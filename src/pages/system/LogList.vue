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
import { useI18n } from '@/i18n'
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
/** 本地 t 已被表格实例占用，i18n 取词函数改名 tr */
const { t: tr, tl } = useI18n()

/** 模块码 → 字典键；mock 数据里的模块是中文，找不到时回退原文 */
const MODULE_KEY = {
  认证: 'log.moduleAuth',
  订单: 'log.moduleOrder',
  商品: 'log.moduleProduct',
  库存: 'log.moduleStock',
  会员: 'log.moduleMember',
  用户: 'log.moduleUser',
}
/** 模块徽章：不同业务域用不同色相，扫日志时更容易区分 */
const MODULE_CLASS = {
  认证: 'badge-info',
  订单: 'badge-primary',
  商品: 'badge-accent',
  库存: 'badge-warning',
  会员: 'badge-purple',
  用户: 'badge-muted',
}
function moduleText(m) {
  return MODULE_KEY[m] ? tr(MODULE_KEY[m]) : m
}
const MODULE_STYLE = computed(() =>
  Object.fromEntries(Object.keys(MODULE_CLASS).map((m) => [m, { label: moduleText(m), class: MODULE_CLASS[m] }])),
)
const RESULT_STYLE = computed(() => ({
  success: { label: tr('log.success'), class: 'badge-success' },
  fail: { label: tr('log.failed'), class: 'badge-danger' },
}))

const TABS = [
  { key: 'all', labelKey: 'log.tabAll' },
  { key: 'login', labelKey: 'log.tabLogin' },
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
  { key: 'createdAt', label: tr('log.time'), width: 158 },
  { key: 'operatorName', label: tr('log.operator'), width: 150 },
  { key: 'roleName', label: tr('log.role'), width: 82 },
  { key: 'module', label: tr('log.module'), width: 88 },
  { key: 'action', label: tr('log.action'), width: 116 },
  { key: 'detail', label: tr('log.detail'), width: 320 },
  { key: 'ip', label: tr('log.ip'), width: 126 },
  { key: 'userAgent', label: tr('log.agent'), width: 168 },
  { key: 'result', label: tr('log.result'), width: 82 },
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
  { key: 'total', label: tr('log.kpiTotal'), value: thousands(stats.total), unit: tr('log.unitRecord'), icon: 'log', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)', foot: tr('log.kpiTotalFoot') },
  { key: 'today', label: tr('log.kpiToday'), value: thousands(stats.today), unit: tr('log.unitRecord'), icon: 'activity', color: 'var(--c-accent)', bg: 'var(--c-accent-soft)', foot: tr('log.kpiTodayFoot', { date: stats.todayLabel || '—' }) },
  { key: 'fail', label: tr('log.kpiFail'), value: thousands(stats.fail), unit: tr('log.unitRecord'), icon: 'alert', color: 'var(--c-danger)', bg: 'var(--c-danger-soft)', foot: tr('log.kpiFailFoot') },
  { key: 'operators', label: tr('log.kpiOperators'), value: thousands(stats.operators), unit: tr('dashboard.unitPerson'), icon: 'users', color: 'var(--c-purple)', bg: 'var(--c-purple-soft)', foot: tr('log.kpiOperatorsFoot') },
])

/* ------------------------------ 导出日志 ------------------------------ */
async function onExport() {
  const rows = await t.fetchAll()
  if (!rows.length) {
    toast.warning(tr('log.exportEmpty'))
    return
  }
  exportObjects(
    `operation-logs_${dateStr()}`,
    [
      ['createdAt', tr('log.time')],
      ['operatorName', tr('log.operator')],
      ['username', tr('user.username')],
      ['roleName', tr('log.role')],
      ['module', tr('log.module')],
      ['action', tr('log.action')],
      ['detail', tr('log.detail')],
      ['ip', tr('log.ip')],
      ['userAgent', tr('log.agent')],
      ['result', tr('log.result'), (r) => RESULT_STYLE.value[r.result]?.label || r.result],
    ],
    rows,
  )
  toast.ok(tr('log.exportedOk', { n: rows.length }))
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="$t('log.title')"
      :desc="$t('log.desc')"
      icon="log"
    >
      <template #actions>
        <AppButton icon="download" @click="onExport">{{ $t('log.exportLogs') }}</AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        :title="$t('log.noPermissionTitle')"
        :desc="$t('log.noPermissionDesc')"
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
        <div v-for="k in kpis" v-else :key="k.key" class="kpi">
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
              {{ $t(tb.labelKey) }}
            </button>
          </div>
          <div class="text-[11.5px] text-text-3">
            {{ tab === 'login' ? $t('log.tabLoginHint') : $t('log.tabAllHint') }}
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <FormField :label="$t('common.keyword')" class="col-span-2">
            <SearchInput
              v-model="query.keyword"
              :placeholder="$t('log.searchPlaceholder')"
              width="100%"
              @search="t.reload()"
              @enter="t.reload()"
            />
          </FormField>
          <FormField :label="$t('log.module')">
            <select v-model="query.module" class="input w-full">
              <option value="">{{ $t('log.modulePlaceholder') }}</option>
              <option v-for="m in modules" :key="m" :value="m">{{ moduleText(m) }}</option>
            </select>
          </FormField>
          <FormField :label="$t('log.result')">
            <select v-model="query.result" class="input w-full">
              <option value="">{{ $t('log.resultPlaceholder') }}</option>
              <option value="success">{{ $t('log.success') }}</option>
              <option value="fail">{{ $t('log.failed') }}</option>
            </select>
          </FormField>
          <FormField :label="$t('common.startDate')">
            <input v-model="query.startDate" type="date" class="input w-full" />
          </FormField>
          <FormField :label="$t('common.endDate')">
            <input v-model="query.endDate" type="date" class="input w-full" />
          </FormField>
          <div class="flex items-center gap-2 col-span-2 md:col-span-3 xl:col-span-6 xl:justify-end">
            <AppButton variant="primary" icon="search" @click="t.reload()">{{ $t('common.search') }}</AppButton>
            <AppButton icon="refresh" @click="t.reset()">{{ $t('common.reset') }}</AppButton>
          </div>
        </div>
      </div>

      <!-- 日志表格 -->
      <div class="card mt-3">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">{{ tab === 'login' ? $t('log.tabLogin') : $t('log.tabAll') }}</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('log.totalRecords', { n: total }) }}</div>
          </div>
          <div class="flex items-center gap-2 text-[11.5px] text-text-3">
            <Icon name="shieldCheck" :size="14" />
            {{ $t('log.readOnlyTip') }}
          </div>
        </div>

        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          row-key="id"
          :empty-text="$t('log.emptyList')"
          :empty-hint="$t('log.emptyListHint')"
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
