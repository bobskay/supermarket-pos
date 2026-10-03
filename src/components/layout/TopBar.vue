<script setup>
/**
 * 顶栏：面包屑 / 皮肤切换 / 待办提醒 / 用户菜单
 * （全局搜索已按需求移除，改由各列表页的筛选栏承担）
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import ThemePicker from './ThemePicker.vue'
import LangPicker from './LangPicker.vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  warningCount: { type: Number, default: 0 },
})
const emit = defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const { user, roleName, avatarText, isManager } = useAuth()
const { t } = useI18n()

/** 路由 name → 文案 key（未列出的页面沿用 meta.title，保证不会显示空白） */
const TITLE_KEY = {
  dashboard: 'nav.dashboard',
  pos: 'nav.pos',
  orders: 'nav.orders',
  'order-detail': 'order.detailTitle',
  members: 'nav.members',
  'member-detail': 'member.detailTitle',
  'member-create': 'member.newMember',
  products: 'nav.products',
  'product-create': 'product.newProduct',
  'product-edit': 'product.editProduct',
  categories: 'nav.categories',
  stock: 'nav.stock',
  'stock-logs': 'nav.stockLogs',
  'stock-check': 'nav.stockCheck',
  purchase: 'nav.purchase',
  reports: 'nav.reports',
  users: 'nav.users',
  logs: 'nav.logs',
  settings: 'nav.settings',
  profile: 'nav.profile',
  forbidden: 'common.noPermission',
  'not-found': 'notFound.title',
}

const showUserMenu = ref(false)
const showNotif = ref(false)

const crumb = computed(() => ({
  title: TITLE_KEY[route.name] ? t(TITLE_KEY[route.name]) : route.meta?.title || '',
}))

