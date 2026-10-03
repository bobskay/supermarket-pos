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

const loading = ref(true)
const member = ref(null)
const tab = ref('orders')

const MEMBER_STATUS_STYLE = {
  active: { label: '正常', class: 'badge-success' },
  disabled: { label: '已注销', class: 'badge-muted' },
}
/** 积分明细的变动类型 → 徽章配色 */
const POINT_TYPE_STYLE = {
  earn: { label: '消费累计', class: 'badge-success' },
  deduct: { label: '积分抵扣', class: 'badge-warning' },
  refund: { label: '退款扣回', class: 'badge-danger' },
}

const orders = computed(() => member.value?.orders || [])
const pointLogs = computed(() => member.value?.pointLogs || [])
const genderText = computed(() => (member.value?.gender === 'female' ? '女' : '男'))

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
  { label: '累计消费', value: money(member.value?.totalConsume || 0), icon: 'money', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: `共 ${member.value?.orderCount || 0} 笔订单` },
  { label: '平均客单价', value: money(avgOrder.value), icon: 'target', color: 'var(--c-accent)', bg: 'var(--c-accent-soft)', foot: '累计消费 ÷ 订单数' },
  { label: '积分余额', value: thousands(member.value?.points || 0), unit: '分', icon: 'star', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)', foot: `储值余额 ${money(member.value?.balance || 0)}` },
])

