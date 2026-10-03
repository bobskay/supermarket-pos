<script setup>
/**
 * 报表统计（店长专属）
 * ------------------------------------------------------------------
 * 一个页面装下门店经营分析：销售趋势 / 支付方式 / 商品排行 / 品类结构 /
 * 收银员业绩 / 时段分析，并支持切换统计周期与导出 Excel。
 * 数据来自 reportApi.overview()，一次请求返回全部聚合结果，前端只做切片与展示。
 */
import { ref, computed, onMounted } from 'vue'
import { reportApi } from '@/api'
import { money, thousands, percent, calc } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppChart from '@/components/ui/AppChart.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const { isManager } = useAuth()

const loading = ref(true)
const raw = ref(null)
const range = ref(14)
const metrics = ref(['amount', 'orders'])

const RANGES = [
  { key: 7, label: '近 7 天' },
  { key: 14, label: '近 14 天' },
  { key: 30, label: '近 30 天' },
]

const METRIC_DEFS = [
  { key: 'amount', name: '销售额', color: 'var(--c-primary)', area: true },
  { key: 'orders', name: '订单数', color: 'var(--c-accent)' },
  { key: 'profit', name: '毛利', color: 'var(--c-success)' },
  { key: 'cost', name: '成本', color: 'var(--c-warning)' },
]

/* ============================== 派生数据 ============================== */
const trend = computed(() => (raw.value?.trend || []).slice(-range.value))

/** 按当前周期汇总（趋势数据按天聚合，直接加总即可） */
const period = computed(() => {
  const rows = trend.value
  const amount = calc(rows.reduce((s, r) => s + r.amount, 0))
  const orders = rows.reduce((s, r) => s + r.orders, 0)
  const profit = calc(rows.reduce((s, r) => s + r.profit, 0))
  const cost = calc(rows.reduce((s, r) => s + r.cost, 0))
  const best = rows.slice().sort((a, b) => b.amount - a.amount)[0] || null
  return {
    amount,
    orders,
    profit,
    cost,
    avgPrice: orders ? calc(amount / orders) : 0,
    profitRate: amount ? (profit / amount) * 100 : 0,
    dayAvg: rows.length ? calc(amount / rows.length) : 0,
    best,
  }
})

/** 环比：当前周期 vs 前一个等长周期 */
const compare = computed(() => {
  const all = raw.value?.trend || []
  const cur = all.slice(-range.value)
  const prev = all.slice(-range.value * 2, -range.value)
  const sum = (rows) => calc(rows.reduce((s, r) => s + r.amount, 0))
  const a = sum(cur)
  const b = sum(prev)
  if (!b) return null
  return ((a - b) / b) * 100
})

const kpis = computed(() => [
  {
    label: '销售总额',
    value: money(period.value.amount),
    icon: 'money',
    color: 'var(--c-primary)',
    bg: 'var(--c-primary-soft)',
    foot: `日均 ${money(period.value.dayAvg)}`,
    compare: compare.value,
  },
  {
    label: '订单总数',
    value: thousands(period.value.orders),
    unit: '单',
    icon: 'receipt',
    color: 'var(--c-accent)',
    bg: 'var(--c-accent-soft)',
    foot: `客单价 ${money(period.value.avgPrice)}`,
  },
  {
    label: '毛利总额',
    value: money(period.value.profit),
    icon: 'trendUp',
    color: 'var(--c-success)',
    bg: 'var(--c-success-soft)',
    foot: `毛利率 ${percent(period.value.profitRate)}`,
  },
  {
    label: '成本总额',
    value: money(period.value.cost),
    icon: 'scale',
    color: 'var(--c-warning)',
    bg: 'var(--c-warning-soft)',
    foot: '按商品进价核算',
  },
])

const payStats = computed(() => raw.value?.payStats || [])
const payTotal = computed(() => calc(payStats.value.reduce((s, p) => s + p.amount, 0)))
const categoryStats = computed(() => raw.value?.categoryStats || [])
const cashierStats = computed(() => raw.value?.cashierStats || [])
const hourStats = computed(() => raw.value?.hourStats || [])
const productRank = computed(() => raw.value?.productRank || [])
const rankLimit = ref(10)
const rankRows = computed(() => productRank.value.slice(0, rankLimit.value))
/** 横向柱状图只取前 8 个，避免商品名互相挤压 */
const rankChart = computed(() =>
  productRank.value.slice(0, 8).map((r) => ({ name: r.name, amount: r.amount, qty: r.qty })),
)

