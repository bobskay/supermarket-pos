<script setup>
/**
 * 用户管理（店长专属）
 * ------------------------------------------------------------------
 * - 账号体系只有两种角色：店长（全权限）/ 收银员（收银 + 会员）
 * - 「最后一个店长不能降级」「不能停用自己」这两条业务规则在前端拦截并给出明确提示，
 *   避免演示时把系统锁死（演示环境不落库，但交互上必须讲得通）
 */
import { ref, reactive, computed } from 'vue'
import { userApi, settingApi } from '@/api'
import { dateOnly, fromNow } from '@/utils/format'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
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
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const confirm = useConfirm()
const { user, isManager } = useAuth()

const ROLES = [
  { value: 'manager', label: '店长' },
  { value: 'cashier', label: '收银员' },
]
const ROLE_NAME = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))
const ROLE_CLASS = { manager: 'badge-primary', cashier: 'badge-info' }
/** 角色徽章映射：店长=主色，收银员=信息色（与侧边菜单的配色习惯一致） */
const ROLE_STYLE_MAP = {
  manager: { label: '店长', class: ROLE_CLASS.manager },
  cashier: { label: '收银员', class: ROLE_CLASS.cashier },
}
const USER_STATUS_STYLE = {
  active: { label: '正常', class: 'badge-success' },
  disabled: { label: '已停用', class: 'badge-muted' },
}
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/
const PHONE_RE = /^1\d{10}$/

/* ------------------------------- 列表 ------------------------------- */
const t = useTable(userApi.list, {
  filters: { keyword: '', role: '', status: '' },
  pageSize: 20,
})
const { list, total, loading, query, page, size } = t

const columns = [
  { key: 'employeeNo', label: '工号', width: 90 },
  { key: 'username', label: '账号', width: 124 },
  { key: 'name', label: '姓名', width: 110 },
  { key: 'role', label: '角色', width: 90 },
  { key: 'phone', label: '手机号', width: 126 },
  { key: 'status', label: '状态', width: 88 },
  { key: 'lastLoginAt', label: '最后登录时间', width: 156, format: (r) => (r.lastLoginAt ? dateOnly(r.lastLoginAt) : '从未登录') },
  { key: 'createdAt', label: '创建时间', width: 108, format: (r) => dateOnly(r.createdAt) },
  { key: 'actions', label: '操作', width: 262, align: 'right' },
]

const summary = computed(() => ({
  manager: list.value.filter((u) => u.role === 'manager').length,
  cashier: list.value.filter((u) => u.role === 'cashier').length,
  disabled: list.value.filter((u) => u.status === 'disabled').length,
}))
/** 最后一位店长不允许降级：以当前列表里的店长数量为准 */
const managerCount = computed(() => list.value.filter((u) => u.role === 'manager').length)

/* --------------------------- 角色权限对照表 --------------------------- */
const matrixVisible = ref(false)
const matrixLoading = ref(false)
const roleMatrix = ref([])

async function openMatrix() {
  matrixVisible.value = true
  if (roleMatrix.value.length) return
  matrixLoading.value = true
  try {
    const res = await settingApi.detail()
    roleMatrix.value = res.data?.roleMatrix || []
  } finally {
    matrixLoading.value = false
  }
}

/* ------------------------------ 新增账号 ------------------------------ */
const createVisible = ref(false)
const createForm = reactive({ username: '', name: '', phone: '', role: 'cashier', password: '123456' })
const createErr = reactive({ username: '', name: '', phone: '' })

function openCreate() {
  Object.assign(createForm, { username: '', name: '', phone: '', role: 'cashier', password: '123456' })
  createErr.username = ''
  createErr.name = ''
  createErr.phone = ''
  createVisible.value = true
}

function checkUsername() {
  const v = createForm.username.trim()
  if (!v) return '请输入登录账号'
  if (!USERNAME_RE.test(v)) return '账号只能使用 3-20 位英文、数字或下划线'
  // 唯一性前端校验：mock 列表里的账号不允许重复，避免演示时出现两个 admin
  if (list.value.some((u) => u.username === v)) return '该账号已存在，请更换'
  return ''
}

const nextEmployeeNo = computed(() => {
  const prefix = createForm.role === 'manager' ? 'M' : 'C'
  const nums = list.value
    .filter((u) => String(u.employeeNo || '').startsWith(prefix))
    .map((u) => Number(String(u.employeeNo).slice(1)) || 0)
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
})

