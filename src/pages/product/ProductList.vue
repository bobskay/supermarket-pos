<script setup>
/**
 * 商品档案（列表 + 快速新增/改价/停用/删除）
 * ------------------------------------------------------------------
 * 演示要点：所有写操作都「先调接口 → toast → 合并本地行」，界面立刻有变化。
 * 数据编排：useTable 负责分页/排序的「外壳」，但它拿到的是全量商品（pageSize: 0）——
 * 因为「库存情况」（有货/预警/售罄）是我方基于 stock 与 warnThreshold 的业务判断，
 * mock 后端没有这个字段，只能在拿到全量后本地筛，再交给 Pagination 切页。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { productApi, categoryApi } from '@/api'
import { money, thousands, qty, sumBy } from '@/utils/format'
import { productImage } from '@/utils/product-image'
import { exportXls } from '@/utils/export'
import { useTable } from '@/composables/useTable'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormField from '@/components/ui/FormField.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isManager } = useAuth()

/** 状态徽章映射：在售=绿、停用=灰 */
const STATUS_STYLE = {
  active: { label: '在售', class: 'badge-success' },
  inactive: { label: '停用', class: 'badge-muted' },
}

const UNITS = ['斤', '个', '盒', '袋', '瓶', '罐', '箱', '排', '桶', '提', '把', '支', '块', '条', '卷', '板', '只']

/** 全量商品：pageSize: 0 让 mock 后端不分页，一次拿全，便于本地统计与筛选 */
const t = useTable(productApi.list, {
  filters: { keyword: '', categoryId: '', status: '', stockState: '' },
  pageSize: 0, // 关键：pageSize 0 = 不分页，拿全量做本地统计/筛选
})
// 解构出 ref 与常用方法：脚本与模板里都用裸变量，避免对象内 ref 解包带来的不确定性
const { list, total, loading, query, refresh, reset: resetTable, fetchAll, patchLocal, removeLocal, unshiftLocal } = t

const categories = ref([])
const allProducts = ref([])
const PAGE_SIZES = [10, 20, 50, 100]

onMounted(async () => {
  // 分类下拉只需要一次
  const catRes = await categoryApi.list({ pageSize: 0 })
  categories.value = catRes.data?.list || catRes.data || []
})

// 每次 fetchData 后同步一份全量数据（KPI、本地筛选都基于它）
watch(list, (rows) => {
  allProducts.value = (rows || []).slice()
})
// 首屏接口未回来时也要有确定的数组，避免 computed 里判空
allProducts.value = (list.value || []).slice()

/* ------------------------------ KPI ------------------------------ */
const kpi = computed(() => {
  const rows = allProducts.value
  const active = rows.filter((p) => p.status === 'active')
  return {
    total: rows.length,
    active: active.length,
    inactive: rows.length - active.length,
    // 库存总金额按「进价 × 库存」估算，与库存页的 stockAmount 口径一致
    stockAmount: sumBy(rows, (p) => Number(p.costPrice || 0) * Number(p.stock || 0)),
  }
})

const kpiCards = computed(() => [
  { label: '商品总数', value: thousands(kpi.value.total), unit: '种', icon: 'product', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: '全部档案' },
  { label: '在售数量', value: thousands(kpi.value.active), unit: '种', icon: 'check', color: 'var(--c-success)', bg: 'var(--c-success-soft)', foot: '可正常销售' },
  { label: '停用数量', value: thousands(kpi.value.inactive), unit: '种', icon: 'power', color: 'var(--c-text-2)', bg: 'var(--c-surface-3)', foot: '已下架/停售' },
  { label: '库存总金额', value: money(kpi.value.stockAmount), icon: 'wallet', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)', foot: '进价 × 库存' },
])

/* --------------------------- 库存情况 --------------------------- */
/** 业务口径：0 = 售罄；低于预警阈值 = 预警；否则有货 */
function stockStateOf(row) {
  const stock = Number(row.stock || 0)
  if (stock <= 0) return 'empty'
  if (stock < Number(row.warnThreshold || 0)) return 'low'
  return 'normal'
}

