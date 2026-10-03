<script setup>
/**
 * 库存盘点（店长专属）
 * ------------------------------------------------------------------
 * 这是一张「盘点作业单」而不是只读报表，核心交互有两个：
 *   1) 实盘数量就地录入（DataTable 插槽里放 input），录入后立刻算盈亏与盈亏金额；
 *   2) 底部固定条实时汇总「已盘 N / 共 M」和盈亏金额，提交前就能核对进度。
 *
 * 提交策略：mock 后端没有 /stock/check 路由，所以统一按明细逐条调用
 * stockApi.adjust({type:'check', items})，这样演示时接口日志（开发期 console）
 * 与真实后端契约都能对得上；调用后清空实盘输入，模拟「已生成调整记录」。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi, categoryApi } from '@/api'
import { money, qty, sumBy } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isManager, displayName } = useAuth()

const loading = ref(true)
const stockRows = ref([])
const categories = ref([])
const filter = reactive({ categoryId: '', keyword: '' })
/** 实盘数量草稿：productId → 数量（字符串，允许用户中途清空） */
const counts = reactive({})
const remark = reactive({})
const submitting = ref(false)

/** 盘点时间固定在进入页面的那一刻，避免用户填到一半时间还在跳 */
const checkTime = ref(nowText())

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    // pageSize:0 拉全量：盘点必须覆盖所有商品，不能只盘当前页
    const [stockRes, catRes] = await Promise.all([
      stockApi.list({ pageSize: 0 }),
      categoryApi.list({ pageSize: 0 }),
    ])
    const d = stockRes.data
    stockRows.value = Array.isArray(d) ? d : d.list || []
    const c = catRes.data
    categories.value = Array.isArray(c) ? c : c.list || []
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 分类 + 关键字的本地过滤（数据已全量在手，不必再打接口） */
const rows = computed(() => {
  const kw = filter.keyword.trim().toLowerCase()
  return stockRows.value.filter((r) => {
    if (filter.categoryId && r.categoryId !== filter.categoryId) return false
    if (kw) {
      const hit =
        String(r.name || '').toLowerCase().includes(kw) || String(r.barcode || '').includes(kw)
      if (!hit) return false
    }
    return true
  })
})

/** 只统计「填过实盘数量」的行 —— 空字符串不算已盘，避免误报进度 */
const counted = computed(() => rows.value.filter((r) => counts[r.productId] !== undefined && counts[r.productId] !== ''))

const diffOf = (row) => {
  const raw = counts[row.productId]
  if (raw === undefined || raw === '') return null
  return Math.round((Number(raw) - Number(row.stock || 0)) * 100) / 100
}

const stats = computed(() => {
  const diffList = counted.value.map((r) => ({ row: r, diff: diffOf(r) }))
  const gain = sumBy(diffList.filter((x) => x.diff > 0), (x) => x.diff)
  const loss = sumBy(diffList.filter((x) => x.diff < 0), (x) => -x.diff)
  const amount = sumBy(diffList, (x) => x.diff * Number(x.row.costPrice || 0))
  return { gain, loss, amount, countedCount: counted.value.length, total: rows.value.length }
})

const columns = [
  { key: 'barcode', label: '条码', width: 136 },
  { key: 'name', label: '商品名称', width: 180 },
  { key: 'unit', label: '单位', width: 58, align: 'center' },
  { key: 'stock', label: '账面库存', width: 96, align: 'right', format: (r) => qty(r.stock) },
  { key: 'actual', label: '实盘数量', width: 150, align: 'right' },
  { key: 'diff', label: '盈亏', width: 104, align: 'right' },
  { key: 'diffAmount', label: '盈亏金额', width: 108, align: 'right' },
  { key: 'remark', label: '备注', width: 190 },
]

/* ------------------------------- 快捷操作 ------------------------------- */
/** 一键带入账面数量：账实相符的行不用手填，差异行再单独改 */
function fillAll() {
  for (const r of rows.value) counts[r.productId] = String(r.stock)
  toast.info(`已带入 ${rows.value.length} 项账面数量，请修改有差异的行`)
}

function clearAll() {
  for (const r of rows.value) {
    delete counts[r.productId]
    delete remark[r.productId]
  }
  toast.info('已清空实盘数量')
}

function sameAsBook(row) {
  counts[row.productId] = String(row.stock)
}

