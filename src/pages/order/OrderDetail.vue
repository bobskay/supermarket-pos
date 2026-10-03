<script setup>
/**
 * 订单详情
 * ------------------------------------------------------------------
 * 一单的完整凭证视图：基本信息 + 金额构成 + 商品明细 + 退款记录 + 80mm 小票预览。
 *
 * 明细里的「毛利率」需要进价，而订单 items 只存了售价快照，
 * 所以这里一次性拉全量商品档案建 productId → costPrice 映射（商品仅 60 余条，
 * 比按行逐个请求更省事，也不会出现部分行缺数据）。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { orderApi, productApi } from '@/api'
import { money, qty, percent, fromNow, ORDER_STATUS_STYLE, MEMBER_LEVEL_STYLE } from '@/utils/format'
import { printElement } from '@/utils/export'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import AppButton from '@/components/ui/AppButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import Icon from '@/components/ui/Icon.vue'
import Empty from '@/components/ui/Empty.vue'
import AppModal from '@/components/ui/AppModal.vue'
import FormField from '@/components/ui/FormField.vue'

const route = useRoute()
const router = useRouter()
const { user, isManager } = useAuth()
const toast = useToast()
const confirm = useConfirm()
const { t, tl } = useI18n()

const loading = ref(true)
const detail = ref(null)
const costMap = ref({})
const receiptRef = ref(null)
const printing = ref(false)

/* --------------------- 状态码 / 等级码 → 字典文案 --------------------- */
const STATUS_KEY = {
  paid: 'order.statusPaid',
  unpaid: 'order.statusUnpaid',
  refunded: 'order.statusRefunded',
  partial_refund: 'order.statusPartialRefund',
  void: 'order.statusVoid',
}
const LEVEL_KEY = {
  normal: 'member.levelNormal',
  silver: 'member.levelSilver',
  gold: 'member.levelGold',
  diamond: 'member.levelDiamond',
}
/** 订单里的会员只有中文等级名（mock 未提供 level 码），按名称反查字典键 */
const LEVEL_NAME_KEY = {
  '普通会员': 'member.levelNormal',
  '银卡会员': 'member.levelSilver',
  '金卡会员': 'member.levelGold',
  '钻石会员': 'member.levelDiamond',
}

const statusMap = computed(() => {
  const out = {}
  for (const [code, cfg] of Object.entries(ORDER_STATUS_STYLE)) {
    out[code] = { ...cfg, label: STATUS_KEY[code] ? t(STATUS_KEY[code]) : cfg.label }
  }
  return out
})

/** 会员等级：优先按等级码取字典，缺码时按中文名反查，最后回退原值 */
function levelText(rec) {
  if (rec?.memberLevel && LEVEL_KEY[rec.memberLevel]) return t(LEVEL_KEY[rec.memberLevel])
  const key = LEVEL_NAME_KEY[rec?.memberLevelName]
  return key ? t(key) : tl(rec, 'memberLevelName')
}

/** 订单类型：按类型码取字典，缺码时回退后端给的中文名 */
function typeText(rec) {
  if (rec?.type === 'member') return t('pos.memberOrder')
  if (rec?.type === 'normal') return t('pos.normalOrder')
  return rec?.typeName || ''
}

/* ------------------------------- 加载 ------------------------------- */
onMounted(async () => {
  loading.value = true
  try {
    const [res, prods] = await Promise.all([
      orderApi.detail(route.params.id),
      // 进价只用于算毛利，失败也不该阻断整页渲染
      productApi.list({ pageSize: 0 }).catch(() => null),
    ])
    detail.value = res.data || null
    const map = {}
    for (const p of prods?.data?.list || []) map[p.id] = p
    costMap.value = map
  } finally {
    loading.value = false
  }
})

/* ------------------------------- 派生数据 ------------------------------- */
const order = computed(() => detail.value)
const items = computed(() => order.value?.items || [])

