<script setup>
/**
 * 结算收款面板（收银台 / 结算弹窗的主体）
 * ------------------------------------------------------------------
 * 支持一笔订单混合支付：可以「现金 + 微信」「微信 + 支付宝」等任意组合。
 * 把这块独立出来，是因为它逻辑最密（应收/已收/找零/差额），单独维护更清晰。
 */
import { ref, computed, watch } from 'vue'
import { money, calc } from '@/utils/format'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'
import DataTable from '@/components/ui/DataTable.vue'

const props = defineProps({
  /** 购物车行 */
  items: { type: Array, default: () => [] },
  /** 应收金额 */
  payable: { type: Number, default: 0 },
  /** 商品合计 */
  grossAmount: { type: Number, default: 0 },
  /** 优惠合计 */
  discountAmount: { type: Number, default: 0 },
  /** 积分抵扣 */
  pointsDiscount: { type: Number, default: 0 },
  pointsUsed: { type: Number, default: 0 },
  pointsEarned: { type: Number, default: 0 },
  member: { type: Object, default: null },
  defaultMethod: { type: String, default: 'wechat' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const METHODS = [
  { method: 'cash', methodName: '现金', icon: 'money' },
  { method: 'wechat', methodName: '微信', icon: 'qrcode' },
  { method: 'alipay', methodName: '支付宝', icon: 'qrcode' },
  { method: 'card', methodName: '储值卡', icon: 'card' },
]

const payments = ref([])
const cashInput = ref(0)

function init() {
  const m = METHODS.find((x) => x.method === props.defaultMethod) || METHODS[1]
  payments.value = [{ method: m.method, methodName: m.methodName, amount: props.payable }]
  cashInput.value = 0
}

// 应收变化时重新初始化，避免出现「上一单的金额」
watch(() => props.payable, init, { immediate: true })

const paidTotal = computed(() => calc(payments.value.reduce((s, p) => s + Number(p.amount || 0), 0)))
const diff = computed(() => calc(props.payable - paidTotal.value))
const change = computed(() => calc(Math.max(0, paidTotal.value - props.payable)))
const settled = computed(() => diff.value <= 0.001)
const hasCash = computed(() => payments.value.some((p) => p.method === 'cash'))

function chooseMethod(m) {
  payments.value[0].method = m.method
  payments.value[0].methodName = m.methodName
  if (payments.value.length === 1) payments.value[0].amount = props.payable
}

function syncName(p) {
  p.methodName = METHODS.find((x) => x.method === p.method)?.methodName || '其他'
}

function addLine() {
  const used = new Set(payments.value.map((p) => p.method))
  const next = METHODS.find((m) => !used.has(m.method)) || METHODS[0]
  payments.value.push({ method: next.method, methodName: next.methodName, amount: Math.max(0, diff.value) })
}

function removeLine(i) {
  if (payments.value.length <= 1) return
  payments.value.splice(i, 1)
  payments.value[0].amount = calc(payments.value[0].amount + Math.max(0, diff.value))
}

/** 用主支付方式补足差额 */
function fillExact() {
  payments.value[0].amount = calc(payments.value[0].amount + Math.max(0, diff.value))
}

/** 现金快捷：累加到现金行（没有现金行就新建一行） */
function quickCash(amount) {
  let line = payments.value.find((p) => p.method === 'cash')
  if (!line) {
    line = { method: 'cash', methodName: '现金', amount: 0 }
    payments.value.unshift(line)
  }
  line.amount = calc(line.amount + amount)
}

function onCashInput(v) {
  cashInput.value = Number(v) || 0
  const line = payments.value.find((p) => p.method === 'cash')
  if (line) line.amount = cashInput.value
}

const columns = [
  { key: 'name', label: '商品' },
  { key: 'qty', label: '数量', width: 78, align: 'right', format: (r) => `${r.qty}${r.unit}` },
  { key: 'price', label: '单价', width: 78, align: 'right', format: (r) => money(r.price) },
  { key: 'subtotal', label: '小计', width: 86, align: 'right', format: (r) => money(r.subtotal) },
]

defineExpose({
  /** 提交时由父组件取用 */
  getPayload: () => ({
    payments: payments.value.filter((p) => Number(p.amount) > 0),
    paidTotal: paidTotal.value,
    change: change.value,
    settled: settled.value,
  }),
  fillExact,
})
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-[1fr_246px] gap-4">
    <!-- 左：商品 + 支付方式 -->
    <div class="min-w-0">
      <div class="text-[12.5px] font-medium text-text-2 mb-2">待结算商品</div>
      <div class="rounded-md overflow-hidden" :style="{ border: '1px solid var(--c-line)' }">
        <!-- 高度收在 3~4 行，保证整个结算弹窗不需要滚动 -->
        <DataTable :columns="columns" :list="items" row-key="productId" :hover="false" max-height="132px" />
      </div>

      <div class="text-[12.5px] font-medium text-text-2 mt-4 mb-2">
        支付方式
        <span class="text-[11px] text-text-3 font-normal ml-1">点选主支付方式，可再增加一笔实现混合支付</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in METHODS"
          :key="m.method"
          class="flex items-center gap-1.5 h-[34px] px-3 rounded-md text-[13px] transition-colors"
          :style="{
            background: payments[0]?.method === m.method ? 'var(--c-primary-soft)' : 'var(--c-surface)',
            border: `1px solid ${payments[0]?.method === m.method ? 'var(--c-primary)' : 'var(--c-line)'}`,
            color: payments[0]?.method === m.method ? 'var(--c-primary)' : 'var(--c-text-2)',
          }"
          @click="chooseMethod(m)"
        >
          <Icon :name="m.icon" :size="14" />{{ m.methodName }}
        </button>
      </div>

      <div class="mt-3 space-y-2">
        <div v-for="(p, i) in payments" :key="i" class="flex items-center gap-2">
          <select v-model="p.method" class="h-[34px] text-[13px]" style="width: 104px" @change="syncName(p)">
            <option v-for="m in METHODS" :key="m.method" :value="m.method">{{ m.methodName }}</option>
          </select>
          <input
            v-model.number="p.amount"
            class="input flex-1 text-right num"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
          />
          <button
            class="shrink-0"
            :class="payments.length > 1 ? 'text-text-3 hover:text-danger' : 'text-text-3 opacity-30'"
            :disabled="payments.length <= 1"
            title="删除这笔支付"
            @click="removeLine(i)"
          >
            <Icon name="close" :size="15" />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-2">
        <AppButton size="sm" variant="ghost" icon="plus" :disabled="payments.length >= 4" @click="addLine">
          增加一笔支付
        </AppButton>
        <div class="flex-1" />
        <button class="text-[12px] text-primary hover:underline" @click="fillExact">
          按主支付方式补足差额
        </button>
      </div>

      <!-- 现金快捷 -->
      <div v-if="hasCash" class="mt-3 p-2.5 rounded-md" :style="{ background: 'var(--c-surface-2)' }">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[12px] text-text-2">现金实收</span>
          <span class="text-[11px] text-text-3">点快捷面额累加，或直接输入</span>
        </div>
        <input
          :value="cashInput"
          class="input w-full num text-right mb-2"
          type="number"
          step="0.01"
          min="0"
          placeholder="输入顾客支付的现金金额"
          @input="onCashInput($event.target.value)"
        />
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="v in [20, 50, 100, 200, 500]"
            :key="v"
            class="text-[12px] px-2.5 h-[26px] rounded transition-colors hover:border-primary"
            :style="{ background: 'var(--c-surface)', border: '1px solid var(--c-line)' }"
            @click="quickCash(v)"
          >
            ￥{{ v }}
          </button>
          <button
            class="text-[12px] px-2.5 h-[26px] rounded transition-colors hover:border-primary"
            :style="{ background: 'var(--c-surface)', border: '1px solid var(--c-line)' }"
            @click="quickCash(Math.ceil(payable))"
          >
            取整 ￥{{ Math.ceil(payable) }}
          </button>
        </div>
      </div>
    </div>

    <!-- 右：汇总 -->
    <div class="min-w-0">
      <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
        <div class="space-y-1.5 text-[12.5px]">
          <div class="flex justify-between">
            <span class="text-text-2">商品合计</span><span class="num">{{ money(grossAmount) }}</span>
          </div>
          <div v-if="discountAmount > 0" class="flex justify-between">
            <span class="text-text-2">优惠合计</span>
            <span class="num" :style="{ color: 'var(--c-success)' }">-{{ money(discountAmount) }}</span>
          </div>
          <div v-if="pointsDiscount > 0" class="flex justify-between">
            <span class="text-text-2">积分抵扣</span>
            <span class="num" :style="{ color: 'var(--c-success)' }">-{{ money(pointsDiscount) }}</span>
          </div>
        </div>
        <div class="divider my-2.5" />
        <div class="flex items-end justify-between">
          <span class="text-[13px] font-medium">应收</span>
          <span class="text-[24px] font-semibold leading-none" :style="{ color: 'var(--c-primary)' }">
            {{ money(payable) }}
          </span>
        </div>
        <div class="divider my-2.5" />
        <div class="space-y-1.5 text-[12.5px]">
          <div class="flex justify-between">
            <span class="text-text-2">已收</span><span class="num">{{ money(paidTotal) }}</span>
          </div>
          <div v-if="!settled" class="flex justify-between">
            <span :style="{ color: 'var(--c-danger)' }">还差</span>
            <span class="num font-semibold" :style="{ color: 'var(--c-danger)' }">{{ money(diff) }}</span>
          </div>
          <div v-else-if="change > 0" class="flex justify-between">
            <span class="text-text-2">应找零</span>
            <span class="num font-semibold" :style="{ color: 'var(--c-warning)' }">{{ money(change) }}</span>
          </div>
          <div v-else class="flex justify-between">
            <span :style="{ color: 'var(--c-success)' }">金额已结清</span>
            <Icon name="check" :size="14" :style="{ color: 'var(--c-success)' }" />
          </div>
        </div>
      </div>

      <div class="card card-pad mt-3">
        <div class="text-[12.5px] text-text-2 mb-2">顾客与积分</div>
        <div class="text-[12.5px] space-y-1">
          <div class="flex justify-between">
            <span class="text-text-3">订单类型</span>
            <span>{{ member ? '会员订单' : '普通订单' }}</span>
          </div>
          <div v-if="member" class="flex justify-between">
            <span class="text-text-3">会员</span>
            <span class="truncate ml-2">{{ member.name }}（{{ member.levelName }}）</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-3">本单获得积分</span>
            <span :style="member ? { color: 'var(--c-primary)' } : null">{{ member ? `+${pointsEarned}` : '-' }}</span>
          </div>
          <div v-if="pointsUsed > 0" class="flex justify-between">
            <span class="text-text-3">本单抵扣积分</span>
            <span :style="{ color: 'var(--c-warning)' }">-{{ pointsUsed }}</span>
          </div>
        </div>
      </div>

      <div class="card card-pad mt-3">
        <div class="flex items-start gap-2 text-[11.5px] text-text-3 leading-relaxed">
          <Icon name="info" :size="14" class="mt-[1px] shrink-0" />
          <span>
            结算后系统自动扣减积分、扣减库存并生成订单记录，可在订单管理中查询与退款。
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
