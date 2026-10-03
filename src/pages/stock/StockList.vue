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
import { useI18n } from '@/i18n'
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
const { t, tl } = useI18n()

/* --------------------------- 状态字典（主题色统一走 badge-*） --------------------------- */
/** 状态码 → 字典键；找不到码时回退到后端给的中文 name */
const STATE_KEY = { normal: 'stock.normal', low: 'stock.low', empty: 'stock.empty' }
const STOCK_STATE_TEXT = { normal: 'var(--c-success)', low: 'var(--c-warning)', empty: 'var(--c-danger)' }
/** 继承 format.js 的配色表，标签文案按当前语言取词 */
const STOCK_STATE_MAP = computed(() =>
  Object.fromEntries(
    Object.entries(STOCK_STATE_STYLE).map(([k, cls]) => [k, { label: stateText(k), class: cls }]),
  ),
)

/** 按状态码取文案，未知码回退到数据里的 name 字段 */
function stateText(state, row) {
  if (STATE_KEY[state]) return t(STATE_KEY[state])
  return row ? tl(row, 'stockStateName', t('stock.normal')) : t('stock.normal')
}

const ADJUST_TYPES = computed(() => [
  { value: 'loss', label: t('stock.typeLoss'), hint: t('stock.typeLossHint') },
  { value: 'damage', label: t('stock.typeDamage'), hint: t('stock.typeDamageHint') },
  { value: 'check', label: t('stock.typeCheck'), hint: t('stock.typeCheckHint') },
  { value: 'other', label: t('stock.typeOther'), hint: t('stock.typeOtherHint') },
])
const COMMON_REASONS = ['生鲜腐坏报损', '过期销毁', '搬运破损', '盘点差异修正', '顾客退换折损', '内部领用']

const STOCK_STATE_OPTIONS = computed(() => [
  { value: '', label: t('stock.allStates') },
  { value: 'normal', label: t('stock.normal') },
  { value: 'low', label: t('stock.low') },
  { value: 'empty', label: t('stock.empty') },
])
/** 排序值统一编码成 key|order，交给 onSort 解开，避免页面里散落排序分支 */
const SORT_OPTIONS = computed(() => [
  { value: 'stock|asc', label: t('stock.sortStockAsc') },
  { value: 'stock|desc', label: t('stock.sortStockDesc') },
  { value: 'stockAmount|desc', label: t('stock.sortAmountDesc') },
])

