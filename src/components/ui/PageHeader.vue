<script setup>
/** 页面标题栏：标题 + 说明 + 右侧操作区，统一各页面头部高度 */
import Icon from './Icon.vue'

defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** 透明背景（用于收银台等自带布局的页面） */
  bare: { type: Boolean, default: false },
})
</script>

<template>
  <div
    class="flex items-start justify-between gap-4 flex-wrap"
    :class="!bare && 'pb-4 mb-4 border-b border-line'"
  >
    <div class="flex items-start gap-3 min-w-0">
      <div
        v-if="icon"
        class="shrink-0 flex items-center justify-center rounded-lg"
        :style="{ width: '34px', height: '34px', background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }"
      >
        <Icon :name="icon" :size="18" />
      </div>
      <div class="min-w-0">
        <h1 class="text-[17px] font-semibold leading-tight">{{ title }}</h1>
        <p v-if="desc" class="text-xs text-text-3 mt-1">{{ desc }}</p>
      </div>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <slot name="actions" />
    </div>
  </div>
</template>
