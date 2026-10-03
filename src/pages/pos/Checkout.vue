<script setup>
/**
 * 收银开单（POS 工作台）
 * ------------------------------------------------------------------
 * 布局：左侧「扫码 / 搜索 / 热销」→ 中间「购物车」→ 右侧「会员 · 金额 · 结算」
 *
 * 效率设计（演示加分项）：
 *   · 条码框常驻焦点：扫码枪 / 手输条码回车即入车，同商品自动累加
 *   · 条码查不到时自动降级为名称模糊搜索（收银现场最常见的补救路径）
 *   · F1 聚焦扫码 / F2 结算 / F4 清空 / F8 取单 / F9 挂单，Ctrl+Enter 结算
 *   · 数量框支持 ↑↓ 微调，改成 0 即删除该行
 *   · 扫码成功用 WebAudio 合成「嘀」声，无音频文件也有收银机手感
 *   · 会员绑定后自动算等级折扣、积分抵扣与累计积分
 *   · 混合支付：一笔订单可拆成现金 + 微信 + 支付宝多笔
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { productApi, memberApi, orderApi, settingApi } from '@/api'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/i18n'
import { money, calc, genNo, debounce } from '@/utils/format'
import { productImage } from '@/utils/product-image'
import PageShell from '@/components/layout/PageShell.vue'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Empty from '@/components/ui/Empty.vue'
import ReceiptPaper from '@/components/ReceiptPaper.vue'
import HotProducts from './HotProducts.vue'
import PaymentPanel from './PaymentPanel.vue'

const { user, isManager } = useAuth()
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()

/* ============================== 基础状态 ============================== */
const barcodeInput = ref(null)
const scanText = ref('')
/** 刚加入的商品 id 列表：短时高亮对应行，替代弹窗提示 */
const lastAdded = ref([])
const searchKeyword = ref('')
const searching = ref(false)
const searchResult = ref([])

const cart = ref([])
const member = ref(null)
const memberKeyword = ref('')
const memberSearching = ref(false)

const wholeDiscount = ref(0)
const usePoints = ref(false)
const remark = ref('')

const settings = ref(null)
const draftOrderNo = ref(genNo('SO'))

const payModal = ref(false)
const holdDrawer = ref(false)
const holds = ref([])
const receiptModal = ref(false)
const lastOrder = ref(null)
const submitting = ref(false)
const payPanel = ref(null)

const quickMember = reactive({ visible: false, name: '', phone: '', gender: 'female', loading: false })
const quickMemberSaving = ref(false)

/* ============================== 计算 ============================== */
const itemCount = computed(() => cart.value.reduce((s, i) => s + Number(i.qty || 0), 0))
const grossAmount = computed(() => calc(cart.value.reduce((s, i) => s + i.price * i.qty, 0)))

/** 会员等级折扣（店长可在系统设置里关闭会员折扣） */
const MEMBER_DISCOUNT = { normal: 1, silver: 0.95, gold: 0.95, diamond: 0.9 }
const memberDiscount = computed(() => {
  if (!member.value || !settings.value?.pos?.memberDiscount) return 0
  const rate = MEMBER_DISCOUNT[member.value.level] ?? 1
  return calc(grossAmount.value * (1 - rate))
})

const discountAmount = computed(() => calc(Number(wholeDiscount.value || 0) + memberDiscount.value))
const afterDiscount = computed(() => Math.max(0, calc(grossAmount.value - discountAmount.value)))

/** 积分抵扣：默认 100 分 = 1 元 */
const pointsRate = computed(() => Number(settings.value?.pos?.pointsDeductRate || 100))
const canUsePoints = computed(
  () => !!member.value && !!settings.value?.pos?.pointsEnabled && member.value.points >= pointsRate.value,
)
const maxPointsDeduct = computed(() => {
  if (!canUsePoints.value) return 0
  const maxYuan = Math.max(0, afterDiscount.value - 0.01)
  const maxByPoints = Math.floor(member.value.points / pointsRate.value)
  return calc(Math.min(maxYuan, maxByPoints))
})
const pointsDiscount = computed(() => (usePoints.value ? maxPointsDeduct.value : 0))
const pointsUsed = computed(() => Math.round(pointsDiscount.value * pointsRate.value))
const payable = computed(() => Math.max(0.01, calc(afterDiscount.value - pointsDiscount.value)))

const pointsEarned = computed(() => {
  if (!member.value) return 0
  const rate = Number(settings.value?.pos?.pointsRate || 1)
  const levelRate = { normal: 1, silver: 1, gold: 1.2, diamond: 1.5 }[member.value.level] ?? 1
  return Math.round(payable.value * rate * levelRate)
})

/* ============================== 提示音 ============================== */
let audioCtx = null
/** 用 WebAudio 合成一声「嘀」：成功高音、失败低音 */
function beep(ok = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = ok ? 1180 : 320
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.12)
  } catch {
    /* 浏览器未授权音频时静默忽略 */
  }
}

/* ============================== 商品入车 ============================== */
function focusScan() {
  nextTick(() => barcodeInput.value?.focus())
}

/**
 * 加入购物车（同商品累加数量）
 * 反馈方式刻意不用弹窗：加车是收银台最高频动作，一单几十次弹窗会挡住商品列表。
 * 改为「商品行高亮 800ms + 一声提示音」，不打断操作节奏。
 */