async function submitCreate(close) {
  createErr.username = checkUsername()
  createErr.name = createForm.name.trim() ? '' : '请输入姓名'
  createErr.phone = PHONE_RE.test(createForm.phone.trim()) ? '' : '请输入 11 位有效手机号'
  if (createErr.username || createErr.name || createErr.phone) return

  const payload = {
    username: createForm.username.trim(),
    name: createForm.name.trim(),
    phone: createForm.phone.trim(),
    role: createForm.role,
    roleName: ROLE_NAME[createForm.role],
    employeeNo: nextEmployeeNo.value,
    password: createForm.password || '123456',
  }
  const res = await userApi.create(payload)
  toast.ok(res.message || `账号创建成功，初始密码 ${payload.password}`)
  // 本地插入草稿行，把密码字段剔掉（真实后端也不会回传密码）
  const { password, ...safe } = payload
  t.unshiftLocal({
    id: `U${Date.now()}`,
    ...safe,
    status: 'active',
    lastLoginAt: '',
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
  })
  close()
}

/* -------------------------------- 编辑 -------------------------------- */
const editVisible = ref(false)
const editRow = ref(null)
const editForm = reactive({ name: '', phone: '', role: 'cashier', remark: '' })
const editErr = reactive({ name: '', phone: '', role: '' })

function openEdit(row) {
  editRow.value = row
  Object.assign(editForm, { name: row.name, phone: row.phone, role: row.role, remark: row.remark || '' })
  editErr.name = ''
  editErr.phone = ''
  editErr.role = ''
  editVisible.value = true
}

function onEditRoleChange() {
  // 实时提示，而不是等点保存才报错，店长一眼就知道为什么不能改
  const onlyManager = editRow.value?.role === 'manager' && managerCount.value <= 1
  editErr.role = onlyManager && editForm.role !== 'manager' ? '这是最后一位店长账号，不能降级为收银员' : ''
}

async function submitEdit(close) {
  editErr.name = editForm.name.trim() ? '' : '请输入姓名'
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : '请输入 11 位有效手机号'
  const onlyManager = editRow.value?.role === 'manager' && managerCount.value <= 1
  editErr.role = onlyManager && editForm.role !== 'manager' ? '这是最后一位店长账号，不能降级为收银员' : ''
  if (editErr.name || editErr.phone || editErr.role) return

  const patch = {
    name: editForm.name.trim(),
    phone: editForm.phone.trim(),
    role: editForm.role,
    roleName: ROLE_NAME[editForm.role],
    remark: editForm.remark.trim(),
  }
  const res = await userApi.update(editRow.value.id, patch)
  toast.ok(res.message || '账号信息已更新')
  t.patchLocal(editRow.value.id, patch)
  close()
}

/* ------------------------------ 重置密码 ------------------------------ */
const pwdVisible = ref(false)
const pwdResult = ref('')

async function resetPassword(row) {
  const ok = await confirm({
    title: `重置「${row.name}」的登录密码`,
    content: '重置后原密码立即失效，新密码为初始密码，请提醒该员工首次登录后自行修改。',
    confirmText: '确认重置',
  })
  if (!ok) return
  const res = await userApi.resetPassword(row.id)
  pwdResult.value = res.data?.password || '123456'
  pwdVisible.value = true
  toast.ok(res.message || '密码已重置')
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(pwdResult.value)
    toast.ok('新密码已复制到剪贴板')
  } catch {
    // 非 https / 无权限时浏览器会拒绝，提示手动复制即可
    toast.warning('浏览器不允许自动复制，请手动选中复制')
  }
}

/* --------------------------- 停用 / 启用 / 删除 --------------------------- */
function isSelf(row) {
  return row.id === user.value?.id
}

async function toggleStatus(row) {
  if (isSelf(row)) {
    toast.warning('不能停用当前登录的账号')
    return
  }
  const toDisable = row.status === 'active'
  const ok = await confirm({
    title: `${toDisable ? '停用' : '启用'}账号「${row.name}」`,
    content: toDisable
      ? '停用后该账号无法登录，但其历史订单与操作日志会完整保留。'
      : '启用后该账号可以立即恢复登录。',
    confirmText: toDisable ? '确认停用' : '确认启用',
    danger: toDisable,
  })
  if (!ok) return
  const res = toDisable ? await userApi.disable(row.id) : await userApi.enable(row.id)
  toast.ok(res.message || (toDisable ? '账号已停用' : '账号已启用'))
  t.patchLocal(row.id, { status: toDisable ? 'disabled' : 'active' })
}

async function removeUser(row) {
  const ok = await confirm({
    title: `删除账号「${row.name}」`,
    content: '删除属于高风险操作，账号将被停用并无法登录，其历史订单与操作日志会保留。',
    confirmText: '确认删除',
    danger: true,
  })
  if (!ok) return
  // 删除 → 停用：保证历史订单与日志仍能关联到操作人
  toast.info('账号已停用，历史订单与日志保留')
  t.patchLocal(row.id, { status: 'disabled' })
}
</script>