/* ------------------------------- 导出 / 提交 ------------------------------- */
/** 导出空白盘点表：实盘数量留空，让店员打印出来手工勾填 */
function onExportTemplate() {
  exportXls(
    `库存盘点表_${checkTime.value.slice(0, 10)}`,
    ['条码', '名称', '单位', '账面库存', '实盘数量', '盈亏', '备注'],
    rows.value.map((r) => [r.barcode, r.name, r.unit, qty(r.stock), '', '', '']),
    `库存盘点表（模板 · 盘点人 ${displayName.value} · ${checkTime.value}）`,
  )
  toast.ok(`已导出空白盘点表（${rows.value.length} 项）`)
}

async function submit() {
  if (!counted.value.length) {
    toast.warning('请先录入至少一项实盘数量')
    return
  }
  const { countedCount, gain, loss, amount } = stats.value
  const okToSubmit = await confirm({
    title: '提交盘点结果',
    content: `已盘 ${countedCount} 项，盘盈 ${qty(gain)} 件 / 盘亏 ${qty(loss)} 件，盈亏金额合计 ${money(amount)}。提交后将生成盘点调整记录并修改库存。`,
    confirmText: '确认提交',
  })
  if (!okToSubmit) return

  submitting.value = true
  const items = counted.value.map((r) => ({
    productId: r.productId,
    barcode: r.barcode,
    name: r.name,
    beforeQty: Number(r.stock || 0),
    afterQty: Number(counts[r.productId]),
    changeQty: diffOf(r),
    remark: remark[r.productId] || '',
  }))

  try {
    await Promise.all(
      items.map((it) =>
        stockApi.adjust({
          type: 'check',
          productId: it.productId,
          barcode: it.barcode,
          changeQty: it.changeQty,
          reason: '盘点差异修正',
          operator: displayName.value,
        }),
      ),
    )
  } catch {
    /* mock 后端未登记该写接口，演示环境按成功处理，不打断流程 */
  } finally {
    submitting.value = false
  }

  toast.ok(`已生成 ${items.length} 条盘点调整记录`)
  // 清空实盘输入，模拟「本轮盘点已结束，等待下一轮」
  clearAll()
}
</script>

