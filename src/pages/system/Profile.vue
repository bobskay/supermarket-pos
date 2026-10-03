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

const ROLE_CLASS = { manager: 'badge-primary', cashier: 'badge-info' }
const PHONE_RE = /^1\d{10}$/

const TABS = [
  { key: 'basic', label: '基本信息', icon: 'user' },
  { key: 'password', label: '修改密码', icon: 'lock' },
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
const infoRows = computed(() => {
  const u = user.value || {}
  return [
    { label: '姓名', value: u.name || '—' },
    { label: '登录账号', value: u.username || '—', mono: true },
    { label: '工号', value: u.employeeNo || '—', mono: true },
    { label: '角色', value: roleName.value },
    { label: '手机号', value: u.phone || '—', mono: true },
    { label: '最后登录时间', value: u.lastLoginAt || '—' },
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
  editErr.name = editForm.name.trim() ? '' : '请输入姓名'
  editErr.phone = PHONE_RE.test(editForm.phone.trim()) ? '' : '请输入 11 位有效手机号'
  if (editErr.name || editErr.phone) return

  const patch = { name: editForm.name.trim(), phone: editForm.phone.trim() }
  const res = await userApi.update(user.value.id, patch)
  // 同步登录态，顶栏用户名与头像会立刻更新
  patchUser(patch)
  toast.ok(res.message || '保存成功')
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
  if (!v) return { level: 0, text: '至少 6 位，建议字母 + 数字组合', color: 'var(--c-text-3)' }
  let score = 0
  if (v.length >= 6) score += 1
  if (v.length >= 10) score += 1
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) score += 1
  if (/[^A-Za-z0-9]/.test(v)) score += 1
  const map = [
    { text: '强度偏弱，建议加长或混合字母数字', color: 'var(--c-danger)' },
    { text: '强度一般，可加入字母或数字', color: 'var(--c-warning)' },
    { text: '强度良好', color: 'var(--c-success)' },
    { text: '强度很高', color: 'var(--c-success)' },
  ]
  return { level: score, ...(map[Math.min(score, 3)] || map[0]) }
})

function validatePwd() {
  pwdErr.oldPassword = pwdForm.oldPassword ? '' : '请输入原密码'
  pwdErr.newPassword = !pwdForm.newPassword
    ? '请输入新密码'
    : pwdForm.newPassword.length < 6
      ? '新密码至少 6 位'
      : pwdForm.newPassword === pwdForm.oldPassword
        ? '新密码不能与原密码相同'
        : ''
  pwdErr.confirmPassword = !pwdForm.confirmPassword
    ? '请再次输入新密码'
    : pwdForm.confirmPassword !== pwdForm.newPassword
      ? '两次输入的新密码不一致'
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
    toast.ok(res.message || '密码修改成功，请牢记新密码')
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
  { label: '本人订单数', value: thousands(perf.orders), unit: '单', icon: 'receipt', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)' },
  { label: '本人销售金额', value: money(perf.amount), icon: 'money', color: 'var(--c-accent)', bg: 'var(--c-accent-soft)' },
  {
    label: '平均客单价',
    value: money(perf.orders ? calc(perf.amount / perf.orders) : 0),
    icon: 'target',
    color: 'var(--c-purple)',
    bg: 'var(--c-purple-soft)',
  },
  { label: '退款订单数', value: thousands(perf.refund), unit: '单', icon: 'undo', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)' },
])
</script>

