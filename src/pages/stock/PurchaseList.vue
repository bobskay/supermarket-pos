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

const PURCHASE_STATUS_MAP = {
  pending: { label: '待入库', class: 'badge-warning' },
  received: { label: '已入库', class: 'badge-success' },
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待入库' },
  { value: 'received', label: '已入库' },
]

/** 预置供应商：演示时不必手输，避免因缺数据卡住流程 */
const SUPPLIERS = [
  '华南生鲜配送中心',
  '鹏程食品供应商',
  '百川日用百货',
  '蒙发乳业华南仓',
  '中粮粮油贸易商',
  '联和饮料经销商',
]

const t = useTable(stockApi.purchaseOrders, {
  filters: { keyword: '', status: '', startDate: '', endDate: '' },
  pageSize: 20,
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = t


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
    { key: 'total', label: '进货单总数', value: thousands(s.total), unit: '单', icon: 'file', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: '历史全部进货单' },
    { key: 'received', label: '已入库', value: thousands(s.received), unit: '单', icon: 'check', color: 'var(--c-success)', bg: 'var(--c-success-soft)', foot: '库存已增加的进货单' },
    { key: 'pending', label: '待入库', value: thousands(s.pending), unit: '单', icon: 'clock', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)', foot: '需确认入库后方可销售' },
    { key: 'month', label: '本月进货金额', value: money(s.monthAmount), icon: 'wallet', color: 'var(--c-purple)', bg: 'var(--c-purple-soft)', foot: '按创建时间统计本月进货成本' },
  ]
})

const columns = [
  { key: 'purchaseNo', label: '进货单号', width: 146 },
  { key: 'supplier', label: '供应商', width: 150 },
  { key: 'itemCount', label: '商品种类', width: 88, align: 'right', format: (r) => `${qty(r.itemCount)} 种` },
  { key: 'totalQty', label: '入库总件数', width: 100, align: 'right', format: (r) => qty(r.totalQty) },
  { key: 'totalAmount', label: '进货金额', width: 110, align: 'right' },
  { key: 'status', label: '状态', width: 92, align: 'center' },
  { key: 'operator', label: '创建人', width: 90 },
  { key: 'createdAt', label: '创建时间', width: 148 },
  { key: 'remark', label: '备注', width: 120 },
  { key: 'action', label: '操作', width: 210 },
]

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

const detailColumns = [
  { key: 'barcode', label: '条码', width: 136 },
  { key: 'name', label: '商品名称', width: 190 },
  { key: 'unit', label: '单位', width: 60, align: 'center' },
  { key: 'costPrice', label: '进价', width: 88, align: 'right' },
  { key: 'qty', label: '数量', width: 82, align: 'right' },
  { key: 'amount', label: '金额', width: 100, align: 'right' },
]

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
    title: '确认入库',
    content: `确认将进货单 ${row.purchaseNo}（${row.itemCount} 种商品 / ${qty(row.totalQty)} 件）入库？确认后库存将立即增加。`,
    confirmText: '确认入库',
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
  toast.ok('入库成功，库存已增加')
}

function printOrder(row) {
  toast.info(`进货单 ${row.purchaseNo} 已发送至打印机（模拟）`)
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
      PURCHASE_STATUS_MAP[r.status]?.label || r.statusName,
      r.operator,
      r.createdAt,
      r.remark,
    ]),
    `采购入库单（共 ${list.length} 张）`,
  )
  toast.ok(`已导出 ${list.length} 张进货单`)
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
    toast.warning('请至少添加 1 行商品明细')
    return
  }
  if (valid.some((l) => !(Number(l.qty) > 0))) {
    toast.warning('明细数量必须大于 0')
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
  toast.ok('进货单创建成功，待确认入库')
}
</script>

