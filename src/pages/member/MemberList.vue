<script setup>
/**
 * 会员管理（列表页）
 * ------------------------------------------------------------------
 * 权限：收银员可查询 / 新建 / 编辑 / 调整积分，注销仅店长。
 * 收银员看到的「注销」按钮保持可见但禁用，并用 title 说明原因——
 * 直接隐藏按钮会让收银员以为系统坏了，禁用 + tooltip 更符合门店培训习惯。
 *
 * 演示环境后端不落库，所以写操作成功后统一用 table.patchLocal / table.unshiftLocal
 * 把结果合并回本地列表，保证「点完立刻能看到变化」。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { memberApi } from '@/api'
import {
  money, thousands, dateOnly, fromNow, dateStr, sumBy, MEMBER_LEVEL_STYLE,
} from '@/utils/format'
import { exportObjects } from '@/utils/export'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useTable } from '@/composables/useTable'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isManager } = useAuth()
const { t, tl } = useI18n()

/* --------------------- 等级码 / 状态码 → 字典文案 --------------------- */
const LEVEL_KEY = {
  normal: 'member.levelNormal',
  silver: 'member.levelSilver',
  gold: 'member.levelGold',
  diamond: 'member.levelDiamond',
}
/** 中文等级名 → 字典键：mock 里只有 levelName 时按名称反查 */
const LEVEL_NAME_KEY = {
  '普通会员': 'member.levelNormal',
  '银卡会员': 'member.levelSilver',
  '金卡会员': 'member.levelGold',
  '钻石会员': 'member.levelDiamond',
}

const LEVELS = computed(() => [
  { value: 'normal', label: t('member.levelNormal') },
  { value: 'silver', label: t('member.levelSilver') },
  { value: 'gold', label: t('member.levelGold') },
  { value: 'diamond', label: t('member.levelDiamond') },
])

const MEMBER_STATUS_CLASS = {
  active: 'badge-success',
  disabled: 'badge-muted',
}
/** 状态徽章：配色沿用原映射，文案按当前语言取 */
const statusMap = computed(() => ({
  active: { label: t('member.normal'), class: MEMBER_STATUS_CLASS.active },
  disabled: { label: t('member.cancelled'), class: MEMBER_STATUS_CLASS.disabled },
}))

function statusText(row) {
  return statusMap.value[row?.status]?.label || tl(row, 'statusName', row?.status || '')
}

/** 等级文案：优先按等级码取字典，缺码时按中文名反查，最后回退原值 */
function levelText(row) {
  if (row?.level && LEVEL_KEY[row.level]) return t(LEVEL_KEY[row.level])
  const key = LEVEL_NAME_KEY[row?.levelName]
  return key ? t(key) : tl(row, 'levelName')
}

function levelNameOf(code) {
  return LEVEL_KEY[code] ? t(LEVEL_KEY[code]) : code
}

function pointsText(n) {
  return `${thousands(Number(n || 0))} ${t('member.pointsUnit')}`
}

const PHONE_RE = /^1\d{10}$/

/* ------------------------------- 列表 ------------------------------- */
const table = useTable(memberApi.list, {
  filters: { keyword: '', level: '', status: '' },
  pageSize: 20,
})
// 解构出 ref 后模板里可直接用（对象里的 ref 在模板中不会自动解包）
const { list, total, loading, query, page, size } = table

const columns = computed(() => [
  { key: 'memberNo', label: t('member.memberNo'), width: 118 },
  { key: 'name', label: t('member.name'), width: 130 },
  { key: 'phone', label: t('member.phone'), width: 126 },
  { key: 'levelName', label: t('member.level'), width: 96 },
  { key: 'points', label: t('member.points'), width: 84, align: 'right', format: (r) => thousands(r.points) },
  { key: 'balance', label: t('member.balance'), width: 100, align: 'right', format: (r) => money(r.balance) },
  { key: 'totalConsume', label: t('member.totalConsume'), width: 106, align: 'right', format: (r) => money(r.totalConsume) },
  { key: 'orderCount', label: t('member.orderCount'), width: 78, align: 'right' },
  { key: 'lastConsumeAt', label: t('member.lastConsumeAt'), width: 140, format: (r) => (r.lastConsumeAt ? dateOnly(r.lastConsumeAt) : '—') },
  { key: 'createdAt', label: t('member.createdAt'), width: 108, format: (r) => dateOnly(r.createdAt) },
  { key: 'status', label: t('member.status'), width: 88 },
  { key: 'actions', label: t('common.actions'), width: 246, align: 'right' },
])

