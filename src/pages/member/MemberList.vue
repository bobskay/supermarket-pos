<script setup>
/**
 * 会员管理（列表页）
 * ------------------------------------------------------------------
 * 权限：收银员可查询 / 新建 / 编辑 / 调整积分，注销仅店长。
 * 收银员看到的「注销」按钮保持可见但禁用，并用 title 说明原因——
 * 直接隐藏按钮会让收银员以为系统坏了，禁用 + tooltip 更符合门店培训习惯。
 *
 * 演示环境后端不落库，所以写操作成功后统一用 t.patchLocal / t.unshiftLocal
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

/** 会员等级与状态：下拉选项与徽章映射集中定义，方便后续加卡种 */
const LEVELS = [
  { value: 'normal', label: '普通会员' },
  { value: 'silver', label: '银卡会员' },
  { value: 'gold', label: '金卡会员' },
  { value: 'diamond', label: '钻石会员' },
]
const LEVEL_NAME = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]))
const MEMBER_STATUS_STYLE = {
  active: { label: '正常', class: 'badge-success' },
  disabled: { label: '已注销', class: 'badge-muted' },
}
const PHONE_RE = /^1\d{10}$/

/* ------------------------------- 列表 ------------------------------- */
const t = useTable(memberApi.list, {
  filters: { keyword: '', level: '', status: '' },
  pageSize: 20,
})
// 解构出 ref 后模板里可直接用（对象里的 ref 在模板中不会自动解包）
const { list, total, loading, query, page, size } = t

const columns = [
  { key: 'memberNo', label: '会员号', width: 118 },
  { key: 'name', label: '姓名', width: 130 },
  { key: 'phone', label: '手机号', width: 126 },
  { key: 'levelName', label: '等级', width: 96 },
  { key: 'points', label: '积分', width: 84, align: 'right', format: (r) => thousands(r.points) },
  { key: 'balance', label: '储值余额', width: 100, align: 'right', format: (r) => money(r.balance) },
  { key: 'totalConsume', label: '累计消费', width: 106, align: 'right', format: (r) => money(r.totalConsume) },
  { key: 'orderCount', label: '订单数', width: 78, align: 'right' },
  { key: 'lastConsumeAt', label: '最后消费时间', width: 140, format: (r) => (r.lastConsumeAt ? dateOnly(r.lastConsumeAt) : '—') },
  { key: 'createdAt', label: '注册时间', width: 108, format: (r) => dateOnly(r.createdAt) },
  { key: 'status', label: '状态', width: 88 },
  { key: 'actions', label: '操作', width: 246, align: 'right' },
]

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
    label: '会员总数',
    value: thousands(stats.total),
    unit: '位',
    icon: 'members',
    color: 'var(--c-primary)',
    bg: 'var(--c-primary-soft)',
    foot: `其中已注销 ${stats.disabled} 位`,
  },
  {
    label: '本月新增',
    value: thousands(stats.monthNew),
    unit: '位',
    icon: 'trendUp',
    color: 'var(--c-accent)',
    bg: 'var(--c-accent-soft)',
    foot: `统计月份 ${stats.monthLabel || '—'}`,
  },
  {
    label: '会员余额合计',
    value: money(stats.balance),
    icon: 'wallet',
    color: 'var(--c-purple)',
    bg: 'var(--c-purple-soft)',
    foot: '尚未消费的储值卡余额',
  },
  {
    label: '累计消费金额',
    value: money(stats.consume),
    icon: 'money',
    color: 'var(--c-warning)',
    bg: 'var(--c-warning-soft)',
    foot: '全部会员历史消费合计',
  },
])

/* ------------------------------ 筛选 / 导出 ------------------------------ */
function onReset() {
  t.reset()
}

