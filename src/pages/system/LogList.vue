<script setup>
/**
 * 操作日志（店长专属）
 * ------------------------------------------------------------------
 * 演示环境没有真实审计中间件，日志全部来自 mock-data/operation-logs.json，
 * 因此筛选统一交给后端（queryList）处理；只有 4 个顶部 KPI 需要全量数据，
 * 用 pageSize: 0 单独拉一次。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { logApi } from '@/api'
import { dateStr, fromNow, thousands } from '@/utils/format'
import { exportObjects } from '@/utils/export'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useTable } from '@/composables/useTable'
import Icon from '@/components/ui/Icon.vue'
import Empty from '@/components/ui/Empty.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const { isManager } = useAuth()

/** 模块徽章：不同业务域用不同色相，扫日志时更容易区分 */
const MODULE_STYLE = {
  认证: { label: '认证', class: 'badge-info' },
  订单: { label: '订单', class: 'badge-primary' },
  商品: { label: '商品', class: 'badge-accent' },
  库存: { label: '库存', class: 'badge-warning' },
  会员: { label: '会员', class: 'badge-purple' },
  用户: { label: '用户', class: 'badge-muted' },
}
const RESULT_STYLE = {
  success: { label: '成功', class: 'badge-success' },
  fail: { label: '失败', class: 'badge-danger' },
}

const TABS = [
  { key: 'all', label: '全部操作日志' },
  { key: 'login', label: '登录登出记录' },
]
const tab = ref('all')

/* ------------------------------- 列表 ------------------------------- */
// tab 在调用时读取，因此切换 Tab 后只要 t.reload() 就会走另一个接口
const t = useTable((params) => (tab.value === 'login' ? logApi.login(params) : logApi.operation(params)), {
  filters: { keyword: '', module: '', result: '', startDate: '', endDate: '' },
  pageSize: 20,
})
const { list, total, loading, query, page, size } = t

const modules = ref([])

const columns = computed(() => [
  { key: 'createdAt', label: '时间', width: 158 },
  { key: 'operatorName', label: '操作人', width: 150 },
  { key: 'roleName', label: '角色', width: 82 },
  { key: 'module', label: '模块', width: 88 },
  { key: 'action', label: '操作动作', width: 116 },
  { key: 'detail', label: '详情', width: 320 },
  { key: 'ip', label: 'IP', width: 126 },
  { key: 'userAgent', label: '终端', width: 168 },
  { key: 'result', label: '结果', width: 82 },
])

function switchTab(key) {
  if (tab.value === key) return
  tab.value = key
  t.reload()
}

onMounted(async () => {
  const res = await logApi.modules()
  modules.value = res.data || []
})

/* ------------------------------- KPI ------------------------------- */
const stats = reactive({ total: 0, today: 0, todayLabel: '', fail: 0, operators: 0 })
const statsLoading = ref(true)

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await logApi.operation({ page: 1, pageSize: 0 })
    const rows = res.data?.list || []
    const days = rows.map((r) => String(r.createdAt || '').slice(0, 10)).filter(Boolean).sort()
    const today = dateStr()
    // 演示日志截止在脚本生成日；当天没有数据时回退到最新一天，否则「今日操作数」恒为 0
    const day = days.includes(today) ? today : days[days.length - 1] || today
    stats.total = rows.length
    stats.todayLabel = day
    stats.today = rows.filter((r) => String(r.createdAt || '').startsWith(day)).length
    stats.fail = rows.filter((r) => r.result === 'fail').length
    stats.operators = new Set(rows.map((r) => r.operatorId || r.username)).size
  } finally {
    statsLoading.value = false
  }
}
onMounted(loadStats)

const kpis = computed(() => [
  { label: '日志总数', value: thousands(stats.total), unit: '条', icon: 'log', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: '全量留痕，不可删除' },
  { label: '今日操作数', value: thousands(stats.today), unit: '条', icon: 'activity', color: 'var(--c-accent)', bg: 'var(--c-accent-soft)', foot: `统计日期 ${stats.todayLabel || '—'}` },
  { label: '失败操作数', value: thousands(stats.fail), unit: '条', icon: 'alert', color: 'var(--c-danger)', bg: 'var(--c-danger-soft)', foot: '登录失败 / 校验不通过' },
  { label: '涉及操作人', value: thousands(stats.operators), unit: '人', icon: 'users', color: 'var(--c-purple)', bg: 'var(--c-purple-soft)', foot: '包含店长与收银员' },
])

/* ------------------------------ 导出日志 ------------------------------ */
async function onExport() {
  const rows = await t.fetchAll()
  if (!rows.length) {
    toast.warning('当前筛选结果为空，没有可导出的日志')
    return
  }
  exportObjects(
    `操作日志_${dateStr()}`,
    [
      ['createdAt', '时间'],
      ['operatorName', '操作人'],
      ['username', '账号'],
      ['roleName', '角色'],
      ['module', '模块'],
      ['action', '操作动作'],
      ['detail', '详情'],
      ['ip', 'IP'],
      ['userAgent', '终端'],
      ['result', '结果', (r) => RESULT_STYLE[r.result]?.label || r.result],
    ],
    rows,
  )
  toast.ok(`已导出 ${rows.length} 条操作日志`)
}
</script>

