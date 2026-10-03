<script setup>
/** 侧滑抽屉：用于筛选条件、订单详情等不想打断主流程的场景 */
import { watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: [String, Number], default: 420 },
  placement: { type: String, default: 'right' }, // right | left
})
const emit = defineEmits(['update:modelValue', 'close'])

const widthValue = typeof props.width === 'number' ? `${props.width}px` : props.width

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function onKey(e) {
  if (e.key === 'Escape' && props.modelValue) close()
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) document.addEventListener('keydown', onKey)
    else document.removeEventListener('keydown', onKey)
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="modelValue" class="fixed inset-0 z-[1000]">
        <div class="absolute inset-0" :style="{ background: 'var(--c-mask)' }" @click="close" />
        <div
          class="absolute top-0 bottom-0 flex flex-col anim-slide"
          :style="{
            [placement]: '0',
            width: widthValue,
            maxWidth: '100vw',
            background: 'var(--c-surface)',
            boxShadow: 'var(--shadow-lg)',
            borderLeft: placement === 'right' ? '1px solid var(--c-line)' : 'none',
            borderRight: placement === 'left' ? '1px solid var(--c-line)' : 'none',
          }"
        >
          <div class="flex items-center justify-between px-4 h-[52px] border-b border-line shrink-0">
            <h3 class="text-[15px] font-semibold">{{ title }}</h3>
            <button class="btn btn-ghost btn-sm" @click="close"><Icon name="close" :size="16" /></button>
          </div>
          <div class="flex-1 overflow-auto p-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="px-4 py-3 border-t border-line flex justify-end gap-2 shrink-0">
            <slot name="footer" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active > div:last-child,
.drawer-leave-active > div:last-child {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
