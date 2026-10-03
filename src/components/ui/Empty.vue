<script setup>
/** 空状态：列表 / 图表 / 详情通用 */
import Icon from './Icon.vue'

defineProps({
  icon: { type: String, default: 'inbox' },
  title: { type: String, default: '暂无数据' },
  desc: { type: String, default: '' },
  size: { type: Number, default: 76 },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center" :style="{ padding: `${size / 2}px 16px` }">
    <div
      class="flex items-center justify-center rounded-full mb-3"
      :style="{ width: `${size}px`, height: `${size}px`, background: 'var(--c-surface-3)' }"
    >
      <Icon :name="icon" :size="size * 0.36" class="text-text-3" />
    </div>
    <div class="text-text-2 text-sm font-medium">{{ title }}</div>
    <div v-if="desc" class="text-text-3 text-xs mt-1 max-w-[320px] leading-relaxed">{{ desc }}</div>
    <div class="mt-3">
      <slot />
    </div>
  </div>
</template>
