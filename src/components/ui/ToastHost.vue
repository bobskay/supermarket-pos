<script setup>
/** 轻提示渲染容器（挂在 App.vue 一次） */
import { toasts, useToast } from '@/composables/useToast'
import Icon from './Icon.vue'

const { close } = useToast()

const STYLE = {
  success: { color: 'var(--c-success)', bg: 'var(--c-success-soft)', icon: 'success' },
  error: { color: 'var(--c-danger)', bg: 'var(--c-danger-soft)', icon: 'close' },
  warning: { color: 'var(--c-warning)', bg: 'var(--c-warning-soft)', icon: 'alert' },
  info: { color: 'var(--c-info)', bg: 'var(--c-info-soft)', icon: 'info' },
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[1300] flex flex-col items-end gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 anim-toast"
          :style="{
            minWidth: '220px',
            maxWidth: '380px',
            background: 'var(--c-elevated)',
            border: '1px solid var(--c-line)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)',
          }"
        >
          <span
            class="shrink-0 flex items-center justify-center rounded-full mt-[1px]"
            :style="{
              width: '20px',
              height: '20px',
              background: STYLE[t.type]?.bg,
              color: STYLE[t.type]?.color,
            }"
          >
            <Icon :name="STYLE[t.type]?.icon || 'info'" :size="13" :stroke="2.2" />
          </span>
          <div class="flex-1 min-w-0">
            <div v-if="t.title" class="text-[13px] font-medium">{{ t.title }}</div>
            <div class="text-[13px] text-text leading-snug break-words">{{ t.message }}</div>
          </div>
          <button class="text-text-3 hover:text-text shrink-0 mt-[2px]" @click="close(t.id)">
            <Icon name="close" :size="13" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.22s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.toast-move {
  transition: transform 0.2s ease;
}
</style>
