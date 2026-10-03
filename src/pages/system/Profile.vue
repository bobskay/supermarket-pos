<script setup>
/**
 * 个人中心
 * ------------------------------------------------------------------
 * - 左侧身份卡 + 右侧 Tab（基本信息 / 修改密码），Tab 与 URL 的 ?tab= 双向联动：
 *   顶栏「修改密码」入口可以直接跳到 ?tab=password，刷新后仍停留在该 Tab。
 * - 修改姓名 / 手机号后必须 patchUser 回写登录态，否则顶栏与头像还是旧值。
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi, userApi, orderApi } from '@/api'
import { money, thousands, sumBy, calc, dateStr } from '@/utils/format'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormField from '@/components/ui/FormField.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { user, roleName, avatarText, patchUser } = useAuth()
const { t, tl } = useI18n()

const ROLE_CLASS = { manager: 'badge-primary', cashier: 'badge-info' }
/** 角色码 → 字典键，找不到时回退登录态里的中文名 */
const ROLE_KEY = { manager: 'user.manager', cashier: 'user.cashier' }
const PHONE_RE = /^1\d{10}$/

const TABS = [
  { key: 'basic', labelKey: 'profile.baseInfo', icon: 'user' },
  { key: 'password', labelKey: 'profile.changePasswordTab', icon: 'lock' },
]

/* --------------------------- Tab 与 URL 联动 --------------------------- */
const activeTab = ref(route.query.tab === 'password' ? 'password' : 'basic')

watch(
  () => route.query.tab,
  (v) => {
    activeTab.value = v === 'password' ? 'password' : 'basic'
  },
)

function setTab(key) {
  if (activeTab.value === key) return
  activeTab.value = key
  // 用 replace 而不是 push：切换 Tab 不该产生一条新的浏览器历史
  router.replace({ query: key === 'password' ? { tab: 'password' } : {} })
}

/* ------------------------------ 基本信息 ------------------------------ */
const roleText = computed(() => (ROLE_KEY[user.value?.role] ? t(ROLE_KEY[user.value.role]) : roleName.value))

const infoRows = computed(() => {
  const u = user.value || {}
  return [
    { key: 'name', label: t('profile.name'), value: u.name || '—' },
    { key: 'username', label: t('profile.username'), value: u.username || '—', mono: true },
    { key: 'employeeNo', label: t('profile.employeeNo'), value: u.employeeNo || '—', mono: true },
    { key: 'role', label: t('profile.role'), value: roleText.value },
    { key: 'phone', label: t('profile.phone'), value: u.phone || '—', mono: true },
    { key: 'lastLoginAt', label: t('profile.lastLoginAt'), value: u.lastLoginAt || '—' },
  ]
})

const editVisible = ref(false)
const editForm = reactive({ name: '', phone: '' })
const editErr = reactive({ name: '', phone: '' })

function openEdit() {
  editForm.name = user.value?.name || ''
  editForm.phone = user.value?.phone || ''
  editErr.name = ''
  editErr.phone = ''
  editVisible.value = true
}

async function submitEdit(close) {
  editErr.name = editForm.name.trim() ? '' : t('user.needName')
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : t('user.needPhone')
  if (editErr.name || editErr.phone) return

  const patch = { name: editForm.name.trim(), phone: editForm.phone.trim() }
  const res = await userApi.update(user.value.id, patch)
  // 同步登录态，顶栏用户名与头像会立刻更新
  patchUser(patch)
  toast.ok(t('profile.profileOk') || res.message)
  close()
}

/* ------------------------------ 修改密码 ------------------------------ */
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdErr = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdSaving = ref(false)
const showOld = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

const pwdStrength = computed(() => {
  const v = pwdForm.newPassword
  if (!v) return { level: 0, text: t('profile.strengthEmpty'), color: 'var(--c-text-3)' }
  let score = 0
  if (v.length >= 6) score += 1
  if (v.length >= 10) score += 1
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) score += 1
  if (/[^A-Za-z0-9]/.test(v)) score += 1
  const map = ['profile.strengthWeak', 'profile.strengthFair', 'profile.strengthGood', 'profile.strengthStrong']
  return { level: score, text: t(map[Math.min(score, 3)] || map[0]), color: score >= 2 ? 'var(--c-success)' : score === 1 ? 'var(--c-warning)' : 'var(--c-danger)' }
})

function validatePwd() {
  pwdErr.oldPassword = pwdForm.oldPassword ? '' : t('profile.oldPlaceholder')
  pwdErr.newPassword = !pwdForm.newPassword
    ? t('profile.newPasswordHint')
    : pwdForm.newPassword.length < 6
      ? t('profile.passwordTooShort')
      : pwdForm.newPassword === pwdForm.oldPassword
        ? t('profile.passwordSameAsOld')
        : ''
  pwdErr.confirmPassword = !pwdForm.confirmPassword
    ? t('profile.confirmPlaceholder')
    : pwdForm.confirmPassword !== pwdForm.newPassword
      ? t('profile.passwordMismatch')
      : ''
  return !pwdErr.oldPassword && !pwdErr.newPassword && !pwdErr.confirmPassword
}

