<script setup>
/**
 * 顶栏：面包屑 / 皮肤切换 / 待办提醒 / 用户菜单
 * （全局搜索已按需求移除，改由各列表页的筛选栏承担）
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import Icon from '@/components/ui/Icon.vue'
import ThemePicker from './ThemePicker.vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  warningCount: { type: Number, default: 0 },
})
const emit = defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const { user, roleName, avatarText, isManager } = useAuth()

const showUserMenu = ref(false)
const showNotif = ref(false)

const crumb = computed(() => ({
  group: route.meta?.group || '',
  title: route.meta?.title || '',
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
 * 待办提醒：库存类提醒只有店长能处理，收银员看到会点进 403，所以按角色过滤
 */
const notifications = computed(() => {
  const all = [
    {
      icon: 'alert',
      color: 'var(--c-warning)',
      bg: 'var(--c-warning-soft)',
      title: '库存预警',
      desc: `${props.warningCount} 个商品低于安全库存`,
      to: { name: 'stock', query: { stockState: 'low' } },
      managerOnly: true,
    },
    {
      icon: 'truck',
      color: 'var(--c-info)',
      bg: 'var(--c-info-soft)',
      title: '待入库进货单',
      desc: '有 1 张采购单等待确认入库',
      to: { name: 'purchase' },
      managerOnly: true,
    },
    {
      icon: 'receipt',
      color: 'var(--c-danger)',
      bg: 'var(--c-danger-soft)',
      title: '退款待复核',
      desc: '今日有退款记录待店长确认',
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
    <button class="icon-btn" :title="collapsed ? '展开菜单' : '收起菜单'" @click="emit('toggle-sidebar')">
      <Icon :name="collapsed ? 'chevronRight' : 'chevronLeft'" :size="16" />
    </button>

    <!-- 面包屑 -->
    <div class="flex items-center gap-1.5 min-w-0">
      <span v-if="crumb.group" class="text-[13px] text-text-3 hidden sm:inline">{{ crumb.group }}</span>
      <Icon v-if="crumb.group" name="chevronRight" :size="12" class="text-text-3 hidden sm:inline" />
      <span class="text-[14px] font-semibold truncate">{{ crumb.title || '超市收银系统' }}</span>
    </div>

    <div class="flex-1" />

    <!-- 皮肤切换 -->
    <ThemePicker />

    <!-- 通知 -->
    <div class="relative">
      <button
        class="icon-btn"
        title="待办提醒"
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
            <span class="text-[13px] font-semibold">待办提醒</span>
            <span class="badge badge-danger">{{ notifications.length }}</span>
          </div>
          <RouterLink
            v-for="n in notifications"
            :key="n.title"
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
              <span class="block text-[13px] font-medium">{{ n.title }}</span>
              <span class="block text-[11.5px] text-text-3 leading-snug">{{ n.desc }}</span>
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
              <Icon name="user" :size="15" /><span>个人中心</span>
            </RouterLink>
            <RouterLink
              class="menu-item"
              :to="{ name: 'profile', query: { tab: 'password' } }"
              @click="showUserMenu = false"
            >
              <Icon name="lock" :size="15" /><span>修改密码</span>
            </RouterLink>
            <RouterLink v-if="isManager" class="menu-item" :to="{ name: 'settings' }" @click="showUserMenu = false">
              <Icon name="settings" :size="15" /><span>系统设置</span>
            </RouterLink>
          </div>
          <div class="p-1 border-t border-line">
            <button class="menu-item w-full" :style="{ color: 'var(--c-danger)' }" @click="signOut">
              <Icon name="logout" :size="15" /><span>退出登录</span>
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
