<script setup>
/**
 * 会员详情
 * ------------------------------------------------------------------
 * 后端 /members/:id 已经一次性返回 { ...member, orders, pointLogs }，
 * 所以这一页只发一个请求：把「消费趋势 / 消费记录 / 积分明细」都在前端聚合，
 * 演示时页面切换更快，也少一次接口往返。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { memberApi } from '@/api'
import {
  money, thousands, dateOnly, fromNow, sumBy, calc,
  MEMBER_LEVEL_STYLE, ORDER_STATUS_STYLE,
} from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import Empty from '@/components/ui/Empty.vue'
import PageShell from '@/components/layout/PageShell.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppChart from '@/components/ui/AppChart.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { t, tl } = useI18n()

const loading = ref(true)
const member = ref(null)
const tab = ref('orders')

/* --------------------- 等级码 / 状态码 / 积分类型 → 字典文案 --------------------- */
const LEVEL_KEY = {
  normal: 'member.levelNormal',
  silver: 'member.levelSilver',
  gold: 'member.levelGold',
  diamond: 'member.levelDiamond',
}
const LEVEL_NAME_KEY = {
  '普通会员': 'member.levelNormal',
  '银卡会员': 'member.levelSilver',
  '金卡会员': 'member.levelGold',
  '钻石会员': 'member.levelDiamond',
}
const MEMBER_STATUS_CLASS = {
  active: 'badge-success',
  disabled: 'badge-muted',
}
/** 状态徽章：配色沿用原映射，文案按当前语言取 */
const statusMap = computed(() => ({
  active: { label: t('member.normal'), class: MEMBER_STATUS_CLASS.active },
  disabled: { label: t('member.cancelled'), class: MEMBER_STATUS_CLASS.disabled },
}))
/** 订单状态徽章：配色沿用 utils/format 的映射，文案按当前语言取 */
const STATUS_KEY = {
  paid: 'order.statusPaid',
  unpaid: 'order.statusUnpaid',
  refunded: 'order.statusRefunded',
  partial_refund: 'order.statusPartialRefund',
  void: 'order.statusVoid',
}
const orderStatusMap = computed(() => {
  const out = {}
  for (const [code, cfg] of Object.entries(ORDER_STATUS_STYLE)) {
    out[code] = { ...cfg, label: STATUS_KEY[code] ? t(STATUS_KEY[code]) : cfg.label }
  }
  return out
})
/** 积分明细的变动类型 → 徽章配色 + 字典文案 */
const POINT_TYPE_KEY = {
  earn: 'member.pointEarn',
  deduct: 'member.pointDeduct',
  refund: 'member.pointRefund',
}
const POINT_TYPE_CLASS = {
  earn: 'badge-success',
  deduct: 'badge-warning',
  refund: 'badge-danger',
}
const pointTypeMap = computed(() => {
  const out = {}
  for (const code of Object.keys(POINT_TYPE_KEY)) {
    out[code] = { label: t(POINT_TYPE_KEY[code]), class: POINT_TYPE_CLASS[code] }
  }
  return out
})

function statusText(rec) {
  return statusMap.value[rec?.status]?.label || tl(rec, 'statusName', rec?.status || '')
}

/** 等级文案：优先按等级码取字典，缺码时按中文名反查，最后回退原值 */
function levelText(rec) {
  if (rec?.level && LEVEL_KEY[rec.level]) return t(LEVEL_KEY[rec.level])
  const key = LEVEL_NAME_KEY[rec?.levelName]
  return key ? t(key) : tl(rec, 'levelName')
}

function pointsText(n) {
  return `${thousands(Number(n || 0))} ${t('member.pointsUnit')}`
}

const orders = computed(() => member.value?.orders || [])
const pointLogs = computed(() => member.value?.pointLogs || [])
const genderText = computed(() => (member.value?.gender === 'female' ? t('member.female') : t('member.male')))

