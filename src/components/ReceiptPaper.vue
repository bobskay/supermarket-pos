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
 *
 * 文案全部走 i18n：字段名复用字典里的 order.receipt* 系列键。
 */
import { computed } from 'vue'
import { useI18n } from '@/i18n'
import { money, qty as fmtQty } from '@/utils/format'

const props = defineProps({
  order: { type: Object, default: null },
  draft: { type: Object, default: null },
  /** 门店信息：不传时用字典里的门店抬头兜底 */
  shop: { type: Object, default: () => ({}) },
  /** 小票页脚：不传时用字典兜底 */
  footer: { type: String, default: '' },
  /** 是否显示订单号下方条码模拟 */
  showBarcode: { type: Boolean, default: true },
})

const { t } = useI18n()

/** 门店抬头：优先用外部传入的真实门店信息 */
const shopInfo = computed(() => ({
  name: props.shop?.name || t('nav.storeName'),
  address: props.shop?.address || t('order.shopAddress'),
  phone: props.shop?.phone || '0755-8888 6666',
}))

const footerText = computed(() => props.footer || t('order.receiptFooter'))

const data = computed(() => {
  if (props.order) {
    const o = props.order
    return {
      no: o.orderNo,
      time: o.createdAt,
      operator: o.cashierName || o.operatorName,
      customer: o.memberName ? `${o.memberName}（${o.memberNo}）` : t('order.guest'),
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
    no: d.orderNo || t('pos.pendingOrderNo'),
    time: d.time || '',
    operator: d.operatorName || '',
    customer: d.member ? `${d.member.name}（${d.member.memberNo}）` : t('order.guest'),
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
    status: t('pos.statusUnsettled'),
    refund: null,
    orderType: d.member ? t('pos.memberOrder') : t('pos.normalOrder'),
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
      <div style="font-size: 14px; font-weight: 700; letter-spacing: 1px">{{ shopInfo.name }}</div>
      <div style="font-size: 10.5px">{{ shopInfo.address }}</div>
      <div style="font-size: 10.5px">TEL: {{ shopInfo.phone }}</div>
      <div style="font-size: 11px; margin-top: 4px">{{ $t('order.receiptSubtitle') }}</div>
    </div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 单头信息 -->
    <div class="flex justify-between"><span>{{ $t('order.receiptNo') }}</span><span>{{ data.no }}</span></div>
    <div class="flex justify-between"><span>{{ $t('order.receiptTime') }}</span><span>{{ data.time }}</span></div>
    <div class="flex justify-between"><span>{{ $t('order.receiptPos') }}</span><span>{{ data.operator || '-' }}</span></div>
    <div class="flex justify-between"><span>{{ $t('order.receiptCustomer') }}</span><span>{{ data.customer }}</span></div>
    <div class="flex justify-between"><span>{{ $t('order.receiptType') }}</span><span>{{ data.orderType }}</span></div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 商品明细 -->
    <div class="flex justify-between" style="font-weight: 700">
      <span style="flex: 1">{{ $t('order.receiptGoods') }}</span>
      <span style="width: 34px; text-align: right">{{ $t('order.receiptQty') }}</span>
      <span style="width: 46px; text-align: right">{{ $t('order.receiptPrice') }}</span>
      <span style="width: 50px; text-align: right">{{ $t('order.receiptAmount') }}</span>
    </div>
    <div style="margin: 3px 0">{{ line }}</div>

    <div v-for="(it, i) in data.items" :key="i" style="margin-bottom: 3px">
      <div style="word-break: break-all">{{ it.name }}</div>
      <div class="flex justify-between">
        <span style="color: #666">{{ $t('pos.barcode') }} {{ it.barcode }}</span>
        <span style="width: 34px; text-align: right">{{ fmtQty(it.qty) }}{{ it.unit }}</span>
        <span style="width: 46px; text-align: right">{{ Number(it.price).toFixed(2) }}</span>
        <span style="width: 50px; text-align: right">{{ Number(it.subtotal).toFixed(2) }}</span>
      </div>
    </div>

    <div style="margin: 6px 0">{{ line }}</div>

    <!-- 金额 -->
    <div class="flex justify-between">
      <span>{{ $t('order.receiptTotal') }}</span><span>{{ money(data.gross, false) }}</span>
    </div>
    <div v-if="data.discount > 0" class="flex justify-between">
      <span>{{ $t('order.receiptDiscount') }}</span><span>-{{ money(data.discount, false) }}</span>
    </div>
    <div v-if="data.pointsUsed > 0" class="flex justify-between">
      <span>{{ $t('pos.pointsDeduct', { points: data.pointsUsed }) }}</span><span>-{{ money(data.pointsDiscount, false) }}</span>
    </div>
    <div class="flex justify-between" style="font-size: 14px; font-weight: 700; margin-top: 4px">
      <span>{{ $t('order.receiptPayable') }}</span><span>{{ money(data.payable, false) }}</span>
    </div>

    <template v-if="data.payments.length">
      <div style="margin: 4px 0">{{ line }}</div>
      <div v-for="(p, i) in data.payments" :key="i" class="flex justify-between">
        <span>{{ $t('order.receiptPay') }} · {{ p.methodName }}</span><span>{{ money(p.amount, false) }}</span>
      </div>
      <div v-if="data.change != null && data.change > 0" class="flex justify-between" style="font-weight: 700">
        <span>{{ $t('order.receiptChange') }}</span><span>{{ money(data.change, false) }}</span>
      </div>
    </template>

    <template v-if="data.pointsEarned > 0">
      <div style="margin: 4px 0">{{ line }}</div>
      <div class="flex justify-between">
        <span>{{ $t('order.receiptEarned') }}</span>
        <span>{{ data.pointsEarned }} {{ $t('pos.earnedPointsSuffix') }}</span>
      </div>
    </template>

    <template v-if="data.refund">
      <div style="margin: 4px 0">{{ line }}</div>
      <div class="flex justify-between" style="font-weight: 700">
        <span>
          {{ $t('order.receiptRefund') }} ({{ data.refund.type === 'full' ? $t('order.refundFullShort') : $t('order.refundPartialShort') }})
        </span>
        <span>{{ money(data.refund.amount, false) }}</span>
      </div>
      <div>{{ $t('order.reason') }}: {{ data.refund.reason }}</div>
      <div>{{ $t('common.operator') }}: {{ data.refund.operator }} {{ data.refund.createdAt }}</div>
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
      <div>{{ footerText }}</div>
      <div style="margin-top: 4px; color: #666">{{ $t('order.receiptDemo') }}</div>
    </div>
  </div>
</template>
