<script setup>
/** 全局确认框（配合 useConfirm 使用，挂在 App.vue 里一次即可） */
import { confirmState, resolveConfirm } from '@/composables/useConfirm'
import Icon from './Icon.vue'

const ICON_STYLE = {
  warning: { name: 'alert', color: 'var(--c-warning)', bg: 'var(--c-warning-soft)' },
  danger: { name: 'alert', color: 'var(--c-danger)', bg: 'var(--c-danger-soft)' },
  question: { name: 'question', color: 'var(--c-primary)', bg: 'var(--c-primary-soft)' },
  info: { name: 'info', color: 'var(--c-info)', bg: 'var(--c-info-soft)' },
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="confirmState.visible" class="fixed inset-0 z-[1200] flex items-center justify-center p-4">
        <div class="absolute inset-0" :style="{ background: 'var(--c-mask)' }" @click="resolveConfirm(false)" />
        <div
          class="relative anim-pop w-full max-w-[400px] p-5"
          :style="{
            background: 'var(--c-elevated)',
            border: '1px solid var(--c-line)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-lg)',
          }"
        >
          <div class="flex gap-3">
            <div
              class="shrink-0 flex items-center justify-center rounded-full"
              :style="{
                width: '36px',
                height: '36px',
                background: ICON_STYLE[confirmState.icon]?.bg || 'var(--c-primary-soft)',
                color: ICON_STYLE[confirmState.icon]?.color || 'var(--c-primary)',
              }"
            >
              <Icon :name="ICON_STYLE[confirmState.icon]?.name || 'question'" :size="18" />
            </div>
            <div class="min-w-0 pt-0.5">
              <h3 class="text-[15px] font-semibold">{{ confirmState.title }}</h3>
              <p v-if="confirmState.content" class="text-[13px] text-text-2 mt-1.5 leading-relaxed whitespace-pre-line">
                {{ confirmState.content }}
              </p>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-5">
            <button class="btn btn-default" @click="resolveConfirm(false)">{{ confirmState.cancelText }}</button>
            <button
              class="btn"
              :class="confirmState.danger ? 'btn-danger' : 'btn-primary'"
              @click="resolveConfirm(true)"
            >
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
