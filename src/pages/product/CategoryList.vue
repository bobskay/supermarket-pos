<script setup>
/**
 * 商品分类
 * ------------------------------------------------------------------
 * 左侧分类明细（商品数量 / 库存金额），右侧分类销售占比饼图。
 * 商品数量与库存金额需要按分类聚合，所以一次拉全量商品（pageSize: 0）与全量库存后本地统计，
 * 避免为 8 个分类各发一次请求。
 */
import { ref, computed, onMounted } from 'vue'
import { categoryApi, productApi, stockApi, reportApi } from '@/api'
import { money, sumBy } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppChart from '@/components/ui/AppChart.vue'
import AppModal from '@/components/ui/AppModal.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'

const toast = useToast()
const confirm = useConfirm()
const { isManager } = useAuth()
const { t } = useI18n()

const loading = ref(true)
const categories = ref([])
const products = ref([])
const stockRows = ref([])
const reportRows = ref([])

/** 分类 → 聚合指标（商品数量、库存金额），用于表格列 */
const statsMap = computed(() => {
  const map = {}
  for (const c of categories.value) {
    const list = products.value.filter((p) => p.categoryId === c.id)
    const stock = stockRows.value.filter((s) => s.categoryId === c.id)
    map[c.id] = {
      productCount: list.length,
      activeCount: list.filter((p) => p.status === 'active').length,
      stockQty: sumBy(stock, (s) => Number(s.stock || 0)),
      stockAmount: sumBy(stock, (s) => Number(s.stockAmount || 0)),
    }
  }
  return map
})

const categoryRows = computed(() =>
  [...categories.value].sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0)),
)

/** 饼图数据：优先用报表接口，报表缺数据时退化为本地库存金额占比 */
const pieData = computed(() => {
  if (reportRows.value.length) return reportRows.value
  return categoryRows.value.map((c) => ({
    categoryId: c.id,
    name: c.name,
    amount: statsMap.value[c.id]?.stockAmount || 0,
  }))
})

const totalStockAmount = computed(() => sumBy(categoryRows.value, (c) => statsMap.value[c.id]?.stockAmount || 0))
const totalProducts = computed(() => products.value.length)