/* ------------------------------- KPI ------------------------------- */
const stats = reactive({ total: 0, disabled: 0, monthNew: 0, monthLabel: '', balance: 0, consume: 0 })
const statsLoading = ref(true)

async function loadStats() {
  statsLoading.value = true
  try {
    // pageSize: 0 → mock 后端返回全量，用于顶部统计与导出
    const res = await memberApi.list({ page: 1, pageSize: 0 })
    const rows = res.data?.list || []
    const months = rows.map((r) => String(r.createdAt || '').slice(0, 7)).filter(Boolean).sort()
    const thisMonth = dateStr().slice(0, 7)
    // 演示数据是脚本生成的固定历史区间，本月通常没有新增；此时回退到数据里最新的月份，
    // 否则「本月新增」永远是 0，演示时看不出统计效果（KPI 脚注会写明具体月份）
    const month = months.includes(thisMonth) ? thisMonth : months[months.length - 1] || thisMonth
    stats.total = rows.length
    stats.disabled = rows.filter((r) => r.status === 'disabled').length
    stats.monthLabel = month
    stats.monthNew = rows.filter((r) => String(r.createdAt || '').startsWith(month)).length
    stats.balance = sumBy(rows, (r) => r.balance)
    stats.consume = sumBy(rows, (r) => r.totalConsume)
  } finally {
    statsLoading.value = false
  }
}
onMounted(loadStats)

const kpis = computed(() => [
  {
    label: t('member.totalMembers'),
    value: thousands(stats.total),
    unit: t('member.unitPerson'),
    icon: 'members',
    color: 'var(--c-primary)',
    bg: 'var(--c-primary-soft)',
    foot: t('member.totalFoot', { n: stats.disabled }),
  },
  {
    label: t('member.newThisMonth'),
    value: thousands(stats.monthNew),
    unit: t('member.unitPerson'),
    icon: 'trendUp',
    color: 'var(--c-accent)',
    bg: 'var(--c-accent-soft)',
    foot: t('member.monthFoot', { month: stats.monthLabel || '—' }),
  },
  {
    label: t('member.balanceTotal'),
    value: money(stats.balance),
    icon: 'wallet',
    color: 'var(--c-purple)',
    bg: 'var(--c-purple-soft)',
    foot: t('member.balanceFoot'),
  },
  {
    label: t('member.consumeTotal'),
    value: money(stats.consume),
    icon: 'money',
    color: 'var(--c-warning)',
    bg: 'var(--c-warning-soft)',
    foot: t('member.consumeFoot'),
  },
])

/* ------------------------------ 筛选 / 导出 ------------------------------ */
function onReset() {
  table.reset()
}

async function onExport() {
  const rows = await table.fetchAll()
  if (!rows.length) {
    toast.warning(t('member.exportEmpty'))
    return
  }
  exportObjects(
    `${t('member.exportName')}_${dateStr()}`,
    [
      ['memberNo', t('member.memberNo')],
      ['name', t('member.name')],
      ['phone', t('member.phone')],
      ['levelName', t('member.levelLabel')],
      ['points', t('member.points')],
      ['balance', t('member.balance')],
      ['totalConsume', t('member.totalConsume')],
      ['orderCount', t('member.orderCount')],
      ['lastConsumeAt', t('member.lastConsumeAt')],
      ['createdAt', t('member.createdAt')],
      ['status', t('member.status'), (r) => statusText(r)],
      ['remark', t('member.remark')],
    ],
    rows,
  )
  toast.ok(t('member.exportedOk', { n: rows.length }))
}

/* ------------------------------- 新建 ------------------------------- */
const createVisible = ref(false)
const createForm = reactive({ memberNo: '', name: '', phone: '', level: 'normal', gender: 'male' })
const createErr = reactive({ name: '', phone: '' })

/** 会员号：VIP + 5 位数字，弹窗里先展示出来，让收银员知道顾客的会员号 */
function genMemberNo() {
  return `VIP${Math.floor(10000 + Math.random() * 89999)}`
}

function openCreate() {
  Object.assign(createForm, {
    memberNo: genMemberNo(),
    name: '',
    phone: '',
    level: 'normal',
    gender: 'male',
  })
  createErr.name = ''
  createErr.phone = ''
  createVisible.value = true
}

