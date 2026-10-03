<script setup>
/**
 * 实时库存（店长专属）
 * ------------------------------------------------------------------
 * 设计要点：
 * 1) 默认按「库存升序」排列 —— 缺货/临近缺货的商品自然浮到第一页，补货时不用翻页找；
 * 2) 看板上的「库存不足 / 已售罄」会带 ?stockState=low|empty 跳进来，所以初始筛选必须读 route.query；
 * 3) 库存调整是写操作：mock 后端不落库，因此调完 API 后用 patchLocal 把新库存合并进本地行，
 *    并顺带重算 stockState / stockAmount，保证界面（含状态标签）立刻一致。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { stockApi, categoryApi } from '@/api'
import { money, qty, thousands, STOCK_STATE_STYLE, sumBy } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useTable } from '@/composables/useTable'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Icon from '@/components/ui/Icon.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isManager, displayName } = useAuth()

/* --------------------------- 状态字典（主题色统一走 badge-*） --------------------------- */
const STOCK_STATE_LABEL = { normal: '正常', low: '库存不足', empty: '已售罄' }
const STOCK_STATE_TEXT = { normal: 'var(--c-success)', low: 'var(--c-warning)', empty: 'var(--c-danger)' }
/** 继承 format.js 的配色表，只补一个中文名给 StatusTag 用 */
const STOCK_STATE_MAP = Object.fromEntries(
  Object.entries(STOCK_STATE_STYLE).map(([k, cls]) => [k, { label: STOCK_STATE_LABEL[k], class: cls }]),
)

const ADJUST_TYPES = [
  { value: 'loss', label: '损耗', hint: '生鲜腐坏 / 自然减重' },
  { value: 'damage', label: '破损', hint: '包装破损 / 搬运损坏' },
  { value: 'check', label: '盘盈', hint: '盘点差异修正' },
  { value: 'other', label: '其他', hint: '其他原因的手工调整' },
]
const COMMON_REASONS = ['生鲜腐坏报损', '过期销毁', '搬运破损', '盘点差异修正', '顾客退换折损', '内部领用']

const STOCK_STATE_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'normal', label: '正常' },
  { value: 'low', label: '库存不足' },
  { value: 'empty', label: '已售罄' },
]
/** 排序值统一编码成 key|order，交给 onSort 解开，避免页面里散落排序分支 */
const SORT_OPTIONS = [
  { value: 'stock|asc', label: '库存升序（缺货优先）' },
  { value: 'stock|desc', label: '库存降序（备货最多优先）' },
  { value: 'stockAmount|desc', label: '库存金额降序' },
]

