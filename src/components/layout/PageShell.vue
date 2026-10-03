<script setup>
/**
 * 标准页面骨架：统一页面内边距与最大宽度，页面里只写业务内容。
 * 收银台等需要满屏布局的页面直接用 <PageShell full> 或自定义布局。
 */
defineProps({
  /** 满宽（不限制最大宽度） */
  fluid: { type: Boolean, default: true },
  /** 去掉内边距（自带布局的页面用） */
  bare: { type: Boolean, default: false },
  /** 内容最大宽度，默认 1600px */
  maxWidth: { type: String, default: '1600px' },
})
</script>

<template>
  <div class="h-full overflow-y-auto scroll-thin" :style="{ background: 'var(--c-bg)' }">
    <div
      class="mx-auto"
      :class="bare ? '' : 'px-3 sm:px-5 py-4'"
      :style="{ maxWidth: fluid ? maxWidth : '1280px' }"
    >
      <slot />
    </div>
  </div>
</template>