const STOCK_STATE_STYLE = {
  normal: { label: '有货', tone: 'text-text-2' },
  low: { label: '预警', tone: 'text-warning' },
  empty: { label: '售罄', tone: 'text-danger' },
}

/** 库存颜色：售罄红、低于阈值橙，其余常规色 */
function stockColor(row) {
  const state = stockStateOf(row)
  if (state === 'empty') return 'var(--c-danger)'
  if (state === 'low') return 'var(--c-warning)'
  return 'var(--c-text)'
}

const filtered = computed(() => {
  const { keyword, categoryId, status, stockState } = t.query
  const kw = String(keyword || '').trim().toLowerCase()
  return allProducts.value.filter((p) => {
    if (kw && !String(p.name || '').toLowerCase().includes(kw) && !String(p.barcode || '').includes(kw)) return false
    if (categoryId && p.categoryId !== categoryId) return false
    if (status && p.status !== status) return false
    if (stockState && stockStateOf(p) !== stockState) return false
    return true
  })
})

/** 本地分页：只把当前页交给 DataTable，避免一次渲染上百行 */
const page = ref(1)
const size = ref(20)
const pagedRows = computed(() => {
  const start = (page.value - 1) * size.value
  return filtered.value.slice(start, start + size.value)
})
watch(filtered, () => {
  // 筛选变化后如果当前页超界，回到最后一页
  const max = Math.max(1, Math.ceil(filtered.value.length / size.value))
  if (page.value > max) page.value = max
})

function onPageChange({ page: p, pageSize: s }) {
  if (p) page.value = p
  if (s) size.value = s
}

function onQuery() {
  page.value = 1
  refresh()
}

function onReset() {
  page.value = 1
  t.reset()
}

/* ----------------------------- 表格列 ----------------------------- */
const columns = [
  { key: 'image', label: '图片', width: 66, align: 'center' },
  { key: 'barcode', label: '条码', width: 172 },
  { key: 'name', label: '商品名称', width: 150 },
  { key: 'categoryName', label: '分类', width: 100 },
  { key: 'unit', label: '单位', width: 58, align: 'center' },
  { key: 'costPrice', label: '进价', width: 84, align: 'right', format: (r) => money(r.costPrice) },
  { key: 'price', label: '售价', width: 88, align: 'right', format: (r) => money(r.price) },
  { key: 'memberPrice', label: '会员价', width: 88, align: 'right', format: (r) => money(r.memberPrice) },
  { key: 'stock', label: '库存', width: 96, align: 'right' },
  { key: 'stockAmount', label: '库存金额', width: 100, align: 'right', format: (r) => money(Number(r.costPrice || 0) * Number(r.stock || 0)) },
  { key: 'status', label: '状态', width: 76, align: 'center' },
  { key: 'updatedAt', label: '更新时间', width: 104, align: 'right', format: (r) => String(r.updatedAt || '').slice(0, 10) },
  { key: 'action', label: '操作', width: 232, align: 'right' },
]

/* --------------------------- 商品图片 --------------------------- */
/** 记录加载失败的图片 id，避免死链一直显示破图 */
const brokenImages = ref([])
const imagePreview = ref({ visible: false, id: '', src: '', name: '', barcode: '', price: 0 })

function isImageBroken(id) {
  return brokenImages.value.includes(id)
}

function markImageBroken(id) {
  if (!brokenImages.value.includes(id)) brokenImages.value.push(id)
}

function previewImage(row) {
  imagePreview.value = {
    visible: true,
    id: row.id,
    src: isImageBroken(row.id) ? '' : productImage(row),
    name: row.name,
    barcode: row.barcode,
    price: row.price,
  }
}

/* --------------------------- 导出 / 复制 --------------------------- */
async function onExport() {
  const rows = filtered.value.map((p) => [
    p.barcode,
    p.name,
    p.categoryName,
    p.unit,
    money(p.costPrice, false),
    money(p.price, false),
    money(p.memberPrice, false),
    qty(p.stock),
    money(Number(p.costPrice || 0) * Number(p.stock || 0), false),
    p.status === 'active' ? '在售' : '停用',
    String(p.updatedAt || '').slice(0, 10),
  ])
  exportXls(
    `商品档案_${new Date().toISOString().slice(0, 10)}`,
    ['条码', '商品名称', '分类', '单位', '进价', '售价', '会员价', '库存', '库存金额', '状态', '更新时间'],
    rows,
    '商品档案导出',
  )
  toast.ok('导出成功，文件已开始下载')
}

