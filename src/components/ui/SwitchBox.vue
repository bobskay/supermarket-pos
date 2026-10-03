<script setup>
/** 开关（v-model），带文字标签 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
  emit('change', !props.modelValue)
}
</script>

<template>
  <div class="flex items-center gap-3" :class="disabled && 'opacity-60'">
    <button
      type="button"
      class="switch"
      :class="modelValue && 'is-on'"
      :disabled="disabled"
      role="switch"
      :aria-checked="modelValue"
      @click="toggle"
    />
    <div v-if="label || hint" class="min-w-0">
      <div class="text-[13px]">{{ label }}</div>
      <div v-if="hint" class="text-xs text-text-3">{{ hint }}</div>
    </div>
  </div>
</template>