const topCategory = computed(() => categoryStats.value[0] || null)
const bestHour = computed(() => hourStats.value.slice().sort((a, b) => b.amount - a.amount)[0] || null)

/* ============================== 表格列 ============================== */
const rankColumns = [
  { key: 'index', label: '排名', width: 60, align: 'center' },
  { key: 'name', label: '商品名称' },
  { key: 'barcode', label: '条码', width: 130 },
  { key: 'qty', label: '销量', width: 90, align: 'right', format: (r) => `${r.qty}${r.unit}` },
  { key: 'amount', label: '销售额', width: 110, align: 'right', format: (r) => money(r.amount) },
  { key: 'share', label: '销售占比', width: 100, align: 'right' },
]

const cashierColumns = [
  { key: 'name', label: '收银员', width: 100 },
  { key: 'employeeNo', label: '工号', width: 80 },
  { key: 'roleName', label: '角色', width: 84 },
  { key: 'orderCount', label: '订单数', width: 88, align: 'right' },
  { key: 'amount', label: '销售额', width: 110, align: 'right', format: (r) => money(r.amount) },
  { key: 'avgPrice', label: '客单价', width: 96, align: 'right', format: (r) => money(r.avgPrice) },
  { key: 'bar', label: '', width: 120 },
]

const categoryColumns = [
  { key: 'name', label: '品类' },
  { key: 'skuCount', label: 'SKU 数', width: 90, align: 'right' },
  { key: 'amount', label: '销售额', width: 120, align: 'right', format: (r) => money(r.amount) },
  { key: 'share', label: '占比', width: 100, align: 'right' },
  { key: 'stockAmount', label: '库存金额', width: 120, align: 'right', format: (r) => money(r.stockAmount) },
]

/* ============================== 操作 ============================== */
async function load() {
  loading.value = true
  try {
    const res = await reportApi.overview()
    raw.value = res.data
  } finally {
    loading.value = false
  }
}

function toggleMetric(key) {
  const i = metrics.value.indexOf(key)
  if (i > -1) {
    if (metrics.value.length === 1) {
      toast.warning('至少保留一个指标')
      return
    }
    metrics.value.splice(i, 1)
  } else {
    metrics.value.push(key)
  }
}

const activeSeries = computed(() => METRIC_DEFS.filter((m) => metrics.value.includes(m.key)))

function exportTrend() {
  exportXls(
    `销售趋势_近${range.value}天`,
    ['日期', '销售额', '订单数', '成本', '毛利'],
    trend.value.map((r) => [r.date, r.amount, r.orders, r.cost, r.profit]),
    `销售趋势报表（近 ${range.value} 天）`,
  )
  toast.ok('报表已导出')
}

function exportRank() {
  exportXls(
    '商品销售排行',
    ['排名', '商品名称', '条码', '销量', '单位', '销售额'],
    productRank.value.map((r, i) => [i + 1, r.name, r.barcode, r.qty, r.unit, r.amount]),
    '商品销售排行',
  )
  toast.ok('商品排行已导出')
}

function exportCashier() {
  exportXls(
    '收银员业绩',
    ['收银员', '工号', '角色', '订单数', '销售额', '客单价'],
    cashierStats.value.map((r) => [r.name, r.employeeNo, r.roleName, r.orderCount, r.amount, r.avgPrice]),
    '收银员业绩统计',
  )
  toast.ok('收银员业绩已导出')
}