function onKeydown(e) {
  if (e.key === 'Escape') {
    showUserMenu.value = false
    showNotif.value = false
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

async function signOut() {
  showUserMenu.value = false
  await useAuth().logout()
  router.replace({ name: 'login' })
}

/**
 * 待办提醒：库存类提醒只有店长能处理，收银员看到会点进 403，所以按角色过滤。
 * 文案用 t() 在模板里取，避免把 t 的调用提前固化。
 */
const notifications = computed(() => {
  const all = [
    {
      icon: 'alert',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
      titleKey: 'topbar.stockWarning',
      descKey: 'topbar.stockWarningDesc',
      descParams: { n: props.warningCount },
      to: { name: 'stock', query: { stockState: 'low' } },
      managerOnly: true,
    },
    {
      icon: 'truck',
      color: 'var(--c-info)',
      bg: 'var(--c-info-soft)',
      titleKey: 'topbar.pendingPurchase',
      descKey: 'topbar.pendingPurchaseDesc',
      to: { name: 'purchase' },
      managerOnly: true,
    },
    {
      icon: 'receipt',
      color: 'var(--c-danger)',
      bg: 'var(--c-danger-soft)',
      titleKey: 'topbar.refundTodo',
      descKey: 'topbar.refundTodoDesc',
      to: { name: 'orders', query: { status: 'refunded' } },
      managerOnly: false,
    },
  ]
  return isManager.value ? all : all.filter((n) => !n.managerOnly)
})
</script>

<template>
  <header
    class="h-[52px] shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b border-line"
    :style="{ background: 'var(--c-surface)' }"
  >
    <!-- 折叠 -->
    <button
      class="icon-btn"
      :title="collapsed ? t('topbar.expand') : t('topbar.collapse')"
      @click="emit('toggle-sidebar')"
    >
      <Icon :name="collapsed ? 'chevronRight' : 'chevronLeft'" :size="16" />
    </button>

    <!-- 面包屑 -->
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="text-[14px] font-semibold truncate">{{ crumb.title || t('nav.brand') }}</span>
    </div>

    <div class="flex-1" />

    <!-- 语言切换 -->
    <LangPicker />

    <!-- 皮肤切换 -->
    <ThemePicker />

    <!-- 通知 -->
    <div class="relative">
      <button
        class="icon-btn"
        :title="t('topbar.notify')"
        @click="showNotif = !showNotif; showUserMenu = false"
      >
        <Icon name="bell" :size="17" />
        <span
          v-if="warningCount"
          class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          :style="{ background: 'var(--c-danger)' }"
        />
      </button>
      <Transition name="fade">
        <div v-if="showNotif" class="dropdown right-0 w-[290px] p-0">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-line">
            <span class="text-[13px] font-semibold">{{ t('topbar.notifications') }}</span>
            <span class="badge badge-danger">{{ notifications.length }}</span>
          </div>
          <RouterLink
            v-for="n in notifications"
            :key="n.titleKey"
            :to="n.to"
            class="flex items-start gap-2.5 px-3 py-2.5 hover:bg-hover transition-colors"
            @click="showNotif = false"
          >
            <span
              class="shrink-0 flex items-center justify-center rounded-md mt-0.5"
              :style="{ width: '26px', height: '26px', background: n.bg, color: n.color }"
            >
              <Icon :name="n.icon" :size="14" />
            </span>
            <span class="min-w-0">
              <span class="block text-[13px] font-medium">{{ t(n.titleKey) }}</span>
              <span class="block text-[11.5px] text-text-3 leading-snug">
                {{ t(n.descKey, n.descParams) }}
              </span>
            </span>
          </RouterLink>
        </div>
      </Transition>
    </div>

    <!-- 用户 -->
    <div class="relative">
      <button
        class="flex items-center gap-2 h-[32px] pl-1 pr-2 rounded-md transition-colors"
        :style="{ background: showUserMenu ? 'var(--c-surface-2)' : 'transparent' }"
        @click="showUserMenu = !showUserMenu; showNotif = false"
      >
        <span
          class="flex items-center justify-center rounded-md text-[13px] font-medium shrink-0"
          :style="{ width: '26px', height: '26px', background: 'var(--c-primary)', color: '#fff' }"
        >
          {{ avatarText }}
        </span>
        <span class="text-left hidden sm:block">
          <span class="block text-[12.5px] font-medium leading-tight">{{ user?.name }}</span>
          <span class="block text-[10.5px] text-text-3 leading-tight">{{ roleName }}</span>
        </span>
        <Icon name="chevronDown" :size="13" class="text-text-3" />
      </button>

      <Transition name="fade">
        <div v-if="showUserMenu" class="dropdown right-0 w-[214px] p-0">
          <div class="px-3 py-2.5 border-b border-line">
            <div class="text-[13px] font-medium">{{ user?.name }}</div>
            <div class="text-[11.5px] text-text-3">{{ user?.username }} · {{ roleName }}</div>
          </div>
          <div class="p-1">
            <RouterLink class="menu-item" :to="{ name: 'profile' }" @click="showUserMenu = false">
              <Icon name="user" :size="15" /><span>{{ t('topbar.account') }}</span>
            </RouterLink>
            <RouterLink
              class="menu-item"
              :to="{ name: 'profile', query: { tab: 'password' } }"
              @click="showUserMenu = false"
            >
              <Icon name="lock" :size="15" /><span>{{ t('topbar.changePassword') }}</span>
            </RouterLink>
            <RouterLink v-if="isManager" class="menu-item" :to="{ name: 'settings' }" @click="showUserMenu = false">
              <Icon name="settings" :size="15" /><span>{{ t('topbar.systemSettings') }}</span>
            </RouterLink>
          </div>
          <div class="p-1 border-t border-line">
            <button class="menu-item w-full" :style="{ color: 'var(--c-danger)' }" @click="signOut">
              <Icon name="logout" :size="15" /><span>{{ t('topbar.logout') }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--c-text-2);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.icon-btn:hover {
  background: var(--c-hover);
  color: var(--c-text);
}
.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 60;
  padding: 4px;
  background: var(--c-elevated);
  border: 1px solid var(--c-line);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  animation: pop-in 0.14s ease both;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--c-text-2);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.menu-item:hover {
  background: var(--c-hover);
  color: var(--c-text);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.14s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
