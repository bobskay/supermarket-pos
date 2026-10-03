<script setup>
/**
 * 应用外壳：登录页以外的所有页面共用（侧栏 + 顶栏 + 内容区）
 */
import { ref, onMounted, computed } from 'vue'
import SideNav from './SideNav.vue'
import TopBar from './TopBar.vue'
import { stockApi } from '@/api'

const collapsed = ref(localStorage.getItem('pos.navCollapsed') === '1')
const warningCount = ref(0)

function toggleSidebar() {
  collapsed.value = !collapsed.value
  localStorage.setItem('pos.navCollapsed', collapsed.value ? '1' : '0')
}

onMounted(async () => {
  try {
    const res = await stockApi.summary()
    warningCount.value = (res.data.lowCount || 0) + (res.data.emptyCount || 0)
  } catch {
    warningCount.value = 0
  }
})

const contentKey = computed(() => 'shell')
</script>

<template>
  <div class="h-full flex overflow-hidden" :style="{ background: 'var(--c-bg)' }">
    <SideNav :collapsed="collapsed" />
    <div class="flex-1 min-w-0 flex flex-col">
      <TopBar :collapsed="collapsed" :warning-count="warningCount" @toggle-sidebar="toggleSidebar" />
      <main class="flex-1 min-h-0">
        <slot />
      </main>
    </div>
  </div>
</template>
