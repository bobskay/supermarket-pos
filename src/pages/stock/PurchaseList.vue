<script setup>
/**
 * 采购入库（店长专属）
 * ------------------------------------------------------------------
 * 两条业务线：
 *   A. 进货单列表：查看明细 → 确认入库（确认后本地把状态改成「已入库」，界面立刻变化）；
 *   B. 新建进货单：抽屉里做一张含明细行的单据，明细的金额随进价/数量实时计算，
 *      底部汇总「共 N 种 / 合计 X 件 / 总金额 ￥Y」，提交后把新单插到列表最前面。
 *
 * 校验只做「至少 1 行明细 + 数量 > 0」，其余字段都能靠预置值走通，保证演示不卡壳。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi, productApi } from '@/api'
import { money, qty, thousands, sumBy, calc, genNo, dateStr } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useTable } from '@/composables/useTable'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isManager, displayName } = useAuth()
const { t, tl } = useI18n()

/** 状态码 → 字典键；未知码回退到数据里的中文 name */
const STATUS_KEY = { pending: 'stock.pending', received: 'stock.received' }
const PURCHASE_STATUS_STYLE = { pending: 'badge-warning', received: 'badge-success' }
const PURCHASE_STATUS_MAP = computed(() =>
  Object.fromEntries(
    Object.entries(STATUS_KEY).map(([k, key]) => [k, { label: t(key), class: PURCHASE_STATUS_STYLE[k] }]),
  ),
)

/** 按状态码取文案，未知码回退到数据里的 name 字段 */
function statusText(row) {
  if (STATUS_KEY[row.status]) return t(STATUS_KEY[row.status])
  return tl(row, 'statusName', row.status)
}

const STATUS_OPTIONS = computed(() => [
  { value: '', label: t('stock.allStates') },
  { value: 'pending', label: t('stock.pending') },
  { value: 'received', label: t('stock.received') },
])

/** 预置供应商：演示时不必手输，避免因缺数据卡住流程 */
const SUPPLIERS = [
  '华南生鲜配送中心',
  '鹏程食品供应商',
  '百川日用百货',
  '蒙发乳业华南仓',
  '中粮粮油贸易商',
  '联和饮料经销商',
]