/** 基础资料：两列栅格逐项展示，空值统一显示 — */
const infoRows = computed(() => {
  const m = member.value || {}
  return [
    { label: '会员号', value: m.memberNo, mono: true },
    { label: '姓名', value: m.name },
    { label: '性别', value: genderText.value },
    { label: '手机号', value: m.phone, mono: true },
    { label: '会员等级', value: m.levelName, level: m.level },
    { label: '会员状态', value: MEMBER_STATUS_STYLE[m.status]?.label || m.status, tone: MEMBER_STATUS_STYLE[m.status]?.class },
    { label: '当前积分', value: `${thousands(m.points || 0)} 分` },
    { label: '储值余额', value: money(m.balance || 0) },
    { label: '累计消费', value: money(m.totalConsume || 0) },
    { label: '订单数', value: `${m.orderCount || 0} 笔` },
    { label: '最后消费时间', value: m.lastConsumeAt ? `${dateOnly(m.lastConsumeAt)} · ${fromNow(m.lastConsumeAt)}` : '从未消费' },
    { label: '注册时间', value: m.createdAt ? dateOnly(m.createdAt) : '—' },
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
const orderColumns = [
  { key: 'orderNo', label: '订单号', width: 156 },
  { key: 'createdAt', label: '时间', width: 148 },
  { key: 'itemCount', label: '件数', width: 70, align: 'right' },
  { key: 'grossAmount', label: '原价', width: 96, align: 'right', format: (r) => money(r.grossAmount) },
  { key: 'discountAmount', label: '优惠', width: 96, align: 'right', format: (r) => money(r.discountAmount) },
  { key: 'finalAmount', label: '实收', width: 104, align: 'right', format: (r) => money(r.finalAmount) },
  { key: 'status', label: '状态', width: 92 },
]

const pointColumns = [
  { key: 'createdAt', label: '时间', width: 152 },
  { key: 'type', label: '类型', width: 100 },
  { key: 'change', label: '变动积分', width: 100, align: 'right' },
  { key: 'orderNo', label: '关联订单号', width: 156 },
  { key: 'amount', label: '订单金额', width: 110, align: 'right', format: (r) => money(r.amount) },
  { key: 'operator', label: '操作人', width: 96 },
]

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
  pointsErr.change = change === 0 ? '调整数量不能为 0' : ''
  pointsErr.reason = pointsForm.reason.trim() ? '' : '请填写调整原因（便于日后对账）'
  if (pointsErr.change || pointsErr.reason) return

  const res = await memberApi.adjustPoints(member.value.id, {
    change,
    reason: pointsForm.reason.trim(),
  })
  toast.ok(res.message || `积分已${change > 0 ? '增加' : '扣减'} ${Math.abs(change)} 分`)
  // 本地合并：积分与明细都要立刻变化，演示时一眼能看出操作生效
  member.value = {
    ...member.value,
    points: Number(member.value.points || 0) + change,
    pointLogs: [
      {
        id: `PT-LOCAL-${Date.now()}`,
        change,
        type: change > 0 ? 'earn' : 'deduct',
        typeName: change > 0 ? '消费累计' : '积分抵扣',
        orderNo: '—',
        amount: 0,
        balance: Number(member.value.points || 0) + change,
        operator: '手工调整',
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
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
      title="会员不存在或已被删除"
      desc="该会员号可能输入有误，或数据已被重置。可返回列表重新检索。"
      :size="92"
    >
      <AppButton variant="primary" icon="arrowLeft" @click="router.push({ name: 'members' })">
        返回会员列表
      </AppButton>
    </Empty>

    <template v-else>
      <!-- 顶部信息条 -->
      <div class="flex items-start justify-between gap-4 flex-wrap pb-4 mb-4 border-b border-line">
        <div class="flex items-start gap-3 min-w-0">
          <AppButton icon="arrowLeft" title="返回会员列表" @click="router.push({ name: 'members' })" />
          <div
            class="shrink-0 flex items-center justify-center rounded-full text-[16px] font-semibold"
            :style="{ width: '42px', height: '42px', background: 'var(--c-primary)', color: '#fff' }"
          >
            {{ (member.name || '?').slice(-1) }}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[17px] font-semibold leading-tight">{{ member.name }}</h1>
              <span class="badge" :class="MEMBER_LEVEL_STYLE[member.level]">{{ member.levelName }}</span>
              <StatusTag :value="member.status" :map="MEMBER_STATUS_STYLE" />
            </div>
            <p class="text-xs text-text-3 mt-1 flex items-center gap-3 flex-wrap">
              <span class="font-mono">{{ member.memberNo }}</span>
              <span>{{ member.phone }}</span>
              <span v-if="member.lastConsumeAt" :title="fromNow(member.lastConsumeAt)">
                最后消费 {{ dateOnly(member.lastConsumeAt) }}
              </span>
              <span v-else>从未消费</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <AppButton icon="edit" @click="router.push({ name: 'member-create', query: { id: member.id } })">
            编辑
          </AppButton>
          <AppButton icon="star" @click="openPoints">调整积分</AppButton>
          <AppButton
            variant="primary"
            icon="receipt"
            @click="router.push({ name: 'orders', query: { keyword: member.memberNo } })"
          >
            查看全部订单
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
              <div class="text-[14px] font-semibold">会员资料</div>
              <span class="text-[11.5px] text-text-3">
                注册 {{ member.createdAt ? dateOnly(member.createdAt) : '—' }}
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
                <div class="text-[11.5px] text-text-3">备注</div>
                <div class="mt-1 text-[13.5px] text-text-2 leading-relaxed">
                  {{ member.remark || '暂无备注' }}
                </div>
              </div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="text-[14px] font-semibold mb-3">积分概览</div>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">当前积分余额</span>
                <span class="num font-semibold">{{ thousands(member.points || 0) }} 分</span>
              </div>
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">累计获得积分</span>
                <span class="num" :style="{ color: 'var(--c-success)' }">+{{ thousands(pointEarned) }}</span>
              </div>
              <div class="flex items-center justify-between text-[13px]">
                <span class="text-text-2">累计抵扣 / 扣回</span>
                <span class="num" :style="{ color: 'var(--c-warning)' }">-{{ thousands(pointUsed) }}</span>
              </div>
              <div class="divider" />
              <div class="text-[11.5px] text-text-3 leading-relaxed">
                积分按门店设置的倍率累计，100 积分可抵扣 1 元；退款订单会同步扣回已累计积分。
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：趋势 + 明细 -->
        <div class="space-y-3 min-w-0">
          <div class="card">
            <div class="panel-head">
              <div>
                <div class="text-[14px] font-semibold">消费趋势</div>
                <div class="text-[11.5px] text-text-3 mt-0.5">按下单日期聚合的实收金额</div>
              </div>
              <span class="text-[12px] text-text-3">
                近 {{ trend.length }} 个消费日 · 合计 <span class="price">{{ money(ordersTotal) }}</span>
              </span>
            </div>
            <div class="p-3 pt-4">
              <AppChart
                v-if="trendEnough"
                type="line"
                :data="trend"
                x-key="date"
                :series="[{ key: 'amount', name: '消费金额', area: true }]"
                money
                height="240px"
              />
              <div v-else class="empty py-10">
                <Icon name="chart" :size="26" class="text-text-3 opacity-70" />
                <div class="text-text-2 text-[13px]">消费数据不足，无法绘制趋势</div>
                <div class="text-[12px] text-text-3">该会员目前只有 {{ trend.length }} 个消费日数据</div>
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
                  消费记录（{{ orders.length }}）
                </button>
                <button
                  class="seg-item"
                  :class="tab === 'points' && 'is-active'"
                  @click="tab = 'points'"
                >
                  积分明细（{{ pointLogs.length }}）
                </button>
              </div>
              <span class="text-[11.5px] text-text-3">
                实收合计 <span class="price">{{ money(ordersTotal) }}</span>
                <template v-if="orders.length"> · 优惠合计 {{ money(sumBy(orders, (o) => o.discountAmount)) }}</template>
              </span>
            </div>

            <!-- 消费记录 -->
            <DataTable
              v-if="tab === 'orders'"
              :columns="orderColumns"
              :list="orders"
              row-key="id"
              empty-text="该会员暂无消费记录"
              empty-hint="收银台开单时选择该会员即可累积消费与积分"
            >
              <template #cell-orderNo="{ row }">
                <button
                  class="font-mono text-[12.5px] hover:text-primary"
                  title="查看订单详情"
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
                <StatusTag :value="row.status" :map="ORDER_STATUS_STYLE" />
              </template>
            </DataTable>

            <!-- 积分明细 -->
            <DataTable
              v-else
              :columns="pointColumns"
              :list="pointLogs"
              row-key="id"
              empty-text="该会员暂无积分变动记录"
              empty-hint="消费累计、积分抵扣与退款扣回都会在这里留痕"
            >
              <template #cell-createdAt="{ row }">
                <span :title="fromNow(row.createdAt)">{{ row.createdAt }}</span>
              </template>
              <template #cell-type="{ row }">
                <StatusTag :value="row.type" :map="POINT_TYPE_STYLE" />
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
      title="调整积分"
      :subtitle="member ? `${member.name} · ${member.memberNo}` : ''"
      width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField label="当前积分">
          <input class="input w-full num" :value="`${thousands(member?.points || 0)} 分`" disabled />
        </FormField>
        <FormField label="调整后积分">
          <input
            class="input w-full num"
            :value="`${thousands(Number(member?.points || 0) + Number(pointsForm.change || 0))} 分`"
            disabled
          />
        </FormField>
        <FormField label="调整数量" required :error="pointsErr.change" hint="正数增加、负数扣减" span="2">
          <div class="flex items-center gap-2">
            <AppButton icon="minus" @click="stepPoints(-10)">-10</AppButton>
            <input v-model.number="pointsForm.change" type="number" class="input w-full num text-center" />
            <AppButton icon="plus" @click="stepPoints(10)">+10</AppButton>
          </div>
        </FormField>
        <FormField label="调整原因" required :error="pointsErr.reason" span="2">
          <input v-model="pointsForm.reason" class="input w-full" placeholder="如：活动补偿 / 积分兑换 / 手工纠正" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitPoints(close)">确认调整</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
