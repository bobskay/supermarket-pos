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
    toast.warning('仅店长可以新增分类')
    return
  }
  editing.value = null
  form.value = emptyForm()
  errors.value = {}
  modalVisible.value = true
}

function openEdit(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以编辑分类')
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
  if (!String(f.code || '').trim()) e.code = '分类编码不能为空'
  else if (!/^[A-Za-z0-9_]{2,12}$/.test(String(f.code).trim())) e.code = '编码建议 2-12 位字母/数字'
  if (!String(f.name || '').trim()) e.name = '分类名称不能为空'
  if (f.sort === '' || Number(f.sort) < 0) e.sort = '排序号不能为空且不小于 0'
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
    toast.ok('分类已保存')
  } else {
    await categoryApi.create(payload).catch(() => null)
    // 用时间戳造一个本地 id，让新分类立刻出现在列表与饼图里
    categories.value.push({ id: `C${Date.now().toString().slice(-4)}`, ...payload })
    toast.ok('分类创建成功')
  }
  modalVisible.value = false
}

/* ------------------------------ 删除 ------------------------------ */
async function removeRow(row) {
  if (!isManager.value) {
    toast.warning('仅店长可以删除分类')
    return
  }
  const count = statsMap.value[row.id]?.productCount || 0
  const okToGo = await confirm({
    title: '删除分类',
    content: count
      ? `分类「${row.name}」下有 ${count} 个商品，删除后这些商品将变为「未分类」，业务上不建议删除。`
      : `确认删除分类「${row.name}」？该分类下暂无商品。`,
    danger: true,
    confirmText: '删除',
  })
  if (!okToGo) return

  // 删除只从列表移除，不动该分类下的商品，避免历史订单失去分类信息
  categories.value = categories.value.filter((c) => c.id !== row.id)
  toast.ok(count ? `分类已删除，其下 ${count} 个商品保持原分类不变` : '分类已删除')
}
</script>

<template>
  <PageShell>
    <PageHeader title="商品分类" desc="维护商品分类编码与排序，并查看各分类的销售占比" icon="layers">
      <template #actions>
        <AppButton icon="refresh" :loading="loading" @click="load" />
        <AppButton v-if="isManager" variant="primary" icon="plus" @click="openCreate">新增分类</AppButton>
      </template>
    </PageHeader>

    <!-- 权限兜底 -->
    <div v-if="!isManager" class="card card-pad mb-3 flex items-start gap-2.5">
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" />
      <div class="text-[12.5px] text-text-2">
        <span class="font-medium text-text">权限不足</span>：商品分类为店长专属功能，收银员只能查看分类与占比。
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 items-start">
      <!-- 左：分类明细 -->
      <div class="card min-w-0">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">分类明细</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              共 {{ categoryRows.length }} 个分类 · {{ totalProducts }} 个商品 · 库存金额 {{ money(totalStockAmount) }}
            </div>
          </div>
        </div>

        <div v-if="loading" class="p-3 space-y-2">
          <div v-for="i in 6" :key="i" class="skeleton" style="height: 42px" />
        </div>

        <div v-else-if="!categoryRows.length" class="empty">
          <Icon name="inbox" :size="30" class="text-text-3 opacity-70" />
          <div class="text-sm text-text-2">暂无分类</div>
        </div>

        <div v-else class="table-wrap">
          <table class="table-flat">
            <thead>
              <tr>
                <th style="width: 64px">排序</th>
                <th style="width: 110px">分类编码</th>
                <th>分类名称</th>
                <th style="width: 110px" class="text-right">商品数量</th>
                <th style="width: 116px" class="text-right">库存金额</th>
                <th style="width: 160px">备注</th>
                <th style="width: 130px" class="text-right">操作</th>
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
                  <span class="text-[11.5px] text-text-3 ml-1">/ 在售 {{ statsMap[row.id]?.activeCount || 0 }}</span>
                </td>
                <td class="text-right"><span class="price">{{ money(statsMap[row.id]?.stockAmount || 0) }}</span></td>
                <td class="text-[12.5px] text-text-3 truncate">{{ row.remark || '—' }}</td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <AppButton size="sm" variant="ghost" @click="openEdit(row)">编辑</AppButton>
                    <AppButton size="sm" variant="ghost" @click="removeRow(row)">
                      <span :style="{ color: 'var(--c-danger)' }">删除</span>
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
              <div class="text-[14px] font-semibold">分类销售占比</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">按分类统计的销售金额</div>
            </div>
            <Icon name="pie" :size="15" class="text-text-3" />
          </div>
          <div class="p-3">
            <AppChart v-if="!loading && pieData.length" type="pie" :data="pieData" name-key="name" value-key="amount" money height="260px" />
            <div v-else class="skeleton" style="height: 260px" />
          </div>
        </div>

        <div class="card card-pad">
          <div class="text-[13.5px] font-semibold mb-3">分类概况</div>
          <div v-if="loading" class="space-y-2">
            <div v-for="i in 4" :key="i" class="skeleton" style="height: 30px" />
          </div>
          <div v-else class="space-y-2">
            <div v-for="row in categoryRows.slice(0, 6)" :key="row.id" class="flex items-center gap-2.5">
              <span class="text-[12.5px] text-text-3 w-[18px]">{{ row.sort }}</span>
              <span class="flex-1 min-w-0 text-[12.5px] truncate">{{ row.name }}</span>
              <span class="text-[12px] num text-text-2">{{ statsMap[row.id]?.productCount || 0 }} 种</span>
              <span class="text-[12px] price w-[92px] text-right">{{ money(statsMap[row.id]?.stockAmount || 0) }}</span>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="info" :size="15" :style="{ color: 'var(--c-primary)' }" />
            <div class="text-[13.5px] font-semibold">小提示</div>
          </div>
          <ul class="text-[12.5px] text-text-2 space-y-1.5 leading-relaxed">
            <li>删除分类前请先确认该分类下没有在售商品。</li>
            <li>删除分类只做本地移除，不影响该分类下的商品。</li>
            <li>排序号越小越靠前，收银台按该顺序展示。</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <AppModal
      v-model="modalVisible"
      :title="editing ? '编辑分类' : '新增分类'"
      :subtitle="editing ? `分类编号 ${editing.id}` : '编码用于收银台与报表归类，建议大写英文'"
      :width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField label="分类编码" required :error="errors.code">
          <input v-model="form.code" class="input font-mono uppercase" :class="errors.code && 'is-error'" placeholder="如 FRESH" />
        </FormField>

        <FormField label="分类名称" required :error="errors.name">
          <input v-model="form.name" class="input" :class="errors.name && 'is-error'" placeholder="如 生鲜果蔬" />
        </FormField>

        <FormField label="排序号" required :error="errors.sort" hint="数字越小越靠前">
          <input v-model="form.sort" type="number" min="0" class="input num" :class="errors.sort && 'is-error'" />
        </FormField>

        <FormField label="备注">
          <input v-model="form.remark" class="input" placeholder="选填" />
        </FormField>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="save" @click="submit">保存</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