<template>
  <PageShell>
    <PageHeader
      title="操作日志"
      desc="登录登出 / 商品与库存变动 / 开单退款 全量留痕，可按操作人、模块、结果与日期范围追溯"
      icon="log"
    >
      <template #actions>
        <AppButton icon="download" @click="onExport">导出日志</AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        title="当前角色无权查看操作日志"
        desc="操作日志属于店长专属模块，请使用店长账号（admin）登录后访问。"
        :size="92"
      />
    </div>

    <template v-else>
      <!-- KPI -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <template v-if="statsLoading">
          <div v-for="i in 4" :key="i" class="kpi">
            <div class="skeleton" style="height: 14px; width: 55%" />
            <div class="skeleton" style="height: 26px; width: 70%" />
            <div class="skeleton" style="height: 12px; width: 48%" />
          </div>
        </template>
        <div v-for="k in kpis" v-else :key="k.label" class="kpi">
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
            {{ k.value }}<span class="text-[13px] text-text-3 ml-1 font-normal">{{ k.unit }}</span>
          </div>
          <div class="kpi-foot">{{ k.foot }}</div>
        </div>
      </div>

      <!-- Tab + 筛选 -->
      <div class="card card-pad mt-3">
        <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div class="seg">
            <button
              v-for="tb in TABS"
              :key="tb.key"
              class="seg-item"
              :class="tab === tb.key && 'is-active'"
              @click="switchTab(tb.key)"
            >
              {{ tb.label }}
            </button>
          </div>
          <div class="text-[11.5px] text-text-3">
            {{ tab === 'login' ? '仅展示「认证」模块的登录 / 登出记录' : '按时间倒序展示全部操作留痕' }}
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <FormField label="关键字" class="col-span-2">
            <SearchInput
              v-model="query.keyword"
              placeholder="操作人 / 详情 / 动作"
              width="100%"
              @search="t.reload()"
              @enter="t.reload()"
            />
          </FormField>
          <FormField label="模块">
            <select v-model="query.module" class="input w-full">
              <option value="">全部模块</option>
              <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
            </select>
          </FormField>
          <FormField label="操作结果">
            <select v-model="query.result" class="input w-full">
              <option value="">全部结果</option>
              <option value="success">成功</option>
              <option value="fail">失败</option>
            </select>
          </FormField>
          <FormField label="开始日期">
            <input v-model="query.startDate" type="date" class="input w-full" />
          </FormField>
          <FormField label="结束日期">
            <input v-model="query.endDate" type="date" class="input w-full" />
          </FormField>
          <div class="flex items-center gap-2 col-span-2 md:col-span-3 xl:col-span-6 xl:justify-end">
            <AppButton variant="primary" icon="search" @click="t.reload()">查询</AppButton>
            <AppButton icon="refresh" @click="t.reset()">重置</AppButton>
          </div>
        </div>
      </div>

      <!-- 日志表格 -->
      <div class="card mt-3">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">{{ tab === 'login' ? '登录登出记录' : '全部操作日志' }}</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">共 {{ total }} 条记录 · 失败操作以红色徽章标出</div>
          </div>
          <div class="flex items-center gap-2 text-[11.5px] text-text-3">
            <Icon name="shieldCheck" :size="14" />
            日志仅可查询与导出，不可编辑或删除
          </div>
        </div>

        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          row-key="id"
          empty-text="没有匹配的操作日志"
          empty-hint="试试放宽日期范围，或清空关键字后重新查询"
        >
          <template #cell-createdAt="{ row }">
            <span :title="fromNow(row.createdAt)">{{ row.createdAt }}</span>
          </template>

          <template #cell-operatorName="{ row }">
            <span class="flex flex-col leading-tight min-w-0">
              <span class="truncate">{{ row.operatorName }}</span>
              <span class="font-mono text-[11.5px] text-text-3 truncate">{{ row.username }}</span>
            </span>
          </template>

          <template #cell-roleName="{ row }">
            <span class="text-[12.5px] text-text-2">{{ row.roleName }}</span>
          </template>

          <template #cell-module="{ row }">
            <StatusTag :value="row.module" :map="MODULE_STYLE" />
          </template>

          <template #cell-action="{ row }">
            <span class="text-[13px]">{{ row.action }}</span>
          </template>

          <template #cell-detail="{ row }">
            <!-- 详情可能很长：截断显示 + title 悬浮查看全文，避免表格被撑变形 -->
            <span class="block truncate text-text-2" style="max-width: 320px" :title="row.detail">
              {{ row.detail }}
            </span>
          </template>

          <template #cell-ip="{ row }">
            <span class="font-mono text-[12.5px] text-text-2">{{ row.ip }}</span>
          </template>

          <template #cell-userAgent="{ row }">
            <span class="block truncate text-[12.5px] text-text-3" style="max-width: 166px" :title="row.userAgent">
              {{ row.userAgent }}
            </span>
          </template>

          <template #cell-result="{ row }">
            <StatusTag :value="row.result" :map="RESULT_STYLE" />
          </template>
        </DataTable>

        <div class="px-4 py-3 border-t border-line">
          <Pagination v-model:page="page" v-model:page-size="size" :total="total" @change="t.onPageChange" />
        </div>
      </div>
    </template>
  </PageShell>
</template>
