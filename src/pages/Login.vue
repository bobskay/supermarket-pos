<script setup>
/**
 * 登录页
 * - 左侧品牌区（随皮肤变色），右侧登录表单
 * - 两个一键登录按钮：店长 / 收银员，点击自动填充并直接登录，
 *   演示时不用手输密码，也方便快速对比两种角色的可见范围
 */
import { ref, reactive, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'
import ThemePicker from '@/components/layout/ThemePicker.vue'
import LangPicker from '@/components/layout/LangPicker.vue'

const router = useRouter()
const route = useRoute()
const { login, homeRoute } = useAuth()
const { t } = useI18n()
const toast = useToast()

const form = reactive({ username: '', password: '' })
const errors = reactive({ username: '', password: '' })
const loading = ref(false)
const showPwd = ref(false)
const remember = ref(true)
/** 手动输入账号入口默认收起，主界面只留两个角色登录按钮 */
const manual = ref(false)
/** 当前正在一键登录的角色，用于给对应按钮单独的 loading 态 */
const quickLoading = ref('')

const DEMO = [
  { labelKey: 'login.managerLogin', username: 'admin', password: '123456', descKey: 'login.managerHint', icon: 'shield' },
  { labelKey: 'login.cashierLogin', username: 'cashier01', password: '123456', descKey: 'login.cashierHint', icon: 'cart' },
]

const FEATURES = [
  { icon: 'scan', titleKey: 'login.featureScan', descKey: 'login.featureScanDesc' },
  { icon: 'wallet', titleKey: 'login.featurePay', descKey: 'login.featurePayDesc' },
  { icon: 'members', titleKey: 'login.featureMember', descKey: 'login.featureMemberDesc' },
  { icon: 'chartBar', titleKey: 'login.featureReport', descKey: 'login.featureReportDesc' },
]

function fill(acc) {
  form.username = acc.username
  form.password = acc.password
  errors.username = ''
  errors.password = ''
}

function validate() {
  errors.username = form.username.trim() ? '' : t('login.usernamePlaceholder')
  errors.password = form.password ? '' : t('login.passwordPlaceholder')
  return !errors.username && !errors.password
}

async function doLogin(payload, from) {
  loading.value = true
  quickLoading.value = from || ''
  try {
    const u = await login(payload)
    toast.success(t('login.welcome', { name: u.name, role: u.roleName }))
    // 优先级：页面被拦时的回跳地址 > 该角色的默认首页（店长看板 / 收银员收银台）
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect ? redirect : homeRoute(u.role)
    router.replace(target)
    return true
  } catch (e) {
    toast.error(e.message || '登录失败')
    errors.password = e.message || '账号或密码错误'
    return false
  } finally {
    loading.value = false
    quickLoading.value = ''
  }
}

function submit() {
  if (!validate() || loading.value) return
  doLogin({ username: form.username.trim(), password: form.password })
}

/** 一键登录：先回填表单让用户看清账号，再直接提交 */
function quickLogin(acc) {
  if (loading.value) return
  fill(acc)
  doLogin({ username: acc.username, password: acc.password }, acc.username)
}

/** 演示时经常要来回切换账号，回车直接登录更省事 */
function onKeydown(e) {
  if (e.key === 'Enter') submit()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-full flex" :style="{ background: 'var(--c-bg)' }">
    <!-- 登录页也提供换肤与语言切换，方便在没有账号时先挑好 -->
    <div class="fixed top-3 right-4 z-30 flex items-center gap-2.5">
      <LangPicker />
      <ThemePicker variant="full" />
    </div>

    <!-- 品牌区 -->
    <div
      class="hidden lg:flex flex-col justify-between w-[46%] xl:w-[42%] p-10 relative overflow-hidden"
      :style="{ background: 'var(--c-surface)', borderRight: '1px solid var(--c-line)' }"
    >
      <!-- 极简装饰：淡色网格 -->
      <div
        class="absolute inset-0 opacity-[0.35] pointer-events-none"
        :style="{
          backgroundImage:
            'linear-gradient(var(--c-line) 1px, transparent 1px), linear-gradient(90deg, var(--c-line) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage: 'radial-gradient(ellipse at 30% 20%, #000 20%, transparent 72%)',
        }"
      />

      <div class="relative">
        <div class="flex items-center gap-2.5">
          <div
            class="flex items-center justify-center rounded-lg"
            :style="{ width: '36px', height: '36px', background: 'var(--c-primary)', color: '#fff' }"
          >
            <Icon name="storeFront" :size="21" />
          </div>
          <div>
            <div class="text-[15px] font-semibold leading-tight">{{ t('nav.storeName') }}</div>
            <div class="text-[11px] text-text-3 tracking-[0.16em]">SUPERMARKET POS</div>
          </div>
        </div>

        <h1 class="mt-14 text-[30px] leading-tight font-semibold tracking-tight">
          {{ t('login.slogan1') }}<br />
          <span :style="{ color: 'var(--c-primary)' }">{{ t('login.slogan2') }}</span>
        </h1>
        <p class="mt-3.5 text-[13.5px] text-text-2 max-w-[420px] leading-relaxed">
          {{ t('login.intro') }}
        </p>

        <div class="grid grid-cols-2 gap-2.5 mt-9 max-w-[440px]">
          <div
            v-for="f in FEATURES"
            :key="f.titleKey"
            class="p-3 rounded-lg"
            :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
          >
            <Icon :name="f.icon" :size="17" :style="{ color: 'var(--c-primary)' }" />
            <div class="text-[13px] font-medium mt-2">{{ t(f.titleKey) }}</div>
            <div class="text-[11.5px] text-text-3 leading-snug mt-0.5">{{ t(f.descKey) }}</div>
          </div>
        </div>
      </div>

      <div class="relative flex items-center gap-6 text-[11.5px] text-text-3">
        <span class="flex items-center gap-1.5"><Icon name="shieldCheck" :size="13" />{{ t('login.footPermission') }}</span>
        <span class="flex items-center gap-1.5"><Icon name="history" :size="13" />{{ t('login.footLog') }}</span>
        <span class="flex items-center gap-1.5"><Icon name="package" :size="13" />{{ t('login.footStock') }}</span>
      </div>
    </div>

    <!-- 表单区 -->
    <div class="flex-1 flex items-center justify-center p-5 sm:p-8">
      <div class="w-full max-w-[380px]">
        <div class="lg:hidden flex items-center gap-2.5 mb-8">
          <div
            class="flex items-center justify-center rounded-lg"
            :style="{ width: '34px', height: '34px', background: 'var(--c-primary)', color: '#fff' }"
          >
            <Icon name="storeFront" :size="19" />
          </div>
          <div class="text-[15px] font-semibold">{{ t('nav.brand') }}</div>
        </div>

        <h2 class="text-[22px] font-semibold tracking-tight">{{ t('login.title') }}</h2>
        <p class="text-[13px] text-text-3 mt-1.5">{{ t('login.subtitle') }}</p>

        <!-- 两个角色登录按钮：点击直接带上对应账号密码登录 -->
        <div class="grid grid-cols-2 gap-3 mt-7">
          <AppButton
            v-for="d in DEMO"
            :key="d.username"
            variant="primary"
            size="lg"
            block
            :icon="d.icon"
            :loading="quickLoading === d.username"
            :disabled="loading && quickLoading !== d.username"
            @click="quickLogin(d)"
          >
            {{ t(d.labelKey) }}
          </AppButton>
        </div>
        <div class="flex items-center justify-between mt-2.5 text-[11px] text-text-3">
          <span>{{ t('login.managerHint') }}</span>
          <span>{{ t('login.cashierHint') }}</span>
        </div>

        <!-- 手动输入账号：默认收起，需要时点开 -->
        <div class="mt-7 pt-5 border-t border-line">
          <button
            type="button"
            class="flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-primary transition-colors"
            @click="manual = !manual"
          >
            <Icon :name="manual ? 'chevronUp' : 'chevronDown'" :size="13" />
            {{ t('login.otherAccount') }}
          </button>

          <form v-if="manual" class="mt-4 space-y-4 anim-slide" @submit.prevent="submit">
            <div class="field">
              <label class="field-label" for="username">{{ t('login.username') }}</label>
              <div class="relative">
                <Icon name="user" :size="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
                <input
                  id="username"
                  v-model="form.username"
                  class="input w-full pl-8"
                  :class="errors.username && 'is-error'"
                  :placeholder="t('login.usernamePlaceholder')"
                  autocomplete="username"
                />
              </div>
              <div v-if="errors.username" class="field-error">{{ errors.username }}</div>
            </div>

            <div class="field">
              <label class="field-label" for="password">{{ t('login.password') }}</label>
              <div class="relative">
                <Icon name="lock" :size="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
                <input
                  id="password"
                  v-model="form.password"
                  :type="showPwd ? 'text' : 'password'"
                  class="input w-full pl-8 pr-9"
                  :class="errors.password && 'is-error'"
                  :placeholder="t('login.passwordPlaceholder')"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
                  :title="showPwd ? t('login.password') : t('login.password')"
                  @click="showPwd = !showPwd"
                >
                  <Icon name="eye" :size="15" />
                </button>
              </div>
              <div v-if="errors.password" class="field-error">{{ errors.password }}</div>
            </div>

            <div class="flex items-center justify-between">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input v-model="remember" type="checkbox" class="w-[15px] h-[15px] accent-[var(--c-primary)]" />
                <span class="text-[12.5px] text-text-2">{{ t('login.remember') }}</span>
              </label>
              <button
                type="button"
                class="text-[12.5px] text-text-3 hover:text-primary"
                @click="toast.info(t('login.forgotTip'))"
              >
                {{ t('login.forgot') }}
              </button>
            </div>

            <AppButton
              variant="soft"
              size="lg"
              block
              type="submit"
              :loading="loading && !quickLoading"
              icon-right="arrowRight"
            >
              {{ loading && !quickLoading ? t('login.loggingIn') : t('login.login') }}
            </AppButton>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
