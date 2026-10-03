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

const STORE_NAME = '惠民生活超市'
const SHOP_ADDR = '幸福路 128 号 · 0755-8888 6666'

const loading = ref(true)
const detail = ref(null)
const costMap = ref({})
const receiptRef = ref(null)
const printing = ref(false)

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

const INFO = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    { label: '订单号', value: o.orderNo, mono: true },
    { label: '下单时间', value: `${o.createdAt}（${fromNow(o.createdAt)}）`, mono: true },
    { label: '结算时间', value: o.settledAt || '未结算', mono: true },
    { label: '订单类型', value: o.typeName || (o.type === 'member' ? '会员订单' : '普通订单') },
    { label: '收银员', value: `${o.operatorName || o.cashierName || '—'}${o.operatorId ? `（${o.operatorId}）` : ''}` },
    { label: '备注', value: o.remark || '无' },
  ]
})

const PAY_ICON = { cash: 'money', wechat: 'phone', alipay: 'qrcode', card: 'card' }
const PAY_TONE = { cash: 'var(--c-success)', wechat: 'var(--c-accent)', alipay: 'var(--c-info)', card: 'var(--c-purple)' }
const PAY_LABEL = { cash: '现金', wechat: '微信', alipay: '支付宝', card: '储值卡' }

function payLabel(p) {
  return p.methodName || PAY_LABEL[p.method] || p.method
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

const itemColumns = [
  { key: 'barcode', label: '条码', width: 136 },
  { key: 'name', label: '商品名称' },
  { key: 'unit', label: '单位', width: 62, align: 'center' },
  { key: 'price', label: '单价', width: 96, align: 'right', format: (r) => money(r.price) },
  { key: 'qty', label: '数量', width: 76, align: 'right', format: (r) => qty(r.qty) },
  { key: 'subtotal', label: '小计', width: 104, align: 'right', format: (r) => money(r.subtotal) },
  { key: 'margin', label: '毛利率', width: 84, align: 'right' },
]

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
    toast.warning('权限不足：退款需由店长操作')
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
    toast.warning('退款金额需大于 0 且不超过实收金额')
    return
  }
  const reason = refundForm.reason.trim() || '顾客申请退款'

  const go = await confirm({
    title: '确认退款',
    content: `订单 ${order.value.orderNo}\n退款金额 ${money(amount)}（${refundForm.type === 'full' ? '全额' : '部分'}退款）\n退款原因：${reason}\n\n退款后库存与积分将一并回滚。`,
    danger: true,
    confirmText: '确认退款',
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
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
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
      <Empty icon="inbox" title="订单不存在" :desc="`未找到订单 ${route.params.id}，可能已被删除或链接有误`">
        <AppButton variant="primary" icon="arrowLeft" @click="goBack">返回订单列表</AppButton>
      </Empty>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="flex items-start justify-between gap-4 flex-wrap pb-4 mb-4 border-b border-line">
        <div class="flex items-start gap-3 min-w-0">
          <AppButton icon="arrowLeft" title="返回订单列表" @click="goBack" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[17px] font-semibold font-mono">{{ order.orderNo }}</h1>
              <StatusTag :value="order.status" :map="ORDER_STATUS_STYLE" />
            </div>
            <p class="text-xs text-text-3 mt-1">
              {{ order.createdAt }} · {{ order.operatorName || order.cashierName }} 开单 · 共 {{ qty(totalQty) }} 件商品
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <AppButton icon="print" :loading="printing" @click="onPrint">打印小票</AppButton>
          <AppButton
            v-if="order.status === 'paid' || order.status === 'partial_refund'"
            variant="danger"
            icon="undo"
            @click="openRefund"
          >
            退款
          </AppButton>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 items-start">
        <!-- 左栏 -->
        <div class="space-y-3 min-w-0">
          <!-- 订单信息 -->
          <div class="card">
            <div class="panel-head"><div class="text-[14px] font-semibold">订单信息</div></div>
            <div class="p-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <div v-for="f in INFO" :key="f.label" class="flex items-start justify-between gap-3 py-1.5 border-b border-line">
                  <span class="text-[12.5px] text-text-3 shrink-0">{{ f.label }}</span>
                  <span class="text-[13px] text-right break-all" :class="f.mono && 'num'">{{ f.value }}</span>
                </div>

                <!-- 会员信息：可直接跳到会员档案 -->
                <div class="flex items-start justify-between gap-3 py-1.5 border-b border-line">
                  <span class="text-[12.5px] text-text-3 shrink-0">顾客</span>
                  <div v-if="order.type === 'member'" class="text-right min-w-0">
                    <div class="flex items-center gap-1.5 justify-end flex-wrap">
                      <button class="text-[13px] text-primary hover:underline" @click="goMember">{{ order.memberName }}</button>
                      <span
                        v-if="order.memberLevelName"
                        class="badge"
                        :class="MEMBER_LEVEL_STYLE[order.memberLevel] || 'badge-muted'"
                      >
                        {{ order.memberLevelName }}
                      </span>
                    </div>
                    <div class="text-[11.5px] text-text-3 num mt-0.5">
                      {{ order.memberNo }} · {{ order.memberPhone || '未留手机号' }}
                    </div>
                  </div>
                  <span v-else class="text-[13px] text-text-3">散客</span>
                </div>

                <!-- 支付方式明细：混合支付时逐笔展示 -->
                <div class="sm:col-span-2 py-1.5">
                  <div class="text-[12.5px] text-text-3 mb-2">支付方式</div>
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
                    <div v-if="!(order.payments || []).length" class="text-[13px] text-text-3">暂无支付记录</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 金额构成 -->
          <div class="card">
            <div class="panel-head"><div class="text-[14px] font-semibold">金额构成</div></div>
            <div class="p-3">
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">商品原价合计</div>
                  <div class="price text-[17px] mt-1.5">{{ money(grossAmount) }}</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">整单优惠</div>
                  <div class="price text-[17px] mt-1.5" :style="{ color: 'var(--c-danger)' }">-{{ money(discountAmount) }}</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
                  <div class="text-[12px] text-text-3">积分抵扣</div>
                  <div class="price text-[17px] mt-1.5" :style="{ color: 'var(--c-purple)' }">-{{ money(pointsDiscount) }}</div>
                  <div class="text-[11.5px] text-text-3 mt-0.5 num">用掉 {{ pointsUsed }} 积分</div>
                </div>
                <div class="p-3 rounded-md" :style="{ background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-soft-2)' }">
                  <div class="text-[12px]" :style="{ color: 'var(--c-primary)' }">实收金额</div>
                  <div class="price text-[24px] mt-1" :style="{ color: 'var(--c-primary)' }">{{ money(finalAmount) }}</div>
                  <div class="text-[11.5px] text-text-3 mt-0.5 num">
                    {{ order.type === 'member' ? `本单获得 ${order.pointsEarned || 0} 积分` : '散客订单不计积分' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 商品明细 -->
          <div class="card">
            <div class="panel-head">
              <div class="text-[14px] font-semibold">商品明细</div>
              <div class="text-[11.5px] text-text-3">共 {{ items.length }} 种 / {{ qty(totalQty) }} 件</div>
            </div>
            <DataTable :columns="itemColumns" :list="items" empty-text="该订单没有商品明细">
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
              <span class="text-[12.5px] text-text-3">原价合计 <span class="price text-text">{{ money(grossAmount) }}</span></span>
              <span class="text-[12.5px] text-text-3">
                优惠合计 <span class="price" :style="{ color: 'var(--c-danger)' }">-{{ money(discountAmount + pointsDiscount) }}</span>
              </span>
              <span class="text-[13.5px] font-semibold">实收 <span class="price" :style="{ color: 'var(--c-primary)' }">{{ money(finalAmount) }}</span></span>
            </div>
          </div>

          <!-- 退款记录 -->
          <div v-if="order.refund" class="card">
            <div class="panel-head">
              <div class="text-[14px] font-semibold">退款记录</div>
              <StatusTag :label="order.refund.type === 'partial' ? '部分退款' : '全额退款'" tone="badge-danger" />
            </div>
            <div class="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div class="text-[12px] text-text-3">退款单号</div>
                <div class="font-mono text-[13px] mt-1">{{ order.refund.id }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">退款金额</div>
                <div class="price text-[15px] mt-1" :style="{ color: 'var(--c-danger)' }">{{ money(order.refund.amount) }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">操作人 / 时间</div>
                <div class="text-[13px] mt-1">{{ order.refund.operator }}</div>
                <div class="text-[11.5px] text-text-3 num">{{ order.refund.createdAt }}</div>
              </div>
              <div>
                <div class="text-[12px] text-text-3">退款原因</div>
                <div class="text-[13px] mt-1">{{ order.refund.reason || '未填写' }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右栏：小票预览 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">小票预览</div>
            <AppButton size="sm" icon="print" @click="onPrintPreview">打印</AppButton>
          </div>
          <div class="p-3">
            <div
              ref="receiptRef"
              class="receipt-paper mx-auto p-3.5"
              :style="{ width: '80mm', maxWidth: '100%', borderRadius: '4px' }"
            >
              <div class="text-center">
                <div style="font-size: 15px; font-weight: 700; letter-spacing: 2px">{{ STORE_NAME }}</div>
                <div style="font-size: 11px">{{ SHOP_ADDR }}</div>
                <div style="font-size: 12px; margin-top: 2px">销售小票</div>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between"><span>订单号</span><span>{{ order.orderNo }}</span></div>
              <div class="flex justify-between"><span>下单时间</span><span>{{ order.createdAt }}</span></div>
              <div class="flex justify-between"><span>收银员</span><span>{{ order.operatorName || order.cashierName }}</span></div>
              <div class="flex justify-between">
                <span>顾客</span>
                <span>{{ order.type === 'member' ? `${order.memberName}（${order.memberLevelName}）` : '散客' }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between" style="font-weight: 700">
                <span style="flex: 1">商品</span>
                <span style="width: 34px; text-align: right">数量</span>
                <span style="width: 52px; text-align: right">单价</span>
                <span style="width: 62px; text-align: right">小计</span>
              </div>
              <div v-for="(it, i) in items" :key="i" class="flex justify-between" style="padding-top: 3px">
                <span style="flex: 1; word-break: break-all">{{ it.name }}</span>
                <span style="width: 34px; text-align: right">{{ qty(it.qty) }}</span>
                <span style="width: 52px; text-align: right">{{ Number(it.price).toFixed(2) }}</span>
                <span style="width: 62px; text-align: right">{{ Number(it.subtotal).toFixed(2) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between"><span>件数</span><span>{{ qty(totalQty) }}</span></div>
              <div class="flex justify-between"><span>原价合计</span><span>{{ money(grossAmount) }}</span></div>
              <div v-if="discountAmount" class="flex justify-between"><span>整单优惠</span><span>-{{ money(discountAmount) }}</span></div>
              <div v-if="pointsDiscount" class="flex justify-between">
                <span>积分抵扣（{{ pointsUsed }} 分）</span><span>-{{ money(pointsDiscount) }}</span>
              </div>
              <div class="flex justify-between" style="font-size: 14px; font-weight: 700; margin-top: 4px">
                <span>应收合计</span><span>{{ money(finalAmount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between" style="font-weight: 700"><span>支付方式</span><span>金额</span></div>
              <div v-for="(p, i) in order.payments || []" :key="i" class="flex justify-between">
                <span>{{ payLabel(p) }}</span><span>{{ money(p.amount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="flex justify-between">
                <span>本单积分</span>
                <span>{{ order.pointsEarned ? `+${order.pointsEarned}` : '0' }}</span>
              </div>
              <div v-if="order.refund" class="flex justify-between">
                <span>退款</span><span>-{{ money(order.refund.amount) }}</span>
              </div>

              <div class="receipt-dash" />

              <div class="text-center" style="font-size: 12px">
                <div style="font-weight: 700">谢谢光临，欢迎下次惠顾！</div>
                <div style="font-size: 11px; margin-top: 3px">小票请妥善保管，凭票退换</div>
                <div style="font-size: 11px">服务热线 0755-8888 6666</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 退款弹窗 -->
      <AppModal v-model="refundVisible" title="订单退款" :subtitle="`${order.orderNo} · 实收 ${money(finalAmount)}`" width="560">
        <div class="grid grid-cols-2 gap-3">
          <FormField label="退款类型" required>
            <select v-model="refundForm.type" class="input" @change="onRefundTypeChange">
              <option value="full">全额退款</option>
              <option value="partial">部分退款</option>
            </select>
          </FormField>

          <FormField label="退款金额" required :hint="`最高可退 ${money(finalAmount)}`">
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

          <FormField label="退款原因" required span="2" hint="将记录到退款单与操作日志中">
            <input v-model="refundForm.reason" class="input" placeholder="如：商品质量问题 / 重复付款 / 顾客取消" />
          </FormField>

          <div class="col-span-2 flex items-start gap-2.5 p-3 rounded-md" :style="{ background: 'var(--c-warning-soft)' }">
            <Icon name="alert" :size="15" :style="{ color: 'var(--c-warning)' }" class="mt-0.5 shrink-0" />
            <div class="text-[12.5px] leading-relaxed" :style="{ color: 'var(--c-warning)' }">
              退款为不可撤销操作：确认后退回款项、回滚库存，并扣回该单已发放的积分。
            </div>
          </div>
        </div>

        <template #footer="{ close }">
          <AppButton @click="close">取消</AppButton>
          <AppButton variant="danger" icon="undo" @click="submitRefund">确认退款</AppButton>
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