async function submitCreate(close) {
  createErr.name = createForm.name.trim() ? '' : t('member.nameRequired')
  createErr.phone = PHONE_RE.test(createForm.phone.trim()) ? '' : t('member.phoneInvalid')
  if (createErr.name || createErr.phone) return

  const payload = {
    memberNo: createForm.memberNo,
    name: createForm.name.trim(),
    phone: createForm.phone.trim(),
    gender: createForm.gender,
    level: createForm.level,
    levelName: levelNameOf(createForm.level),
  }
  const res = await memberApi.create(payload)
  toast.ok(res.message || t('member.createOk'))
  // 本地插入草稿行：演示环境不落库，靠这一步让界面立刻出现新会员
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const createdAt = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  table.unshiftLocal({
    id: `M${Date.now()}`,
    ...payload,
    points: 0,
    balance: 0,
    totalConsume: 0,
    orderCount: 0,
    lastConsumeAt: '',
    status: 'active',
    remark: '',
    createdAt,
  })
  stats.total += 1
  if (createdAt.startsWith(stats.monthLabel)) stats.monthNew += 1
  close()
}

/* ------------------------------- 编辑 ------------------------------- */
const editVisible = ref(false)
const editRow = ref(null)
const editForm = reactive({ name: '', phone: '', level: 'normal', remark: '' })
const editErr = reactive({ name: '', phone: '' })

function openEdit(row) {
  editRow.value = row
  Object.assign(editForm, {
    name: row.name,
    phone: row.phone,
    level: row.level,
    remark: row.remark || '',
  })
  editErr.name = ''
  editErr.phone = ''
  editVisible.value = true
}

async function submitEdit(close) {
  editErr.name = editForm.name.trim() ? '' : t('member.nameRequired')
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : t('member.phoneInvalid')
  if (editErr.name || editErr.phone) return

  const id = editRow.value.id
  const patch = {
    name: editForm.name.trim(),
    phone: editForm.phone.trim(),
    level: editForm.level,
    levelName: levelNameOf(editForm.level),
    remark: editForm.remark.trim(),
  }
  const res = await memberApi.update(id, patch)
  toast.ok(res.message || t('member.updateOk'))
  table.patchLocal(id, patch)
  close()
}

/* ----------------------------- 调整积分 ----------------------------- */
const pointsVisible = ref(false)
const pointsRow = ref(null)
const pointsForm = reactive({ change: 0, reason: '' })
const pointsErr = reactive({ change: '', reason: '' })

function openPoints(row) {
  pointsRow.value = row
  pointsForm.change = 0
  pointsForm.reason = ''
  pointsErr.change = ''
  pointsErr.reason = ''
  pointsVisible.value = true
}

function stepPoints(n) {
  pointsForm.change = Number(pointsForm.change || 0) + n
}

async function submitPoints(close) {
  const change = Number(pointsForm.change || 0)
  pointsErr.change = change === 0 ? t('member.adjustZero') : ''
  pointsErr.reason = pointsForm.reason.trim() ? '' : t('member.adjustReasonRequired')
  if (pointsErr.change || pointsErr.reason) return

  const id = pointsRow.value.id
  const res = await memberApi.adjustPoints(id, { change, reason: pointsForm.reason.trim() })
  toast.ok(
    res.message ||
      (change > 0
        ? t('member.pointsAdded', { n: Math.abs(change) })
        : t('member.pointsDeducted', { n: Math.abs(change) })),
  )
  table.patchLocal(id, { points: Number(pointsRow.value.points || 0) + change })
  close()
}

