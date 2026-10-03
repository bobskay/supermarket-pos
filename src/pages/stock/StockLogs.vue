<script setup>
/**
 * 库存流水（店长专属）
 * ------------------------------------------------------------------
 * 库存是这个门店唯一「说不清就查不出」的资产，所以每一笔变动都必须留痕：
 * 采购入库 / 损耗 / 破损 / 盘盈，这条时间线就是事后追溯的依据。
 *
 * 顶部三个统计用 pageSize:0 拉全量后本地统计，不受分页影响；
 * 表格里的日期区间与关键字都交给后端 queryList 处理（字段名与 mock 一致）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi } from '@/api'
import { thousands, qty } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useTable } from '@/composables/useTable'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const { isManager } = useAuth()

/** 变动类型 → 中文名 + 徽章配色（与业务约定一一对应） */
const LOG_TYPE_MAP = {
  purchase: { label: '采购入库', class: 'badge-info' },
  loss: { label: '损耗', class: 'badge-warning' },
  damage: { label: '破损', class: 'badge-danger' },
  check: { label: '盘盈', class: 'badge-success' },
}

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'purchase', label: '采购入库' },
  { value: 'loss', label: '损耗' },
  { value: 'damage', label: '破损' },
  { value: 'check', label: '盘盈' },
]

const t = useTable(stockApi.logs, {
  filters: { keyword: '', type: '', startDate: '', endDate: '' },
  pageSize: 20,
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = t


const logs = ref([])
const statsLoading = ref(true)

/** 顶部小型统计：破损也列出来，报损管理同样重要 */
const stats = computed(() => {
  const rows = logs.value
  const count = (type) => rows.filter((r) => r.type === type).length
  const sumType = (type) =>
    Math.round(rows.filter((r) => r.type === type).reduce((s, r) => s + Math.abs(Number(r.changeQty) || 0), 0) * 100) / 100
  return [
    {
      key: 'purchase',
      label: '采购入库笔数',
      value: thousands(count('purchase')),
      unit: '笔',
      sub: `共入库 ${qty(sumType('purchase'))} 件`,
      icon: 'truck',
      color: 'var(--c-info)',
      bg: 'var(--c-info-soft)',
    },
    {
      key: 'loss',
      label: '损耗笔数',
      value: thousands(count('loss')),
      unit: '笔',
      sub: `共减少 ${qty(sumType('loss'))} 件`,
      icon: 'trendDown',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
    },
    {
      key: 'check',
      label: '盘盈笔数',
      value: thousands(count('check')),
      unit: '笔',
      sub: `共增加 ${qty(sumType('check'))} 件`,
      icon: 'fileAdd',
      color: 'var(--c-success)',
      bg: 'var(--c-success-soft)',
    },
    {
      key: 'damage',
      label: '破损笔数',
      value: thousands(count('damage')),
      unit: '笔',
      sub: '含搬运与包装破损',
      icon: 'alert',
      color: 'var(--c-danger)',
      bg: 'var(--c-danger-soft)',
    },
  ]
})

/** 全量流水中最早一条的时间，作为统计范围提示（给甲方看口径） */
const earliest = computed(() => {
  const rows = logs.value
  if (!rows.length) return '—'
  return rows.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), rows[0].createdAt).slice(0, 10)
})

const columns = [
  { key: 'createdAt', label: '时间', width: 152 },
  { key: 'type', label: '类型', width: 96, align: 'center' },
  { key: 'barcode', label: '条码', width: 134 },
  { key: 'productName', label: '商品名称', width: 168 },
  { key: 'changeQty', label: '变动数量', width: 104, align: 'right' },
  { key: 'beforeQty', label: '调整前', width: 82, align: 'right', format: (r) => qty(r.beforeQty) },
  { key: 'afterQty', label: '调整后', width: 82, align: 'right', format: (r) => qty(r.afterQty) },
  { key: 'reason', label: '原因', width: 160 },
  { key: 'relatedNo', label: '关联单号', width: 140 },
  { key: 'operator', label: '操作人', width: 90 },
]

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await stockApi.logs({ pageSize: 0 })
    const d = res.data
    logs.value = Array.isArray(d) ? d : d.list || []
  } finally {
    statsLoading.value = false
  }
}

onMounted(loadStats)

function onQuery() {
  reload()
}

function onReset() {
  reset()
}

/** 快捷区间：盘点通常按周 / 月回看，省得手点两次日历 */
function quickRange(days) {
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  query.startDate = fmt(start)
  query.endDate = fmt(end)
  reload()
}