async function load() {
  loading.value = true
  try {
    const res = await memberApi.detail(route.params.id)
    member.value = res.data
  } catch {
    // 会员不存在时后端返回 404，这里保持 member 为空走 Empty 兜底
    member.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* ------------------------------ 统计 ------------------------------ */
const avgOrder = computed(() => {
  const m = member.value
  if (!m || !m.orderCount) return 0
  return calc(Number(m.totalConsume || 0) / Number(m.orderCount))
})

const stats = computed(() => [
  {
    label: t('member.totalConsume'),
    value: money(member.value?.totalConsume || 0),
    icon: 'money',
    color: 'var(--c-primary)',
    bg: 'var(--c-primary-soft)',
    foot: t('member.ordersFoot', { n: member.value?.orderCount || 0 }),
  },
  {
    label: t('member.avgOrderAmount'),
    value: money(avgOrder.value),
    icon: 'target',
    color: 'var(--c-accent)',
    bg: 'var(--c-accent-soft)',
    foot: t('member.avgFoot'),
  },
  {
    label: t('member.pointsBalanceLabel'),
    value: thousands(member.value?.points || 0),
    unit: t('member.pointsUnit'),
    icon: 'star',
    color: 'var(--c-warning)',
    bg: 'var(--c-warning-soft)',
    foot: t('member.balanceFootLabel', { amount: money(member.value?.balance || 0) }),
  },
])

/** 基础资料：两列栅格逐项展示，空值统一显示 — */
const infoRows = computed(() => {
  const m = member.value || {}
  const st = statusMap.value[m.status]
  return [
    { label: t('member.memberNo'), value: m.memberNo, mono: true },
    { label: t('member.name'), value: m.name },
    { label: t('member.gender'), value: genderText.value },
    { label: t('member.phone'), value: m.phone, mono: true },
    { label: t('member.levelLabel'), value: levelText(m), level: m.level },
    { label: t('member.statusLabel'), value: st?.label || m.status, tone: st?.class },
    { label: t('member.currentPoints'), value: pointsText(m.points || 0) },
    { label: t('member.balance'), value: money(m.balance || 0) },
    { label: t('member.totalConsume'), value: money(m.totalConsume || 0) },
    { label: t('member.orderCount'), value: `${m.orderCount || 0} ${t('member.unitOrder')}` },
    {
      label: t('member.lastConsumeAt'),
      value: m.lastConsumeAt ? `${dateOnly(m.lastConsumeAt)} · ${fromNow(m.lastConsumeAt)}` : t('member.neverConsumed'),
    },
    { label: t('member.createdAt'), value: m.createdAt ? dateOnly(m.createdAt) : '—' },
  ]
})

/* ---------------------------- 消费趋势 ---------------------------- */
/** 把订单按日期聚合成金额序列，用于折线图 */
const trend = computed(() => {
  const map = new Map()
  for (const o of orders.value) {
    const day = String(o.date || o.createdAt || '').slice(0, 10)
    if (!day) continue
    const cur = map.get(day) || { date: day, amount: 0, orders: 0 }
    cur.amount = calc(cur.amount + Number(o.finalAmount || 0))
    cur.orders += 1
    map.set(day, cur)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
})
/** 只有 1 个数据点的折线看不出趋势，直接提示数据不足更诚实 */
const trendEnough = computed(() => trend.value.length >= 2)

/* ---------------------------- 表格列 ---------------------------- */
const orderColumns = computed(() => [
  { key: 'orderNo', label: t('order.orderNo'), width: 156 },
  { key: 'createdAt', label: t('common.time'), width: 148 },
  { key: 'itemCount', label: t('order.items'), width: 70, align: 'right' },
  { key: 'grossAmount', label: t('order.grossAmount'), width: 96, align: 'right', format: (r) => money(r.grossAmount) },
  { key: 'discountAmount', label: t('order.discount'), width: 96, align: 'right', format: (r) => money(r.discountAmount) },
  { key: 'finalAmount', label: t('order.paid'), width: 104, align: 'right', format: (r) => money(r.finalAmount) },
  { key: 'status', label: t('common.status'), width: 92 },
])

const pointColumns = computed(() => [
  { key: 'createdAt', label: t('common.time'), width: 152 },
  { key: 'type', label: t('common.type'), width: 100 },
  { key: 'change', label: t('member.pointsChange'), width: 100, align: 'right' },
  { key: 'orderNo', label: t('member.relatedOrder'), width: 156 },
  { key: 'amount', label: t('member.orderAmount'), width: 110, align: 'right', format: (r) => money(r.amount) },
  { key: 'operator', label: t('common.operator'), width: 96 },
])

const ordersTotal = computed(() => sumBy(orders.value, (o) => o.finalAmount))
const pointEarned = computed(() => pointLogs.value.filter((p) => p.change > 0).reduce((s, p) => s + p.change, 0))
const pointUsed = computed(() => Math.abs(pointLogs.value.filter((p) => p.change < 0).reduce((s, p) => s + p.change, 0)))

/* ---------------------------- 调整积分 ---------------------------- */
const pointsVisible = ref(false)
const pointsForm = reactive({ change: 0, reason: '' })
const pointsErr = reactive({ change: '', reason: '' })

function openPoints() {
  pointsForm.change = 0
  pointsForm.reason = ''
  pointsErr.change = ''
  pointsErr.reason = ''
  pointsVisible.value = true
}

function stepPoints(n) {
  pointsForm.change = Number(pointsForm.change || 0) + n
}

async function submitPoints(close) {
  const change = Number(pointsForm.change || 0)
  pointsErr.change = change === 0 ? t('member.adjustZero') : ''
  pointsErr.reason = pointsForm.reason.trim() ? '' : t('member.adjustReasonRequired')
  if (pointsErr.change || pointsErr.reason) return

  const res = await memberApi.adjustPoints(member.value.id, {
    change,
    reason: pointsForm.reason.trim(),
  })
  toast.ok(
    res.message ||
      (change > 0
        ? t('member.pointsAdded', { n: Math.abs(change) })
        : t('member.pointsDeducted', { n: Math.abs(change) })),
  )
  // 本地合并：积分与明细都要立刻变化，演示时一眼能看出操作生效
  member.value = {
    ...member.value,
    points: Number(member.value.points || 0) + change,
    pointLogs: [
      {
        id: `PT-LOCAL-${Date.now()}`,
        change,
        type: change > 0 ? 'earn' : 'deduct',
        typeName: change > 0 ? t('member.pointEarn') : t('member.pointDeduct'),
        orderNo: '—',
        amount: 0,
        balance: Number(member.value.points || 0) + change,
        operator: t('member.manualAdjust'),
        createdAt: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 8)}`,
      },
      ...pointLogs.value,
    ],
  }
  close()
}
</script>

<template>
  <PageShell>
    <!-- 加载骨架 -->
    <template v-if="loading">
      <div class="flex items-center gap-3 pb-4 mb-4 border-b border-line">
        <div class="skeleton" style="height: 34px; width: 34px" />
        <div class="space-y-2">
          <div class="skeleton" style="height: 18px; width: 180px" />
          <div class="skeleton" style="height: 12px; width: 260px" />
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div v-for="i in 3" :key="i" class="kpi">
          <div class="skeleton" style="height: 14px; width: 50%" />
          <div class="skeleton" style="height: 26px; width: 70%" />
          <div class="skeleton" style="height: 12px; width: 45%" />
        </div>
      </div>
      <div class="skeleton mt-3" style="height: 280px" />
    </template>

    <!-- 会员不存在 -->
    <Empty
      v-else-if="!member"
      icon="members"
      :title="$t('member.detailEmpty')"
      :desc="$t('member.detailEmptyDesc')"
      :size="92"
    >
      <AppButton variant="primary" icon="arrowLeft" @click="router.push({ name: 'members' })">
        {{ $t('member.backToList') }}
      </AppButton>
    </Empty>

    <template v-else>
      <!-- 顶部信息条 -->
      <div class="flex items-start justify-between gap-4 flex-wrap pb-4 mb-4 border-b border-line">
        <div class="flex items-start gap-3 min-w-0">
          <AppButton icon="arrowLeft" :title="$t('member.backToList')" @click="router.push({ name: 'members' })" />
          <div
            class="shrink-0 flex items-center justify-center rounded-full text-[16px] font-semibold"
            :style="{ width: '42px', height: '42px', background: 'var(--c-primary)', color: '#fff' }"
          >
            {{ (member.name || '?').slice(-1) }}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[17px] font-semibold leading-tight">{{ member.name }}</h1>
              <span class="badge" :class="MEMBER_LEVEL_STYLE[member.level]">{{ levelText(member) }}</span>
              <StatusTag :value="member.status" :map="statusMap" />
            </div>
            <p class="text-xs text-text-3 mt-1 flex items-center gap-3 flex-wrap">
              <span class="font-mono">{{ member.memberNo }}</span>
              <span>{{ member.phone }}</span>
              <span v-if="member.lastConsumeAt" :title="fromNow(member.lastConsumeAt)">
                {{ $t('member.lastConsumeAtLabel', { date: dateOnly(member.lastConsumeAt) }) }}
              </span>
              <span v-else>{{ $t('member.neverConsumed') }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <AppButton icon="edit" @click="router.push({ name: 'member-create', query: { id: member.id } })">
            {{ $t('common.edit') }}
          </AppButton>
          <AppButton icon="star" @click="openPoints">{{ $t('member.adjustPoints') }}</AppButton>
          <AppButton
            variant="primary"
            icon="receipt"
            @click="router.push({ name: 'orders', query: { keyword: member.memberNo } })"
          >
            {{ $t('member.viewAllOrders') }}
          </AppButton>
        </div>
      </div>

      <!-- 统计卡 -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div v-for="s in stats" :key="s.label" class="kpi">
          <div class="flex items-start justify-between">
            <div class="kpi-label">{{ s.label }}</div>
            <span
              class="flex items-center justify-center rounded-md shrink-0"
              :style="{ width: '26px', height: '26px', background: s.bg, color: s.color }"
            >
              <Icon :name="s.icon" :size="14" />
            </span>
          </div>
          <div class="kpi-value" :style="{ color: s.color }">
            {{ s.value }}<span v-if="s.unit" class="text-[13px] text-text-3 ml-1 font-normal">{{ s.unit }}</span>
          </div>
          <div class="kpi-foot">{{ s.foot }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-3 mt-3">
        <!-- 左侧资料卡 -->
        <div class="space-y-3">
          <div class="card">
            <div class="panel-head">
              <div class="text-[14px] font-semibold">{{ $t('member.profileTitle') }}</div>
              <span class="text-[11.5px] text-text-3">
                {{ $t('member.joinedAt', { date: member.createdAt ? dateOnly(member.createdAt) : '—' }) }}
              </span>
            </div>
            <div class="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <div v-for="r in infoRows" :key="r.label" class="min-w-0">
                <div class="text-[11.5px] text-text-3">{{ r.label }}</div>
                <div class="mt-1 text-[13.5px] truncate" :class="r.mono && 'font-mono'">
                  <span v-if="r.level" class="badge" :class="MEMBER_LEVEL_STYLE[r.level]">{{ r.value }}</span>
                  <span v-else-if="r.tone" class="badge" :class="r.tone">{{ r.value }}</span>
                  <span v-else>{{ r.value || '—' }}</span>
                </div>
              </div>
              <div class="col-span-2">
                <div class="text-[11.5px] text-text-3">{{ $t('common.remark') }}</div>
                <div class="mt-1 text-[13.5px] text-text-2 leading-relaxed">
                  {{ member.remark || $t('member.noRemark') }}
                </div>
              </div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="text-[14px] font-semibold mb-3">{{ $t('member.pointsOverview') }}</div>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">{{ $t('member.pointsBalanceNow') }}</span>
                <span class="num font-semibold">{{ pointsText(member.points || 0) }}</span>
              </div>
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">{{ $t('member.pointsEarnedTotal') }}</span>
                <span class="num" :style="{ color: 'var(--c-success)' }">+{{ thousands(pointEarned) }}</span>
              </div>
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">{{ $t('member.pointsUsedTotal') }}</span>
                <span class="num" :style="{ color: 'var(--c-warning)' }">-{{ thousands(pointUsed) }}</span>
              </div>
              <div class="divider" />
              <div class="text-[11.5px] text-text-3 leading-relaxed">
                {{ $t('member.pointsNote') }}
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：趋势 + 明细 -->
        <div class="space-y-3 min-w-0">
          <div class="card">
            <div class="panel-head">
              <div>
                <div class="text-[14px] font-semibold">{{ $t('member.consumeTrend') }}</div>
                <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('member.consumeTrendDesc') }}</div>
              </div>
              <span class="text-[12px] text-text-3">
                {{ $t('member.trendRange', { n: trend.length, amount: money(ordersTotal) }) }}
              </span>
            </div>
            <div class="p-3 pt-4">
              <AppChart
                v-if="trendEnough"
                type="line"
                :data="trend"
                x-key="date"
                :series="[{ key: 'amount', name: $t('member.consumeAmount'), area: true }]"
                money
                height="240px"
              />
              <div v-else class="empty py-10">
                <Icon name="chart" :size="26" class="text-text-3 opacity-70" />
                <div class="text-text-2 text-[13px]">{{ $t('member.trendEmpty') }}</div>
                <div class="text-[12px] text-text-3">{{ $t('member.trendEmptyDesc', { n: trend.length }) }}</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="panel-head">
              <div class="seg">
                <button
                  class="seg-item"
                  :class="tab === 'orders' && 'is-active'"
                  @click="tab = 'orders'"
                >
                  {{ $t('member.consumeRecord') }}（{{ orders.length }}）
                </button>
                <button
                  class="seg-item"
                  :class="tab === 'points' && 'is-active'"
                  @click="tab = 'points'"
                >
                  {{ $t('member.pointsRecord') }}（{{ pointLogs.length }}）
                </button>
              </div>
              <span class="text-[11.5px] text-text-3">
                {{ $t('member.ordersTotal', { amount: money(ordersTotal) }) }}
                <template v-if="orders.length"> · {{ $t('order.discountTotal') }} {{ money(sumBy(orders, (o) => o.discountAmount)) }}</template>
              </span>
            </div>

            <!-- 消费记录 -->
            <DataTable
              v-if="tab === 'orders'"
              :columns="orderColumns"
              :list="orders"
              row-key="id"
              :empty-text="$t('member.noConsume')"
              :empty-hint="$t('member.noConsumeHint')"
            >
              <template #cell-orderNo="{ row }">
                <button
                  class="font-mono text-[12.5px] hover:text-primary"
                  :title="$t('common.detail')"
                  @click="router.push({ name: 'order-detail', params: { id: row.id } })"
                >
                  {{ row.orderNo }}
                </button>
              </template>
              <template #cell-createdAt="{ row }">
                <span :title="fromNow(row.createdAt)">{{ row.createdAt }}</span>
              </template>
              <template #cell-itemCount="{ row }">
                <span class="num">{{ row.itemCount }}</span>
              </template>
              <template #cell-grossAmount="{ row }">
                <span class="num text-text-2">{{ money(row.grossAmount) }}</span>
              </template>
              <template #cell-discountAmount="{ row }">
                <span class="num" :style="{ color: row.discountAmount ? 'var(--c-warning)' : 'var(--c-text-3)' }">
                  {{ row.discountAmount ? `-${money(row.discountAmount)}` : money(0) }}
                </span>
              </template>
              <template #cell-finalAmount="{ row }">
                <span class="price">{{ money(row.finalAmount) }}</span>
              </template>
              <template #cell-status="{ row }">
                <StatusTag :value="row.status" :map="orderStatusMap" />
              </template>
            </DataTable>

            <!-- 积分明细 -->
            <DataTable
              v-else
              :columns="pointColumns"
              :list="pointLogs"
              row-key="id"
              :empty-text="$t('member.noPointLogs')"
              :empty-hint="$t('member.noPointLogsHint')"
            >
              <template #cell-createdAt="{ row }">
                <span :title="fromNow(row.createdAt)">{{ row.createdAt }}</span>
              </template>
              <template #cell-type="{ row }">
                <StatusTag :value="row.type" :map="pointTypeMap" />
              </template>
              <template #cell-change="{ row }">
                <span
                  class="num font-semibold"
                  :style="{ color: row.change >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
                >
                  {{ row.change >= 0 ? '+' : '-' }}{{ thousands(Math.abs(row.change)) }}
                </span>
              </template>
              <template #cell-orderNo="{ row }">
                <span class="font-mono text-[12.5px] text-text-2">{{ row.orderNo || '—' }}</span>
              </template>
              <template #cell-operator="{ row }">
                <span>{{ row.operator || '—' }}</span>
              </template>
            </DataTable>
          </div>
        </div>
      </div>
    </template>

    <!-- 调整积分 -->
    <AppModal
      v-model="pointsVisible"
      :title="$t('member.adjustPoints')"
      :subtitle="member ? `${member.name} · ${member.memberNo}` : ''"
      width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('member.currentPoints')">
          <input class="input w-full num" :value="pointsText(member?.points || 0)" disabled />
        </FormField>
        <FormField :label="$t('member.adjustAfter')">
          <input
            class="input w-full num"
            :value="pointsText(Number(member?.points || 0) + Number(pointsForm.change || 0))"
            disabled
          />
        </FormField>
        <FormField :label="$t('member.adjustQty')" required :error="pointsErr.change" :hint="$t('member.adjustQtyHint')" span="2">
          <div class="flex items-center gap-2">
            <AppButton icon="minus" @click="stepPoints(-10)">-10</AppButton>
            <input v-model.number="pointsForm.change" type="number" class="input w-full num text-center" />
            <AppButton icon="plus" @click="stepPoints(10)">+10</AppButton>
          </div>
        </FormField>
        <FormField :label="$t('member.adjustReason')" required :error="pointsErr.reason" span="2">
          <input v-model="pointsForm.reason" class="input w-full" :placeholder="$t('member.reasonPlaceholder')" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="check" @click="submitPoints(close)">{{ $t('member.adjustConfirm') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