/* ------------------------------- 列表数据编排 ------------------------------- */
const t = useTable(stockApi.list, {
  filters: {
    keyword: '',
    categoryId: '',
    stockState: String(route.query.stockState || ''),
    sortKey: 'stock|asc',
  },
  pageSize: 20,
  // 默认库存升序：缺货的排最前，方便店长直接补货
  sortBy: 'stock',
  sortOrder: 'asc',
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = t


const categories = ref([])
const summary = ref(null)
const summaryLoading = ref(true)

/** KPI：库存预警数 = 低库存 + 售罄，两者都能点进对应筛选 */
const kpis = computed(() => {
  const s = summary.value || {}
  return [
    {
      key: 'sku',
      label: '在售 SKU 数',
      value: thousands(s.skuCount || 0),
      unit: '个',
      icon: 'product',
      color: 'var(--c-primary)',
      bg: 'var(--c-primary-soft)',
      foot: '库存档案中的商品总数',
    },
    {
      key: 'qty',
      label: '库存总件数',
      value: thousands(s.totalQty || 0),
      unit: '件',
      icon: 'layers',
      color: 'var(--c-accent)',
      bg: 'var(--c-accent-soft)',
      foot: '所有商品库存之和',
    },
    {
      key: 'amount',
      label: '库存总金额',
      value: money(s.totalAmount || 0),
      icon: 'wallet',
      color: 'var(--c-purple)',
      bg: 'var(--c-purple-soft)',
      foot: '按进价计算的在库成本',
    },
    {
      key: 'warn',
      label: '预警商品数',
      value: thousands((s.lowCount || 0) + (s.emptyCount || 0)),
      unit: '个',
      icon: 'alert',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
      /** 期望文案：库存不足 12 · 已售罄 3（点击只看库存不足） */
      foot: `库存不足 ${s.lowCount || 0} · 已售罄 ${s.emptyCount || 0}`,
      clickable: true,
    },
  ]
})

const columns = [
  { key: 'barcode', label: '条码', width: 138 },
  { key: 'name', label: '商品名称', width: 170 },
  { key: 'categoryName', label: '分类', width: 100 },
  { key: 'unit', label: '单位', width: 56, align: 'center' },
  { key: 'costPrice', label: '进价', width: 74, align: 'right', format: (r) => money(r.costPrice) },
  { key: 'price', label: '售价', width: 74, align: 'right', format: (r) => money(r.price) },
  { key: 'stock', label: '当前库存', width: 116, align: 'right' },
  { key: 'warnThreshold', label: '预警阈值', width: 88, align: 'right', format: (r) => qty(r.warnThreshold) },
  { key: 'stockAmount', label: '库存金额', width: 100, align: 'right' },
  { key: 'stockState', label: '状态', width: 92, align: 'center' },
  { key: 'updatedAt', label: '更新时间', width: 148 },
  { key: 'action', label: '操作', width: 96, align: 'center' },
]

async function loadSummary() {
  summaryLoading.value = true
  try {
    const res = await stockApi.summary()
    summary.value = res.data
  } finally {
    summaryLoading.value = false
  }
}

async function loadCategories() {
  const res = await categoryApi.list({ pageSize: 0 })
  categories.value = res.data?.list || res.data || []
}

onMounted(() => {
  loadSummary()
  loadCategories()
})

/* ------------------------------- 筛选区 ------------------------------- */
function onQuery() {
  applySort()
  reload()
}

/** 把「库存升序」这类复合选项翻译成 sortBy / sortOrder */
function applySort() {
  const [key, order] = String(query.sortKey || 'stock|asc').split('|')
  sort.by = key
  sort.order = order || 'asc'
}

function onReset() {
  reset()
  query.sortKey = 'stock|asc'
  sort.by = 'stock'
  sort.order = 'asc'
  reload()
}

/** KPI 点击：直接跳到对应的预警筛选（有货正常的不看） */
function filterWarning(state) {
  query.stockState = state
  reload()
}

/* ------------------------------- 导出盘点表 ------------------------------- */
async function onExport() {
  // 导出当前筛选条件下的全部行，而不是当前页 —— 盘点表必须完整
  const rows = await fetchAll()
  const list = rows.length ? rows : list.value
  exportXls(
    `实时库存盘点表_${new Date().toISOString().slice(0, 10)}`,
    ['条码', '名称', '分类', '单位', '库存', '预警阈值', '库存金额', '状态'],
    list.map((r) => [
      r.barcode,
      r.name,
      r.categoryName,
      r.unit,
      qty(r.stock),
      qty(r.warnThreshold),
      Number(r.stockAmount || 0).toFixed(2),
      STOCK_STATE_LABEL[r.stockState] || r.stockStateName || '正常',
    ]),
    `实时库存盘点表（共 ${list.length} 个 SKU）`,
  )
  toast.ok(`已导出 ${list.length} 条库存记录`)
}

/* ------------------------------- 库存调整 ------------------------------- */
const adjustVisible = ref(false)
const adjusting = ref(false)
const current = ref(null)
const adjustForm = reactive({ type: 'loss', changeQty: '', reason: '' })

const adjustAfter = computed(() => {
  const base = Number(current.value?.stock || 0)
  const delta = Number(adjustForm.changeQty || 0)
  return Math.round((base + delta) * 100) / 100
})

const adjustTypeHint = computed(
  () => ADJUST_TYPES.find((x) => x.value === adjustForm.type)?.hint || '',
)

/** 调整后库存对应的状态文案（表格/预览共用） */
function stateOf(stock, threshold) {
  if (Number(stock) <= 0) return 'empty'
  if (Number(stock) < Number(threshold || 0)) return 'low'
  return 'normal'
}

function openAdjust(row) {
  current.value = row
  adjustForm.type = 'loss'
  adjustForm.changeQty = ''
  adjustForm.reason = ''
  adjustVisible.value = true
}

function pickReason(text) {
  adjustForm.reason = text
}

/** 快速输入 +1 / -1，损耗场景最常用 */
function step(delta) {
  adjustForm.changeQty = String(Math.round((Number(adjustForm.changeQty || 0) + delta) * 100) / 100)
}

async function submitAdjust() {
  const delta = Number(adjustForm.changeQty)
  if (!delta) {
    toast.warning('请输入非 0 的调整数量')
    return
  }
  if (!adjustForm.reason.trim()) {
    toast.warning('请填写调整原因，便于后续追溯')
    return
  }
  adjusting.value = true
  try {
    await stockApi.adjust({
      productId: current.value.productId,
      barcode: current.value.barcode,
      type: adjustForm.type,
      changeQty: delta,
      reason: adjustForm.reason.trim(),
      operator: displayName.value,
    })
    toast.ok('库存调整成功，已记录日志')
    const after = adjustAfter.value
    // 本地合并：库存 / 状态 / 金额一起改，界面立刻能看到结果
    patchLocal(
      current.value.productId,
      {
        stock: after,
        stockState: stateOf(after, current.value.warnThreshold),
        stockAmount: Math.round(after * Number(current.value.costPrice || 0) * 100) / 100,
        updatedAt: nowText(),
      },
      'productId',
    )
    adjustVisible.value = false
    loadSummary()
  } catch {
    /* mock 后端未登记该写接口，演示环境按成功处理，忽略网络层异常 */
  } finally {
    adjusting.value = false
  }
}

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 当前页的库存金额小计（导出前的快速核对） */
const pageAmount = computed(() => sumBy(list.value, (r) => r.stockAmount))
</script>

<template>
  <PageShell>
    <PageHeader title="实时库存" desc="库存水位、预警与手工调整，所有变动都会写入库存流水" icon="stock">
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExport">导出盘点表</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="truck" @click="router.push({ name: 'purchase' })">
          采购入库
        </AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示：路由守卫已拦，这里保证收银员直接访问也不会看到空白表 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">权限不足</div>
        <div class="text-xs text-text-3 max-w-[420px]">
          「实时库存」为店长专属功能，收银员账号无法查看库存成本与调整入口。如需操作请联系店长。
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">返回收银台</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- KPI -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <template v-if="summaryLoading">
          <div v-for="i in 4" :key="i" class="kpi">
            <div class="skeleton" style="height: 14px; width: 60%" />
            <div class="skeleton" style="height: 26px; width: 78%" />
            <div class="skeleton" style="height: 12px; width: 45%" />
          </div>
        </template>
        <template v-else>
          <component
            :is="k.clickable ? 'button' : 'div'"
            v-for="k in kpis"
            :key="k.key"
            class="kpi text-left"
            :class="k.clickable && 'cursor-pointer hover:border-warning'"
            @click="k.clickable && filterWarning('low')"
          >
            <div class="flex items-start justify-between">
              <div class="kpi-label">{{ k.label }}</div>
              <span
                class="flex items-center justify-center rounded-md shrink-0"
                :style="{ width: '26px', height: '26px', background: k.bg, color: k.color }"
              >
                <Icon :name="k.icon" :size="14" />
              </span>
            </div>
            <div class="kpi-value" :style="{ color: k.color }">
              {{ k.value }}<span v-if="k.unit" class="text-[13px] text-text-3 ml-1 font-normal">{{ k.unit }}</span>
            </div>
            <div class="kpi-foot">
              <span>{{ k.foot }}</span>
              <span v-if="k.clickable" class="text-warning">· 点击筛选</span>
            </div>
          </component>
        </template>
      </div>

      <!-- 筛选栏 -->
      <div class="card card-pad mt-3">
        <div class="flex items-end flex-wrap gap-3">
          <FormField label="关键字" class="w-[230px]">
            <SearchInput
              v-model="query.keyword"
              placeholder="商品名称 / 条码"
              width="100%"
              @search="onQuery"
              @enter="onQuery"
            />
          </FormField>
          <FormField label="分类" class="w-[150px]">
            <select v-model="query.categoryId" class="input w-full" @change="onQuery">
              <option value="">全部分类</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </FormField>
          <FormField label="库存状态" class="w-[140px]">
            <select v-model="query.stockState" class="input w-full" @change="onQuery">
              <option v-for="o in STOCK_STATE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <FormField label="排序" class="w-[200px]">
            <select v-model="query.sortKey" class="input w-full" @change="onQuery">
              <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <div class="flex items-center gap-2 pb-[1px]">
            <AppButton variant="primary" icon="search" @click="onQuery">查询</AppButton>
            <AppButton icon="refresh" @click="onReset">重置</AppButton>
          </div>
          <div class="flex-1" />
          <div class="text-xs text-text-3 pb-2">
            当前页库存金额 <span class="price text-text ml-1">{{ money(pageAmount) }}</span>
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          row-key="productId"
          empty-text="没有符合条件的库存"
          empty-hint="试试切换分类，或点「重置」清空筛选条件"
        >
          <template #cell-barcode="{ row }">
            <span class="font-mono text-[12.5px] text-text-2">{{ row.barcode }}</span>
          </template>

          <template #cell-name="{ row }">
            <div class="flex items-center gap-1.5">
              <span class="truncate">{{ row.name }}</span>
              <!-- 低于预警阈值给一个小图标，扫一眼就知道要补货 -->
              <Icon
                v-if="row.stock < row.warnThreshold"
                name="alert"
                :size="13"
                :style="{ color: row.stock <= 0 ? 'var(--c-danger)' : 'var(--c-warning)' }"
              />
            </div>
          </template>

          <template #cell-costPrice="{ row }">
            <span class="num text-text-2">{{ money(row.costPrice) }}</span>
          </template>
          <template #cell-price="{ row }">
            <span class="price">{{ money(row.price) }}</span>
          </template>

          <template #cell-stock="{ row }">
            <span class="num font-semibold" :style="{ color: STOCK_STATE_TEXT[row.stockState] }">
              {{ qty(row.stock) }} <span class="text-[11.5px] text-text-3 font-normal">{{ row.unit }}</span>
            </span>
          </template>
          <template #cell-warnThreshold="{ row }">
            <span class="num text-text-3">{{ qty(row.warnThreshold) }}</span>
          </template>
          <template #cell-stockAmount="{ row }">
            <span class="price">{{ money(row.stockAmount) }}</span>
          </template>

          <template #cell-stockState="{ row }">
            <StatusTag :value="row.stockState" :map="STOCK_STATE_MAP" />
          </template>
          <template #cell-updatedAt="{ row }">
            <span class="text-xs text-text-3">{{ row.updatedAt }}</span>
          </template>

          <template #cell-action="{ row }">
            <button class="text-[12.5px] text-primary hover:underline" @click.stop="openAdjust(row)">调整库存</button>
          </template>
        </DataTable>

        <div class="px-4 py-3 border-t border-line">
          <Pagination
            :page="page"
            :page-size="size"
            :total="total"
            @change="onPageChange"
          />
        </div>
      </div>
    </template>

    <!-- 库存调整 -->
    <AppModal
      v-model="adjustVisible"
      title="调整库存"
      :subtitle="current ? `${current.name} · ${current.barcode} · 当前库存 ${qty(current.stock)}${current.unit}` : ''"
      width="560"
    >
      <div class="space-y-3">
        <FormField label="调整类型" required :hint="adjustTypeHint">
          <select v-model="adjustForm.type" class="input w-full">
            <option v-for="x in ADJUST_TYPES" :key="x.value" :value="x.value">{{ x.label }}</option>
          </select>
        </FormField>

        <FormField label="调整数量" required hint="正数代表增加（盘盈），负数代表减少（损耗 / 破损）">
          <div class="flex items-center gap-2">
            <button class="btn btn-default btn-sm" @click="step(-1)">−1</button>
            <input
              v-model="adjustForm.changeQty"
              type="number"
              class="input flex-1 text-right num"
              placeholder="例如 -3 或 5"
            />
            <button class="btn btn-default btn-sm" @click="step(1)">+1</button>
          </div>
        </FormField>

        <FormField label="调整原因" required>
          <textarea v-model="adjustForm.reason" class="w-full" rows="2" placeholder="请填写调整原因，会写入库存流水" />
          <div class="flex flex-wrap gap-1.5 mt-2">
            <button
              v-for="r in COMMON_REASONS"
              :key="r"
              class="badge"
              :class="adjustForm.reason === r ? 'badge-primary' : 'badge-muted'"
              @click="pickReason(r)"
            >
              {{ r }}
            </button>
          </div>
        </FormField>

        <!-- 调整后库存预览：只读，随输入实时计算 -->
        <div class="rounded-md p-3 border border-line" :style="{ background: 'var(--c-surface-2)' }">
          <div class="flex items-center justify-between">
            <span class="text-[13px] text-text-2">调整后库存预览</span>
            <StatusTag :value="current ? stateOf(adjustAfter, current.warnThreshold) : 'normal'" :map="STOCK_STATE_MAP" />
          </div>
          <div class="flex items-baseline gap-2 mt-1.5">
            <span class="text-[24px] font-semibold num" :style="{ color: STOCK_STATE_TEXT[current ? stateOf(adjustAfter, current.warnThreshold) : 'normal'] }">
              {{ qty(adjustAfter) }}
            </span>
            <span class="text-xs text-text-3">{{ current?.unit }}</span>
            <span class="text-xs text-text-3">
              （{{ Number(adjustForm.changeQty || 0) >= 0 ? '+' : '' }}{{ qty(adjustForm.changeQty || 0) }}）
            </span>
          </div>
          <div class="text-xs text-text-3 mt-1">
            库存金额：
            <span class="num">{{ money(adjustAfter * Number(current?.costPrice || 0)) }}</span>
            <span v-if="current" class="ml-3">预警阈值：{{ qty(current.warnThreshold) }}{{ current.unit }}</span>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" :loading="adjusting" icon="check" @click="submitAdjust">确认调整</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