async function onExport() {
  const rows = await t.fetchAll()
  if (!rows.length) {
    toast.warning('当前筛选结果为空，没有可导出的数据')
    return
  }
  exportObjects(
    `会员列表_${dateStr()}`,
    [
      ['memberNo', '会员号'],
      ['name', '姓名'],
      ['phone', '手机号'],
      ['levelName', '会员等级'],
      ['points', '积分'],
      ['balance', '储值余额'],
      ['totalConsume', '累计消费'],
      ['orderCount', '订单数'],
      ['lastConsumeAt', '最后消费时间'],
      ['createdAt', '注册时间'],
      ['status', '状态', (r) => MEMBER_STATUS_STYLE[r.status]?.label || r.status],
      ['remark', '备注'],
    ],
    rows,
  )
  toast.ok(`已导出 ${rows.length} 条会员数据`)
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
  createErr.name = createForm.name.trim() ? '' : '请输入会员姓名'
  createErr.phone = PHONE_RE.test(createForm.phone.trim()) ? '' : '请输入 11 位有效手机号'
  if (createErr.name || createErr.phone) return

  const payload = {
    memberNo: createForm.memberNo,
    name: createForm.name.trim(),
    phone: createForm.phone.trim(),
    gender: createForm.gender,
    level: createForm.level,
    levelName: LEVEL_NAME[createForm.level],
  }
  const res = await memberApi.create(payload)
  toast.ok(res.message || '会员创建成功')
  // 本地插入草稿行：演示环境不落库，靠这一步让界面立刻出现新会员
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const createdAt = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  t.unshiftLocal({
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
  editErr.name = editForm.name.trim() ? '' : '请输入会员姓名'
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : '请输入 11 位有效手机号'
  if (editErr.name || editErr.phone) return

  const id = editRow.value.id
  const patch = {
    name: editForm.name.trim(),
    phone: editForm.phone.trim(),
    level: editForm.level,
    levelName: LEVEL_NAME[editForm.level],
    remark: editForm.remark.trim(),
  }
  const res = await memberApi.update(id, patch)
  toast.ok(res.message || '会员信息已更新')
  t.patchLocal(id, patch)
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
  pointsErr.change = change === 0 ? '调整数量不能为 0' : ''
  pointsErr.reason = pointsForm.reason.trim() ? '' : '请填写调整原因（便于日后对账）'
  if (pointsErr.change || pointsErr.reason) return

  const id = pointsRow.value.id
  const res = await memberApi.adjustPoints(id, { change, reason: pointsForm.reason.trim() })
  toast.ok(res.message || `积分已${change > 0 ? '增加' : '扣减'} ${Math.abs(change)} 分`)
  t.patchLocal(id, { points: Number(pointsRow.value.points || 0) + change })
  close()
}

/* ------------------------------- 注销 ------------------------------- */
async function deactivate(row) {
  const ok = await confirm({
    title: `注销会员「${row.name}」`,
    content: '注销后该会员不能再参与积分与折扣，但会保留历史订单与消费记录，此操作不可撤销。',
    confirmText: '确认注销',
    danger: true,
  })
  if (!ok) return
  const res = await memberApi.remove(row.id)
  toast.ok(res.message || '会员已注销，历史订单与消费记录已保留')
  // 不真删：注销只是状态变更，历史订单还要能查到该会员
  t.patchLocal(row.id, { status: 'disabled' })
  stats.disabled += 1
}
</script>

<template>
  <PageShell>
    <PageHeader
      title="会员管理"
      desc="维护会员档案、等级、积分与储值余额；注销会员不影响历史订单查询"
      icon="members"
    >
      <template #actions>
        <AppButton icon="download" @click="onExport">导出会员</AppButton>
        <AppButton icon="fileAdd" @click="router.push({ name: 'member-create' })">完整表单录入</AppButton>
        <AppButton variant="primary" icon="plus" @click="openCreate">新建会员</AppButton>
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
        <FormField label="关键字" class="col-span-2">
          <SearchInput
            v-model="query.keyword"
            placeholder="姓名 / 手机号 / 会员号"
            width="100%"
            @search="t.reload()"
            @enter="t.reload()"
          />
        </FormField>
        <FormField label="会员等级">
          <select v-model="query.level" class="input w-full">
            <option value="">全部等级</option>
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
        <FormField label="会员状态">
          <select v-model="query.status" class="input w-full">
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已注销</option>
          </select>
        </FormField>
        <div class="flex items-center gap-2">
          <AppButton variant="primary" icon="search" @click="t.reload()">查询</AppButton>
          <AppButton icon="refresh" @click="onReset">重置</AppButton>
        </div>
      </div>
    </div>

    <!-- 表格 -->
    <div class="card mt-3">
      <div class="panel-head">
        <div>
          <div class="text-[14px] font-semibold">会员档案</div>
          <div class="text-[11.5px] text-text-3 mt-0.5">共 {{ total }} 条记录 · 按注册时间倒序</div>
        </div>
        <div class="text-[11.5px] text-text-3">
          {{ isManager ? '店长可执行全部操作' : '收银员可新建 / 编辑 / 调整积分，注销需店长权限' }}
        </div>
      </div>

      <DataTable
        :columns="columns"
        :list="list"
        :loading="loading"
        row-key="id"
        empty-text="没有匹配的会员"
        empty-hint="试试换个关键字，或点击右上角「新建会员」录入"
      >
        <template #cell-memberNo="{ row }">
          <button
            class="font-mono text-[12.5px] hover:text-primary"
            title="查看会员详情"
            @click="router.push({ name: 'member-detail', params: { id: row.id } })"
          >
            {{ row.memberNo || row.id }}
          </button>
        </template>

        <template #cell-name="{ row }">
          <span class="flex items-center gap-2 min-w-0">
            <span class="truncate">{{ row.name }}</span>
            <span class="badge" :class="MEMBER_LEVEL_STYLE[row.level]">{{ row.levelName }}</span>
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
          <span v-else class="text-text-3">从未消费</span>
        </template>

        <template #cell-status="{ row }">
          <StatusTag :value="row.status" :map="MEMBER_STATUS_STYLE" />
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <AppButton size="sm" variant="ghost" icon="eye" @click.stop="router.push({ name: 'member-detail', params: { id: row.id } })">
              详情
            </AppButton>
            <AppButton size="sm" variant="ghost" icon="edit" @click.stop="openEdit(row)">编辑</AppButton>
            <AppButton size="sm" variant="ghost" icon="star" @click.stop="openPoints(row)">调分</AppButton>
            <AppButton
              size="sm"
              variant="danger-soft"
              icon="close"
              :disabled="!isManager"
              :title="isManager ? '注销会员（保留历史订单）' : '仅店长可注销会员'"
              @click.stop="deactivate(row)"
            >
              注销
            </AppButton>
          </div>
        </template>
      </DataTable>

      <div class="px-4 py-3 border-t border-line">
        <Pagination v-model:page="page" v-model:page-size="size" :total="total" @change="t.onPageChange" />
      </div>
    </div>

    <!-- 新建会员 -->
    <AppModal v-model="createVisible" title="新建会员" subtitle="收银台高频操作：录入手机号即可开卡" width="560">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="会员号" hint="系统自动生成，不可修改">
          <input class="input w-full font-mono" :value="createForm.memberNo" disabled />
        </FormField>
        <FormField label="姓名" required :error="createErr.name">
          <input v-model="createForm.name" class="input w-full" placeholder="请输入会员姓名" />
        </FormField>
        <FormField label="手机号" required :error="createErr.phone" hint="11 位手机号，用于收银台检索">
          <input v-model="createForm.phone" class="input w-full" maxlength="11" placeholder="请输入手机号" />
        </FormField>
        <FormField label="性别">
          <select v-model="createForm.gender" class="input w-full">
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </FormField>
        <FormField label="会员等级" span="2">
          <select v-model="createForm.level" class="input w-full">
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitCreate(close)">保存并开卡</AppButton>
      </template>
    </AppModal>

    <!-- 编辑会员 -->
    <AppModal
      v-model="editVisible"
      title="编辑会员"
      :subtitle="editRow ? `${editRow.memberNo} · ${editRow.name}` : ''"
      width="560"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField label="姓名" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" placeholder="请输入会员姓名" />
        </FormField>
        <FormField label="手机号" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" placeholder="11 位手机号" />
        </FormField>
        <FormField label="会员等级" span="2" hint="等级影响积分倍率与会员折扣">
          <select v-model="editForm.level" class="input w-full">
            <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </FormField>
        <FormField label="备注" span="2">
          <textarea v-model="editForm.remark" class="w-full" rows="2" placeholder="如：重点维护客户、忌口备注等" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="save" @click="submitEdit(close)">保存</AppButton>
      </template>
    </AppModal>

    <!-- 调整积分 -->
    <AppModal
      v-model="pointsVisible"
      title="调整积分"
      :subtitle="pointsRow ? `${pointsRow.name} · ${pointsRow.memberNo}` : ''"
      width="520"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField label="当前积分">
          <input class="input w-full num" :value="`${thousands(pointsRow?.points || 0)} 分`" disabled />
        </FormField>
        <FormField label="调整后积分">
          <input
            class="input w-full num"
            :value="`${thousands(Number(pointsRow?.points || 0) + Number(pointsForm.change || 0))} 分`"
            disabled
          />
        </FormField>
        <FormField label="调整数量" required :error="pointsErr.change" hint="正数增加、负数扣减" span="2">
          <div class="flex items-center gap-2">
            <AppButton icon="minus" @click="stepPoints(-10)">-10</AppButton>
            <input v-model.number="pointsForm.change" type="number" class="input w-full num text-center" />
            <AppButton icon="plus" @click="stepPoints(10)">+10</AppButton>
          </div>
        </FormField>
        <FormField label="调整原因" required :error="pointsErr.reason" span="2">
          <input v-model="pointsForm.reason" class="input w-full" placeholder="如：活动补偿 / 积分兑换 / 手工纠正" />
        </FormField>
      </div>
      <div class="mt-3 text-[11.5px] text-text-3 leading-relaxed">
        积分调整会写入会员积分明细，并同步更新会员的可用积分。
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitPoints(close)">确认调整</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