const table = useTable(stockApi.purchaseOrders, {
  filters: { keyword: '', status: '', startDate: '', endDate: '' },
  pageSize: 20,
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = table


const allOrders = ref([])
const products = ref([])
const summaryLoading = ref(true)

/** 全量进货单（KPI 与「本月金额」统计用，和列表筛选解耦） */
const summary = computed(() => {
  const rows = allOrders.value
  const thisMonth = dateStr().slice(0, 7)
  return {
    total: rows.length,
    received: rows.filter((r) => r.status === 'received').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    monthAmount: sumBy(
      rows.filter((r) => String(r.createdAt || '').startsWith(thisMonth)),
      (r) => r.totalAmount,
    ),
  }
})

const kpis = computed(() => {
  const s = summary.value
  return [
    { key: 'total', label: t('stock.totalOrders'), value: thousands(s.total), unit: t('common.unitOrder'), icon: 'file', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: t('stock.footAllOrders') },
    { key: 'received', label: t('stock.received'), value: thousands(s.received), unit: t('common.unitOrder'), icon: 'check', color: 'var(--c-success)', bg: 'var(--c-success-soft)', foot: t('stock.footReceived') },
    { key: 'pending', label: t('stock.pending'), value: thousands(s.pending), unit: t('common.unitOrder'), icon: 'clock', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)', foot: t('stock.footPending') },
    { key: 'month', label: t('stock.monthAmount'), value: money(s.monthAmount), icon: 'wallet', color: 'var(--c-purple)', bg: 'var(--c-purple-soft)', foot: t('stock.footMonthAmount') },
  ]
})

const columns = computed(() => [
  { key: 'purchaseNo', label: t('stock.purchaseNo'), width: 146 },
  { key: 'supplier', label: t('stock.supplier'), width: 150 },
  { key: 'itemCount', label: t('stock.kindsCount'), width: 88, align: 'right', format: (r) => `${qty(r.itemCount)} ${t('common.unitKind')}` },
  { key: 'totalQty', label: t('stock.totalPieces'), width: 100, align: 'right', format: (r) => qty(r.totalQty) },
  { key: 'totalAmount', label: t('stock.purchaseAmount'), width: 110, align: 'right' },
  { key: 'status', label: t('stock.stockState'), width: 92, align: 'center' },
  { key: 'operator', label: t('stock.creator'), width: 90 },
  { key: 'createdAt', label: t('stock.createdAt'), width: 148 },
  { key: 'remark', label: t('common.remark'), width: 120 },
  { key: 'action', label: t('common.actions'), width: 210 },
])

async function loadSummary() {
  summaryLoading.value = true
  try {
    const res = await stockApi.purchaseOrders({ pageSize: 0 })
    const d = res.data
    allOrders.value = Array.isArray(d) ? d : d.list || []
  } finally {
    summaryLoading.value = false
  }
}

async function loadProducts() {
  const res = await productApi.list({ pageSize: 0 })
  const d = res.data
  products.value = Array.isArray(d) ? d : d.list || []
}

onMounted(() => {
  loadSummary()
  loadProducts()
})

function onQuery() {
  reload()
}

function onReset() {
  reset()
}

/* ------------------------------- 查看明细 ------------------------------- */
const detailVisible = ref(false)
const detailOrder = ref(null)

const detailColumns = computed(() => [
  { key: 'barcode', label: t('stock.barcode'), width: 136 },
  { key: 'name', label: t('stock.productName'), width: 190 },
  { key: 'unit', label: t('stock.unit'), width: 60, align: 'center' },
  { key: 'costPrice', label: t('stock.costPrice'), width: 88, align: 'right' },
  { key: 'qty', label: t('stock.qty'), width: 82, align: 'right' },
  { key: 'amount', label: t('stock.subtotal'), width: 100, align: 'right' },
])

function openDetail(row) {
  detailOrder.value = row
  detailVisible.value = true
}

const detailItems = computed(() => detailOrder.value?.items || [])
const detailTotal = computed(() => {
  const items = detailItems.value
  return {
    qty: sumBy(items, (x) => x.qty),
    amount: sumBy(items, (x) => x.amount ?? calc(Number(x.costPrice || 0) * Number(x.qty || 0))),
  }
})

/* ------------------------------- 确认入库 ------------------------------- */
async function confirmReceive(row) {
  const okToDo = await confirm({
    title: t('stock.confirmReceive'),
    content: t('stock.receiveConfirm', {
      no: row.purchaseNo,
      kinds: row.itemCount,
      pieces: qty(row.totalQty),
    }),
    confirmText: t('stock.confirmReceive'),
  })
  if (!okToDo) return

  try {
    await stockApi.confirmPurchase(row.id)
  } catch {
    /* mock 后端未登记该写接口，演示环境按成功处理 */
  }
  // 本地合并状态，列表立刻从「待入库」变成「已入库」
  patchLocal(row.id, { status: 'received', statusName: '已入库' })
  const hit = allOrders.value.find((x) => x.id === row.id)
  if (hit) hit.status = 'received'
  toast.ok(t('stock.receiveOk'))
}

function printOrder(row) {
  toast.info(t('stock.printSent', { no: row.purchaseNo }))
}

function onExport() {
  const list = allOrders.value.length ? allOrders.value : list.value
  exportXls(
    `采购入库单_${dateStr()}`,
    ['进货单号', '供应商', '商品种类', '入库总件数', '进货金额', '状态', '创建人', '创建时间', '备注'],
    list.map((r) => [
      r.purchaseNo,
      r.supplier,
      qty(r.itemCount),
      qty(r.totalQty),
      Number(r.totalAmount || 0).toFixed(2),
      statusText(r),
      r.operator,
      r.createdAt,
      r.remark,
    ]),
    `采购入库单（共 ${list.length} 张）`,
  )
  toast.ok(t('stock.purchaseExported', { n: list.length }))
}

/* ------------------------------- 新建进货单 ------------------------------- */
const createVisible = ref(false)
const creating = ref(false)
const form = reactive({ supplier: SUPPLIERS[0], purchaseDate: dateStr(), remark: '' })
/** 明细行：每行 { productId, costPrice, qty } */
const lines = ref([emptyLine()])

function emptyLine() {
  return { productId: '', costPrice: null, qty: 10 }
}

function productOf(id) {
  return products.value.find((p) => p.id === id) || null
}

function openCreate() {
  form.supplier = SUPPLIERS[0]
  form.purchaseDate = dateStr()
  form.remark = ''
  lines.value = [emptyLine()]
  createVisible.value = true
}

function addLine() {
  lines.value.push(emptyLine())
}

function removeLine(index) {
  lines.value.splice(index, 1)
  if (!lines.value.length) lines.value.push(emptyLine())
}

/** 选择商品后自动带出默认进价（可手改），减少录入动作 */
function onPickProduct(line) {
  const p = productOf(line.productId)
  if (p) line.costPrice = p.costPrice
}

const lineAmount = (line) => calc(Number(line.costPrice || 0) * Number(line.qty || 0))

const createTotal = computed(() => {
  const valid = lines.value.filter((l) => l.productId)
  return {
    kinds: valid.length,
    qty: sumBy(valid, (l) => l.qty),
    amount: sumBy(valid, (l) => lineAmount(l)),
  }
})

async function submitCreate() {
  const valid = lines.value.filter((l) => l.productId)
  if (!valid.length) {
    toast.warning(t('stock.needOneLine'))
    return
  }
  if (valid.some((l) => !(Number(l.qty) > 0))) {
    toast.warning(t('stock.needQty'))
    return
  }

  const items = valid.map((l) => {
    const p = productOf(l.productId)
    return {
      productId: l.productId,
      barcode: p?.barcode || '',
      name: p?.name || '',
      unit: p?.unit || '',
      costPrice: Number(l.costPrice ?? p?.costPrice ?? 0),
      qty: Number(l.qty),
      amount: lineAmount(l),
    }
  })
  const payload = {
    supplier: form.supplier,
    purchaseDate: form.purchaseDate,
    remark: form.remark,
    items,
    totalQty: createTotal.value.qty,
    totalAmount: createTotal.value.amount,
    itemCount: items.length,
  }

  creating.value = true
  try {
    await stockApi.createPurchase(payload)
  } catch {
    /* mock 后端未登记该写接口，演示环境按成功处理 */
  } finally {
    creating.value = false
  }

  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const draft = {
    id: `PO-LOCAL-${Date.now()}`,
    purchaseNo: genNo('RK'),
    supplier: payload.supplier,
    status: 'pending',
    statusName: '待入库',
    totalQty: payload.totalQty,
    totalAmount: payload.totalAmount,
    itemCount: payload.itemCount,
    items,
    operator: displayName.value,
    remark: payload.remark,
    createdAt: `${payload.purchaseDate} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`,
  }
  // 新单插到列表最前面：让用户马上看到自己刚建的单据
  unshiftLocal(draft)
  allOrders.value.unshift(draft)
  createVisible.value = false
  toast.ok(t('stock.purchaseOk'))
}
</script>

<template>
  <PageShell>
    <PageHeader :title="$t('stock.purchaseTitle')" :desc="$t('stock.purchasePageDesc')" icon="truck">
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExport">{{ $t('stock.exportPurchase') }}</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="plus" @click="openCreate">{{ $t('stock.newPurchase') }}</AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">{{ $t('common.noPermission') }}</div>
        <div class="text-xs text-text-3 max-w-[420px]">
          {{ $t('stock.purchasePermTip') }}
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">{{ $t('stock.backToPos') }}</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- KPI -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <template v-if="summaryLoading">
          <div v-for="i in 4" :key="i" class="kpi">
            <div class="skeleton" style="height: 14px; width: 60%" />
            <div class="skeleton" style="height: 26px; width: 78%" />
            <div class="skeleton" style="height: 12px; width: 45%" />
          </div>
        </template>
        <template v-else>
          <div v-for="k in kpis" :key="k.key" class="kpi">
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
            <div class="kpi-foot">{{ k.foot }}</div>
          </div>
        </template>
      </div>

      <!-- 筛选栏 -->
      <div class="card card-pad mt-3">
        <div class="flex items-end flex-wrap gap-3">
          <FormField :label="$t('common.keyword')" class="w-[240px]">
            <SearchInput
              v-model="query.keyword"
              :placeholder="$t('stock.purchaseSearchPlaceholder')"
              width="100%"
              @search="onQuery"
              @enter="onQuery"
            />
          </FormField>
          <FormField :label="$t('common.status')" class="w-[140px]">
            <select v-model="query.status" class="input w-full" @change="onQuery">
              <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <FormField :label="$t('common.startDate')" class="w-[150px]">
            <input v-model="query.startDate" type="date" class="input w-full" @change="onQuery" />
          </FormField>
          <FormField :label="$t('common.endDate')" class="w-[150px]">
            <input v-model="query.endDate" type="date" class="input w-full" @change="onQuery" />
          </FormField>
          <div class="flex items-center gap-2 pb-[1px]">
            <AppButton variant="primary" icon="search" @click="onQuery">{{ $t('common.search') }}</AppButton>
            <AppButton icon="refresh" @click="onReset">{{ $t('common.reset') }}</AppButton>
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          :empty-text="$t('stock.purchaseEmptyText')"
          :empty-hint="$t('stock.purchaseEmptyHint')"
        >
          <template #cell-purchaseNo="{ row }">
            <button class="font-mono text-[12.5px] text-primary hover:underline" @click.stop="openDetail(row)">
              {{ row.purchaseNo }}
            </button>
          </template>

          <template #cell-totalQty="{ row }">
            <span class="num">{{ qty(row.totalQty) }}</span>
          </template>
          <template #cell-totalAmount="{ row }">
            <span class="price">{{ money(row.totalAmount) }}</span>
          </template>

          <template #cell-status="{ row }">
            <StatusTag :value="row.status" :map="PURCHASE_STATUS_MAP" />
          </template>

          <template #cell-createdAt="{ row }">
            <span class="text-[12.5px] text-text-2 num">{{ row.createdAt }}</span>
          </template>
          <template #cell-remark="{ row }">
            <span v-if="row.remark" class="text-text-2">{{ row.remark }}</span>
            <span v-else class="text-text-3">—</span>
          </template>

          <template #cell-action="{ row }">
            <div class="flex items-center gap-2">
              <button class="text-[12.5px] text-primary hover:underline" @click.stop="openDetail(row)">{{ $t('stock.viewDetail') }}</button>
              <button
                v-if="row.status === 'pending'"
                class="text-[12.5px] hover:underline"
                :style="{ color: 'var(--c-success)' }"
                @click.stop="confirmReceive(row)"
              >
                {{ $t('stock.confirmReceive') }}
              </button>
              <span v-else class="text-[12.5px] text-text-3">{{ $t('stock.received') }}</span>
              <button class="text-[12.5px] text-text-2 hover:text-text hover:underline" @click.stop="printOrder(row)">
                {{ $t('common.print') }}
              </button>
            </div>
          </template>
        </DataTable>

        <div class="px-4 py-3 border-t border-line">
          <Pagination
            :page="page"
            :page-size="size"
            :total="total"
            @change="onPageChange"
          />
        </div>
      </div>
    </template>

    <!-- 查看明细 -->
    <AppDrawer v-model="detailVisible" :title="$t('stock.purchaseDetail')" width="620">
      <template v-if="detailOrder">
        <div class="card card-pad mb-3" :style="{ background: 'var(--c-surface-2)' }">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div class="text-[15px] font-semibold num">{{ detailOrder.purchaseNo }}</div>
              <div class="text-xs text-text-3 mt-0.5">
                {{ detailOrder.supplier }} · {{ $t('stock.createdAtInline', { time: detailOrder.createdAt }) }}
              </div>
            </div>
            <StatusTag :value="detailOrder.status" :map="PURCHASE_STATUS_MAP" />
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <div>
              <div class="text-xs text-text-3">{{ $t('stock.kindsCount') }}</div>
              <div class="text-[15px] font-semibold num">{{ qty(detailOrder.itemCount) }} {{ $t('common.unitKind') }}</div>
            </div>
            <div>
              <div class="text-xs text-text-3">{{ $t('stock.totalPieces') }}</div>
              <div class="text-[15px] font-semibold num">{{ qty(detailOrder.totalQty) }} {{ $t('common.unitPiece') }}</div>
            </div>
            <div>
              <div class="text-xs text-text-3">{{ $t('stock.purchaseAmount') }}</div>
              <div class="text-[15px] font-semibold price">{{ money(detailOrder.totalAmount) }}</div>
            </div>
          </div>
          <div v-if="detailOrder.remark" class="text-xs text-text-3 mt-2">{{ $t('stock.remarkInline', { text: detailOrder.remark }) }}</div>
          <div class="text-xs text-text-3 mt-0.5">{{ $t('stock.creatorInline', { name: detailOrder.operator }) }}</div>
        </div>

        <DataTable
          :columns="detailColumns"
          :list="detailItems"
          :hover="false"
          :empty-text="$t('stock.noItemsText')"
        >
          <template #cell-barcode="{ row }">
            <span class="font-mono text-[12px] text-text-2">{{ row.barcode }}</span>
          </template>
          <template #cell-costPrice="{ row }">
            <span class="num text-text-2">{{ money(row.costPrice) }}</span>
          </template>
          <template #cell-qty="{ row }">
            <span class="num">{{ qty(row.qty) }} {{ row.unit }}</span>
          </template>
          <template #cell-amount="{ row }">
            <span class="price">{{ money(row.amount ?? Number(row.costPrice) * Number(row.qty)) }}</span>
          </template>
        </DataTable>

        <div class="flex items-center justify-end gap-6 mt-3 pt-3 border-t border-line">
          <span class="text-[13px] text-text-2">{{ $t('stock.totalQtyInline', { n: qty(detailTotal.qty) }) }}</span>
          <span class="text-[13px] text-text-2">{{ $t('stock.totalAmountInline', { amount: money(detailTotal.amount) }) }}</span>
        </div>
      </template>

      <template #footer>
        <AppButton @click="detailVisible = false">{{ $t('common.close') }}</AppButton>
        <AppButton
          v-if="detailOrder?.status === 'pending'"
          variant="success"
          icon="check"
          @click="confirmReceive(detailOrder), (detailVisible = false)"
        >
          {{ $t('stock.confirmReceive') }}
        </AppButton>
      </template>
    </AppDrawer>

    <!-- 新建进货单 -->
    <AppDrawer v-model="createVisible" :title="$t('stock.newPurchase')" width="720">
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <FormField :label="$t('stock.supplier')" required>
            <select v-model="form.supplier" class="input w-full">
              <option v-for="s in SUPPLIERS" :key="s" :value="s">{{ s }}</option>
            </select>
          </FormField>
          <FormField :label="$t('stock.purchaseDate')" required>
            <input v-model="form.purchaseDate" type="date" class="input w-full" />
          </FormField>
          <FormField :label="$t('common.remark')">
            <input v-model="form.remark" class="input w-full" :placeholder="$t('stock.supplierRemarkPlaceholder')" />
          </FormField>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-[13.5px] font-semibold">{{ $t('stock.itemsTitle') }}</div>
          <AppButton size="sm" icon="plus" @click="addLine">{{ $t('stock.addRow') }}</AppButton>
        </div>

        <div class="card" style="overflow: hidden">
          <div class="table-wrap">
            <table class="table-flat">
              <thead>
                <tr>
                  <th style="width: 240px">{{ $t('stock.colProduct') }}</th>
                  <th style="width: 90px" class="text-right">{{ $t('stock.currentStock') }}</th>
                  <th style="width: 100px" class="text-right">{{ $t('stock.costPrice') }}</th>
                  <th style="width: 100px" class="text-right">{{ $t('stock.qty') }}</th>
                  <th style="width: 100px" class="text-right">{{ $t('stock.subtotal') }}</th>
                  <th style="width: 46px" class="text-center">{{ $t('common.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in lines" :key="i">
                  <td>
                    <select v-model="line.productId" class="input w-full" @change="onPickProduct(line)">
                      <option value="">{{ $t('stock.selectProduct') }}</option>
                      <option v-for="p in products" :key="p.id" :value="p.id">
                        {{ p.name }}（{{ p.barcode }}）
                      </option>
                    </select>
                  </td>
                  <td class="text-right">
                    <span class="num text-text-2">
                      {{ productOf(line.productId) ? `${qty(productOf(line.productId).stock)}${productOf(line.productId).unit}` : '—' }}
                    </span>
                  </td>
                  <td class="text-right">
                    <input
                      v-model="line.costPrice"
                      type="number"
                      step="0.01"
                      class="input w-full text-right num"
                      :placeholder="productOf(line.productId) ? String(productOf(line.productId).costPrice) : '0.00'"
                    />
                  </td>
                  <td class="text-right">
                    <input v-model="line.qty" type="number" min="1" class="input w-full text-right num" />
                  </td>
                  <td class="text-right">
                    <span class="price">{{ money(lineAmount(line)) }}</span>
                  </td>
                  <td class="text-center">
                    <button class="text-text-3 hover:text-danger" :title="$t('stock.deleteLineTitle')" @click="removeLine(i)">
                      <Icon name="trash" :size="15" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="text-xs text-text-3">{{ $t('stock.createHint') }}</div>
      </div>

      <!-- 抽屉底部：实时汇总 + 提交 -->
      <template #footer>
        <div class="flex items-center gap-4 flex-1 flex-wrap">
          <span class="text-[13px] text-text-2">
            {{ $t('stock.totalKinds', { n: createTotal.kinds }) }}
          </span>
          <span class="text-[13px] text-text-2">
            {{ $t('stock.totalSummary', { pieces: qty(createTotal.qty) }) }}
          </span>
          <span class="text-[13px] text-text-2">
            {{ $t('stock.totalAmountLabel', { amount: money(createTotal.amount) }) }}
          </span>
        </div>
        <AppButton @click="createVisible = false">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="save" :loading="creating" @click="submitCreate">{{ $t('stock.submitPurchase') }}</AppButton>
      </template>
    </AppDrawer>
  </PageShell>
</template>