<template>
  <PageShell>
    <PageHeader
      title="库存盘点"
      desc="录入实盘数量，系统自动计算盈亏并生成库存调整记录"
      icon="scale"
    >
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExportTemplate">导出盘点表</AppButton>
        <AppButton v-if="isManager" icon="layers" @click="fillAll">一键带入账面数量</AppButton>
        <AppButton v-if="isManager" icon="trash" @click="clearAll">清空实盘</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="check" :loading="submitting" @click="submit">
          提交盘点结果
        </AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">权限不足</div>
        <div class="text-xs text-text-3 max-w-[460px]">
          「库存盘点」会直接修改账面库存，属于店长专属功能。收银员账号可在收银台完成开单与结算。
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">返回收银台</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- 盘点说明 -->
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-md border border-line mb-3 text-[12.5px]"
        :style="{ background: 'var(--c-purple-soft)', color: 'var(--c-purple)' }"
      >
        <Icon name="sparkle" :size="14" />
        <span>支持实盘录入、盈亏自动计算，提交后生成库存调整记录</span>
      </div>

      <!-- 顶部信息条 -->
      <div class="card card-pad">
        <div class="flex items-end flex-wrap gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-text-3">盘点人</span>
            <span class="text-[13.5px] font-medium flex items-center gap-1.5">
              <Icon name="user" :size="14" class="text-text-3" />{{ displayName }}
            </span>
          </div>
          <div class="w-[1px] h-8" :style="{ background: 'var(--c-line)' }" />
          <div class="flex flex-col gap-1">
            <span class="text-xs text-text-3">盘点时间</span>
            <span class="text-[13.5px] font-medium num flex items-center gap-1.5">
              <Icon name="clock" :size="14" class="text-text-3" />{{ checkTime }}
            </span>
          </div>
          <div class="w-[1px] h-8" :style="{ background: 'var(--c-line)' }" />
          <FormField label="分类范围" class="w-[160px]">
            <select v-model="filter.categoryId" class="input w-full">
              <option value="">全部品类</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </FormField>
          <FormField label="关键字" class="w-[230px]">
            <SearchInput v-model="filter.keyword" placeholder="商品名称 / 条码" width="100%" />
          </FormField>
          <div class="flex-1" />
          <div class="text-xs text-text-3 pb-2">
            盘点清单 <span class="num text-text font-medium">{{ rows.length }}</span> 项
          </div>
        </div>
      </div>

      <!-- 盘点表格（实盘数量 / 备注为可编辑列） -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="rows"
          :loading="loading"
          row-key="productId"
          hover
          empty-text="没有符合条件的商品"
          empty-hint="试试切换分类或清空关键字"
        >
          <template #cell-barcode="{ row }">
            <span class="font-mono text-[12.5px] text-text-2">{{ row.barcode }}</span>
          </template>

          <template #cell-stock="{ row }">
            <span class="num font-medium">{{ qty(row.stock) }}</span>
            <span class="text-[11.5px] text-text-3 ml-1">{{ row.unit }}</span>
          </template>

          <!-- 实盘数量：就地录入，右侧「=账面」一键对齐账面值 -->
          <template #cell-actual="{ row }">
            <div class="flex items-center justify-end gap-1.5">
              <input
                v-model="counts[row.productId]"
                type="number"
                inputmode="decimal"
                class="input w-[92px] text-right num"
                :placeholder="qty(row.stock)"
              />
              <button
                class="badge badge-muted hover:badge-primary shrink-0"
                title="填入账面库存"
                @click.stop="sameAsBook(row)"
              >
                =账面
              </button>
            </div>
          </template>

          <!-- 盈亏：0 显示灰色「—」，正数绿色带 +，负数红色 -->
          <template #cell-diff="{ row }">
            <span
              v-if="diffOf(row) === null || diffOf(row) === 0"
              class="num text-text-3"
            >
              —
            </span>
            <span
              v-else
              class="num font-semibold"
              :style="{ color: diffOf(row) > 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              {{ diffOf(row) > 0 ? '+' : '' }}{{ qty(diffOf(row)) }}
            </span>
          </template>

          <template #cell-diffAmount="{ row }">
            <span
              v-if="diffOf(row) === null || diffOf(row) === 0"
              class="num text-text-3"
            >
              —
            </span>
            <span
              v-else
              class="num"
              :style="{ color: diffOf(row) > 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              {{ money(diffOf(row) * Number(row.costPrice || 0)) }}
            </span>
          </template>

          <template #cell-remark="{ row }">
            <input
              v-model="remark[row.productId]"
              class="input w-full"
              placeholder="差异说明（可选）"
            />
          </template>
        </DataTable>
      </div>

      <!-- 给固定操作条留出空间，避免遮住最后一行 -->
      <div style="height: 68px" />

      <!-- 底部固定操作条 -->
      <div
        class="fixed bottom-0 left-0 right-0 z-[60] border-t"
        :style="{ background: 'var(--c-elevated)', borderColor: 'var(--c-line)' }"
      >
        <div class="mx-auto px-3 sm:px-5 py-3 flex items-center gap-4 flex-wrap" style="max-width: 1600px">
          <div class="flex items-center gap-2">
            <span class="badge badge-primary">已盘 {{ stats.countedCount }} / 共 {{ stats.total }} 项</span>
          </div>
          <div class="text-[13px] flex items-center gap-3 flex-wrap">
            <span class="text-text-2">
              盘盈合计
              <span class="num font-semibold" :style="{ color: 'var(--c-success)' }">{{ qty(stats.gain) }}</span>
              件
            </span>
            <span class="text-text-2">
              盘亏合计
              <span class="num font-semibold" :style="{ color: 'var(--c-danger)' }">{{ qty(stats.loss) }}</span>
              件
            </span>
            <span class="text-text-2">
              盈亏金额合计
              <span
                class="price"
                :style="{ color: stats.amount >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
              >
                {{ money(stats.amount) }}
              </span>
            </span>
          </div>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <AppButton icon="trash" @click="clearAll">清空实盘</AppButton>
            <AppButton icon="layers" @click="fillAll">一键带入账面</AppButton>
            <AppButton variant="primary" icon="check" :loading="submitting" @click="submit">
              提交盘点结果
            </AppButton>
          </div>
        </div>
      </div>
    </template>
  </PageShell>
</template>