async function submitPwd() {
  if (pwdSaving.value || !validatePwd()) return
  pwdSaving.value = true
  try {
    const res = await authApi.changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    toast.ok(t('profile.passwordOk') || res.message)
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    pwdErr.oldPassword = ''
    pwdErr.newPassword = ''
    pwdErr.confirmPassword = ''
    showOld.value = false
    showNew.value = false
    showConfirm.value = false
  } finally {
    pwdSaving.value = false
  }
}

/* ---------------------------- 我的本月表现 ---------------------------- */
const perfLoading = ref(true)
const perf = reactive({ orders: 0, amount: 0, refund: 0, month: '' })

async function loadPerf() {
  perfLoading.value = true
  try {
    // pageSize: 0 → 取本人全部订单，再在前端按月份聚合（收银员自查视角）
    const res = await orderApi.list({ operatorId: user.value?.id, page: 1, pageSize: 0 })
    const rows = res.data?.list || []
    const months = rows.map((o) => String(o.date || o.createdAt || '').slice(0, 7)).filter(Boolean).sort()
    const thisMonth = dateStr().slice(0, 7)
    // 演示数据是历史月份，本月无数据时回退到本人最新有单的月份，避免统计恒为 0
    const month = months.includes(thisMonth) ? thisMonth : months[months.length - 1] || thisMonth
    const mine = rows.filter((o) => String(o.date || o.createdAt || '').startsWith(month))
    perf.month = month
    perf.orders = mine.length
    perf.amount = sumBy(mine, (o) => o.finalAmount)
    perf.refund = mine.filter((o) => o.status === 'refunded' || o.status === 'partial_refund').length
  } finally {
    perfLoading.value = false
  }
}
onMounted(loadPerf)

const perfKpis = computed(() => [
  { key: 'orders', label: t('profile.monthOrders'), value: thousands(perf.orders), unit: t('dashboard.unitOrder'), icon: 'receipt', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)' },
  { key: 'amount', label: t('profile.myAmount'), value: money(perf.amount), icon: 'money', color: 'var(--c-accent)', bg: 'var(--c-accent-soft)' },
  {
    key: 'avg',
    label: t('member.avgOrderAmount'),
    value: money(perf.orders ? calc(perf.amount / perf.orders) : 0),
    icon: 'target',
    color: 'var(--c-purple)',
    bg: 'var(--c-purple-soft)',
  },
  { key: 'refund', label: t('profile.refundOrders'), value: thousands(perf.refund), unit: t('dashboard.unitOrder'), icon: 'undo', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)' },
])
</script>

