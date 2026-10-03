<script setup>
/**
 * 根组件：根据路由决定是否套外壳，并挂载全局悬浮层（提示 / 确认 / 进度条 / 网络状态）
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ProgressBar from '@/components/layout/ProgressBar.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const { isLogin } = useAuth()

/** 登录页 / 403 等空白页不套外壳 */
const useShell = computed(() => !route.meta?.blank && isLogin.value)
</script>

<template>
  <ProgressBar />

  <AppShell v-if="useShell">
    <RouterView v-slot="{ Component }">
      <component :is="Component" />
    </RouterView>
  </AppShell>

  <RouterView v-else />

  <ToastHost />
  <ConfirmDialog />
</template>