function addToCart(product, qty = 1) {
  const exist = cart.value.find((i) => i.productId === product.id || i.barcode === product.barcode)
  if (exist) {
    exist.qty = calc(exist.qty + qty)
    exist.subtotal = calc(exist.price * exist.qty)
  } else {
    cart.value.push({
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      price: product.price,
      costPrice: product.costPrice,
      stock: product.stock,
      qty,
      subtotal: calc(product.price * qty),
    })
  }
  highlight(product.id)
  beep(true)
}

/** 行高亮：支持连续扫码时多行同时高亮 */
function highlight(productId) {
  if (!lastAdded.value.includes(productId)) lastAdded.value.push(productId)
  setTimeout(() => {
    lastAdded.value = lastAdded.value.filter((id) => id !== productId)
  }, 800)
}

/** 热销榜只有统计字段，加车前按商品 id / 条码补全信息 */
async function pickHot(row) {
  try {
    const res = await productApi.detail(row.productId)
    addToCart(res.data, 1)
  } catch {
    addToCart(
      {
        id: row.productId,
        barcode: row.barcode,
        name: row.name,
        unit: row.unit,
        price: row.price || 0,
        stock: 0,
        image: productImage(row.barcode),
      },
      1,
    )
  }
}

/** 条码回车：先精确查条码，查不到再降级名称搜索 */
async function onScanEnter() {
  const code = scanText.value.trim()
  if (!code) return
  scanText.value = ''
  try {
    const res = await productApi.byBarcode(code)
    // 提示音与行高亮都在 addToCart 里统一处理，这里不再重复
    addToCart(res.data, 1)
  } catch {
    beep(false)
    searchKeyword.value = code
    const found = await doSearch(code)
    if (found.length === 1) {
      addToCart(found[0], 1)
      searchResult.value = []
      searchKeyword.value = ''
    } else if (!found.length) {
      toast.error(t('pos.scanNotFound', { code }))
    } else {
      toast.warning(t('pos.scanFallback', { code, n: found.length }))
    }
  } finally {
    focusScan()
  }
}

const doSearch = debounce((kw) => runSearch(kw), 280)

async function runSearch(kw) {
  const q = String(kw || '').trim()
  if (!q) {
    searchResult.value = []
    searching.value = false
    return []
  }
  searching.value = true
  try {
    const res = await productApi.list({ keyword: q, status: 'active', pageSize: 12 })
    searchResult.value = res.data.list || []
    return searchResult.value
  } catch {
    searchResult.value = []
    return []
  } finally {
    searching.value = false
  }
}

watch(searchKeyword, (v) => {
  searching.value = !!String(v).trim()
  doSearch(v)
})

/* ============================== 购物车操作 ============================== */
function setQty(item, v) {
  const n = Number(v)
  if (!n || n <= 0) {
    removeItem(item)
    return
  }
  item.qty = calc(n)
  item.subtotal = calc(item.price * item.qty)
}

function stepQty(item, delta) {
  setQty(item, calc(item.qty + delta))
  focusScan()
}

function removeItem(item) {
  const i = cart.value.findIndex((x) => x.productId === item.productId)
  if (i > -1) cart.value.splice(i, 1)
  toast.info(t('pos.removed', { name: item.name }))
}

async function clearCart() {
  if (!cart.value.length) return
  const okClear = await confirm({
    title: t('pos.clearTitle'),
    content: t('pos.clearConfirm', { kinds: cart.value.length, pieces: itemCount.value }),
    danger: true,
    confirmText: t('pos.clear'),
  })
  if (!okClear) return
  resetDraft()
  toast.ok(t('pos.cartCleared'))
  focusScan()
}

function resetDraft() {
  cart.value = []
  member.value = null
  wholeDiscount.value = 0
  usePoints.value = false
  remark.value = ''
  memberKeyword.value = ''
  draftOrderNo.value = genNo('SO')
}

/* ============================== 会员 ============================== */
async function searchMember() {
  const kw = memberKeyword.value.trim()
  if (!kw) return
  memberSearching.value = true
  try {
    const res = await memberApi.search(kw)
    if (!res.data) {
      toast.warning(t('pos.memberNotFound', { kw }))
      return
    }
    if (res.data.status !== 'active') {
      toast.error(t('pos.memberDisabled', { name: res.data.name }))
      return
    }
    member.value = res.data
    memberKeyword.value = ''
    toast.success(
      t('pos.memberBound', {
        name: res.data.name,
        level: res.data.levelName,
        points: res.data.points,
      }),
    )
  } catch (e) {
    toast.error(e.message)
  } finally {
    memberSearching.value = false
  }
}

function unbindMember() {
  member.value = null
  usePoints.value = false
  toast.info(t('pos.memberUnbound'))
}

function openQuickMember() {
  quickMember.name = ''
  quickMember.phone = ''
  quickMember.gender = 'female'
  quickMember.visible = true
}

async function saveQuickMember() {
  if (!quickMember.name.trim()) return toast.error(t('pos.needName'))
  if (!/^1\d{10}$/.test(quickMember.phone.trim())) return toast.error(t('pos.needPhone'))
  quickMemberSaving.value = true
  try {
    await memberApi.create({ name: quickMember.name.trim(), phone: quickMember.phone.trim(), gender: quickMember.gender })
    // 演示环境后端不落库，用提交的信息直接在本地绑定到本单
    member.value = {
      id: `M${Date.now()}`,
      memberNo: `VIP${Date.now().toString().slice(-5)}`,
      name: quickMember.name.trim(),
      phone: quickMember.phone.trim(),
      level: 'normal',
      levelName: '普通会员',
      points: 0,
      balance: 0,
      status: 'active',
    }
    quickMember.visible = false
    toast.ok(t('pos.quickMemberOk'))
  } finally {
    quickMemberSaving.value = false
  }
}