<template>
  <PageShell>
    <PageHeader
      :title="$t('profile.title')"
      :desc="$t('profile.desc')"
      icon="user"
    />

    <div class="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-3">
      <!-- 左侧身份卡 -->
      <div class="space-y-3">
        <div class="card card-pad">
          <div class="flex flex-col items-center text-center">
            <div
              class="flex items-center justify-center rounded-full text-[26px] font-semibold"
              :style="{ width: '72px', height: '72px', background: 'var(--c-primary)', color: '#fff' }"
            >
              {{ avatarText }}
            </div>
            <div class="mt-3 text-[16px] font-semibold">{{ user?.name }}</div>
            <div class="mt-1.5 flex items-center gap-2">
              <span class="badge" :class="ROLE_CLASS[user?.role] || 'badge-muted'">{{ roleText }}</span>
              <span class="badge badge-muted font-mono">{{ user?.employeeNo }}</span>
            </div>
          </div>

          <div class="divider my-4" />

          <div class="space-y-2.5">
            <div v-for="r in infoRows" :key="r.key" class="flex items-center justify-between gap-3 text-[13px]">
              <span class="text-text-2 shrink-0">{{ r.label }}</span>
              <span class="truncate text-right" :class="r.mono && 'font-mono'">{{ r.value }}</span>
            </div>
          </div>

          <div class="divider my-4" />

          <AppButton block icon="edit" @click="setTab('basic'); openEdit()">{{ $t('profile.editTitle') }}</AppButton>
        </div>

        <div class="card card-pad">
          <div class="flex items-start gap-2 text-[12px] text-text-3 leading-relaxed">
            <Icon name="info" :size="15" class="mt-0.5 shrink-0" />
            <div>
              {{ $t('profile.accountTip') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧 Tab -->
      <div class="space-y-3 min-w-0">
        <div class="card">
          <div class="panel-head">
            <div class="seg">
              <button
                v-for="tb in TABS"
                :key="tb.key"
                class="seg-item"
                :class="activeTab === tb.key && 'is-active'"
                @click="setTab(tb.key)"
              >
                <Icon :name="tb.icon" :size="13" class="mr-1.5" />
                {{ $t(tb.labelKey) }}
              </button>
            </div>
            <span class="text-[11.5px] text-text-3">{{ $t('profile.noLoginHint', { username: user?.username }) }}</span>
          </div>

          <!-- 基本信息 -->
          <div v-if="activeTab === 'basic'" class="p-4">
            <div class="text-[12.5px] text-text-3 mb-3">
              {{ $t('profile.infoTip') }}
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-3">
              <div v-for="r in infoRows" :key="r.key" class="min-w-0">
                <div class="text-[11.5px] text-text-3">{{ r.label }}</div>
                <div class="mt-1 text-[13.5px] truncate" :class="r.mono && 'font-mono'">
                  <span v-if="r.key === 'role'" class="badge" :class="ROLE_CLASS[user?.role] || 'badge-muted'">
                    {{ r.value }}
                  </span>
                  <span v-else>{{ r.value }}</span>
                </div>
              </div>
            </div>

            <div class="divider my-4" />
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="text-[12px] text-text-3">{{ $t('profile.nameChangeTip') }}</div>
              <AppButton variant="primary" icon="edit" @click="openEdit">{{ $t('profile.editProfile') }}</AppButton>
            </div>
          </div>

          <!-- 修改密码 -->
          <div v-else class="p-4">
            <div class="text-[12.5px] text-text-3 mb-3">
              {{ $t('profile.passwordTip') }}
            </div>

            <form class="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-[760px]" @submit.prevent="submitPwd">
              <FormField :label="$t('profile.oldPassword')" required :error="pwdErr.oldPassword" class="lg:col-span-2">
                <div class="relative">
                  <input
                    v-model="pwdForm.oldPassword"
                    :type="showOld ? 'text' : 'password'"
                    class="input w-full pr-9"
                    :placeholder="$t('profile.oldPlaceholder')"
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showOld ? $t('profile.hidePassword') : $t('profile.showPassword')"
                    @click="showOld = !showOld"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <FormField :label="$t('profile.newPassword')" required :error="pwdErr.newPassword">
                <div class="relative">
                  <input
                    v-model="pwdForm.newPassword"
                    :type="showNew ? 'text' : 'password'"
                    class="input w-full pr-9"
                    :placeholder="$t('profile.newPlaceholder')"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showNew ? $t('profile.hidePassword') : $t('profile.showPassword')"
                    @click="showNew = !showNew"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <FormField :label="$t('profile.confirmPassword')" required :error="pwdErr.confirmPassword">
                <div class="relative">
                  <input
                    v-model="pwdForm.confirmPassword"
                    :type="showConfirm ? 'text' : 'password'"
                    class="input w-full pr-9"
                    :placeholder="$t('profile.confirmPlaceholder')"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showConfirm ? $t('profile.hidePassword') : $t('profile.showPassword')"
                    @click="showConfirm = !showConfirm"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <div class="lg:col-span-2 flex items-center gap-2 text-[12px]">
                <span class="text-text-3">{{ $t('profile.strengthLabel') }}</span>
                <span :style="{ color: pwdStrength.color }">{{ pwdStrength.text }}</span>
              </div>

              <div class="lg:col-span-2 flex items-center gap-2">
                <AppButton variant="primary" icon="save" type="submit" :loading="pwdSaving">{{ $t('profile.confirmChange') }}</AppButton>
                <AppButton
                  icon="refresh"
                  @click="Object.assign(pwdForm, { oldPassword: '', newPassword: '', confirmPassword: '' })"
                >
                  {{ $t('profile.clearForm') }}
                </AppButton>
              </div>
            </form>
          </div>
        </div>

        <!-- 我的本月表现 -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('profile.monthPerf') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">
                {{ $t('profile.perfScope', { name: user?.name, month: perf.month || '—' }) }}
              </div>
            </div>
            <AppButton size="sm" icon="refresh" :loading="perfLoading" @click="loadPerf">{{ $t('common.refresh') }}</AppButton>
          </div>

          <div class="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <template v-if="perfLoading">
              <div v-for="i in 4" :key="i" class="kpi">
                <div class="skeleton" style="height: 13px; width: 55%" />
                <div class="skeleton" style="height: 24px; width: 70%" />
              </div>
            </template>
            <div v-for="k in perfKpis" v-else :key="k.key" class="kpi">
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
            </div>
          </div>

          <div class="px-4 pb-4 text-[11.5px] text-text-3">
            {{ $t('profile.perfSourceTip', { id: user?.id }) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑资料 -->
    <AppModal v-model="editVisible" :title="$t('profile.editTitle')" :subtitle="$t('profile.editSubtitle')" width="480">
      <div class="grid grid-cols-2 gap-3">
        <FormField :label="$t('profile.name')" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" :placeholder="$t('profile.namePlaceholder')" />
        </FormField>
        <FormField :label="$t('profile.phone')" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" :placeholder="$t('profile.phonePlaceholder')" />
        </FormField>
        <FormField :label="$t('profile.loginAccount')" span="2" :hint="$t('profile.accountLockedHint')">
          <input class="input w-full font-mono" :value="user?.username" disabled />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="check" @click="submitEdit(close)">{{ $t('common.save') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
