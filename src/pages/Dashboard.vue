<script setup>
/**
 * 经营看板
 * - 顶部 KPI：今日销售额 / 订单数 / 会员消费 / 客单价 / 毛利
 * - 中部：14 天销售走势、支付方式占比、热销商品 Top
 * - 右侧：待处理事项、库存预警、最近订单
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { reportApi } from '@/api'
import { money, thousands, percent, timeShort, ORDER_STATUS_STYLE } from '@/utils/format'
import { useI18n } from '@/i18n'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppChart from '@/components/ui/AppChart.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'

const router = useRouter()
const { user } = useAuth()
const { t, tl } = useI18n()

const loading = ref(true)
const data = ref(null)
const trendDays = ref(14)

const kpis = computed(() => {
  const k = data.value?.kpi || {}
  return [
    {
      key: 'sales',
      label: t('dashboard.todaySales'),
      value: money(k.todaySales || 0),
      compare: k.todaySalesCompare,
      icon: 'money',
      color: 'var(--c-primary)',
      bg: 'var(--c-primary-soft)',
      foot: t('dashboard.vsYesterday'),
    },
    {
      key: 'orders',
      label: t('dashboard.todayOrders'),
      value: thousands(k.todayOrders || 0),
      unit: t('dashboard.unitOrder'),
      compare: k.todayOrdersCompare,
      icon: 'receipt',
      color: 'var(--c-accent)',
      bg: 'var(--c-accent-soft)',
      foot: t('dashboard.vsYesterday'),
    },
    {
      key: 'members',
      label: t('dashboard.todayMembers'),
      value: thousands(k.todayMembers || 0),
      unit: t('dashboard.unitPerson'),
      icon: 'members',
      color: 'var(--c-purple)',
      bg: 'var(--c-purple-soft)',
      foot: t('dashboard.todayMemberVisit'),
    },
    {
      key: 'avgPrice',
      label: t('dashboard.avgPrice'),
      value: money(k.todayAvgPrice || 0),
      icon: 'target',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
      foot: t('dashboard.avgPriceFormula'),
    },
    {
      key: 'profit',
      label: t('dashboard.grossProfit'),
      value: money(k.grossProfit || 0),
      icon: 'trendUp',
      color: 'var(--c-success)',
      bg: 'var(--c-success-soft)',
      foot: t('dashboard.grossFormula'),
    },
  ]
})

const trend = computed(() => (data.value?.trend || []).slice(-trendDays.value))
const category = computed(() => data.value?.categoryStats || [])
const hot = computed(() => data.value?.hotProducts || [])
const recent = computed(() => data.value?.recentOrders || [])
const warnings = computed(() => data.value?.warningList || [])

const todos = computed(() => {
  const todo = data.value?.todo || {}
  return [
    { label: t('dashboard.lowStock'), value: todo.lowStock || 0, icon: 'alert', tone: 'warning', to: { name: 'stock', query: { stockState: 'low' } } },
    { label: t('dashboard.emptyStock'), value: todo.emptyStock || 0, icon: 'package', tone: 'danger', to: { name: 'stock', query: { stockState: 'empty' } } },
    { label: t('dashboard.pendingPurchase'), value: todo.pendingPurchase || 0, icon: 'truck', tone: 'info', to: { name: 'purchase' } },
    { label: t('dashboard.refundToday'), value: todo.refundToday || 0, icon: 'undo', tone: 'purple', to: { name: 'orders', query: { status: 'refunded' } } },
  ]
})

const TODOS_TONE = {
  warning: { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)' },
  danger: { bg: 'var(--c-danger-soft)', color: 'var(--c-danger)' },
  info: { bg: 'var(--c-info-soft)', color: 'var(--c-info)' },
  purple: { bg: 'var(--c-purple-soft)', color: 'var(--c-purple)' },
}

const columns = computed(() => [
  { key: 'orderNo', label: t('dashboard.recentOrderNo'), width: 150 },
  { key: 'memberName', label: t('dashboard.recentCustomer'), width: 90, format: (r) => r.memberName || t('dashboard.guest') },
  { key: 'itemCount', label: t('order.items'), width: 60, align: 'right' },
  { key: 'finalAmount', label: t('order.finalAmount'), width: 90, align: 'right', format: (r) => money(r.finalAmount) },
  { key: 'status', label: t('common.status'), width: 86 },
  { key: 'createdAt', label: t('log.time'), width: 70, align: 'right', format: (r) => timeShort(r.createdAt) },
])

/** 按当前小时选问候语：返回字典键，模板里再 t() 一次 */
const greetingKey = computed(() => {
  const h = new Date().getHours()
  return h < 6
    ? 'dashboard.greetingNight'
    : h < 11
      ? 'dashboard.greetingMorning'
      : h < 14
        ? 'dashboard.greetingNoon'
        : h < 18
          ? 'dashboard.greetingAfternoon'
          : 'dashboard.greetingEvening'
})

