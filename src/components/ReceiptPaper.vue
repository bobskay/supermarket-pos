<script setup>
/**
 * 小票（80mm 热敏纸样式）
 * ------------------------------------------------------------------
 * 收银台与订单详情共用。用真实的小票排版（等宽字体、虚线分隔、右对齐金额），
 * 演示时甲方一眼就能看懂「这就是打印出来的小票」。
 *
 * 支持两种入参：
 *   order  —— 已结算订单对象（含 payments / refund）
 *   draft  —— 收银台草稿 { items, member, totals, operatorName }
 */
import { computed } from 'vue'
import { money, qty as fmtQty } from '@/utils/format'

const props = defineProps({
  order: { type: Object, default: null },
  draft: { type: Object, default: null },
  shop: {
    type: Object,
    default: () => ({
      name: '惠民生活超市（中心店）',
      address: '深圳市南山区科技园南路 128 号',
      phone: '0755-8888 6666',
    }),
  },
  footer: { type: String, default: '谢谢光临，欢迎下次惠顾！' },
  /** 是否显示订单号下方条码模拟 */
  showBarcode: { type: Boolean, default: true },
})

const data = computed(() => {
  if (props.order) {
    const o = props.order
    return {
      no: o.orderNo,
      time: o.createdAt,
      operator: o.cashierName || o.operatorName,
      customer: o.memberName ? `${o.memberName}（${o.memberNo}）` : '散客',
      items: o.items || [],
      itemCount: o.itemCount,
      gross: o.grossAmount,
      discount: o.discountAmount,
      pointsUsed: o.pointsUsed,
      pointsDiscount: o.pointsDiscount,
      payable: o.finalAmount,
      paid: o.paidAmount,
      payments: o.payments || [],
      pointsEarned: o.pointsEarned,
      status: o.statusName,
      refund: o.refund,
      orderType: o.typeName,
      change: null,
    }
  }
  const d = props.draft || {}
  return {
    no: d.orderNo || '（待结算）',
    time: d.time || '',
    operator: d.operatorName || '',
    customer: d.member ? `${d.member.name}（${d.member.memberNo}）` : '散客',
    items: d.items || [],
    itemCount: (d.items || []).reduce((s, i) => s + Number(i.qty || 0), 0),
    gross: d.grossAmount ?? 0,
    discount: d.discountAmount ?? 0,
    pointsUsed: d.pointsUsed ?? 0,
    pointsDiscount: d.pointsDiscount ?? 0,
    payable: d.payable ?? 0,
    paid: d.paidAmount ?? 0,
    payments: d.payments || [],
    pointsEarned: d.pointsEarned ?? 0,
    status: '未结算',
    refund: null,
    orderType: d.member ? '会员订单' : '普通订单',
    change: d.change ?? null,
  }
})

/** 小票宽度固定 78mm，按每行 32 字符排版 */
const line = '-'.repeat(32)
</script>

<template>
  <div class="receipt-paper mx-auto" style="width: 268px; padding: 14px 12px">
    <!-- 抬头 -->
    <div class="text-center">
      <div style="font-size: 14px; font-weight: 700; letter-spacing: 1px">{{ shop.name }}</div>
      <div style="font-size: 10.5px">{{ shop.address }}</div>
      <div style="font-size: 10.5px">TEL: {{ shop.phone }}</div>
      <div style="font-size: 11px; margin-top: 4px">销 售 小 票</div>
    </div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 单头信息 -->
    <div class="flex justify-between"><span>单号</span><span>{{ data.no }}</span></div>
    <div class="flex justify-between"><span>时间</span><span>{{ data.time }}</span></div>
    <div class="flex justify-between"><span>收银员</span><span>{{ data.operator || '-' }}</span></div>
    <div class="flex justify-between"><span>顾客</span><span>{{ data.customer }}</span></div>
    <div class="flex justify-between"><span>类型</span><span>{{ data.orderType }}</span></div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 商品明细 -->
    <div class="flex justify-between" style="font-weight: 700">
      <span style="flex: 1">商品</span>
      <span style="width: 34px; text-align: right">数量</span>
      <span style="width: 46px; text-align: right">单价</span>
      <span style="width: 50px; text-align: right">金额</span>
    </div>
    <div style="margin: 3px 0">{{ line }}</div>

    <div v-for="(it, i) in data.items" :key="i" style="margin-bottom: 3px">
      <div style="word-break: break-all">{{ it.name }}</div>
      <div class="flex justify-between">
        <span style="color: #666">条码 {{ it.barcode }}</span>
        <span style="width: 34px; text-align: right">{{ fmtQty(it.qty) }}{{ it.unit }}</span>
        <span style="width: 46px; text-align: right">{{ Number(it.price).toFixed(2) }}</span>
        <span style="width: 50px; text-align: right">{{ Number(it.subtotal).toFixed(2) }}</span>
      </div>
    </div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 金额 -->
    <div class="flex justify-between">
      <span>商品合计</span><span>{{ money(data.gross, false) }}</span>
    </div>
    <div v-if="data.discount > 0" class="flex justify-between">
      <span>整单优惠</span><span>-{{ money(data.discount, false) }}</span>
    </div>
    <div v-if="data.pointsUsed > 0" class="flex justify-between">
      <span>积分抵扣（{{ data.pointsUsed }}分）</span><span>-{{ money(data.pointsDiscount, false) }}</span>
    </div>
    <div class="flex justify-between" style="font-size: 14px; font-weight: 700; margin-top: 4px">
      <span>应收合计</span><span>{{ money(data.payable, false) }}</span>
    </div>

    <template v-if="data.payments.length">
      <div style="margin: 4px 0">{{ line }}</div>
      <div v-for="(p, i) in data.payments" :key="i" class="flex justify-between">
        <span>支付 · {{ p.methodName }}</span><span>{{ money(p.amount, false) }}</span>
      </div>
      <div v-if="data.change != null && data.change > 0" class="flex justify-between" style="font-weight: 700">
        <span>找零</span><span>{{ money(data.change, false) }}</span>
      </div>
    </template>

    <template v-if="data.pointsEarned > 0">
      <div style="margin: 4px 0">{{ line }}</div>
      <div class="flex justify-between">
        <span>本次获得积分</span><span>{{ data.pointsEarned }} 分</span>
      </div>
    </template>

    <template v-if="data.refund">
      <div style="margin: 4px 0">{{ line }}</div>
      <div class="flex justify-between" style="font-weight: 700">
        <span>退款金额（{{ data.refund.type === 'full' ? '全额' : '部分' }}）</span>
        <span>{{ money(data.refund.amount, false) }}</span>
      </div>
      <div>原因：{{ data.refund.reason }}</div>
      <div>操作：{{ data.refund.operator }} {{ data.refund.createdAt }}</div>
    </template>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 条码模拟 -->
    <div v-if="showBarcode" class="text-center" style="margin-top: 2px">
      <div style="display: flex; justify-content: center; gap: 1px; height: 30px; align-items: flex-end">
        <span
          v-for="(w, i) in [1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 3, 1, 1, 2, 1]"
          :key="i"
          :style="{ width: w + 'px', height: '100%', background: '#111' }"
        />
      </div>
      <div style="font-size: 10px; letter-spacing: 1px">{{ String(data.no).replace(/[^0-9A-Za-z]/g, '') }}</div>
    </div>

    <div class="text-center" style="margin-top: 8px; font-size: 11px">
      <div>{{ footer }}</div>
      <div style="margin-top: 4px; color: #666">本次为演示小票，不具备结算效力</div>
    </div>
  </div>
</template>
