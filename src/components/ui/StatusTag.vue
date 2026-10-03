<script setup>
/**
 * 状态标签：把业务状态码映射到统一徽章配色
 * 用法：<StatusTag :value="row.status" :map="ORDER_STATUS_STYLE" />
 */
import { computed } from 'vue'

const props = defineProps({
  value: { type: [String, Number, Boolean], default: '' },
  /** { 值: { label, class } } */
  map: { type: Object, default: () => ({}) },
  /** 直接指定样式（不走 map） */
  label: { type: String, default: '' },
  tone: { type: String, default: '' }, // badge-success / badge-danger ...
})

const cfg = computed(() => props.map?.[props.value] || null)
const labelText = computed(() => props.label || cfg.value?.label || (props.value === '' ? '-' : String(props.value)))
const cls = computed(() => props.tone || cfg.value?.class || 'badge-muted')
</script>

<template>
  <span class="badge" :class="cls">
    <slot>{{ labelText }}</slot>
  </span>
</template>