/* ============================== 商品图片预览 ============================== */
const previewState = ref({ visible: false, productId: '', barcode: '', name: '', price: 0, unit: '', stock: 0 })

/** 从热销榜点小图：补全商品信息后打开大图 */
async function previewProduct(row) {
  let detail = row
  try {
    const res = await productApi.detail(row.productId)
    detail = res.data
  } catch {
    /* 取不到详情就用榜单里的字段，至少图片与名称是对的 */
  }
  previewState.value = {
    visible: true,
    productId: detail.id || row.productId,
    barcode: detail.barcode || row.barcode,
    name: detail.name || row.name,
    price: detail.price ?? 0,
    unit: detail.unit || row.unit,
    stock: detail.stock ?? 0,
  }
}

/** 大图里直接加车，省得关掉弹窗再点一次（复用 pickHot 按商品 id 取完整数据） */
function addFromPreview() {
  pickHot({ productId: previewState.value.productId, barcode: previewState.value.barcode, name: previewState.value.name, unit: previewState.value.unit })
  previewState.value.visible = false
}

/* ============================== 挂单 / 取单 ============================== */
async function loadHolds() {
  try {
    const res = await orderApi.holds()
    holds.value = res.data || []
  } catch {
    holds.value = []
  }
}

async function holdOrder() {
  if (!cart.value.length) return toast.warning(t('pos.cartEmptyHold'))
  await orderApi.createHold({
    memberId: member.value?.id || '',
    items: cart.value,
    amount: payable.value,
    remark: remark.value,
  })
  holds.value.unshift({
    id: `H${Date.now()}`,
    holdNo: genNo('GD'),
    memberId: member.value?.id || '',
    memberName: member.value?.name || '',
    memberNo: member.value?.memberNo || '',
    itemCount: itemCount.value,
    amount: payable.value,
    operatorName: user.value?.name,
    remark: remark.value,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
  resetDraft()
  toast.ok(t('pos.holdOk'))
}

/** 取单：演示环境用示例商品还原购物车，保证可以继续演示 */
async function takeHold(h) {
  const okTake = await confirm({ title: t('pos.take'), content: t('pos.takeConfirm', { no: h.holdNo }) })
  if (!okTake) return
  const res = await productApi.list({ status: 'active', pageSize: 3 })
  cart.value = (res.data.list || []).slice(0, 3).map((p) => ({
    productId: p.id,
    barcode: p.barcode,
    name: p.name,
    unit: p.unit,
    price: p.price,
    costPrice: p.costPrice,
    stock: p.stock,
    qty: 1,
    subtotal: p.price,
  }))
  if (h.memberId) {
    try {
      const m = await memberApi.detail(h.memberId)
      member.value = m.data
    } catch {
      member.value = null
    }
  }
  await orderApi.removeHold(h.id)
  holds.value = holds.value.filter((x) => x.id !== h.id)
  holdDrawer.value = false
  toast.ok(t('pos.takeOk'))
  focusScan()
}

async function removeHold(h) {
  const okDel = await confirm({
    title: t('common.deleteConfirm'),
    content: t('pos.holdDeleteConfirm', { no: h.holdNo }),
    danger: true,
  })
  if (!okDel) return
  await orderApi.removeHold(h.id)
  holds.value = holds.value.filter((x) => x.id !== h.id)
  toast.ok(t('pos.holdDeleted'))
}

/* ============================== 结算 ============================== */
function openPay() {
  if (!cart.value.length) {
    toast.warning(t('pos.cartEmptyWarn'))
    focusScan()
    return
  }
  payModal.value = true
}

async function submitOrder(printAfter = false) {
  const payload = payPanel.value?.getPayload()
  if (!payload?.settled) {
    toast.error(t('pos.payMismatch'))
    return
  }
  submitting.value = true
  try {
    const body = {
      orderNo: draftOrderNo.value,
      memberId: member.value?.id || '',
      memberNo: member.value?.memberNo || '',
      memberName: member.value?.name || '',
      items: cart.value,
      itemCount: itemCount.value,
      grossAmount: grossAmount.value,
      discountAmount: discountAmount.value,
      pointsUsed: pointsUsed.value,
      pointsDiscount: pointsDiscount.value,
      pointsEarned: pointsEarned.value,
      finalAmount: payable.value,
      payments: payload.payments,
      operatorId: user.value?.id,
      operatorName: user.value?.name,
      remark: remark.value,
    }
    const res = await orderApi.create(body)
    lastOrder.value = {
      ...body,
      id: res.data?.id || `O${Date.now()}`,
      status: 'paid',
      statusName: '已结算',
      type: member.value ? 'member' : 'normal',
      typeName: member.value ? t('pos.memberOrder') : t('pos.normalOrder'),
      memberLevelName: member.value?.levelName || '',
      cashierName: user.value?.name,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
      paidAmount: payload.paidTotal,
      change: payload.change,
    }
    payModal.value = false
    receiptModal.value = true
    toast.ok(
      t('pos.settleOk', { amount: money(payable.value) }) +
        (payload.change > 0 ? t('pos.changeOk', { amount: money(payload.change) }) : ''),
    )
    if (printAfter) {
      await orderApi.print(lastOrder.value.id)
      toast.info(t('pos.printSent'))
    }
  } finally {
    submitting.value = false
  }
}

function newOrder() {
  receiptModal.value = false
  lastOrder.value = null
  resetDraft()
  focusScan()
}

function printReceipt() {
  const el = document.querySelector('.receipt-modal-body')
  if (!el) return
  el.classList.add('print-area')
  window.print()
  setTimeout(() => el.classList.remove('print-area'), 400)
}

/* ============================== 快捷键 ============================== */
function onKeydown(e) {
  const tag = (e.target?.tagName || '').toLowerCase()
  const inField = tag === 'input' || tag === 'textarea' || tag === 'select'

  if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) {
    e.preventDefault()
    openPay()
  } else if (e.key === 'F4') {
    e.preventDefault()
    clearCart()
  } else if (e.key === 'F9') {
    e.preventDefault()
    holdOrder()
  } else if (e.key === 'F8') {
    e.preventDefault()
    holdDrawer.value = true
  } else if (e.key === 'F1') {
    e.preventDefault()
    focusScan()
  } else if (!inField && e.key === '/') {
    e.preventDefault()
    focusScan()
  }
}

/* ============================== 生命周期 ============================== */
/** 示例条码：取真实商品条码，方便演示时点击带出 */
const sampleBarcodes = ref([])

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)

  try {
    const res = await settingApi.detail()
    settings.value = res.data
  } catch {
    settings.value = null
  }

  try {
    const res = await productApi.list({ status: 'active', pageSize: 3 })
    sampleBarcodes.value = (res.data.list || []).map((p) => p.barcode)
  } catch {
    sampleBarcodes.value = []
  }

  loadHolds()
  focusScan()
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