const greeting = computed(() => t('dashboard.greetingJoin', { name: user.value?.name || '' }))


async function load() {
  loading.value = true
  try {
    const res = await reportApi.dashboard()
    data.value = res.data
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader :title="$t('dashboard.title')" :desc="$t('dashboard.headerDesc', { greeting, time: data?.updatedAt || '—' })" icon="dashboard">
      <template #actions>
        <AppButton icon="refresh" :loading="loading" @click="load" />
        <AppButton variant="primary" icon="scan" @click="router.push({ name: 'pos' })">{{ $t('dashboard.goPos') }}</AppButton>
      </template>
    </PageHeader>

    <!-- KPI -->
    <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      <template v-if="loading">
        <div v-for="i in 5" :key="i" class="kpi">
          <div class="skeleton" style="height: 14px; width: 60%" />
          <div class="skeleton" style="height: 26px; width: 78%" />
          <div class="skeleton" style="height: 12px; width: 45%" />
        </div>
      </template>
      <div v-for="k in kpis" v-else :key="k.key" class="kpi">
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
          <template v-if="k.compare != null">
            <span
              class="flex items-center gap-0.5 font-medium"
              :style="{ color: k.compare >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              <Icon :name="k.compare >= 0 ? 'trendUp' : 'trendDown'" :size="13" />
              {{ percent(Math.abs(k.compare)) }}
            </span>
            <span>{{ k.foot }}</span>
          </template>
          <span v-else>{{ k.foot }}</span>
        </div>
      </div>
    </div>

    <!-- 主体两列 -->
    <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 mt-3">
      <div class="space-y-3 min-w-0">
        <!-- 销售走势 -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('dashboard.trend') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('dashboard.trendDesc') }}</div>
            </div>
            <div class="seg">
              <button
                v-for="d in [7, 14, 30]"
                :key="d"
                class="seg-item"
                :class="trendDays === d && 'is-active'"
                @click="trendDays = d"
              >
                {{ $t('dashboard.trendDays', { n: d }) }}
              </button>
            </div>
          </div>
          <div class="p-3 pt-4">
            <AppChart
              v-if="trend.length"
              type="line"
              :data="trend"
              x-key="date"
              :series="[
                { key: 'amount', name: $t('report.metricAmount'), area: true },
                { key: 'orders', name: $t('report.metricOrders'), color: 'var(--c-accent)' },
              ]"
              money
              height="268px"
            />
            <div v-else class="skeleton" style="height: 268px" />
          </div>
        </div>

        <!-- 最近订单 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">{{ $t('dashboard.recentOrders') }}</div>
            <button class="text-[12.5px] text-primary hover:underline" @click="router.push({ name: 'orders' })">
              {{ $t('dashboard.viewAll') }}
            </button>
          </div>
          <DataTable :columns="columns" :list="recent" :loading="loading" hover>
            <template #cell-memberName="{ row }">
              <span class="flex items-center gap-1.5">
                <span
                  v-if="row.type === 'member'"
                  class="w-1.5 h-1.5 rounded-full"
                  :style="{ background: 'var(--c-primary)' }"
                />
                {{ row.memberName || $t('dashboard.guest') }}
              </span>
            </template>
            <template #cell-finalAmount="{ row }">
              <span class="price">{{ money(row.finalAmount) }}</span>
            </template>
            <template #cell-status="{ row }">
              <StatusTag :value="row.status" :map="ORDER_STATUS_STYLE" />
            </template>
            <template #cell-orderNo="{ row }">
              <button class="font-mono text-[12.5px] hover:text-primary" @click="router.push({ name: 'order-detail', params: { id: row.id } })">
                {{ row.orderNo }}
              </button>
            </template>
          </DataTable>
        </div>
      </div>

      <!-- 右侧 -->
      <div class="space-y-3">
        <!-- 待办 -->
        <div class="card card-pad">
          <div class="text-[14px] font-semibold mb-3">{{ $t('dashboard.todo') }}</div>
          <div class="space-y-1.5">
            <button
              v-for="t in todos"
              :key="t.label"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors hover:bg-hover text-left"
              @click="router.push(t.to)"
            >
              <span
                class="flex items-center justify-center rounded-md shrink-0"
                :style="{ width: '26px', height: '26px', background: TODOS_TONE[t.tone].bg, color: TODOS_TONE[t.tone].color }"
              >
                <Icon :name="t.icon" :size="14" />
              </span>
              <span class="flex-1 text-[13px]">{{ t.label }}</span>
              <span class="text-[15px] font-semibold num" :style="{ color: TODOS_TONE[t.tone].color }">{{ t.value }}</span>
              <Icon name="chevronRight" :size="13" class="text-text-3" />
            </button>
          </div>
        </div>

        <!-- 支付方式 -->
        <div class="card">
          <div class="panel-head"><div class="text-[14px] font-semibold">{{ $t('dashboard.categoryShare') }}</div></div>
          <div class="p-3">
            <AppChart
              v-if="category.length"
              type="pie"
              :data="category.slice(0, 6)"
              name-key="name"
              value-key="amount"
              :legend="false"
              height="210px"
            />
            <div v-else class="skeleton" style="height: 210px" />
          </div>
        </div>

        <!-- 热销 -->
        <div class="card">
          <div class="panel-head"><div class="text-[14px] font-semibold">{{ $t('dashboard.hotTitle') }}</div></div>
          <div class="p-2">
            <div
              v-for="(p, i) in hot.slice(0, 5)"
              :key="p.productId"
              class="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-hover"
            >
              <span
                class="w-[18px] h-[18px] rounded flex items-center justify-center text-[11px] font-semibold shrink-0"
                :style="{
                  background: i < 3 ? 'var(--c-primary-soft)' : 'var(--c-surface-3)',
                  color: i < 3 ? 'var(--c-primary)' : 'var(--c-text-3)',
                }"
                >{{ i + 1 }}</span
              >
              <span class="flex-1 min-w-0 text-[13px] truncate">{{ p.name }}</span>
              <span class="text-[12.5px] num text-text-2">{{ p.qty }}{{ p.unit || $t('dashboard.unitPiece') }}</span>
              <span class="text-[12.5px] price">{{ money(p.amount) }}</span>
            </div>
          </div>
        </div>

        <!-- 库存预警 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">{{ $t('dashboard.stockWarning') }}</div>
            <button class="text-[12.5px] text-primary hover:underline" @click="router.push({ name: 'stock' })">
              {{ $t('dashboard.restock') }}
            </button>
          </div>
          <div class="p-2">
            <div v-if="!warnings.length" class="empty py-6">
              <Icon name="check" :size="22" :style="{ color: 'var(--c-success)' }" />
              <div class="text-[13px]">{{ $t('dashboard.stockHealthy') }}</div>
            </div>
            <div
              v-for="w in warnings.slice(0, 6)"
              v-else
              :key="w.productId"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover"
            >
              <Icon
                :name="w.stock === 0 ? 'close' : 'alert'"
                :size="13"
                :style="{ color: w.stock === 0 ? 'var(--c-danger)' : 'var(--c-warning)' }"
              />
              <span class="flex-1 min-w-0 text-[12.5px] truncate">{{ w.name }}</span>
              <span class="text-[12px] num" :style="{ color: w.stock === 0 ? 'var(--c-danger)' : 'var(--c-warning)' }">
                {{ $t('dashboard.stockLeft', { n: w.stock, unit: w.unit }) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
