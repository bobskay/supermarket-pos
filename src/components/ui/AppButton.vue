<script setup>
/**
 * 按钮：统一 loading / disabled / 图标，避免每个页面重复写一个 34px 高的按钮
 */
import Icon from './Icon.vue'

const props = defineProps({
  variant: { type: String, default: 'default' }, // primary | default | soft | ghost | danger | danger-soft | success
  size: { type: String, default: 'md' }, // sm | md | lg
  icon: { type: String, default: '' },
  iconRight: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
})

const emit = defineEmits(['click'])

const sizeClass = { sm: 'btn-sm', md: '', lg: 'btn-lg' }
const iconSize = { sm: 14, md: 15, lg: 17 }

function onClick(e) {
  if (props.loading || props.disabled) return
  emit('click', e)
}
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn-${variant}`, sizeClass[size], block && 'btn-block']"
    :disabled="disabled || loading"
    @click="onClick"
  >
    <span v-if="loading" class="spin">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <path d="M21 12a9 9 0 1 1-6.2-8.6" />
      </svg>
    </span>
    <Icon v-else-if="icon" :name="icon" :size="iconSize[size]" />
    <slot />
    <Icon v-if="iconRight && !loading" :name="iconRight" :size="iconSize[size]" />
  </button>
</template>

<style scoped>
.spin {
  display: inline-flex;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