/* 挂单表格列：用 computed 包一层，切换语言时会自动重算 */
const holdColumns = computed(() => [
  { key: 'holdNo', label: t('pos.holdNo'), width: 128 },
  { key: 'memberName', label: t('pos.memberLabel'), width: 78 },
  { key: 'itemCount', label: t('order.items'), width: 58, align: 'right' },
  { key: 'amount', label: t('common.amount'), width: 84, align: 'right' },
  { key: 'operatorName', label: t('common.operator'), width: 72 },
  { key: 'createdAt', label: t('pos.holdTime'), width: 150 },
  { key: 'actions', label: t('common.actions'), width: 130, align: 'right' },
])
</script>

<template>
  <PageShell bare>
    <div class="h-full flex flex-col min-h-0">
      <!-- ============ 顶部信息条 ============ -->
      <div
        class="shrink-0 flex items-center gap-3 px-4 h-[46px] border-b border-line flex-wrap"
        :style="{ background: 'var(--c-surface)' }"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex items-center justify-center rounded-md"
            :style="{ width: '26px', height: '26px', background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }"
          >
            <Icon name="scan" :size="15" />
          </span>
          <div>
            <div class="text-[13.5px] font-semibold leading-tight">{{ $t('pos.title') }}</div>
            <div class="text-[10.5px] text-text-3 leading-tight font-mono">{{ draftOrderNo }}</div>
          </div>
        </div>

        <div class="h-5 w-px" :style="{ background: 'var(--c-line)' }" />

        <div class="flex items-center gap-1.5 text-[12px] text-text-2">
          <Icon name="user" :size="13" />
          {{ $t('pos.cashier') }} <span class="font-medium text-text">{{ user?.name }}</span>
        </div>
        <div class="hidden sm:flex items-center gap-1.5 text-[12px] text-text-2">
          <Icon name="clock" :size="13" />
          {{ new Date().toLocaleDateString('zh-CN') }} {{ $t('pos.onDuty') }}
        </div>

        <div class="flex-1" />

        <div class="hidden xl:flex items-center gap-2.5 text-[11.5px] text-text-3">
          <span class="flex items-center gap-1"><kbd class="kbd">F1</kbd>{{ $t('pos.scan') }}</span>
          <span class="flex items-center gap-1"><kbd class="kbd">F2</kbd>{{ $t('pos.checkout') }}</span>
          <span class="flex items-center gap-1"><kbd class="kbd">F4</kbd>{{ $t('pos.clear') }}</span>
          <span class="flex items-center gap-1"><kbd class="kbd">F9</kbd>{{ $t('pos.hold') }}</span>
          <span class="flex items-center gap-1"><kbd class="kbd">F8</kbd>{{ $t('pos.takeHold') }}</span>
        </div>

        <AppButton size="sm" variant="default" icon="hold" @click="holdDrawer = true">
          {{ $t('pos.takeHold') }}
          <span v-if="holds.length" class="ml-1 badge badge-primary">{{ holds.length }}</span>
        </AppButton>
        <AppButton size="sm" variant="default" icon="save" @click="holdOrder">{{ $t('pos.hold') }}</AppButton>
      </div>

      <!-- ============ 三栏主体 ============ -->
      <div class="flex-1 min-h-0 flex">
        <!-- 左：扫码 + 搜索 + 热销 -->
        <section
          class="w-[288px] xl:w-[322px] shrink-0 flex flex-col min-h-0 border-r border-line"
          :style="{ background: 'var(--c-surface)' }"
        >
          <!-- 扫码 -->
          <div class="p-3 border-b border-line">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[12px] text-text-2 font-medium flex items-center gap-1.5">
                <Icon name="barcode" :size="14" />{{ $t('pos.scanTitle') }}
              </span>
              <span class="text-[10.5px] text-text-3">{{ $t('pos.enterToAdd') }}</span>
            </div>
            <div class="relative">
              <Icon name="scan" :size="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
              <input
                ref="barcodeInput"
                v-model="scanText"
                class="input w-full pl-8 font-mono"
                :placeholder="$t('pos.scanPlaceholder')"
                @keyup.enter="onScanEnter"
              />
            </div>
            <div v-if="sampleBarcodes.length" class="flex flex-wrap gap-1.5 mt-2">
              <button
                v-for="code in sampleBarcodes"
                :key="code"
                class="text-[10.5px] px-1.5 py-0.5 rounded font-mono transition-colors hover:border-primary"
                :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)', color: 'var(--c-text-2)' }"
                @click="scanText = code; onScanEnter()"
              >
                {{ code }}
              </button>
            </div>
            <div v-if="sampleBarcodes.length" class="text-[10.5px] text-text-3 mt-1.5">
              {{ $t('pos.sampleBarcode') }}
            </div>
          </div>

          <!-- 名称搜索 -->
          <div class="p-3 border-b border-line">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[12px] text-text-2 font-medium flex items-center gap-1.5">
                <Icon name="search" :size="14" />{{ $t('pos.nameSearch') }}
              </span>
              <span class="text-[10.5px] text-text-3">{{ $t('pos.nameSearchHint') }}</span>
            </div>
            <div class="relative">
              <Icon name="search" :size="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
              <input v-model="searchKeyword" class="input w-full pl-8" :placeholder="$t('pos.nameSearchPlaceholder')" />
            </div>
          </div>

          <!-- 结果 / 热销 -->
          <div class="flex-1 min-h-0 flex flex-col">
            <!-- 搜索结果独立滚动 -->
            <div v-if="searchKeyword || searching" class="flex-1 min-h-0 overflow-y-auto scroll-thin p-2">
              <div v-if="searching" class="space-y-1.5">
                <div v-for="i in 5" :key="i" class="skeleton" style="height: 44px" />
              </div>

              <template v-else-if="searchResult.length">
                <div class="text-[11px] text-text-3 px-1 mb-1.5">
                  {{ $t('pos.foundProducts', { n: searchResult.length }) }}
                </div>
                <button
                  v-for="p in searchResult"
                  :key="p.id"
                  class="w-full text-left p-2 rounded-md mb-1 transition-colors hover:border-primary flex items-center gap-2.5"
                  :style="{ border: '1px solid var(--c-line)' }"
                  @click="addToCart(p, 1)"
                >
                  <!-- 商品图，方便肉眼快速确认 -->
                  <span
                    class="shrink-0 rounded-md overflow-hidden flex items-center justify-center"
                    :style="{ width: '38px', height: '38px', background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
                  >
                    <img v-if="productImage(p)" :src="productImage(p)" :alt="p.name" class="w-full h-full object-cover" />
                    <Icon v-else name="product" :size="16" class="text-text-3" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-start justify-between gap-2">
                      <span class="text-[13px] font-medium leading-snug truncate">{{ p.name }}</span>
                      <span class="price text-[13px] shrink-0">{{ money(p.price) }}</span>
                    </span>
                    <span class="flex items-center justify-between mt-1 text-[11px] text-text-3">
                      <span class="font-mono">{{ p.barcode }}</span>
                      <!-- 库存属于店长数据，收银员登录时不展示 -->
                      <span v-if="isManager">{{ $t('product.stock') }} {{ p.stock }}{{ p.unit }}</span>
                    </span>
                  </span>
                </button>
              </template>

              <Empty
                v-else
                icon="search"
                :title="$t('pos.noMatch')"
                :desc="$t('pos.noMatchDesc')"
                :size="56"
              />
            </div>

            <!-- 未搜索时：热销榜独立滚动，避免把扫码框顶出可视区域 -->
            <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-thin p-2">
              <div class="text-[11px] text-text-3 px-1 mb-1.5">{{ $t('pos.hotProducts') }}</div>
              <HotProducts @pick="pickHot" @preview="previewProduct" />
            </div>
          </div>
        </section>

        <!-- 中：购物车 -->
        <section class="flex-1 min-w-0 flex flex-col min-h-0">
          <div
            class="shrink-0 flex items-center gap-2 px-3 h-[38px] border-b border-line"
            :style="{ background: 'var(--c-surface)' }"
          >
            <span class="text-[13px] font-semibold">{{ $t('pos.cart') }}</span>
            <span class="badge badge-primary">
              {{ $t('pos.kinds', { n: cart.length }) }} / {{ $t('pos.pieces', { n: itemCount }) }}
            </span>
            <div class="flex-1" />
            <button class="text-[12px] text-text-2 hover:text-danger flex items-center gap-1" @click="clearCart">
              <Icon name="trash" :size="13" />{{ $t('pos.clear') }}
            </button>
          </div>

          <div v-if="!cart.length" class="flex-1 flex items-center justify-center">
            <Empty
              icon="cart"
              :title="$t('pos.cartEmpty')"
              :desc="$t('pos.cartEmptyDesc')"
              :size="86"
            >
              <AppButton variant="soft" icon="scan" @click="focusScan">{{ $t('pos.focusScan') }}</AppButton>
            </Empty>
          </div>

          <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-thin">
            <table class="table-flat">
              <thead>
                <tr>
                  <th style="width: 34px">#</th>
                  <th>{{ $t('pos.item') }}</th>
                  <th style="width: 92px; text-align: right">{{ $t('pos.price') }}</th>
                  <th style="width: 130px; text-align: center">{{ $t('pos.qty') }}</th>
                  <th style="width: 96px; text-align: right">{{ $t('pos.subtotal') }}</th>
                  <th style="width: 46px"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(it, i) in cart"
                  :key="it.productId"
                  :style="lastAdded.includes(it.productId) ? { background: 'var(--c-primary-soft)' } : null"
                >
                  <td class="text-text-3 text-[12px]">{{ i + 1 }}</td>
                  <td>
                    <div class="text-[13.5px] font-medium leading-snug">{{ it.name }}</div>
                    <div class="text-[11px] text-text-3 font-mono">
                      {{ it.barcode }}
                      <!-- 库存不足提醒只对店长显示 -->
                      <span
                        v-if="isManager && it.stock < it.qty"
                        class="ml-1.5"
                        :style="{ color: 'var(--c-warning)' }"
                      >
                        {{ $t('pos.stockOnlyLeft', { n: it.stock, unit: it.unit }) }}
                      </span>
                    </div>
                  </td>
                  <td class="text-right num">{{ money(it.price) }}</td>
                  <td>
                    <div class="flex items-center justify-center gap-1">
                      <button class="qty-btn" :title="$t('common.decrease')" @click="stepQty(it, -1)">
                        <Icon name="minus" :size="13" />
                      </button>
                      <input
                        class="qty-input"
                        :value="it.qty"
                        @change="setQty(it, $event.target.value)"
                        @keyup.up="stepQty(it, 1)"
                        @keyup.down="stepQty(it, -1)"
                      />
                      <button class="qty-btn" :title="$t('common.increase')" @click="stepQty(it, 1)">
                        <Icon name="plus" :size="13" />
                      </button>
                      <span class="text-[11px] text-text-3 w-4">{{ it.unit }}</span>
                    </div>
                  </td>
                  <td class="text-right price">{{ money(it.price * it.qty) }}</td>
                  <td class="text-center">
                    <button class="text-text-3 hover:text-danger" :title="$t('pos.removeItem')" @click="removeItem(it)">
                      <Icon name="trash" :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="p-3">
              <div class="flex items-center gap-2">
                <Icon name="file" :size="14" class="text-text-3" />
                <input
                  v-model="remark"
                  class="input flex-1"
                  :placeholder="$t('pos.orderRemark')"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 右：会员 + 金额 + 结算 -->
        <aside
          class="w-[296px] xl:w-[330px] shrink-0 flex flex-col min-h-0 border-l border-line"
          :style="{ background: 'var(--c-surface)' }"
        >
          <div class="flex-1 min-h-0 overflow-hidden p-3 space-y-3">
            <!-- 会员绑定 -->
            <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[12.5px] font-semibold flex items-center gap-1.5">
                  <Icon name="members" :size="14" />{{ $t('pos.memberBind') }}
                </span>
                <span class="badge" :class="member ? 'badge-primary' : 'badge-muted'">
                  {{ member ? $t('pos.memberOrder') : $t('pos.normalOrder') }}
                </span>
              </div>

              <!-- 已绑定 -->
              <div v-if="member">
                <div class="flex items-start gap-2.5">
                  <span
                    class="shrink-0 flex items-center justify-center rounded-md text-[13px] font-medium"
                    :style="{ width: '32px', height: '32px', background: 'var(--c-primary)', color: '#fff' }"
                  >
                    {{ member.name.slice(-1) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[13.5px] font-medium truncate">{{ member.name }}</span>
                      <span class="badge badge-purple">{{ member.levelName }}</span>
                    </div>
                    <div class="text-[11.5px] text-text-3 font-mono truncate">
                      {{ member.memberNo }} · {{ member.phone }}
                    </div>
                  </div>
                  <button class="text-text-3 hover:text-danger shrink-0" :title="$t('pos.unbind')" @click="unbindMember">
                    <Icon name="close" :size="14" />
                  </button>
                </div>

                <div class="grid grid-cols-3 gap-2 mt-2.5">
                  <div class="text-center py-1.5 rounded-md" :style="{ background: 'var(--c-surface)' }">
                    <div class="text-[11px] text-text-3">{{ $t('pos.points') }}</div>
                    <div class="text-[13.5px] font-semibold num">{{ member.points }}</div>
                  </div>
                  <div class="text-center py-1.5 rounded-md" :style="{ background: 'var(--c-surface)' }">
                    <div class="text-[11px] text-text-3">{{ $t('pos.balance') }}</div>
                    <div class="text-[13.5px] font-semibold num">{{ money(member.balance) }}</div>
                  </div>
                  <div class="text-center py-1.5 rounded-md" :style="{ background: 'var(--c-surface)' }">
                    <div class="text-[11px] text-text-3">{{ $t('pos.savedThisOrder') }}</div>
                    <div class="text-[13.5px] font-semibold num" :style="{ color: 'var(--c-success)' }">
                      {{ money(memberDiscount + pointsDiscount) }}
                    </div>
                  </div>
                </div>

                <button
                  class="w-full mt-2.5 flex items-center justify-between gap-2 px-2.5 py-2 rounded-md"
                  :style="{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', opacity: canUsePoints ? 1 : 0.6 }"
                  :disabled="!canUsePoints"
                  @click="usePoints = !usePoints"
                >
                  <span class="text-left min-w-0">
                    <span class="block text-[12.5px]">{{ $t('pos.usePoints') }}</span>
                    <span class="block text-[11px] text-text-3 truncate">
                      {{
                        canUsePoints
                          ? $t('pos.pointsAvailable', { points: member.points, amount: money(maxPointsDeduct) })
                          : $t('pos.pointsNotEnough', { rate: pointsRate })
                      }}
                    </span>
                  </span>
                  <span class="switch" :class="usePoints && 'is-on'" />
                </button>
              </div>

              <!-- 未绑定 -->
              <div v-else>
                <div class="relative">
                  <Icon name="search" :size="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
                  <input
                    v-model="memberKeyword"
                    class="input w-full pl-8"
                    :placeholder="$t('pos.memberPlaceholder')"
                    @keyup.enter="searchMember"
                  />
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <AppButton size="sm" variant="soft" block :loading="memberSearching" @click="searchMember">
                    {{ $t('pos.searchMember') }}
                  </AppButton>
                  <AppButton size="sm" variant="default" icon="plus" @click="openQuickMember">
                    {{ $t('pos.newMember') }}
                  </AppButton>
                </div>
                <div class="text-[11px] text-text-3 mt-1.5">{{ $t('pos.noMemberTip') }}</div>
              </div>
            </div>

            <!-- 金额明细 -->
            <div class="card card-pad">
              <div class="text-[12.5px] font-semibold mb-2.5">{{ $t('pos.amountDetail') }}</div>
              <div class="space-y-1.5 text-[12.5px]">
                <div class="flex justify-between">
                  <span class="text-text-2">{{ $t('pos.goodsTotal', { n: itemCount }) }}</span>
                  <span class="num">{{ money(grossAmount) }}</span>
                </div>
                <div v-if="memberDiscount > 0" class="flex justify-between">
                  <span class="text-text-2">{{ $t('pos.memberDiscount') }}</span>
                  <span class="num" :style="{ color: 'var(--c-success)' }">-{{ money(memberDiscount) }}</span>
                </div>
                <div v-if="pointsDiscount > 0" class="flex justify-between">
                  <span class="text-text-2">{{ $t('pos.pointsDeduct', { points: pointsUsed }) }}</span>
                  <span class="num" :style="{ color: 'var(--c-success)' }">-{{ money(pointsDiscount) }}</span>
                </div>

                <div class="flex items-center justify-between pt-1">
                  <span class="text-text-2">{{ $t('pos.wholeDiscount') }}</span>
                  <div class="flex items-center gap-1">
                    <button class="qty-btn" @click="wholeDiscount = Math.max(0, calc(wholeDiscount - 1))">
                      <Icon name="minus" :size="12" />
                    </button>
                    <input v-model.number="wholeDiscount" class="qty-input" style="width: 64px" type="number" min="0" step="0.01" />
                    <button class="qty-btn" @click="wholeDiscount = calc(Number(wholeDiscount || 0) + 1)">
                      <Icon name="plus" :size="12" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="divider my-2.5" />

              <div class="flex items-end justify-between">
                <span class="text-[13px] font-medium">{{ $t('pos.payable') }}</span>
                <span class="text-[26px] font-semibold leading-none" :style="{ color: 'var(--c-primary)' }">
                  {{ money(payable) }}
                </span>
              </div>
              <div v-if="member" class="text-[11.5px] text-text-3 text-right mt-1.5">
                {{ $t('pos.earnedPoints') }}
                <span class="font-medium" :style="{ color: 'var(--c-primary)' }">{{ pointsEarned }}</span>
                {{ $t('pos.earnedPointsSuffix') }}
                <span v-if="pointsUsed > 0">{{ $t('pos.deductedPoints', { points: pointsUsed }) }}</span>
              </div>

              <!-- 操作区跟着应收金额走，收银员视线不用来回跳 -->
              <div class="divider my-3" />
              <div class="grid grid-cols-2 gap-2">
                <AppButton variant="default" icon="save" @click="holdOrder">{{ $t('pos.hold') }} F9</AppButton>
                <AppButton variant="default" icon="hold" @click="holdDrawer = true">{{ $t('pos.takeHold') }} F8</AppButton>
              </div>
              <AppButton
                class="mt-2"
                variant="primary"
                size="lg"
                block
                icon="wallet"
                :disabled="!cart.length"
                @click="openPay"
              >
                {{ $t('pos.checkoutBtn') }}
              </AppButton>
              <div class="text-[11px] text-text-3 text-center mt-1.5">
                {{ $t('pos.checkoutHint') }}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <!-- ============ 结算弹窗 ============ -->
    <AppModal v-model="payModal" :title="$t('pos.settleTitle')" :width="760" :mask-closable="false">
      <PaymentPanel
        v-if="payModal"
        ref="payPanel"
        :items="cart"
        :payable="payable"
        :gross-amount="grossAmount"
        :discount-amount="discountAmount"
        :points-discount="pointsDiscount"
        :points-used="pointsUsed"
        :points-earned="pointsEarned"
        :member="member"
        :default-method="settings?.pos?.defaultPayMethod || 'wechat'"
      />
      <template #footer="{ close }">
        <AppButton variant="default" @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="default" icon="print" :loading="submitting" @click="submitOrder(true)">
          {{ $t('pos.settleAndPrint') }}
        </AppButton>
        <AppButton variant="primary" icon="check" :loading="submitting" @click="submitOrder(false)">
          {{ $t('pos.confirmPay') }}
        </AppButton>
      </template>
    </AppModal>

    <!-- ============ 小票预览 ============ -->
    <AppModal v-model="receiptModal" :title="$t('pos.receiptTitle')" :width="380">
      <div class="receipt-modal-body">
        <ReceiptPaper
          v-if="lastOrder"
          :order="lastOrder"
          :footer="settings?.pos?.receiptFooter || $t('order.receiptFooter')"
        />
      </div>
      <template #footer="{ close }">
        <AppButton variant="default" @click="close">{{ $t('common.close') }}</AppButton>
        <AppButton variant="default" icon="print" @click="printReceipt">{{ $t('pos.printReceipt') }}</AppButton>
        <AppButton variant="primary" icon="plus" @click="newOrder">{{ $t('pos.newOrder') }}</AppButton>
      </template>
    </AppModal>

    <!-- ============ 挂单 / 取单 ============ -->
    <AppDrawer v-model="holdDrawer" :title="$t('pos.holdTitle')" :width="680">
      <div v-if="!holds.length">
        <Empty
          icon="hold"
          :title="$t('pos.noHold')"
          :desc="$t('pos.noHoldDesc')"
        />
      </div>
      <DataTable v-else :columns="holdColumns" :list="holds" max-height="58vh">
        <template #cell-holdNo="{ row }">
          <span class="font-mono text-[12.5px]">{{ row.holdNo }}</span>
        </template>
        <template #cell-memberName="{ row }">
          <span v-if="row.memberName">{{ row.memberName }}</span>
          <span v-else class="text-text-3">{{ $t('order.guest') }}</span>
        </template>
        <template #cell-amount="{ row }">
          <span class="price">{{ money(row.amount) }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="text-[12px] text-text-2">{{ row.createdAt }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1.5 justify-end">
            <AppButton size="sm" variant="soft" @click="takeHold(row)">{{ $t('pos.take') }}</AppButton>
            <AppButton size="sm" variant="ghost" @click="removeHold(row)">{{ $t('common.delete') }}</AppButton>
          </div>
        </template>
      </DataTable>
      <template #footer>
        <div class="text-[12px] text-text-3 mr-auto">
          {{ $t('pos.takeDemoTip') }}
        </div>
      </template>
    </AppDrawer>

    <!-- ============ 商品大图预览 ============ -->
    <AppModal v-model="previewState.visible" :title="previewState.name" :subtitle="$t('pos.previewTitle')" :width="400">
      <div
        class="flex items-center justify-center rounded-lg p-3"
        :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
      >
        <img
          v-if="productImage(previewState.barcode)"
          :src="productImage(previewState.barcode)"
          :alt="previewState.name"
          style="width: 300px; height: 300px; object-fit: contain"
        />
        <div v-else class="empty">
          <Icon name="product" :size="34" />
          <div>{{ $t('pos.noImage') }}</div>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div class="flex justify-between px-2 py-1.5 rounded" :style="{ background: 'var(--c-surface-2)' }">
          <span class="text-text-3">{{ $t('pos.barcode') }}</span>
          <span class="font-mono">{{ previewState.barcode }}</span>
        </div>
        <div class="flex justify-between px-2 py-1.5 rounded" :style="{ background: 'var(--c-surface-2)' }">
          <span class="text-text-3">{{ $t('product.price') }}</span>
          <span class="price">{{ money(previewState.price) }} / {{ previewState.unit }}</span>
        </div>
      </div>
      <template #footer="{ close }">
        <AppButton variant="default" @click="close">{{ $t('common.close') }}</AppButton>
        <AppButton variant="primary" icon="plus" @click="addFromPreview">{{ $t('pos.addToCart') }}</AppButton>
      </template>
    </AppModal>

    <!-- ============ 快捷新建会员 ============ -->
    <AppModal v-model="quickMember.visible" :title="$t('pos.quickMemberTitle')" :width="420">
      <div class="space-y-3">
        <div class="field">
          <label class="field-label">{{ $t('pos.memberName') }}<span class="req">*</span></label>
          <input v-model="quickMember.name" class="input w-full" :placeholder="$t('pos.memberNamePlaceholder')" />
        </div>
        <div class="field">
          <label class="field-label">{{ $t('pos.memberPhone') }}<span class="req">*</span></label>
          <input
            v-model="quickMember.phone"
            class="input w-full font-mono"
            maxlength="11"
            :placeholder="$t('pos.memberPhonePlaceholder')"
            @keyup.enter="saveQuickMember"
          />
        </div>
        <div class="field">
          <label class="field-label">{{ $t('pos.gender') }}</label>
          <div class="seg">
            <button class="seg-item" :class="quickMember.gender === 'female' && 'is-active'" @click="quickMember.gender = 'female'">
              {{ $t('pos.female') }}
            </button>
            <button class="seg-item" :class="quickMember.gender === 'male' && 'is-active'" @click="quickMember.gender = 'male'">
              {{ $t('pos.male') }}
            </button>
          </div>
        </div>
        <div class="text-[11.5px] text-text-3">
          {{ $t('pos.quickMemberTip') }}
        </div>
      </div>
      <template #footer="{ close }">
        <AppButton variant="default" @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" :loading="quickMemberSaving" @click="saveQuickMember">
          {{ $t('pos.createAndBind') }}
        </AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>

<style scoped>
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 17px;
  padding: 0 3px;
  border: 1px solid var(--c-line);
  border-radius: 3px;
  background: var(--c-surface-2);
  font-size: 10px;
  line-height: 1;
}
.qty-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  border: 1px solid var(--c-line);
  background: var(--c-surface);
  color: var(--c-text-2);
  transition: all 0.15s ease;
}
.qty-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.qty-input {
  width: 46px;
  height: 24px;
  padding: 0 4px;
  text-align: center;
  font-size: 13px;
  border-radius: 5px;
}
</style>