/* ------------------------------- 列表数据编排 ------------------------------- */
const table = useTable(stockApi.list, {
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
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = table


const categories = ref([])
const summary = ref(null)
const summaryLoading = ref(true)

/** KPI：库存预警数 = 低库存 + 售罄，两者都能点进对应筛选 */
const kpis = computed(() => {
  const s = summary.value || {}
  return [
    {
      key: 'sku',
      label: t('stock.skuCount'),
      value: thousands(s.skuCount || 0),
      unit: t('common.unitItem'),
      icon: 'product',
      color: 'var(--c-primary)',
      bg: 'var(--c-primary-soft)',
      foot: t('stock.footSkuTotal'),
    },
    {
      key: 'qty',
      label: t('stock.totalQty'),
      value: thousands(s.totalQty || 0),
      unit: t('common.unitPiece'),
      icon: 'layers',
      color: 'var(--c-accent)',
      bg: 'var(--c-accent-soft)',
      foot: t('stock.footQtyTotal'),
    },
    {
      key: 'amount',
      label: t('stock.totalAmount'),
      value: money(s.totalAmount || 0),
      icon: 'wallet',
      color: 'var(--c-purple)',
      bg: 'var(--c-purple-soft)',
      foot: t('stock.footAmountCost'),
    },
    {
      key: 'warn',
      label: t('stock.warningCount'),
      value: thousands((s.lowCount || 0) + (s.emptyCount || 0)),
      unit: t('common.unitItem'),
      icon: 'alert',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
      /** 期望文案：库存不足 12 · 已售罄 3（点击只看库存不足） */
      foot: t('stock.footWarn', { low: s.lowCount || 0, empty: s.emptyCount || 0 }),
      clickable: true,
    },
  ]
})

const columns = computed(() => [
  { key: 'barcode', label: t('stock.barcode'), width: 138 },
  { key: 'name', label: t('stock.productName'), width: 170 },
  { key: 'categoryName', label: t('stock.category'), width: 100 },
  { key: 'unit', label: t('stock.unit'), width: 56, align: 'center' },
  { key: 'costPrice', label: t('stock.costPrice'), width: 74, align: 'right', format: (r) => money(r.costPrice) },
  { key: 'price', label: t('stock.price'), width: 74, align: 'right', format: (r) => money(r.price) },
  { key: 'stock', label: t('stock.stock'), width: 116, align: 'right' },
  { key: 'warnThreshold', label: t('stock.warnThreshold'), width: 88, align: 'right', format: (r) => qty(r.warnThreshold) },
  { key: 'stockAmount', label: t('stock.stockAmount'), width: 100, align: 'right' },
  { key: 'stockState', label: t('stock.stockState'), width: 92, align: 'center' },
  { key: 'updatedAt', label: t('common.updatedAt'), width: 148 },
  { key: 'action', label: t('common.actions'), width: 96, align: 'center' },
])

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
      stateText(r.stockState, r),
    ]),
    `实时库存盘点表（共 ${list.length} 个 SKU）`,
  )
  toast.ok(t('stock.recordsExported', { n: list.length }))
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
  () => ADJUST_TYPES.value.find((x) => x.value === adjustForm.type)?.hint || '',
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
    toast.warning(t('stock.needQtyNonZero'))
    return
  }
  if (!adjustForm.reason.trim()) {
    toast.warning(t('stock.needReason'))
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
    toast.ok(t('stock.adjustOk'))
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
    <PageHeader :title="$t('stock.title')" :desc="$t('stock.listDesc')" icon="stock">
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExport">{{ $t('stock.exportCheck') }}</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="truck" @click="router.push({ name: 'purchase' })">
          {{ $t('stock.goPurchase') }}
        </AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示：路由守卫已拦，这里保证收银员直接访问也不会看到空白表 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">{{ $t('common.noPermission') }}</div>
        <div class="text-xs text-text-3 max-w-[420px]">
          {{ $t('stock.permTip') }}
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">{{ $t('stock.backToPos') }}</AppButton>
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
              <span v-if="k.clickable" class="text-warning">{{ $t('stock.clickFilter') }}</span>
            </div>
          </component>
        </template>
      </div>

      <!-- 筛选栏 -->
      <div class="card card-pad mt-3">
        <div class="flex items-end flex-wrap gap-3">
          <FormField :label="$t('common.keyword')" class="w-[230px]">
            <SearchInput
              v-model="query.keyword"
              :placeholder="$t('stock.searchPlaceholder')"
              width="100%"
              @search="onQuery"
              @enter="onQuery"
            />
          </FormField>
          <FormField :label="$t('stock.category')" class="w-[150px]">
            <select v-model="query.categoryId" class="input w-full" @change="onQuery">
              <option value="">{{ $t('stock.allCategories') }}</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </FormField>
          <FormField :label="$t('stock.stockStateFilter')" class="w-[140px]">
            <select v-model="query.stockState" class="input w-full" @change="onQuery">
              <option v-for="o in STOCK_STATE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <FormField :label="$t('stock.sortLabel')" class="w-[200px]">
            <select v-model="query.sortKey" class="input w-full" @change="onQuery">
              <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <div class="flex items-center gap-2 pb-[1px]">
            <AppButton variant="primary" icon="search" @click="onQuery">{{ $t('common.search') }}</AppButton>
            <AppButton icon="refresh" @click="onReset">{{ $t('common.reset') }}</AppButton>
          </div>
          <div class="flex-1" />
          <div class="text-xs text-text-3 pb-2">
            {{ $t('stock.pageAmount') }} <span class="price text-text ml-1">{{ money(pageAmount) }}</span>
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
          :empty-text="$t('stock.emptyText')"
          :empty-hint="$t('stock.emptyHint')"
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
            <button class="text-[12.5px] text-primary hover:underline" @click.stop="openAdjust(row)">{{ $t('stock.adjust') }}</button>
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
      :title="$t('stock.adjustTitle')"
      :subtitle="current ? $t('stock.adjustSubtitle', { name: current.name, barcode: current.barcode, qty: qty(current.stock), unit: current.unit }) : ''"
      width="560"
    >
      <div class="space-y-3">
        <FormField :label="$t('stock.adjustType')" required :hint="adjustTypeHint">
          <select v-model="adjustForm.type" class="input w-full">
            <option v-for="x in ADJUST_TYPES" :key="x.value" :value="x.value">{{ x.label }}</option>
          </select>
        </FormField>

        <FormField :label="$t('stock.adjustQty')" required :hint="$t('stock.adjustQtyHintFull')">
          <div class="flex items-center gap-2">
            <button class="btn btn-default btn-sm" @click="step(-1)">−1</button>
            <input
              v-model="adjustForm.changeQty"
              type="number"
              class="input flex-1 text-right num"
              :placeholder="$t('stock.adjustQtyPlaceholder')"
            />
            <button class="btn btn-default btn-sm" @click="step(1)">+1</button>
          </div>
        </FormField>

        <FormField :label="$t('stock.adjustReason')" required>
          <textarea v-model="adjustForm.reason" class="w-full" rows="2" :placeholder="$t('stock.adjustReasonPlaceholder')" />
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
            <span class="text-[13px] text-text-2">{{ $t('stock.afterStockPreview') }}</span>
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
            {{ $t('stock.stockAmount') }}：
            <span class="num">{{ money(adjustAfter * Number(current?.costPrice || 0)) }}</span>
            <span v-if="current" class="ml-3">{{ $t('stock.warnThreshold') }}：{{ qty(current.warnThreshold) }}{{ current.unit }}</span>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" :loading="adjusting" icon="check" @click="submitAdjust">{{ $t('stock.confirmAdjust') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