/** 占比计算 */
function shareOf(value, total) {
  if (!total) return 0
  return (value / total) * 100
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      title="报表统计"
      desc="门店经营分析：销售趋势、商品排行、支付结构与收银员业绩"
      icon="chartBar"
    >
      <template #actions>
        <div class="seg">
          <button
            v-for="r in RANGES"
            :key="r.key"
            class="seg-item"
            :class="range === r.key && 'is-active'"
            @click="range = r.key"
          >
            {{ r.label }}
          </button>
        </div>
        <AppButton icon="refresh" :loading="loading" @click="load" />
        <AppButton variant="primary" icon="download" @click="exportTrend">导出报表</AppButton>
      </template>
    </PageHeader>

    <!-- 非店长兜底提示 -->
    <div
      v-if="!isManager"
      class="card card-pad mb-3 flex items-start gap-2.5"
      :style="{ background: 'var(--c-warning-soft)', borderColor: 'transparent' }"
    >
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" class="mt-[1px]" />
      <div class="text-[12.5px]" :style="{ color: 'var(--c-warning)' }">
        报表属于店长权限范围，当前账号仅可查看，如需完整功能请使用店长账号登录。
      </div>
    </div>

    <!-- KPI -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <template v-if="loading">
        <div v-for="i in 4" :key="i" class="kpi">
          <div class="skeleton" style="height: 14px; width: 55%" />
          <div class="skeleton" style="height: 26px; width: 80%" />
          <div class="skeleton" style="height: 12px; width: 40%" />
        </div>
      </template>
      <div v-for="k in kpis" v-else :key="k.label" class="kpi">
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
          <span class="text-text-3">{{ k.foot }}</span>
          <span
            v-if="k.compare != null"
            class="flex items-center gap-0.5 font-medium"
            :style="{ color: k.compare >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
          >
            <Icon :name="k.compare >= 0 ? 'trendUp' : 'trendDown'" :size="12" />
            {{ percent(Math.abs(k.compare)) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 趋势 -->
    <div class="card mt-3">
      <div class="panel-head flex-wrap">
        <div>
          <div class="text-[14px] font-semibold">销售趋势</div>
          <div class="text-[11.5px] text-text-3 mt-0.5">
            近 {{ range }} 天累计 {{ money(period.amount) }}
            <span v-if="period.best">· 最高单日 {{ period.best.date }}（{{ money(period.best.amount) }}）</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            v-for="m in METRIC_DEFS"
            :key="m.key"
            class="flex items-center gap-1.5 h-[26px] px-2.5 rounded text-[12px] transition-colors"
            :style="{
              background: metrics.includes(m.key) ? 'var(--c-surface-2)' : 'transparent',
              border: `1px solid ${metrics.includes(m.key) ? 'var(--c-line-strong)' : 'var(--c-line)'}`,
              color: metrics.includes(m.key) ? 'var(--c-text)' : 'var(--c-text-3)',
            }"
            @click="toggleMetric(m.key)"
          >
            <span class="w-2 h-2 rounded-sm" :style="{ background: m.color }" />
            {{ m.name }}
          </button>
        </div>
      </div>
      <div class="p-3 pt-4">
        <AppChart
          v-if="trend.length"
          type="line"
          :data="trend"
          x-key="date"
          :series="activeSeries"
          height="300px"
        />
        <div v-else class="skeleton" style="height: 300px" />
      </div>
    </div>

    <!-- 支付方式 + 时段 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">支付方式结构</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">含混合支付的每一笔收款</div>
          </div>
        </div>
        <div class="p-3 grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-4 items-center">
          <AppChart
            v-if="payStats.length"
            type="pie"
            :data="payStats"
            name-key="name"
            value-key="amount"
            :legend="false"
            height="190px"
          />
          <div v-else class="skeleton" style="height: 190px" />
          <div class="space-y-2 min-w-0">
            <div v-for="p in payStats" :key="p.method" class="flex items-center gap-2.5">
              <span class="text-[12.5px] w-[62px] shrink-0">{{ p.name }}</span>
              <div class="flex-1 h-[6px] rounded-full overflow-hidden" :style="{ background: 'var(--c-surface-3)' }">
                <div
                  class="h-full rounded-full"
                  :style="{ width: `${shareOf(p.amount, payTotal)}%`, background: 'var(--c-primary)' }"
                />
              </div>
              <span class="text-[12px] num text-text-2 w-[76px] text-right">{{ money(p.amount) }}</span>
              <span class="text-[11.5px] text-text-3 w-[46px] text-right">
                {{ percent(shareOf(p.amount, payTotal), 1) }}
              </span>
            </div>
            <div v-if="!payStats.length" class="text-[12px] text-text-3">暂无支付数据</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">时段销售分布</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              用于排班参考<span v-if="bestHour"> · 高峰 {{ bestHour.hour }}（{{ money(bestHour.amount) }}）</span>
            </div>
          </div>
        </div>
        <div class="p-3 pt-4">
          <AppChart
            v-if="hourStats.length"
            type="bar"
            :data="hourStats"
            x-key="hour"
            :series="[{ key: 'amount', name: '销售额' }]"
            money
            :legend="false"
            height="212px"
          />
          <div v-else class="skeleton" style="height: 212px" />
        </div>
      </div>
    </div>

    <!-- 商品排行 + 品类 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">商品销售排行</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">按销售额排序 · Top {{ rankLimit }}</div>
          </div>
          <div class="flex items-center gap-2">
            <div class="seg">
              <button
                v-for="n in [10, 20, 30]"
                :key="n"
                class="seg-item"
                :class="rankLimit === n && 'is-active'"
                @click="rankLimit = n"
              >
                Top {{ n }}
              </button>
            </div>
            <AppButton size="sm" icon="download" @click="exportRank">导出</AppButton>
          </div>
        </div>
        <DataTable :columns="rankColumns" :list="rankRows" :loading="loading" max-height="330px">
          <template #cell-index="{ index }">
            <span
              class="inline-flex items-center justify-center w-[20px] h-[20px] rounded text-[11.5px] font-semibold"
              :style="{
                background: index < 3 ? 'var(--c-primary-soft)' : 'var(--c-surface-3)',
                color: index < 3 ? 'var(--c-primary)' : 'var(--c-text-3)',
              }"
              >{{ index + 1 }}</span
            >
          </template>
          <template #cell-share="{ row }">
            <span class="text-[12.5px] num">{{ percent(shareOf(row.amount, period.amount), 2) }}</span>
          </template>
        </DataTable>
      </div>

      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">品类销售结构</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              <span v-if="topCategory">第一品类：{{ topCategory.name }}（{{ money(topCategory.amount) }}）</span>
            </div>
          </div>
        </div>
        <div class="p-3">
          <AppChart
            v-if="rankChart.length"
            type="hbar"
            :data="rankChart"
            x-key="name"
            :series="[{ key: 'amount', name: '销售额' }]"
            money
            height="200px"
          />
          <div v-else class="skeleton" style="height: 200px" />
        </div>
        <div class="px-3 pb-3">
          <DataTable :columns="categoryColumns" :list="categoryStats" :loading="loading">
            <template #cell-share="{ row }">
              <span class="text-[12.5px] num">{{ percent(shareOf(row.amount, period.amount), 1) }}</span>
            </template>
          </DataTable>
        </div>
      </div>
    </div>

    <!-- 收银员业绩 -->
    <div class="card mt-3">
      <div class="panel-head">
        <div>
          <div class="text-[14px] font-semibold">收银员业绩</div>
          <div class="text-[11.5px] text-text-3 mt-0.5">全部历史订单统计，用于绩效参考</div>
        </div>
        <AppButton size="sm" icon="download" @click="exportCashier">导出</AppButton>
      </div>
      <DataTable :columns="cashierColumns" :list="cashierStats" :loading="loading">
        <template #cell-roleName="{ row }">
          <span class="badge" :class="row.roleName === '店长' ? 'badge-primary' : 'badge-info'">
            {{ row.roleName }}
          </span>
        </template>
        <template #cell-bar="{ row }">
          <div class="h-[6px] rounded-full overflow-hidden" :style="{ background: 'var(--c-surface-3)' }">
            <div
              class="h-full rounded-full"
              :style="{
                width: `${cashierStats[0]?.amount ? (row.amount / cashierStats[0].amount) * 100 : 0}%`,
                background: 'var(--c-accent)',
              }"
            />
          </div>
        </template>
      </DataTable>
    </div>

    <div class="flex items-center gap-2 text-[11.5px] text-text-3 mt-3">
      <Icon name="info" :size="13" />
      报表数据由本地模拟数据聚合而成（346 笔订单 / 61 个商品），导出为前端直接生成的 Excel 文件。
    </div>
  </PageShell>
</template>