/** 商品原价合计：优先用后端字段，缺失时退回按商品行小计求和 */
const grossAmount = computed(
  () => order.value?.grossAmount ?? items.value.reduce((s, it) => s + Number(it.subtotal || 0), 0),
)
const discountAmount = computed(() => Number(order.value?.discountAmount || 0))
const pointsUsed = computed(() => Number(order.value?.pointsUsed || 0))
const pointsDiscount = computed(() => Number(order.value?.pointsDiscount || 0))
const finalAmount = computed(() => Number(order.value?.finalAmount || 0))
const totalQty = computed(() => items.value.reduce((s, it) => s + Number(it.qty || 0), 0))

/* ------------------------------- 小票抬头 ------------------------------- */
const storeName = computed(() => t('order.receiptStore'))
const shopAddr = computed(() => t('order.receiptAddress'))

const INFO = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    { label: t('order.orderNo'), value: o.orderNo, mono: true },
    { label: t('order.createdAt'), value: `${o.createdAt}（${fromNow(o.createdAt)}）`, mono: true },
    { label: t('order.settledAt'), value: o.settledAt || t('order.statusUnpaid'), mono: true },
    { label: t('order.orderType'), value: typeText(o) },
    { label: t('order.cashier'), value: `${o.operatorName || o.cashierName || '—'}${o.operatorId ? `（${o.operatorId}）` : ''}` },
    { label: t('common.remark'), value: o.remark || t('common.none') },
  ]
})

const PAY_ICON = { cash: 'money', wechat: 'phone', alipay: 'qrcode', card: 'card' }
const PAY_TONE = { cash: 'var(--c-success)', wechat: 'var(--c-accent)', alipay: 'var(--c-info)', card: 'var(--c-purple)' }
/** 支付方式码 → 字典键（与收银台共用 pos.* 文案） */
const PAY_KEY = { cash: 'pos.cash', wechat: 'pos.wechat', alipay: 'pos.alipay', card: 'pos.storedCard' }

function payLabel(p) {
  if (PAY_KEY[p.method]) return t(PAY_KEY[p.method])
  return p.methodName || p.method
}
function payIcon(method) {
  return PAY_ICON[method] || 'wallet'
}
function payTone(method) {
  return PAY_TONE[method] || 'var(--c-text-2)'
}

/** 毛利率：只有拿到进价才算，拿不到就留空而不是硬凑 100% */
function margin(row) {
  const cost = costMap.value[row.productId]?.costPrice
  const price = Number(row.price || 0)
  if (cost == null || !price) return ''
  return percent(((price - Number(cost)) / price) * 100)
}

const itemColumns = computed(() => [
  { key: 'barcode', label: t('product.barcode'), width: 136 },
  { key: 'name', label: t('product.name') },
  { key: 'unit', label: t('common.unit'), width: 62, align: 'center' },
  { key: 'price', label: t('pos.price'), width: 96, align: 'right', format: (r) => money(r.price) },
  { key: 'qty', label: t('common.quantity'), width: 76, align: 'right', format: (r) => qty(r.qty) },
  { key: 'subtotal', label: t('pos.subtotal'), width: 104, align: 'right', format: (r) => money(r.subtotal) },
  { key: 'margin', label: t('order.profitRate'), width: 84, align: 'right' },
])

/* ------------------------------- 打印 / 退款 ------------------------------- */
async function onPrint() {
  printing.value = true
  const res = await orderApi.print(order.value.id)
  printing.value = false
  toast.ok(res.message)
}

function onPrintPreview() {
  // printElement 会给小票挂上 print-area，打印时只输出这一块
  printElement(receiptRef.value)
}

const refundVisible = ref(false)
const refundForm = reactive({ type: 'full', amount: 0, reason: '' })

function openRefund() {
  if (!isManager.value) {
    toast.warning(t('order.noRefundPermission'))
    return
  }
  refundForm.type = 'full'
  refundForm.amount = finalAmount.value
  refundForm.reason = ''
  refundVisible.value = true
}

function onRefundTypeChange() {
  if (refundForm.type === 'full') refundForm.amount = finalAmount.value
}