/* ------------------------------- 注销 ------------------------------- */
async function deactivate(row) {
  const ok = await confirm({
    title: t('member.cancelTitle'),
    content: t('member.cancelConfirm', { name: row.name }),
    confirmText: t('member.cancelConfirmBtn'),
    danger: true,
  })
  if (!ok) return
  const res = await memberApi.remove(row.id)
  toast.ok(res.message || t('member.cancelOk'))
  // 不真删：注销只是状态变更，历史订单还要能查到该会员
  table.patchLocal(row.id, { status: 'disabled' })
  stats.disabled += 1
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="$t('member.title')"
      :desc="$t('member.desc')"
      icon="members"
    >
      <template #actions>
        <AppButton icon="download" @click="onExport">{{ $t('member.exportMembers') }}</AppButton>
        <AppButton icon="fileAdd" @click="router.push({ name: 'member-create' })">{{ $t('member.fullForm') }}</AppButton>
        <AppButton variant="primary" icon="plus" @click="openCreate">{{ $t('member.newMember') }}</AppButton>
      </template>
    </PageHeader>

    <!-- KPI -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <template v-if="statsLoading">
        <div v-for="i in 4" :key="i" class="kpi">
          <div class="skeleton" style="height: 14px; width: 55%" />
          <div class="skeleton" style="height: 26px; width: 72%" />
          <div class="skeleton" style="height: 12px; width: 46%" />
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
          {{ k.value }}<span v-if="k.unit" class="text-[13px] text-text-3 ml-1 font-normal">{{ k.unit }}</span>
        </div>
        <div class="kpi-foot">{{ k.foot }}</div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="card card-pad mt-3">
      <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
        <FormField :label="$t('common.keyword')" class="col-span-2">
          <SearchInput
            v-model="query.keyword"
            :placeholder="$t('member.searchPlaceholder')"
            width="100%"
            @search="table.reload()"
            @enter="table.reload()"
          />
        </FormField>
        <FormField :label="$t('member.levelLabel')">
          <select v-model="query.level" class="input w-full">
            <option value="">{{ $t('member.levelPlaceholder') }}</option>
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
        <FormField :label="$t('member.statusLabel')">
          <select v-model="query.status" class="input w-full">
            <option value="">{{ $t('member.statusPlaceholder') }}</option>
            <option value="active">{{ $t('member.normal') }}</option>
            <option value="disabled">{{ $t('member.cancelled') }}</option>
          </select>
        </FormField>
        <div class="flex items-center gap-2">
          <AppButton variant="primary" icon="search" @click="table.reload()">{{ $t('common.search') }}</AppButton>
          <AppButton icon="refresh" @click="onReset">{{ $t('common.reset') }}</AppButton>
        </div>
      </div>
    </div>

    <!-- 表格 -->
    <div class="card mt-3">
      <div class="panel-head">
        <div>
          <div class="text-[14px] font-semibold">{{ $t('member.listTitle') }}</div>
          <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('member.listFoot', { n: total }) }}</div>
        </div>
        <div class="text-[11.5px] text-text-3">
          {{ isManager ? $t('member.managerScope') : $t('member.cashierScope') }}
        </div>
      </div>

      <DataTable
        :columns="columns"
        :list="list"
        :loading="loading"
        row-key="id"
        :empty-text="$t('member.emptyText')"
        :empty-hint="$t('member.emptyHint')"
      >
        <template #cell-memberNo="{ row }">
          <button
            class="font-mono text-[12.5px] hover:text-primary"
            :title="$t('member.viewDetail')"
            @click="router.push({ name: 'member-detail', params: { id: row.id } })"
          >
            {{ row.memberNo || row.id }}
          </button>
        </template>

        <template #cell-name="{ row }">
          <span class="flex items-center gap-2 min-w-0">
            <span class="truncate">{{ row.name }}</span>
            <span class="badge" :class="MEMBER_LEVEL_STYLE[row.level]">{{ levelText(row) }}</span>
          </span>
        </template>

        <template #cell-points="{ row }">
          <span class="num">{{ thousands(row.points) }}</span>
        </template>

        <template #cell-balance="{ row }">
          <span class="price">{{ money(row.balance) }}</span>
        </template>

        <template #cell-totalConsume="{ row }">
          <span class="price">{{ money(row.totalConsume) }}</span>
        </template>

        <template #cell-lastConsumeAt="{ row }">
          <span v-if="row.lastConsumeAt" :title="fromNow(row.lastConsumeAt)">
            {{ dateOnly(row.lastConsumeAt) }}
          </span>
          <span v-else class="text-text-3">{{ $t('member.neverConsumed') }}</span>
        </template>

        <template #cell-status="{ row }">
          <StatusTag :value="row.status" :map="statusMap" />
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <AppButton size="sm" variant="ghost" icon="eye" @click.stop="router.push({ name: 'member-detail', params: { id: row.id } })">
              {{ $t('common.detail') }}
            </AppButton>
            <AppButton size="sm" variant="ghost" icon="edit" @click.stop="openEdit(row)">{{ $t('common.edit') }}</AppButton>
            <AppButton size="sm" variant="ghost" icon="star" @click.stop="openPoints(row)">{{ $t('member.adjustPoints') }}</AppButton>
            <AppButton
              size="sm"
              variant="danger-soft"
              icon="close"
              :disabled="!isManager"
              :title="isManager ? $t('member.cancelTip') : $t('member.cancelOnlyManager')"
              @click.stop="deactivate(row)"
            >
              {{ $t('member.cancelBtn') }}
            </AppButton>
          </div>
        </template>
      </DataTable>

      <div class="px-4 py-3 border-t border-line">
        <Pagination v-model:page="page" v-model:page-size="size" :total="total" @change="table.onPageChange" />
      </div>
    </div>

    <!-- 新建会员 -->
    <AppModal v-model="createVisible" :title="$t('member.newMember')" :subtitle="$t('member.createSubtitle')" width="560">
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('member.memberNo')" :hint="$t('member.memberNoAuto')">
          <input class="input w-full font-mono" :value="createForm.memberNo" disabled />
        </FormField>
        <FormField :label="$t('member.name')" required :error="createErr.name">
          <input v-model="createForm.name" class="input w-full" :placeholder="$t('member.namePlaceholder')" />
        </FormField>
        <FormField :label="$t('member.phone')" required :error="createErr.phone" :hint="$t('member.phoneHint')">
          <input v-model="createForm.phone" class="input w-full" maxlength="11" :placeholder="$t('member.phonePlaceholder')" />
        </FormField>
        <FormField :label="$t('member.gender')">
          <select v-model="createForm.gender" class="input w-full">
            <option value="male">{{ $t('member.male') }}</option>
            <option value="female">{{ $t('member.female') }}</option>
          </select>
        </FormField>
        <FormField :label="$t('member.levelLabel')" span="2">
          <select v-model="createForm.level" class="input w-full">
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="check" @click="submitCreate(close)">{{ $t('member.saveAndCreate') }}</AppButton>
      </template>
    </AppModal>

    <!-- 编辑会员 -->
    <AppModal
      v-model="editVisible"
      :title="$t('member.editMember')"
      :subtitle="editRow ? `${editRow.memberNo} · ${editRow.name}` : ''"
      width="560"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('member.name')" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" :placeholder="$t('member.namePlaceholder')" />
        </FormField>
        <FormField :label="$t('member.phone')" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" :placeholder="$t('member.phonePlaceholder')" />
        </FormField>
        <FormField :label="$t('member.levelLabel')" span="2" :hint="$t('member.levelHint')">
          <select v-model="editForm.level" class="input w-full">
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
        <FormField :label="$t('common.remark')" span="2">
          <textarea v-model="editForm.remark" class="w-full" rows="2" :placeholder="$t('member.remarkPlaceholder')" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="save" @click="submitEdit(close)">{{ $t('common.save') }}</AppButton>
      </template>
    </AppModal>

    <!-- 调整积分 -->
    <AppModal
      v-model="pointsVisible"
      :title="$t('member.adjustPoints')"
      :subtitle="pointsRow ? `${pointsRow.name} · ${pointsRow.memberNo}` : ''"
      width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('member.currentPoints')">
          <input class="input w-full num" :value="pointsText(pointsRow?.points || 0)" disabled />
        </FormField>
        <FormField :label="$t('member.adjustAfter')">
          <input
            class="input w-full num"
            :value="pointsText(Number(pointsRow?.points || 0) + Number(pointsForm.change || 0))"
            disabled
          />
        </FormField>
        <FormField :label="$t('member.adjustQty')" required :error="pointsErr.change" :hint="$t('member.adjustQtyHint')" span="2">
          <div class="flex items-center gap-2">
            <AppButton icon="minus" @click="stepPoints(-10)">-10</AppButton>
            <input v-model.number="pointsForm.change" type="number" class="input w-full num text-center" />
            <AppButton icon="plus" @click="stepPoints(10)">+10</AppButton>
          </div>
        </FormField>
        <FormField :label="$t('member.adjustReason')" required :error="pointsErr.reason" span="2">
          <input v-model="pointsForm.reason" class="input w-full" :placeholder="$t('member.reasonPlaceholder')" />
        </FormField>
      </div>
      <div class="mt-3 text-[11.5px] text-text-3 leading-relaxed">
        {{ $t('member.adjustNote') }}
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="check" @click="submitPoints(close)">{{ $t('member.adjustConfirm') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
