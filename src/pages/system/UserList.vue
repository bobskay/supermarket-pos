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
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const confirm = useConfirm()
const { user, isManager } = useAuth()
/** 本地 t 已被表格实例占用，i18n 取词函数改名 tr */
const { t: tr, tl } = useI18n()

const ROLES = [
  { value: 'manager', labelKey: 'user.manager' },
  { value: 'cashier', labelKey: 'user.cashier' },
]
/** 提交给接口的角色中文名（数据层保持原样，展示走字典） */
const ROLE_NAME = { manager: '店长', cashier: '收银员' }
const ROLE_CLASS = { manager: 'badge-primary', cashier: 'badge-info' }
/** 角色徽章映射：店长=主色，收银员=信息色（与侧边菜单的配色习惯一致） */
const ROLE_STYLE_MAP = computed(() => ({
  manager: { label: tr('user.manager'), class: ROLE_CLASS.manager },
  cashier: { label: tr('user.cashier'), class: ROLE_CLASS.cashier },
}))
const USER_STATUS_STYLE = computed(() => ({
  active: { label: tr('user.active'), class: 'badge-success' },
  disabled: { label: tr('user.disabled'), class: 'badge-muted' },
}))
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/
const PHONE_RE = /^1\d{10}$/

/* ------------------------------- 列表 ------------------------------- */
const t = useTable(userApi.list, {
  filters: { keyword: '', role: '', status: '' },
  pageSize: 20,
})
const { list, total, loading, query, page, size } = t

const columns = computed(() => [
  { key: 'employeeNo', label: tr('user.employeeNo'), width: 90 },
  { key: 'username', label: tr('user.username'), width: 124 },
  { key: 'name', label: tr('user.name'), width: 110 },
  { key: 'role', label: tr('user.role'), width: 90 },
  { key: 'phone', label: tr('user.phone'), width: 126 },
  { key: 'status', label: tr('user.status'), width: 88 },
  {
    key: 'lastLoginAt',
    label: tr('user.lastLoginAt'),
    width: 156,
    format: (r) => (r.lastLoginAt ? dateOnly(r.lastLoginAt) : tr('user.neverLoggedIn')),
  },
  { key: 'createdAt', label: tr('user.createdAt'), width: 108, format: (r) => dateOnly(r.createdAt) },
  { key: 'actions', label: tr('common.actions'), width: 262, align: 'right' },
])

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
  if (!v) return tr('user.needUsername')
  if (!USERNAME_RE.test(v)) return tr('user.usernameInvalid')
  // 唯一性前端校验：mock 列表里的账号不允许重复，避免演示时出现两个 admin
  if (list.value.some((u) => u.username === v)) return tr('user.usernameTaken')
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
  createErr.name = createForm.name.trim() ? '' : tr('user.needName')
  createErr.phone = PHONE_RE.test(createForm.phone.trim()) ? '' : tr('user.needPhone')
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
  toast.ok(tr('user.createOk', { pwd: payload.password }) || res.message)
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

const lastManagerTip = computed(() => tr('user.lastManagerTip'))

function onEditRoleChange() {
  // 实时提示，而不是等点保存才报错，店长一眼就知道为什么不能改
  const onlyManager = editRow.value?.role === 'manager' && managerCount.value <= 1
  editErr.role = onlyManager && editForm.role !== 'manager' ? lastManagerTip.value : ''
}

async function submitEdit(close) {
  editErr.name = editForm.name.trim() ? '' : tr('user.needName')
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : tr('user.needPhone')
  const onlyManager = editRow.value?.role === 'manager' && managerCount.value <= 1
  editErr.role = onlyManager && editForm.role !== 'manager' ? lastManagerTip.value : ''
  if (editErr.name || editErr.phone || editErr.role) return

  const patch = {
    name: editForm.name.trim(),
    phone: editForm.phone.trim(),
    role: editForm.role,
    roleName: ROLE_NAME[editForm.role],
    remark: editForm.remark.trim(),
  }
  const res = await userApi.update(editRow.value.id, patch)
  toast.ok(tr('user.updatedOk') || res.message)
  t.patchLocal(editRow.value.id, patch)
  close()
}

/* ------------------------------ 重置密码 ------------------------------ */
const pwdVisible = ref(false)
const pwdResult = ref('')

async function resetPassword(row) {
  const ok = await confirm({
    title: tr('user.resetTitle', { name: row.name }),
    content: tr('user.resetConfirm'),
    confirmText: tr('user.resetConfirmText'),
  })
  if (!ok) return
  const res = await userApi.resetPassword(row.id)
  pwdResult.value = res.data?.password || '123456'
  pwdVisible.value = true
  toast.ok(tr('user.resetOk') || res.message)
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(pwdResult.value)
    toast.ok(tr('user.copiedOk'))
  } catch {
    // 非 https / 无权限时浏览器会拒绝，提示手动复制即可
    toast.warning(tr('user.copyDenied'))
  }
}