async function submitRefund() {
  const amount = refundForm.type === 'full' ? finalAmount.value : Number(refundForm.amount || 0)
  if (amount <= 0 || amount > finalAmount.value) {
    toast.warning(t('order.refundAmountInvalid'))
    return
  }
  const reason = refundForm.reason.trim() || t('order.refundDefaultReason')

  const go = await confirm({
    title: t('order.confirmRefund'),
    content: t('order.refundConfirmContent', {
      no: order.value.orderNo,
      amount: money(amount),
      type: refundForm.type === 'full' ? t('order.refundFullShort') : t('order.refundPartialShort'),
      reason,
    }),
    danger: true,
    confirmText: t('order.confirmRefund'),
  })
  if (!go) return

  const res = await orderApi.refund(order.value.id, { type: refundForm.type, amount, reason })
  toast.ok(res.message)
  // 后端不落库，本地覆盖这一单的退款信息，让页面立刻反映结果
  detail.value = {
    ...order.value,
    status: refundForm.type === 'full' ? 'refunded' : 'partial_refund',
    refund: {
      id: res.data?.refundNo || `TK${Date.now()}`,
      amount,
      type: refundForm.type,
      reason,
      operator: user.value?.name || '',
      createdAt: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 8)}`,
    },
  }
  refundVisible.value = false
}

function goBack() {
  router.push({ name: 'orders' })
}

function goMember() {
  router.push({ name: 'member-detail', params: { id: order.value.memberId } })
}
</script>

<template>
  <PageShell>
    <!-- 加载骨架 -->
    <template v-if="loading">
      <div class="flex items-center gap-3">
        <div class="skeleton" style="height: 34px; width: 110px" />
        <div class="skeleton" style="height: 22px; width: 190px" />
        <div class="skeleton" style="height: 22px; width: 78px" />
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 mt-4">
        <div class="space-y-3">
          <div class="card card-pad"><div class="skeleton" style="height: 160px" /></div>
          <div class="card card-pad"><div class="skeleton" style="height: 220px" /></div>
        </div>
        <div class="card card-pad"><div class="skeleton" style="height: 420px" /></div>
      </div>
    </template>

    <!-- 订单不存在（例如手动改了 hash 里的 id） -->
    <div v-else-if="!order" class="card card-pad mt-4">
      <Empty icon="inbox" :title="$t('order.detailEmpty')" :desc="$t('order.detailEmptyDesc', { id: route.params.id })">
        <AppButton variant="primary" icon="arrowLeft" @click="goBack">{{ $t('order.backToList') }}</AppButton>
      </Empty>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="flex items-start justify-between gap-4 flex-wrap pb-4 mb-4 border-b border-line">
        <div class="flex items-start gap-3 min-w-0">
          <AppButton icon="arrowLeft" :title="$t('order.backToList')" @click="goBack" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[17px] font-semibold font-mono">{{ order.orderNo }}</h1>
              <StatusTag :value="order.status" :map="statusMap" />
            </div>
            <p class="text-xs text-text-3 mt-1">
              {{ $t('order.openedBy', { name: order.operatorName || order.cashierName, pieces: qty(totalQty) }) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <AppButton icon="print" :loading="printing" @click="onPrint">{{ $t('order.printReceipt') }}</AppButton>
          <AppButton
            v-if="order.status === 'paid' || order.status === 'partial_refund'"
            variant="danger"
            icon="undo"
            @click="openRefund"
          >
            {{ $t('order.refund') }}
          </AppButton>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 items-start">
        <!-- 左栏 -->
        <div class="space-y-3 min-w-0">
          <!-- 订单信息 -->
          <div class="card">
            <div class="panel-head"><div class="text-[14px] font-semibold">{{ $t('order.baseInfo') }}</div></div>
            <div class="p-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <div v-for="f in INFO" :key="f.label" class="flex items-start justify-between gap-3 py-1.5 border-b border-line">
                  <span class="text-[12.5px] text-text-3 shrink-0">{{ f.label }}</span>
                  <span class="text-[13px] text-right break-all" :class="f.mono && 'num'">{{ f.value }}</span>
                </div>

                <!-- 会员信息：可直接跳到会员档案 -->
                <div class="flex items-start justify-between gap-3 py-1.5 border-b border-line">
                  <span class="text-[12.5px] text-text-3 shrink-0">{{ $t('order.customer') }}</span>
                  <div v-if="order.type === 'member'" class="text-right min-w-0">
                    <div class="flex items-center gap-1.5 justify-end flex-wrap">
                      <button class="text-[13px] text-primary hover:underline" @click="goMember">{{ order.memberName }}</button>
                      <span
                        v-if="order.memberLevelName"
                        class="badge"
                        :class="MEMBER_LEVEL_STYLE[order.memberLevel] || 'badge-muted'"
                      >
                        {{ levelText(order) }}
                      </span>
                    </div>
                    <div class="text-[11.5px] text-text-3 num mt-0.5">
                      {{ order.memberNo }} · {{ order.memberPhone || $t('order.noPhone') }}
                    </div>
                  </div>
                  <span v-else class="text-[13px] text-text-3">{{ $t('order.guest') }}</span>
                </div>

                <!-- 支付方式明细：混合支付时逐笔展示 -->
                <div class="sm:col-span-2 py-1.5">
                  <div class="text-[12.5px] text-text-3 mb-2">{{ $t('order.payMethod') }}</div>
                  <div class="space-y-1.5">
                    <div
                      v-for="(p, i) in order.payments || []"
                      :key="i"
                      class="flex items-center gap-2.5 px-3 py-2 rounded-md"
                      :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
                    >
                      <span
                        class="flex items-center justify-center rounded-md shrink-0"
                        :style="{ width: '24px', height: '24px', background: 'var(--c-surface-3)', color: payTone(p.method) }"
                      >
                        <Icon :name="payIcon(p.method)" :size="13" />
                      </span>
                      <span class="flex-1 text-[13px]">{{ payLabel(p) }}</span>
                      <span class="price">{{ money(p.amount) }}</span>
                    </div>
                    <div v-if="!(order.payments || []).length" class="text-[13px] text-text-3">{{ $t('order.noPayments') }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 金额构成 -->
          <div class="card">
            <div class="panel-head"><div class="text-[14px] font-semibold">{{ $t('order.amountCompose') }}</div></div>
            <div class="p-3">
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">{{ $t('order.grossItemsTotal') }}</div>
                  <div class="price text-[17px] mt-1.5">{{ money(grossAmount) }}</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">{{ $t('pos.wholeDiscount') }}</div>
                  <div class="price text-[17px] mt-1.5" :style="{ color: 'var(--c-danger)' }">-{{ money(discountAmount) }}</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">{{ $t('pos.pointsDiscount') }}</div>
                  <div class="price text-[17px] mt-1.5" :style="{ color: 'var(--c-purple)' }">-{{ money(pointsDiscount) }}</div>
                  <div class="text-[11.5px] text-text-3 mt-0.5 num">{{ $t('order.pointsUsedTip', { points: pointsUsed }) }}</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-soft-2)' }">
                  <div class="text-[12px]" :style="{ color: 'var(--c-primary)' }">{{ $t('order.finalAmount') }}</div>
                  <div class="price text-[24px] mt-1" :style="{ color: 'var(--c-primary)' }">{{ money(finalAmount) }}</div>
                  <div class="text-[11.5px] text-text-3 mt-0.5 num">
                    {{ order.type === 'member' ? $t('order.earnedTip', { points: order.pointsEarned || 0 }) : $t('order.guestNoPoints') }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 商品明细 -->
          <div class="card">
            <div class="panel-head">
              <div class="text-[14px] font-semibold">{{ $t('order.goodsDetail') }}</div>
              <div class="text-[11.5px] text-text-3">{{ $t('order.kindsPieces', { kinds: items.length, pieces: qty(totalQty) }) }}</div>
            </div>
            <DataTable :columns="itemColumns" :list="items" :empty-text="$t('order.noItems')">
              <template #cell-name="{ row }">
                <span class="text-[13.5px]">{{ row.name }}</span>
              </template>
              <template #cell-barcode="{ row }">
                <span class="font-mono text-[12px] text-text-2">{{ row.barcode }}</span>
              </template>
              <template #cell-qty="{ row }">
                <span class="num">{{ qty(row.qty) }}</span>
              </template>
              <template #cell-subtotal="{ row }">
                <span class="price">{{ money(row.subtotal) }}</span>
              </template>
              <template #cell-margin="{ row }">
                <span v-if="margin(row)" class="num text-[13px] text-text-2">{{ margin(row) }}</span>
                <span v-else class="text-text-3">—</span>
              </template>
            </DataTable>
            <div class="flex items-center justify-end gap-6 px-3 py-3 border-t border-line flex-wrap">
              <span class="text-[12.5px] text-text-3">{{ $t('order.grossTotal') }} <span class="price text-text">{{ money(grossAmount) }}</span></span>
              <span class="text-[12.5px] text-text-3">
                {{ $t('order.discountTotal') }} <span class="price" :style="{ color: 'var(--c-danger)' }">-{{ money(discountAmount + pointsDiscount) }}</span>
              </span>
              <span class="text-[13.5px] font-semibold">{{ $t('order.paid') }} <span class="price" :style="{ color: 'var(--c-primary)' }">{{ money(finalAmount) }}</span></span>
            </div>
          </div>

          <!-- 退款记录 -->
          <div v-if="order.refund" class="card">
            <div class="panel-head">
              <div class="text-[14px] font-semibold">{{ $t('order.refundRecord') }}</div>
              <StatusTag :label="order.refund.type === 'partial' ? $t('order.partialRefund') : $t('order.fullRefund')" tone="badge-danger" />
            </div>
            <div class="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div class="text-[12px] text-text-3">{{ $t('order.refundNo') }}</div>
                <div class="font-mono text-[13px] mt-1">{{ order.refund.id }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">{{ $t('order.refundAmount') }}</div>
                <div class="price text-[15px] mt-1" :style="{ color: 'var(--c-danger)' }">{{ money(order.refund.amount) }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">{{ $t('order.operatorTime') }}</div>
                <div class="text-[13px] mt-1">{{ order.refund.operator }}</div>
                <div class="text-[11.5px] text-text-3 num">{{ order.refund.createdAt }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">{{ $t('order.refundReason') }}</div>
                <div class="text-[13px] mt-1">{{ order.refund.reason || $t('order.notFilled') }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右栏：小票预览 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">{{ $t('pos.receiptTitle') }}</div>
            <AppButton size="sm" icon="print" @click="onPrintPreview">{{ $t('common.print') }}</AppButton>
          </div>
          <div class="p-3">
            <div
              ref="receiptRef"
              class="receipt-paper mx-auto p-3.5"
              :style="{ width: '80mm', maxWidth: '100%', borderRadius: '4px' }"
            >
              <div class="text-center">
                <div style="font-size: 15px; font-weight: 700; letter-spacing: 2px">{{ storeName }}</div>
                <div style="font-size: 11px">{{ shopAddr }}</div>
                <div style="font-size: 12px; margin-top: 2px">{{ $t('order.receiptSubtitle') }}</div>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between"><span>{{ $t('order.receiptNo') }}</span><span>{{ order.orderNo }}</span></div>
              <div class="flex justify-between"><span>{{ $t('order.receiptTime') }}</span><span>{{ order.createdAt }}</span></div>
              <div class="flex justify-between"><span>{{ $t('order.receiptPos') }}</span><span>{{ order.operatorName || order.cashierName }}</span></div>
              <div class="flex justify-between">
                <span>{{ $t('order.receiptCustomer') }}</span>
                <span>{{ order.type === 'member' ? `${order.memberName}（${levelText(order)}）` : $t('order.guest') }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between" style="font-weight: 700">
                <span style="flex: 1">{{ $t('order.receiptGoods') }}</span>
                <span style="width: 34px; text-align: right">{{ $t('order.receiptQty') }}</span>
                <span style="width: 52px; text-align: right">{{ $t('order.receiptPrice') }}</span>
                <span style="width: 62px; text-align: right">{{ $t('pos.subtotal') }}</span>
              </div>
              <div v-for="(it, i) in items" :key="i" class="flex justify-between" style="padding-top: 3px">
                <span style="flex: 1; word-break: break-all">{{ it.name }}</span>
                <span style="width: 34px; text-align: right">{{ qty(it.qty) }}</span>
                <span style="width: 52px; text-align: right">{{ Number(it.price).toFixed(2) }}</span>
                <span style="width: 62px; text-align: right">{{ Number(it.subtotal).toFixed(2) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between"><span>{{ $t('order.items') }}</span><span>{{ qty(totalQty) }}</span></div>
              <div class="flex justify-between"><span>{{ $t('order.grossTotal') }}</span><span>{{ money(grossAmount) }}</span></div>
              <div v-if="discountAmount" class="flex justify-between"><span>{{ $t('order.receiptDiscount') }}</span><span>-{{ money(discountAmount) }}</span></div>
              <div v-if="pointsDiscount" class="flex justify-between">
                <span>{{ $t('order.receiptPointsUsed', { points: pointsUsed }) }}</span><span>-{{ money(pointsDiscount) }}</span>
              </div>
              <div class="flex justify-between" style="font-size: 14px; font-weight: 700; margin-top: 4px">
                <span>{{ $t('order.receiptPayable') }}</span><span>{{ money(finalAmount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between" style="font-weight: 700"><span>{{ $t('order.payMethod') }}</span><span>{{ $t('order.receiptAmount') }}</span></div>
              <div v-for="(p, i) in order.payments || []" :key="i" class="flex justify-between">
                <span>{{ payLabel(p) }}</span><span>{{ money(p.amount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between">
                <span>{{ $t('order.receiptEarned') }}</span>
                <span>{{ order.pointsEarned ? `+${order.pointsEarned}` : '0' }}</span>
              </div>
              <div v-if="order.refund" class="flex justify-between">
                <span>{{ $t('order.refund') }}</span><span>-{{ money(order.refund.amount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="text-center" style="font-size: 12px">
                <div style="font-weight: 700">{{ $t('order.receiptFooter') }}</div>
                <div style="font-size: 11px; margin-top: 3px">{{ $t('order.receiptKeep') }}</div>
                <div style="font-size: 11px">{{ $t('order.receiptPhone') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 退款弹窗 -->
      <AppModal
        v-model="refundVisible"
        :title="$t('order.refundTitle')"
        :subtitle="$t('order.refundSubtitle', { no: order.orderNo, amount: money(finalAmount) })"
        width="560"
      >
        <div class="grid grid-cols-2 gap-3">
          <FormField :label="$t('order.refundType')" required>
            <select v-model="refundForm.type" class="input" @change="onRefundTypeChange">
              <option value="full">{{ $t('order.fullRefund') }}</option>
              <option value="partial">{{ $t('order.partialRefund') }}</option>
            </select>
          </FormField>

          <FormField :label="$t('order.refundAmount')" required :hint="$t('order.maxRefund', { amount: money(finalAmount) })">
            <input
              v-model.number="refundForm.amount"
              type="number"
              min="0"
              :max="finalAmount"
              step="0.01"
              class="input num"
              :disabled="refundForm.type === 'full'"
            />
          </FormField>

          <FormField :label="$t('order.refundReason')" required span="2" :hint="$t('order.refundReasonHint')">
            <input v-model="refundForm.reason" class="input" :placeholder="$t('order.refundReasonPlaceholder')" />
          </FormField>

          <div class="col-span-2 flex items-start gap-2.5 p-3 rounded-md" :style="{ background: 'var(--c-warning-soft)' }">
            <Icon name="alert" :size="15" :style="{ color: 'var(--c-warning)' }" class="mt-0.5 shrink-0" />
            <div class="text-[12.5px] leading-relaxed" :style="{ color: 'var(--c-warning)' }">
              {{ $t('order.refundWarn') }}
            </div>
          </div>
        </div>

        <template #footer="{ close }">
          <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
          <AppButton variant="danger" icon="undo" @click="submitRefund">{{ $t('order.confirmRefund') }}</AppButton>
        </template>
      </AppModal>
    </template>
  </PageShell>
</template>

<style scoped>
/* 小票分隔线：模拟热敏打印机的虚线，小票区域固定白底，这里的颜色不参与主题 */
.receipt-dash {
  border-top: 1px dashed currentColor;
  opacity: 0.45;
  margin: 8px 0;
}
</style>