async function copyBarcode(row) {
  try {
    await navigator.clipboard.writeText(String(row.barcode || ''))
    toast.ok(`已复制条码 ${row.barcode}`)
  } catch {
    // 非安全上下文（http 且非 localhost）下 clipboard 不可用，给出兜底提示
    toast.warning('当前环境不支持自动复制，请手动选中条码')
  }
}

function goCreate() {
  router.push({ name: 'product-create' })
}

function goEdit(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以编辑商品档案')
    return
  }
  router.push({ name: 'product-edit', params: { id: row.id } })
}

/* --------------------------- 新增商品弹窗 --------------------------- */
const createVisible = ref(false)
const createForm = ref(emptyForm())
const createErrors = ref({})

function emptyForm() {
  return {
    barcode: '',
    name: '',
    categoryId: '',
    unit: '个',
    costPrice: '',
    price: '',
    memberPrice: '',
    warnThreshold: 10,
    remark: '',
  }
}

/** 13 位模拟条码：69 开头（中国商品前缀）+ 随机数字，满足校验与观感 */
function genBarcode() {
  let body = ''
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10)
  return `69${body}0`
}

function openCreate() {
  if (!isManager.value) {
    toast.warning('仅店长可以新增商品')
    return
  }
  createForm.value = emptyForm()
  createForm.value.barcode = genBarcode()
  createErrors.value = {}
  createVisible.value = true
}

function fillBarcode() {
  createForm.value.barcode = genBarcode()
  createErrors.value.barcode = ''
}

function validateCreate() {
  const f = createForm.value
  const e = {}
  if (!String(f.barcode || '').trim()) e.barcode = '条码不能为空'
  else if (!/^\d{8,13}$/.test(String(f.barcode).trim())) e.barcode = '条码需为 8-13 位数字'
  if (!String(f.name || '').trim()) e.name = '商品名称不能为空'
  if (!f.categoryId) e.categoryId = '请选择商品分类'
  if (f.price === '' || Number(f.price) <= 0) e.price = '售价必须大于 0'
  else if (f.costPrice !== '' && Number(f.costPrice) > Number(f.price)) e.price = '售价不能低于进价'
  if (f.costPrice !== '' && Number(f.costPrice) < 0) e.costPrice = '进价不能为负数'
  if (f.memberPrice !== '' && Number(f.memberPrice) > Number(f.price)) e.memberPrice = '会员价不能高于售价'
  createErrors.value = e
  return !Object.keys(e).length
}