async function onExport() {
  const rows = await fetchAll()
  const list = rows.length ? rows : list.value
  exportXls(
    `库存流水_${new Date().toISOString().slice(0, 10)}`,
    ['时间', '类型', '条码', '商品名称', '变动数量', '调整前', '调整后', '原因', '关联单号', '操作人'],
    list.map((r) => [
      r.createdAt,
      LOG_TYPE_MAP[r.type]?.label || r.typeName || r.type,
      r.barcode,
      r.productName,
      Number(r.changeQty || 0) > 0 ? `+${qty(r.changeQty)}` : qty(r.changeQty),
      qty(r.beforeQty),
      qty(r.afterQty),
      r.reason,
      r.relatedNo,
      r.operator,
    ]),
    `库存流水明细（共 ${list.length} 条）`,
  )
  toast.ok(`已导出 ${list.length} 条流水记录`)
}
</script>

<template>
  <PageShell>
    <PageHeader title="库存流水" desc="所有库存变动均留痕：采购入库 / 损耗 / 破损 / 盘点" icon="history">
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExport">导出流水</AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">权限不足</div>
        <div class="text-xs text-text-3 max-w-[420px]">
          「库存流水」包含进价与报损信息，仅店长可查看。收银员如需核对库存，请联系店长。
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">返回收银台</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- 顶部小型统计 -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <template v-if="statsLoading">
          <div v-for="i in 4" :key="i" class="kpi">
            <div class="skeleton" style="height: 14px; width: 60%" />
            <div class="skeleton" style="height: 26px; width: 78%" />
            <div class="skeleton" style="height: 12px; width: 45%" />
          </div>
        </template>
        <template v-else>
          <div v-for="s in stats" :key="s.key" class="kpi">
            <div class="flex items-start justify-between">
              <div class="kpi-label">{{ s.label }}</div>
              <span
                class="flex items-center justify-center rounded-md shrink-0"
                :style="{ width: '26px', height: '26px', background: s.bg, color: s.color }"
              >
                <Icon :name="s.icon" :size="14" />
              </span>
            </div>
            <div class="kpi-value" :style="{ color: s.color }">
              {{ s.value }}<span class="text-[13px] text-text-3 ml-1 font-normal">{{ s.unit }}</span>
            </div>
            <div class="kpi-foot">{{ s.sub }}</div>
          </div>
        </template>
      </div>

      <!-- 筛选栏 -->
      <div class="card card-pad mt-3">
        <div class="flex items-end flex-wrap gap-3">
          <FormField label="关键字" class="w-[240px]">
            <SearchInput
              v-model="query.keyword"
              placeholder="商品名 / 条码 / 原因 / 单号"
              width="100%"
              @search="onQuery"
              @enter="onQuery"
            />
          </FormField>
          <FormField label="类型" class="w-[140px]">
            <select v-model="query.type" class="input w-full" @change="onQuery">
              <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
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
          <div class="flex-1" />
          <div class="flex items-center gap-1.5 pb-1.5">
            <span class="text-xs text-text-3 mr-1">快捷区间</span>
            <button class="badge badge-muted" @click="quickRange(7)">近 7 天</button>
            <button class="badge badge-muted" @click="quickRange(30)">近 30 天</button>
            <button class="badge badge-muted" @click="quickRange(90)">近 90 天</button>
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          empty-text="没有符合条件的库存流水"
          empty-hint="库存调整、采购入库后会自动生成流水"
        >
          <template #cell-createdAt="{ row }">
            <div class="leading-tight">
              <div class="text-[12.5px] num">{{ row.createdAt.slice(0, 10) }}</div>
              <div class="text-[11.5px] text-text-3 num">{{ row.createdAt.slice(11, 19) }}</div>
            </div>
          </template>

          <template #cell-type="{ row }">
            <StatusTag :value="row.type" :map="LOG_TYPE_MAP" />
          </template>

          <template #cell-barcode="{ row }">
            <span class="font-mono text-[12.5px] text-text-2">{{ row.barcode }}</span>
          </template>

          <!-- 变动数量：正数绿色带 +，负数红色，一眼分清入库还是出库 -->
          <template #cell-changeQty="{ row }">
            <span
              class="num font-semibold"
              :style="{ color: Number(row.changeQty) >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              {{ Number(row.changeQty) >= 0 ? '+' : '' }}{{ qty(row.changeQty) }}
              <span class="text-[11.5px] font-normal text-text-3">{{ row.unit }}</span>
            </span>
          </template>

          <template #cell-beforeQty="{ row }">
            <span class="num text-text-2">{{ qty(row.beforeQty) }}</span>
          </template>
          <template #cell-afterQty="{ row }">
            <span class="num font-medium">{{ qty(row.afterQty) }}</span>
          </template>

          <template #cell-reason="{ row }">
            <span class="text-text-2">{{ row.reason || '—' }}</span>
          </template>
          <template #cell-relatedNo="{ row }">
            <span v-if="row.relatedNo" class="font-mono text-[12.5px] text-primary">{{ row.relatedNo }}</span>
            <span v-else class="text-text-3">—</span>
          </template>
          <template #cell-operator="{ row }">
            <span class="text-text-2">{{ row.operator || '—' }}</span>
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

      <div class="text-xs text-text-3 mt-2">统计口径：全部流水（最早 {{ earliest }}），不受上方筛选影响</div>
    </template>
  </PageShell>
</template>
