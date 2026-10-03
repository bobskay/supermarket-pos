<script setup>
/**
 * 搜索框：内置防抖 + 清空按钮 + 回车触发（扫码枪输入会以回车结尾，正好复用）
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜索…' },
  debounce: { type: Number, default: 300 },
  width: { type: String, default: '220px' },
  autofocus: { type: Boolean, default: false },
  icon: { type: String, default: 'search' },
  clearable: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue', 'search', 'enter', 'clear'])

const inner = ref(props.modelValue)
let timer = null

watch(
  () => props.modelValue,
  (v) => {
    if (v !== inner.value) inner.value = v
  },
)

function onInput(e) {
  inner.value = e.target.value
  emit('update:modelValue', inner.value)
  clearTimeout(timer)
  timer = setTimeout(() => emit('search', inner.value), props.debounce)
}

function onEnter() {
  clearTimeout(timer)
  emit('search', inner.value)
  emit('enter', inner.value)
}

function clear() {
  inner.value = ''
  emit('update:modelValue', '')
  emit('search', '')
  emit('clear')
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="relative" :style="{ width }">
    <Icon
      :name="icon"
      :size="15"
      class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
    />
    <input
      :value="inner"
      class="input w-full pl-8"
      :class="clearable && inner ? 'pr-8' : ''"
      :placeholder="placeholder"
      :autofocus="autofocus"
      @input="onInput"
      @keyup.enter="onEnter"
    />
    <button
      v-if="clearable && inner"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
      title="清空"
      @click="clear"
    >
      <Icon name="close" :size="14" />
    </button>
  </div>
</template>