async function submitCreate() {
  if (!validateCreate()) return
  const f = createForm.value
  const cat = categories.value.find((c) => c.id === f.categoryId)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`

  // 演示环境后端不落库，写接口的返回值我们不依赖；即便 mock 未登记该路由也不阻塞界面
  await productApi
    .create({
      ...f,
      costPrice: Number(f.costPrice || 0),
      price: Number(f.price || 0),
      memberPrice: Number(f.memberPrice || f.price || 0),
      warnThreshold: Number(f.warnThreshold || 0),
      categoryName: cat?.name || '',
      categoryCode: cat?.code || '',
    })
    .catch(() => null)

  // 后端不落库：手工把草稿行并进本地列表，让界面立刻出现新商品
  t.unshiftLocal({
    id: `P${Date.now().toString().slice(-6)}`,
    barcode: String(f.barcode).trim(),
    name: String(f.name).trim(),
    categoryId: f.categoryId,
    categoryName: cat?.name || '—',
    categoryCode: cat?.code || '',
    unit: f.unit,
    costPrice: Number(f.costPrice || 0),
    price: Number(f.price || 0),
    memberPrice: Number(f.memberPrice || f.price || 0),
    stock: 0,
    warnThreshold: Number(f.warnThreshold || 0),
    status: 'active',
    remark: f.remark,
    createdAt: stamp,
    updatedAt: stamp,
  })
  toast.ok('商品创建成功')
  createVisible.value = false
}

/* ----------------------------- 快速改价 ----------------------------- */
const priceVisible = ref(false)
const priceTarget = ref(null)
const priceForm = ref({ price: '', memberPrice: '' })
const priceErrors = ref({})

function openPrice(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以修改售价')
    return
  }
  priceTarget.value = row
  priceForm.value = { price: String(row.price ?? ''), memberPrice: String(row.memberPrice ?? '') }
  priceErrors.value = {}
  priceVisible.value = true
}

async function submitPrice() {
  const f = priceForm.value
  const e = {}
  if (f.price === '' || Number(f.price) <= 0) e.price = '售价必须大于 0'
  if (f.memberPrice !== '' && Number(f.memberPrice) > Number(f.price)) e.memberPrice = '会员价不能高于售价'
  priceErrors.value = e
  if (Object.keys(e).length) return

  const row = priceTarget.value
  await productApi
    .update(row.id, { price: Number(f.price), memberPrice: Number(f.memberPrice || f.price) })
    .catch(() => null)
  t.patchLocal(row.id, {
    price: Number(f.price),
    memberPrice: Number(f.memberPrice || f.price),
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  })
  toast.ok('售价已更新')
  priceVisible.value = false
}

/* --------------------------- 停用 / 启用 --------------------------- */
async function toggleStatus(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以停用或启用商品')
    return
  }
  const toInactive = row.status === 'active'
  const okToGo = await confirm({
    title: toInactive ? '停用商品' : '启用商品',
    content: toInactive
      ? `停用「${row.name}」后收银台将无法扫码销售，历史订单不受影响。`
      : `启用「${row.name}」后可在收银台正常销售。`,
    danger: toInactive,
    confirmText: toInactive ? '停用' : '启用',
  })
  if (!okToGo) return

  if (toInactive) await productApi.disable(row.id).catch(() => null)
  else await productApi.enable(row.id).catch(() => null)

  t.patchLocal(row.id, { status: toInactive ? 'inactive' : 'active' })
  toast.ok(toInactive ? '商品已停用' : '商品已启用')
}

/* ------------------------------ 删除 ------------------------------ */
async function removeRow(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以删除商品')
    return
  }
  const okToGo = await confirm({
    title: '删除商品',
    content: `确认删除「${row.name}」？删除后该商品的库存与销售记录将一并清理，业务上更推荐「停用」。`,
    danger: true,
    confirmText: '删除',
  })
  if (!okToGo) return

  await productApi.remove(row.id).catch(() => null)
  t.removeLocal(row.id)
  toast.ok('商品已删除')
}
</script>

<template>
  <PageShell>
    <PageHeader title="商品档案" desc="维护商品基础信息、售价与库存预警，支撑收银台扫码销售" icon="product">
      <template #actions>
        <AppButton icon="download" @click="onExport">导出商品</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="plus" @click="openCreate">新增商品</AppButton>
      </template>
    </PageHeader>

    <!-- 权限兜底：收银员可看只读列表，但不能改任何数据 -->
    <div v-if="!isManager" class="card card-pad mt-3 flex items-start gap-2.5">
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" />
      <div class="text-[12.5px] text-text-2">
        <span class="font-medium text-text">权限不足</span>：商品档案为店长专属功能，当前账号（收银员）只能查看，
        新增 / 改价 / 停用 / 删除按钮均不可用。
      </div>
    </div>

    <!-- KPI -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <div v-for="k in kpiCards" :key="k.label" class="kpi">
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
    </div>

    <!-- 筛选栏 -->
    <div class="card card-pad mt-3">
      <div class="flex items-end gap-3 flex-wrap">
        <FormField label="关键字">
          <SearchInput v-model="query.keyword" placeholder="商品名称 / 条码" width="220px" @enter="onQuery" />
        </FormField>
        <FormField label="分类">
          <select v-model="query.categoryId" class="input" style="width: 150px">
            <option value="">全部分类</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </FormField>
        <FormField label="状态">
          <select v-model="query.status" class="input" style="width: 120px">
            <option value="">全部</option>
            <option value="active">在售</option>
            <option value="inactive">停用</option>
          </select>
        </FormField>
        <FormField label="库存情况">
          <select v-model="query.stockState" class="input" style="width: 120px">
            <option value="">全部</option>
            <option value="normal">有货</option>
            <option value="low">预警</option>
            <option value="empty">售罄</option>
          </select>
        </FormField>
        <div class="flex items-center gap-2">
          <AppButton variant="primary" icon="search" @click="onQuery">查询</AppButton>
          <AppButton icon="refresh" @click="onReset">重置</AppButton>
        </div>
      </div>
    </div>

    <!-- 表格 -->
    <div class="card mt-3">
      <div class="panel-head">
        <div>
          <div class="text-[14px] font-semibold">商品列表</div>
          <div class="text-[11.5px] text-text-3 mt-0.5">
            共 {{ filtered.length }} 条 · 库存低于预警阈值显示橙色，售罄显示红色
          </div>
        </div>
        <AppButton size="sm" icon="refresh" :loading="loading" @click="refresh()" />
      </div>

      <DataTable
        :columns="columns"
        :list="pagedRows"
        :loading="loading"
        empty-text="没有符合条件的商品"
        empty-hint="试试清空筛选条件，或调整关键字"
      >
        <template #cell-image="{ row }">
          <button
            class="block mx-auto rounded-md overflow-hidden shrink-0"
            :style="{ width: '40px', height: '40px', border: '1px solid var(--c-line)', background: 'var(--c-surface-2)' }"
            :title="`查看「${row.name}」图片`"
            @click.stop="previewImage(row)"
          >
            <img
              v-if="productImage(row) && !isImageBroken(row.id)"
              :src="productImage(row)"
              :alt="row.name"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="markImageBroken(row.id)"
            />
            <span v-else class="w-full h-full flex items-center justify-center text-text-3">
              <Icon name="product" :size="17" />
            </span>
          </button>
        </template>

        <template #cell-barcode="{ row }">
          <span class="flex items-center gap-1.5">
            <span class="font-mono text-[12.5px]">{{ row.barcode }}</span>
            <button class="text-text-3 hover:text-primary" title="复制条码" @click.stop="copyBarcode(row)">
              <Icon name="copy" :size="13" />
            </button>
          </span>
        </template>

        <template #cell-name="{ row }">
          <div class="min-w-0">
            <div class="truncate">{{ row.name }}</div>
            <div v-if="row.remark" class="text-[11.5px] text-text-3 truncate">{{ row.remark }}</div>
          </div>
        </template>

        <template #cell-price="{ row }">
          <span class="price">{{ money(row.price) }}</span>
        </template>

        <template #cell-memberPrice="{ row }">
          <span class="price text-primary">{{ money(row.memberPrice) }}</span>
        </template>

        <template #cell-stock="{ row }">
          <span class="num font-medium" :style="{ color: stockColor(row) }">
            {{ qty(row.stock) }}{{ row.unit }}
          </span>
        </template>

        <template #cell-stockAmount="{ row }">
          <span class="num">{{ money(Number(row.costPrice || 0) * Number(row.stock || 0)) }}</span>
        </template>

        <template #cell-status="{ row }">
          <StatusTag :value="row.status" :map="STATUS_STYLE" />
        </template>

        <template #cell-action="{ row }">
          <div class="flex items-center justify-end gap-1">
            <AppButton size="sm" variant="ghost" @click.stop="goEdit(row)">编辑</AppButton>
            <AppButton size="sm" variant="ghost" @click.stop="openPrice(row)">改售价</AppButton>
            <AppButton size="sm" variant="ghost" @click.stop="toggleStatus(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </AppButton>
            <AppButton v-if="isManager" size="sm" variant="ghost" @click.stop="removeRow(row)">
              <span :style="{ color: 'var(--c-danger)' }">删除</span>
            </AppButton>
          </div>
        </template>
      </DataTable>

      <div class="px-4 py-3 border-t border-line">
        <Pagination
          :page="page"
          :page-size="size"
          :total="filtered.length"
          :page-sizes="PAGE_SIZES"
          @change="onPageChange"
        />
      </div>
    </div>

    <!-- 新增商品 -->
    <AppModal v-model="createVisible" title="新增商品" subtitle="带 * 为必填；条码支持扫码枪输入" :width="640">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="条码" required :error="createErrors.barcode" span="2">
          <div class="flex items-center gap-2">
            <input
              v-model="createForm.barcode"
              class="input flex-1 font-mono"
              :class="createErrors.barcode && 'is-error'"
              placeholder="扫码枪扫描或手动输入（8-13 位数字）"
              @keyup.enter="submitCreate"
            />
            <AppButton icon="barcode" @click="fillBarcode">生成条码</AppButton>
          </div>
        </FormField>

        <FormField label="商品名称" required :error="createErrors.name" span="2">
          <input v-model="createForm.name" class="input" :class="createErrors.name && 'is-error'" placeholder="如：红富士苹果" />
        </FormField>

        <FormField label="分类" required :error="createErrors.categoryId">
          <select v-model="createForm.categoryId" class="input" :class="createErrors.categoryId && 'is-error'">
            <option value="">请选择分类</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </FormField>

        <FormField label="单位">
          <select v-model="createForm.unit" class="input">
            <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
          </select>
        </FormField>

        <FormField label="进价" :error="createErrors.costPrice" hint="元 / 单位">
          <input v-model="createForm.costPrice" type="number" min="0" step="0.01" class="input num" placeholder="0.00" />
        </FormField>

        <FormField label="售价" required :error="createErrors.price" hint="元 / 单位">
          <input
            v-model="createForm.price"
            type="number"
            min="0"
            step="0.01"
            class="input num"
            :class="createErrors.price && 'is-error'"
            placeholder="0.00"
          />
        </FormField>

        <FormField label="会员价" :error="createErrors.memberPrice" hint="需 ≤ 售价">
          <input v-model="createForm.memberPrice" type="number" min="0" step="0.01" class="input num" placeholder="留空则同售价" />
        </FormField>

        <FormField label="预警阈值" hint="库存低于该值触发预警">
          <input v-model="createForm.warnThreshold" type="number" min="0" class="input num" />
        </FormField>

        <FormField label="备注" span="2">
          <textarea v-model="createForm.remark" rows="2" class="w-full" placeholder="选填，如供货要求、陈列位置" />
        </FormField>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="save" @click="submitCreate">保存</AppButton>
      </template>
    </AppModal>

    <!-- 快速改价 -->
    <AppModal v-model="priceVisible" title="改售价" :subtitle="priceTarget?.name" :width="460">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="售价" required :error="priceErrors.price">
          <input
            v-model="priceForm.price"
            type="number"
            min="0"
            step="0.01"
            class="input num"
            :class="priceErrors.price && 'is-error'"
            @keyup.enter="submitPrice"
          />
        </FormField>
        <FormField label="会员价" :error="priceErrors.memberPrice" hint="留空则同售价">
          <input v-model="priceForm.memberPrice" type="number" min="0" step="0.01" class="input num" />
        </FormField>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitPrice">确认修改</AppButton>
      </template>
    </AppModal>

    <!-- 商品图片放大预览 -->
    <AppModal v-model="imagePreview.visible" :title="imagePreview.name" subtitle="商品图片" :width="420">
      <div class="flex items-center justify-center rounded-lg p-3"
        :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }">
        <img
          v-if="imagePreview.src"
          :src="imagePreview.src"
          :alt="imagePreview.name"
          style="width: 320px; height: 320px; object-fit: contain"
        />
        <div v-else class="empty">
          <Icon name="product" :size="34" />
          <div>该商品尚未上传图片</div>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div class="flex justify-between px-2 py-1.5 rounded" :style="{ background: 'var(--c-surface-2)' }">
          <span class="text-text-3">条码</span><span class="font-mono">{{ imagePreview.barcode }}</span>
        </div>
        <div class="flex justify-between px-2 py-1.5 rounded" :style="{ background: 'var(--c-surface-2)' }">
          <span class="text-text-3">售价</span><span class="price">{{ money(imagePreview.price) }}</span>
        </div>
      </div>
      <template #footer="{ close }">
        <AppButton variant="default" @click="close">关闭</AppButton>
        <AppButton
          variant="primary"
          icon="edit"
          @click="close(); router.push({ name: 'product-edit', params: { id: imagePreview.id } })"
        >
          去修改图片
        </AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