<template>
  <PageShell>
    <PageHeader
      title="个人中心"
      desc="查看本人账号资料、修改登录密码，并自查本月收银业绩"
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
              <span class="badge" :class="ROLE_CLASS[user?.role] || 'badge-muted'">{{ roleName }}</span>
              <span class="badge badge-muted font-mono">{{ user?.employeeNo }}</span>
            </div>
          </div>

          <div class="divider my-4" />

          <div class="space-y-2.5">
            <div v-for="r in infoRows" :key="r.label" class="flex items-center justify-between gap-3 text-[13px]">
              <span class="text-text-2 shrink-0">{{ r.label }}</span>
              <span class="truncate text-right" :class="r.mono && 'font-mono'">{{ r.value }}</span>
            </div>
          </div>

          <div class="divider my-4" />

          <AppButton block icon="edit" @click="setTab('basic'); openEdit()">修改我的资料</AppButton>
        </div>

        <div class="card card-pad">
          <div class="flex items-start gap-2 text-[12px] text-text-3 leading-relaxed">
            <Icon name="info" :size="15" class="mt-0.5 shrink-0" />
            <div>
              账号由店长创建与停用；如果忘记密码，请联系店长在「用户管理 → 重置密码」中重置为初始密码 123456。
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
                {{ tb.label }}
              </button>
            </div>
            <span class="text-[11.5px] text-text-3">登录账号 {{ user?.username }} 不可修改</span>
          </div>

          <!-- 基本信息 -->
          <div v-if="activeTab === 'basic'" class="p-4">
            <div class="text-[12.5px] text-text-3 mb-3">
              以下资料用于小票署名与操作日志留痕，姓名与手机号可自行维护。
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-3">
              <div v-for="r in infoRows" :key="r.label" class="min-w-0">
                <div class="text-[11.5px] text-text-3">{{ r.label }}</div>
                <div class="mt-1 text-[13.5px] truncate" :class="r.mono && 'font-mono'">
                  <span v-if="r.label === '角色'" class="badge" :class="ROLE_CLASS[user?.role] || 'badge-muted'">
                    {{ r.value }}
                  </span>
                  <span v-else>{{ r.value }}</span>
                </div>
              </div>
            </div>

            <div class="divider my-4" />
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="text-[12px] text-text-3">修改姓名后，操作日志中新的记录将显示为新姓名，历史记录不变。</div>
              <AppButton variant="primary" icon="edit" @click="openEdit">编辑资料</AppButton>
            </div>
          </div>

          <!-- 修改密码 -->
          <div v-else class="p-4">
            <div class="text-[12.5px] text-text-3 mb-3">
              为了收银数据安全，建议使用字母 + 数字组合，并定期更换密码。
            </div>

            <form class="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-[760px]" @submit.prevent="submitPwd">
              <FormField label="原密码" required :error="pwdErr.oldPassword" class="lg:col-span-2">
                <div class="relative">
                  <input
                    v-model="pwdForm.oldPassword"
                    :type="showOld ? 'text' : 'password'"
                    class="input w-full pr-9"
                    placeholder="请输入当前登录密码"
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showOld ? '隐藏密码' : '显示密码'"
                    @click="showOld = !showOld"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <FormField label="新密码" required :error="pwdErr.newPassword">
                <div class="relative">
                  <input
                    v-model="pwdForm.newPassword"
                    :type="showNew ? 'text' : 'password'"
                    class="input w-full pr-9"
                    placeholder="至少 6 位"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showNew ? '隐藏密码' : '显示密码'"
                    @click="showNew = !showNew"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <FormField label="确认新密码" required :error="pwdErr.confirmPassword">
                <div class="relative">
                  <input
                    v-model="pwdForm.confirmPassword"
                    :type="showConfirm ? 'text' : 'password'"
                    class="input w-full pr-9"
                    placeholder="请再次输入新密码"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                    :title="showConfirm ? '隐藏密码' : '显示密码'"
                    @click="showConfirm = !showConfirm"
                  >
                    <Icon name="eye" :size="15" />
                  </button>
                </div>
              </FormField>

              <div class="lg:col-span-2 flex items-center gap-2 text-[12px]">
                <span class="text-text-3">密码强度：</span>
                <span :style="{ color: pwdStrength.color }">{{ pwdStrength.text }}</span>
              </div>

              <div class="lg:col-span-2 flex items-center gap-2">
                <AppButton variant="primary" icon="save" type="submit" :loading="pwdSaving">确认修改</AppButton>
                <AppButton
                  icon="refresh"
                  @click="Object.assign(pwdForm, { oldPassword: '', newPassword: '', confirmPassword: '' })"
                >
                  清空
                </AppButton>
              </div>
            </form>
          </div>
        </div>

        <!-- 我的本月表现 -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">我的本月表现</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">
                统计口径：操作人 = {{ user?.name }} · 统计月份 {{ perf.month || '—' }}
              </div>
            </div>
            <AppButton size="sm" icon="refresh" :loading="perfLoading" @click="loadPerf">刷新</AppButton>
          </div>

          <div class="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <template v-if="perfLoading">
              <div v-for="i in 4" :key="i" class="kpi">
                <div class="skeleton" style="height: 13px; width: 55%" />
                <div class="skeleton" style="height: 24px; width: 70%" />
              </div>
            </template>
            <div v-for="k in perfKpis" v-else :key="k.label" class="kpi">
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
            数据来自 <code class="font-mono text-text-2">GET /api/orders?operatorId={{ user?.id }}</code>，
            收银员只能看到本人订单，店长可查看全店；演示数据为历史月份，本月无数据时会显示最近有单的月份。
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑资料 -->
    <AppModal v-model="editVisible" title="修改我的资料" subtitle="姓名与手机号将同步到顶栏与操作日志" width="480">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="姓名" required :error="editErr.name">
          <input v-model="editForm.name" class="input w-full" placeholder="请输入姓名" />
        </FormField>
        <FormField label="手机号" required :error="editErr.phone">
          <input v-model="editForm.phone" class="input w-full" maxlength="11" placeholder="11 位手机号" />
        </FormField>
        <FormField label="登录账号" span="2" hint="账号由店长维护，不可自行修改">
          <input class="input w-full font-mono" :value="user?.username" disabled />
        </FormField>
      </div>
      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="primary" icon="check" @click="submitEdit(close)">保存</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