<template>
  <PageShell>
    <PageHeader
      title="用户管理"
      desc="仅店长可创建账号、重置密码与停用账号；收银员账号只能用于收银与会员业务"
      icon="users"
    >
      <template #actions>
        <AppButton icon="shieldCheck" @click="openMatrix">角色权限对照表</AppButton>
        <AppButton variant="primary" icon="plus" :disabled="!isManager" @click="openCreate">
          新增账号
        </AppButton>
      </template>
    </PageHeader>

    <!-- 权限兜底：路由已拦截，这里再给一层明确提示，避免出现空白表 -->
    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        title="当前角色无权查看用户管理"
        desc="用户管理属于店长专属模块，请使用店长账号（admin）登录后访问。"
        :size="92"
      />
    </div>

    <template v-else>
      <!-- 筛选栏 -->
      <div class="card card-pad">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 items-end">
          <FormField label="关键字" class="col-span-2 md:col-span-1 xl:col-span-2">
            <SearchInput
              v-model="query.keyword"
              placeholder="姓名 / 账号 / 工号"
              width="100%"
              @search="t.reload()"
              @enter="t.reload()"
            />
          </FormField>
          <FormField label="角色">
            <select v-model="query.role" class="input w-full">
              <option value="">全部角色</option>
              <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
          </FormField>
          <FormField label="账号状态">
            <select v-model="query.status" class="input w-full">
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="disabled">已停用</option>
            </select>
          </FormField>
          <div class="flex items-center gap-2">
            <AppButton variant="primary" icon="search" @click="t.reload()">查询</AppButton>
            <AppButton icon="refresh" @click="t.reset()">重置</AppButton>
          </div>
        </div>
      </div>

      <!-- 账号表格 -->
      <div class="card mt-3">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">门店账号</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              共 {{ total }} 个账号 · 本页店长 {{ summary.manager }} / 收银员 {{ summary.cashier }} · 已停用
              {{ summary.disabled }}
            </div>
          </div>
          <div class="text-[11.5px] text-text-3">初始密码统一为 123456，员工首次登录后应自行修改</div>
        </div>

        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          row-key="id"
          empty-text="没有匹配的账号"
          empty-hint="换个关键字，或点击「新增账号」为门店开一个新工号"
        >
          <template #cell-employeeNo="{ row }">
            <span class="font-mono text-[12.5px]">{{ row.employeeNo }}</span>
          </template>

          <template #cell-username="{ row }">
            <span class="flex items-center gap-1.5">
              <span class="font-mono text-[12.5px]">{{ row.username }}</span>
              <span v-if="isSelf(row)" class="badge badge-accent">当前登录</span>
            </span>
          </template>

          <template #cell-name="{ row }">
            <span>{{ row.name }}</span>
          </template>

          <template #cell-role="{ row }">
            <StatusTag :value="row.role" :map="ROLE_STYLE_MAP" />
          </template>

          <template #cell-status="{ row }">
            <StatusTag :value="row.status" :map="USER_STATUS_STYLE" />
          </template>

          <template #cell-lastLoginAt="{ row }">
            <span v-if="row.lastLoginAt" :title="fromNow(row.lastLoginAt)">{{ row.lastLoginAt }}</span>
            <span v-else class="text-text-3">从未登录</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center justify-end gap-1">
              <AppButton size="sm" variant="ghost" icon="edit" @click.stop="openEdit(row)">编辑</AppButton>
              <AppButton size="sm" variant="ghost" icon="key" @click.stop="resetPassword(row)">重置密码</AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :icon="row.status === 'active' ? 'pause' : 'play'"
                :disabled="isSelf(row)"
                :title="isSelf(row) ? '不能停用当前登录账号' : row.status === 'active' ? '停用该账号' : '启用该账号'"
                @click.stop="toggleStatus(row)"
              >
                {{ row.status === 'active' ? '停用' : '启用' }}
              </AppButton>
              <AppButton size="sm" variant="danger-soft" icon="trash" :disabled="isSelf(row)" @click.stop="removeUser(row)">
                删除
              </AppButton>
            </div>
          </template>
        </DataTable>

        <div class="px-4 py-3 border-t border-line">
          <Pagination v-model:page="page" v-model:page-size="size" :total="total" @change="t.onPageChange" />
        </div>
      </div>
    </template>

    <!-- 角色权限对照表 -->
    <AppModal v-model="matrixVisible" title="角色权限对照表" subtitle="来源：GET /api/settings 的 roleMatrix" width="620">
      <table class="table-flat">
        <thead>
          <tr>
            <th>功能模块</th>
            <th class="text-center" style="width: 110px">收银员</th>
            <th class="text-center" style="width: 110px">店长</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="matrixLoading">
            <td colspan="3"><div class="skeleton" style="height: 16px" /></td>
          </tr>
          <tr v-for="r in roleMatrix" v-else :key="r.module">
            <td>{{ r.module }}</td>
            <td class="text-center">
              <Icon
                :name="r.cashier ? 'check' : 'close'"
                :size="15"
                :style="{ color: r.cashier ? 'var(--c-success)' : 'var(--c-text-3)' }"
              />
            </td>
            <td class="text-center">
              <Icon
                :name="r.manager ? 'check' : 'close'"
                :size="15"
                :style="{ color: r.manager ? 'var(--c-success)' : 'var(--c-text-3)' }"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div class="mt-3 text-[11.5px] text-text-3 leading-relaxed">
        权限只影响菜单可见性与页面访问，不改变历史数据归属。收银员仅能查看本人订单，店长可查看全部门店数据。
      </div>
      <template #footer="{ close }">
        <AppButton variant="primary" @click="close">我知道了</AppButton>
      </template>
    </AppModal>

    <!-- 新增账号 -->
    <AppModal v-model="createVisible" title="新增账号" subtitle="为门店新员工开通后台登录账号" width="560">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="登录账号" required :error="createErr.username" hint="3-20 位英文、数字或下划线">
          <input
            v-model="createForm.username"
            class="input w-full font-mono"
            placeholder="如 cashier05"
            @blur="createErr.username = checkUsername()"
          />
        </FormField>
        <FormField label="姓名" required :error="createErr.name">
          <input v-model="createForm.name" class="input w-full" placeholder="请输入真实姓名" />
        </FormField>
        <FormField label="手机号" required :error="createErr.phone">
          <input v-model="createForm.phone" class="input w-full" maxlength="11" placeholder="11 位手机号" />
        </FormField>
        <FormField label="角色" hint="收银员只能进入收银台、订单与会员">
          <select v-model="createForm.role" class="input w-full">
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </FormField>
        <FormField label="工号" hint="按角色自动编号">
          <input class="input w-full font-mono" :value="nextEmployeeNo" disabled />
        </FormField>
        <FormField label="初始密码" hint="可修改，默认 123456">
          <input v-model="createForm.password" class="input w-full font-mono" />
        </FormField>
      </div>
      <div class="mt-3 text-[11.5px] text-text-3 leading-relaxed">
        创建后该账号即可使用初始密码登录，请提醒员工首次登录后修改密码。
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitCreate(close)">创建账号</AppButton>
      </template>
    </AppModal>

    <!-- 编辑账号 -->
    <AppModal
      v-model="editVisible"
      title="编辑账号"
      :subtitle="editRow ? `${editRow.employeeNo} · ${editRow.username}` : ''"
      width="560"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField label="账号">
          <input class="input w-full font-mono" :value="editRow?.username" disabled />
        </FormField>
        <FormField label="姓名" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" />
        </FormField>
        <FormField label="手机号" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" />
        </FormField>
        <FormField label="角色" :error="editErr.role" hint="降级为收银员后该账号将无法访问管理模块">
          <select v-model="editForm.role" class="input w-full" @change="onEditRoleChange">
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </FormField>
        <FormField label="备注" span="2">
          <textarea v-model="editForm.remark" class="w-full" rows="2" placeholder="如：早班收银、兼职等" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="save" :disabled="!!editErr.role" @click="submitEdit(close)">保存</AppButton>
      </template>
    </AppModal>

    <!-- 重置密码结果 -->
    <AppModal v-model="pwdVisible" title="密码已重置" subtitle="请把新密码告知该员工" width="440">
      <div class="flex flex-col items-center gap-3 py-2">
        <div
          class="flex items-center justify-center rounded-full"
          :style="{ width: '46px', height: '46px', background: 'var(--c-success-soft)', color: 'var(--c-success)' }"
        >
          <Icon name="key" :size="22" />
        </div>
        <div class="text-[12.5px] text-text-3">新的登录密码</div>
        <div
          class="px-5 py-2.5 rounded-md font-mono text-[20px] font-semibold tracking-[0.2em]"
          :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
        >
          {{ pwdResult }}
        </div>
        <AppButton icon="copy" @click="copyPassword">复制密码</AppButton>
      </div>
      <template #footer="{ close }">
        <AppButton variant="primary" @click="close">完成</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