<template>
  <PageShell>
    <PageHeader title="采购入库" desc="登记进货单与供应商送货，确认入库后库存自动增加" icon="truck">
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExport">导出进货单</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="plus" @click="openCreate">新建进货单</AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">权限不足</div>
        <div class="text-xs text-text-3 max-w-[420px]">
          「采购入库」涉及供应商与进货成本，仅店长可操作。收银员如需补货，请口头或书面告知店长。
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">返回收银台</AppButton>
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
          <FormField label="关键字" class="w-[240px]">
            <SearchInput
              v-model="query.keyword"
              placeholder="进货单号 / 供应商"
              width="100%"
              @search="onQuery"
              @enter="onQuery"
            />
          </FormField>
          <FormField label="状态" class="w-[140px]">
            <select v-model="query.status" class="input w-full" @change="onQuery">
              <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </FormField>
          <FormField label="开始日期" class="w-[150px]">
            <input v-model="query.startDate" type="date" class="input w-full" @change="onQuery" />
          </FormField>
          <FormField label="结束日期" class="w-[150px]">
            <input v-model="query.endDate" type="date" class="input w-full" @change="onQuery" />
          </FormField>
          <div class="flex items-center gap-2 pb-[1px]">
            <AppButton variant="primary" icon="search" @click="onQuery">查询</AppButton>
            <AppButton icon="refresh" @click="onReset">重置</AppButton>
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          empty-text="没有符合条件的进货单"
          empty-hint="点右上角「新建进货单」登记一张供应商送货单"
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
              <button class="text-[12.5px] text-primary hover:underline" @click.stop="openDetail(row)">查看明细</button>
              <button
                v-if="row.status === 'pending'"
                class="text-[12.5px] hover:underline"
                :style="{ color: 'var(--c-success)' }"
                @click.stop="confirmReceive(row)"
              >
                确认入库
              </button>
              <span v-else class="text-[12.5px] text-text-3">已入库</span>
              <button class="text-[12.5px] text-text-2 hover:text-text hover:underline" @click.stop="printOrder(row)">
                打印
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
    <AppDrawer v-model="detailVisible" title="进货单明细" width="620">
      <template v-if="detailOrder">
        <div class="card card-pad mb-3" :style="{ background: 'var(--c-surface-2)' }">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div class="text-[15px] font-semibold num">{{ detailOrder.purchaseNo }}</div>
              <div class="text-xs text-text-3 mt-0.5">
                {{ detailOrder.supplier }} · 创建于 {{ detailOrder.createdAt }}
              </div>
            </div>
            <StatusTag :value="detailOrder.status" :map="PURCHASE_STATUS_MAP" />
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <div>
              <div class="text-xs text-text-3">商品种类</div>
              <div class="text-[15px] font-semibold num">{{ qty(detailOrder.itemCount) }} 种</div>
            </div>
            <div>
              <div class="text-xs text-text-3">入库总件数</div>
              <div class="text-[15px] font-semibold num">{{ qty(detailOrder.totalQty) }} 件</div>
            </div>
            <div>
              <div class="text-xs text-text-3">进货金额</div>
              <div class="text-[15px] font-semibold price">{{ money(detailOrder.totalAmount) }}</div>
            </div>
          </div>
          <div v-if="detailOrder.remark" class="text-xs text-text-3 mt-2">备注：{{ detailOrder.remark }}</div>
          <div class="text-xs text-text-3 mt-0.5">创建人：{{ detailOrder.operator }}</div>
        </div>

        <DataTable
          :columns="detailColumns"
          :list="detailItems"
          :hover="false"
          empty-text="该单没有商品明细"
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
          <span class="text-[13px] text-text-2">合计数量 <span class="num font-semibold text-text">{{ qty(detailTotal.qty) }}</span> 件</span>
          <span class="text-[13px] text-text-2">合计金额 <span class="price text-text">{{ money(detailTotal.amount) }}</span></span>
        </div>
      </template>

      <template #footer>
        <AppButton @click="detailVisible = false">关闭</AppButton>
        <AppButton
          v-if="detailOrder?.status === 'pending'"
          variant="success"
          icon="check"
          @click="confirmReceive(detailOrder), (detailVisible = false)"
        >
          确认入库
        </AppButton>
      </template>
    </AppDrawer>

    <!-- 新建进货单 -->
    <AppDrawer v-model="createVisible" title="新建进货单" width="720">
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <FormField label="供应商" required>
            <select v-model="form.supplier" class="input w-full">
              <option v-for="s in SUPPLIERS" :key="s" :value="s">{{ s }}</option>
            </select>
          </FormField>
          <FormField label="进货日期" required>
            <input v-model="form.purchaseDate" type="date" class="input w-full" />
          </FormField>
          <FormField label="备注">
            <input v-model="form.remark" class="input w-full" placeholder="如：月结供应商" />
          </FormField>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-[13.5px] font-semibold">商品明细</div>
          <AppButton size="sm" icon="plus" @click="addLine">添加一行</AppButton>
        </div>

        <div class="card" style="overflow: hidden">
          <div class="table-wrap">
            <table class="table-flat">
              <thead>
                <tr>
                  <th style="width: 240px">商品</th>
                  <th style="width: 90px" class="text-right">当前库存</th>
                  <th style="width: 100px" class="text-right">进价</th>
                  <th style="width: 100px" class="text-right">数量</th>
                  <th style="width: 100px" class="text-right">金额</th>
                  <th style="width: 46px" class="text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in lines" :key="i">
                  <td>
                    <select v-model="line.productId" class="input w-full" @change="onPickProduct(line)">
                      <option value="">请选择商品</option>
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
                    <button class="text-text-3 hover:text-danger" title="删除该行" @click="removeLine(i)">
                      <Icon name="trash" :size="15" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="text-xs text-text-3">提示：选择商品后会自动带出商品进价，可按实际到货价修改；数量默认为 10。</div>
      </div>

      <!-- 抽屉底部：实时汇总 + 提交 -->
      <template #footer>
        <div class="flex items-center gap-4 flex-1 flex-wrap">
          <span class="text-[13px] text-text-2">
            共 <span class="num font-semibold text-text">{{ createTotal.kinds }}</span> 种商品
          </span>
          <span class="text-[13px] text-text-2">
            合计 <span class="num font-semibold text-text">{{ qty(createTotal.qty) }}</span> 件
          </span>
          <span class="text-[13px] text-text-2">
            总金额 <span class="price text-primary">{{ money(createTotal.amount) }}</span>
          </span>
        </div>
        <AppButton @click="createVisible = false">取消</AppButton>
        <AppButton variant="primary" icon="save" :loading="creating" @click="submitCreate">提交进货单</AppButton>
      </template>
    </AppDrawer>
  </PageShell>
</template>