/* --------------------------- 停用 / 启用 / 删除 --------------------------- */
function isSelf(row) {
  return row.id === user.value?.id
}

async function toggleStatus(row) {
  if (isSelf(row)) {
    toast.warning(tr('user.cannotDisableSelf'))
    return
  }
  const toDisable = row.status === 'active'
  const ok = await confirm({
    title: tr('user.toggleTitle', { action: toDisable ? tr('user.disableAction') : tr('user.enableAction'), name: row.name }),
    content: toDisable ? tr('user.disableConfirmLong') : tr('user.enableConfirmLong'),
    confirmText: toDisable ? tr('common.disable') : tr('common.enable'),
    danger: toDisable,
  })
  if (!ok) return
  const res = toDisable ? await userApi.disable(row.id) : await userApi.enable(row.id)
  toast.ok(tr(toDisable ? 'user.disableOk' : 'user.enableOk') || res.message)
  t.patchLocal(row.id, { status: toDisable ? 'disabled' : 'active' })
}

async function removeUser(row) {
  const ok = await confirm({
    title: tr('user.deleteTitle', { name: row.name }),
    content: tr('user.deleteConfirm'),
    confirmText: tr('common.confirm'),
    danger: true,
  })
  if (!ok) return
  // 删除 → 停用：保证历史订单与日志仍能关联到操作人
  toast.info(tr('user.deleteOk'))
  t.patchLocal(row.id, { status: 'disabled' })
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="$t('user.title')"
      :desc="$t('user.desc')"
      icon="users"
    >
      <template #actions>
        <AppButton icon="shieldCheck" @click="openMatrix">{{ $t('user.roleMatrix') }}</AppButton>
        <AppButton variant="primary" icon="plus" :disabled="!isManager" @click="openCreate">
          {{ $t('user.newUser') }}
        </AppButton>
      </template>
    </PageHeader>

    <!-- 权限兜底：路由已拦截，这里再给一层明确提示，避免出现空白表 -->
    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        :title="$t('user.noPermissionTitle')"
        :desc="$t('user.noPermissionDesc')"
        :size="92"
      />
    </div>

    <template v-else>
      <!-- 筛选栏 -->
      <div class="card card-pad">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 items-end">
          <FormField :label="$t('common.keyword')" class="col-span-2 md:col-span-1 xl:col-span-2">
            <SearchInput
              v-model="query.keyword"
              :placeholder="$t('user.keywordPlaceholder')"
              width="100%"
              @search="t.reload()"
              @enter="t.reload()"
            />
          </FormField>
          <FormField :label="$t('user.role')">
            <select v-model="query.role" class="input w-full">
              <option value="">{{ $t('user.allRoles') }}</option>
              <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ $t(r.labelKey) }}</option>
            </select>
          </FormField>
          <FormField :label="$t('user.accountStatus')">
            <select v-model="query.status" class="input w-full">
              <option value="">{{ $t('user.allStatus') }}</option>
              <option value="active">{{ $t('user.active') }}</option>
              <option value="disabled">{{ $t('user.disabled') }}</option>
            </select>
          </FormField>
          <div class="flex items-center gap-2">
            <AppButton variant="primary" icon="search" @click="t.reload()">{{ $t('common.search') }}</AppButton>
            <AppButton icon="refresh" @click="t.reset()">{{ $t('common.reset') }}</AppButton>
          </div>
        </div>
      </div>

      <!-- 账号表格 -->
      <div class="card mt-3">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">{{ $t('user.storeAccounts') }}</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              {{ $t('user.summary', { total, manager: summary.manager, cashier: summary.cashier, disabled: summary.disabled }) }}
            </div>
          </div>
          <div class="text-[11.5px] text-text-3">{{ $t('user.initialPasswordTip') }}</div>
        </div>

        <DataTable
          :columns="columns"
          :list="list"
          :loading="loading"
          row-key="id"
          :empty-text="$t('user.emptyList')"
          :empty-hint="$t('user.emptyListHint')"
        >
          <template #cell-employeeNo="{ row }">
            <span class="font-mono text-[12.5px]">{{ row.employeeNo }}</span>
          </template>

          <template #cell-username="{ row }">
            <span class="flex items-center gap-1.5">
              <span class="font-mono text-[12.5px]">{{ row.username }}</span>
              <span v-if="isSelf(row)" class="badge badge-accent">{{ $t('user.current') }}</span>
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
            <span v-else class="text-text-3">{{ $t('user.neverLoggedIn') }}</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center justify-end gap-1">
              <AppButton size="sm" variant="ghost" icon="edit" @click.stop="openEdit(row)">{{ $t('user.editAction') }}</AppButton>
              <AppButton size="sm" variant="ghost" icon="key" @click.stop="resetPassword(row)">{{ $t('user.resetAction') }}</AppButton>
              <AppButton
                size="sm"
                variant="ghost"
                :icon="row.status === 'active' ? 'pause' : 'play'"
                :disabled="isSelf(row)"
                :title="isSelf(row) ? $t('user.cannotDisableSelfTip') : row.status === 'active' ? $t('user.disableAccountTip') : $t('user.enableAccountTip')"
                @click.stop="toggleStatus(row)"
              >
                {{ row.status === 'active' ? $t('user.disableAction') : $t('user.enableAction') }}
              </AppButton>
              <AppButton size="sm" variant="danger-soft" icon="trash" :disabled="isSelf(row)" @click.stop="removeUser(row)">
                {{ $t('user.deleteAction') }}
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
    <AppModal v-model="matrixVisible" :title="$t('user.roleMatrix')" :subtitle="$t('user.matrixSubtitle')" width="620">
      <table class="table-flat">
        <thead>
          <tr>
            <th>{{ $t('user.moduleColumn') }}</th>
            <th class="text-center" style="width: 110px">{{ $t('user.cashierColumn') }}</th>
            <th class="text-center" style="width: 110px">{{ $t('user.managerColumn') }}</th>
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
        {{ $t('user.matrixTip') }}
      </div>
      <template #footer="{ close }">
        <AppButton variant="primary" @click="close">{{ $t('common.ok') }}</AppButton>
      </template>
    </AppModal>

    <!-- 新增账号 -->
    <AppModal v-model="createVisible" :title="$t('user.newUser')" :subtitle="$t('user.createSubtitle')" width="560">
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('user.usernameField')" required :error="createErr.username" :hint="$t('user.usernameHint')">
          <input
            v-model="createForm.username"
            class="input w-full font-mono"
            :placeholder="$t('user.usernamePlaceholder')"
            @blur="createErr.username = checkUsername()"
          />
        </FormField>
        <FormField :label="$t('user.name')" required :error="createErr.name">
          <input v-model="createForm.name" class="input w-full" :placeholder="$t('user.namePlaceholder')" />
        </FormField>
        <FormField :label="$t('user.phone')" required :error="createErr.phone">
          <input v-model="createForm.phone" class="input w-full" maxlength="11" :placeholder="$t('user.phonePlaceholder')" />
        </FormField>
        <FormField :label="$t('user.role')" :hint="$t('user.roleHint')">
          <select v-model="createForm.role" class="input w-full">
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ $t(r.labelKey) }}</option>
          </select>
        </FormField>
        <FormField :label="$t('user.employeeNo')" :hint="$t('user.employeeNoHint')">
          <input class="input w-full font-mono" :value="nextEmployeeNo" disabled />
        </FormField>
        <FormField :label="$t('user.initialPassword')" :hint="$t('user.passwordHint')">
          <input v-model="createForm.password" class="input w-full font-mono" />
        </FormField>
      </div>
      <div class="mt-3 text-[11.5px] text-text-3 leading-relaxed">
        {{ $t('user.createTip') }}
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="check" @click="submitCreate(close)">{{ $t('user.createAccount') }}</AppButton>
      </template>
    </AppModal>

    <!-- 编辑账号 -->
    <AppModal
      v-model="editVisible"
      :title="$t('user.editUser')"
      :subtitle="editRow ? `${editRow.employeeNo} · ${editRow.username}` : ''"
      width="560"
    >
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('user.username')">
          <input class="input w-full font-mono" :value="editRow?.username" disabled />
        </FormField>
        <FormField :label="$t('user.name')" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" />
        </FormField>
        <FormField :label="$t('user.phone')" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" />
        </FormField>
        <FormField :label="$t('user.role')" :error="editErr.role" :hint="$t('user.roleEditHint')">
          <select v-model="editForm.role" class="input w-full" @change="onEditRoleChange">
            <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ $t(r.labelKey) }}</option>
          </select>
        </FormField>
        <FormField :label="$t('common.remark')" span="2">
          <textarea v-model="editForm.remark" class="w-full" rows="2" :placeholder="$t('user.remarkPlaceholder')" />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="save" :disabled="!!editErr.role" @click="submitEdit(close)">{{ $t('user.saveAction') }}</AppButton>
      </template>
    </AppModal>

    <!-- 重置密码结果 -->
    <AppModal v-model="pwdVisible" :title="$t('user.resetOk')" :subtitle="$t('user.newPasswordTip')" width="440">
      <div class="flex flex-col items-center gap-3 py-2">
        <div
          class="flex items-center justify-center rounded-full"
          :style="{ width: '46px', height: '46px', background: 'var(--c-success-soft)', color: 'var(--c-success)' }"
        >
          <Icon name="key" :size="22" />
        </div>
        <div class="text-[12.5px] text-text-3">{{ $t('user.newPasswordLabel') }}</div>
        <div
          class="px-5 py-2.5 rounded-md font-mono text-[20px] font-semibold tracking-[0.2em]"
          :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
        >
          {{ pwdResult }}
        </div>
        <AppButton icon="copy" @click="copyPassword">{{ $t('user.copyPassword') }}</AppButton>
      </div>
      <template #footer="{ close }">
        <AppButton variant="primary" @click="close">{{ $t('user.doneAction') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