async function load() {
  loading.value = true
  try {
    const [catRes, prodRes, stockRes, reportRes] = await Promise.all([
      categoryApi.list({ pageSize: 0 }),
      productApi.list({ pageSize: 0 }),
      stockApi.list({ pageSize: 0 }),
      reportApi.category(),
    ])
    const unwrap = (res) => (Array.isArray(res.data) ? res.data : res.data?.list || [])
    categories.value = unwrap(catRes)
    products.value = unwrap(prodRes)
    stockRows.value = unwrap(stockRes)
    reportRows.value = unwrap(reportRes)
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* --------------------------- 新增 / 编辑 --------------------------- */
const modalVisible = ref(false)
const editing = ref(null) // null = 新增
const form = ref(emptyForm())
const errors = ref({})

function emptyForm() {
  return { code: '', name: '', sort: (categories.value.length || 0) + 1, remark: '' }
}

function openCreate() {
  if (!isManager.value) {
    toast.warning(t('product.onlyManagerCatCreate'))
    return
  }
  editing.value = null
  form.value = emptyForm()
  errors.value = {}
  modalVisible.value = true
}

function openEdit(row) {
  if (!isManager.value) {
    toast.warning(t('product.onlyManagerCatEdit'))
    return
  }
  editing.value = row
  form.value = { code: row.code, name: row.name, sort: row.sort, remark: row.remark || '' }
  errors.value = {}
  modalVisible.value = true
}

function validate() {
  const f = form.value
  const e = {}
  if (!String(f.code || '').trim()) e.code = t('product.errCatCodeRequired')
  else if (!/^[A-Za-z0-9_]{2,12}$/.test(String(f.code).trim())) e.code = t('product.errCatCodeFormat')
  if (!String(f.name || '').trim()) e.name = t('product.errCatNameRequired')
  if (f.sort === '' || Number(f.sort) < 0) e.sort = t('product.errCatSort')
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  if (!validate()) return
  const f = form.value
  const payload = {
    code: String(f.code).trim().toUpperCase(),
    name: String(f.name).trim(),
    sort: Number(f.sort),
    remark: f.remark,
  }

  if (editing.value) {
    await categoryApi.update(editing.value.id, payload).catch(() => null)
    // 本地合并：直接替换该行，表格立刻显示新名称/编码
    const idx = categories.value.findIndex((c) => c.id === editing.value.id)
    if (idx > -1) categories.value[idx] = { ...categories.value[idx], ...payload }
    toast.ok(t('product.catSaveOk'))
  } else {
    await categoryApi.create(payload).catch(() => null)
    // 用时间戳造一个本地 id，让新分类立刻出现在列表与饼图里
    categories.value.push({ id: `C${Date.now().toString().slice(-4)}`, ...payload })
    toast.ok(t('product.catCreateOk'))
  }
  modalVisible.value = false
}

/* ------------------------------ 删除 ------------------------------ */
async function removeRow(row) {
  if (!isManager.value) {
    toast.warning(t('product.onlyManagerCatDelete'))
    return
  }
  const count = statsMap.value[row.id]?.productCount || 0
  const okToGo = await confirm({
    title: t('product.catDeleteTitle'),
    content: count
      ? t('product.catDeleteWithProductsNamed', { name: row.name, n: count })
      : t('product.catDeleteSimple', { name: row.name }),
    danger: true,
    confirmText: t('common.delete'),
  })
  if (!okToGo) return

  // 删除只从列表移除，不动该分类下的商品，避免历史订单失去分类信息
  categories.value = categories.value.filter((c) => c.id !== row.id)
  toast.ok(count ? t('product.catDeleteOkWith', { n: count }) : t('product.catDeleteOk'))
}
</script>

<template>
  <PageShell>
    <PageHeader :title="$t('product.catTitle')" :desc="$t('product.catPageDesc')" icon="layers">
      <template #actions>
        <AppButton icon="refresh" :loading="loading" @click="load" />
        <AppButton v-if="isManager" variant="primary" icon="plus" @click="openCreate">{{ $t('product.catNew') }}</AppButton>
      </template>
    </PageHeader>

    <!-- 权限兜底 -->
    <div v-if="!isManager" class="card card-pad mb-3 flex items-start gap-2.5">
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" />
      <div class="text-[12.5px] text-text-2">
        <span class="font-medium text-text">{{ $t('common.noPermission') }}</span>：{{ $t('product.catPermTip') }}
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 items-start">
      <!-- 左：分类明细 -->
      <div class="card min-w-0">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">{{ $t('product.catDetailTitle') }}</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              {{ $t('product.catSummary', { n: categoryRows.length, m: totalProducts, amount: money(totalStockAmount) }) }}
            </div>
          </div>
        </div>

        <div v-if="loading" class="p-3 space-y-2">
          <div v-for="i in 6" :key="i" class="skeleton" style="height: 42px" />
        </div>

        <div v-else-if="!categoryRows.length" class="empty">
          <Icon name="inbox" :size="30" class="text-text-3 opacity-70" />
          <div class="text-sm text-text-2">{{ $t('product.catEmpty') }}</div>
        </div>

        <div v-else class="table-wrap">
          <table class="table-flat">
            <thead>
              <tr>
                <th style="width: 64px">{{ $t('product.catSort') }}</th>
                <th style="width: 110px">{{ $t('product.catCode') }}</th>
                <th>{{ $t('product.catName') }}</th>
                <th style="width: 110px" class="text-right">{{ $t('product.catProductCount') }}</th>
                <th style="width: 116px" class="text-right">{{ $t('product.catStockAmount') }}</th>
                <th style="width: 160px">{{ $t('product.catRemark') }}</th>
                <th style="width: 130px" class="text-right">{{ $t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in categoryRows" :key="row.id">
                <td class="num text-text-2">{{ row.sort }}</td>
                <td>
                  <span class="badge badge-primary font-mono">{{ row.code }}</span>
                </td>
                <td>
                  <div class="text-[13.5px]">{{ row.name }}</div>
                  <div class="text-[11.5px] text-text-3">{{ row.id }}</div>
                </td>
                <td class="text-right">
                  <span class="num">{{ statsMap[row.id]?.productCount || 0 }}</span>
                  <span class="text-[11.5px] text-text-3 ml-1">{{ $t('product.catActiveInline', { n: statsMap[row.id]?.activeCount || 0 }) }}</span>
                </td>
                <td class="text-right"><span class="price">{{ money(statsMap[row.id]?.stockAmount || 0) }}</span></td>
                <td class="text-[12.5px] text-text-3 truncate">{{ row.remark || '—' }}</td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <AppButton size="sm" variant="ghost" @click="openEdit(row)">{{ $t('common.edit') }}</AppButton>
                    <AppButton size="sm" variant="ghost" @click="removeRow(row)">
                      <span :style="{ color: 'var(--c-danger)' }">{{ $t('common.delete') }}</span>
                    </AppButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 右：销售占比 -->
      <div class="space-y-3">
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('product.catShare') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('product.catShareDesc') }}</div>
            </div>
            <Icon name="pie" :size="15" class="text-text-3" />
          </div>
          <div class="p-3">
            <AppChart v-if="!loading && pieData.length" type="pie" :data="pieData" name-key="name" value-key="amount" money height="260px" />
            <div v-else class="skeleton" style="height: 260px" />
          </div>
        </div>

        <div class="card card-pad">
          <div class="text-[13.5px] font-semibold mb-3">{{ $t('product.catOverview') }}</div>
          <div v-if="loading" class="space-y-2">
            <div v-for="i in 4" :key="i" class="skeleton" style="height: 30px" />
          </div>
          <div v-else class="space-y-2">
            <div v-for="row in categoryRows.slice(0, 6)" :key="row.id" class="flex items-center gap-2.5">
              <span class="text-[12.5px] text-text-3 w-[18px]">{{ row.sort }}</span>
              <span class="flex-1 min-w-0 text-[12.5px] truncate">{{ row.name }}</span>
              <span class="text-[12px] num text-text-2">{{ statsMap[row.id]?.productCount || 0 }} {{ $t('common.unitKind') }}</span>
              <span class="text-[12px] price w-[92px] text-right">{{ money(statsMap[row.id]?.stockAmount || 0) }}</span>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="info" :size="15" :style="{ color: 'var(--c-primary)' }" />
            <div class="text-[13.5px] font-semibold">{{ $t('product.catTip') }}</div>
          </div>
          <ul class="text-[12.5px] text-text-2 space-y-1.5 leading-relaxed">
            <li>{{ $t('product.catTip1') }}</li>
            <li>{{ $t('product.catTip2') }}</li>
            <li>{{ $t('product.catTip3') }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <AppModal
      v-model="modalVisible"
      :title="editing ? $t('product.catEdit') : $t('product.catNew')"
      :subtitle="editing ? $t('product.catEditSubtitle', { id: editing.id }) : $t('product.catCreateSubtitle')"
      :width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('product.catCode')" required :error="errors.code">
          <input v-model="form.code" class="input font-mono uppercase" :class="errors.code && 'is-error'" :placeholder="$t('product.catCodePlaceholder')" />
        </FormField>

        <FormField :label="$t('product.catName')" required :error="errors.name">
          <input v-model="form.name" class="input" :class="errors.name && 'is-error'" :placeholder="$t('product.catNamePlaceholder')" />
        </FormField>

        <FormField :label="$t('product.catSortLabel')" required :error="errors.sort" :hint="$t('product.catSortHint')">
          <input v-model="form.sort" type="number" min="0" class="input num" :class="errors.sort && 'is-error'" />
        </FormField>

        <FormField :label="$t('common.remark')">
          <input v-model="form.remark" class="input" :placeholder="$t('common.optional')" />
        </FormField>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="save" @click="submit">{{ $t('common.save') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
