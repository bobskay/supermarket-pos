<script setup>
/**
 * 弹窗：Teleport 到 body，ESC 关闭，遮罩点击关闭（可关）
 * 用法：
 *   <AppModal v-model="visible" title="新增商品" width="560px"> ... </AppModal>
 */
import { watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  width: { type: [String, Number], default: 520 },
  maskClosable: { type: Boolean, default: true },
  escClosable: { type: Boolean, default: true },
  /** 只显示内容，不要头部 */
  bare: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'close', 'open'])

const widthValue = typeof props.width === 'number' ? `${props.width}px` : props.width

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function onKey(e) {
  if (e.key === 'Escape' && props.escClosable && props.modelValue) {
    e.stopPropagation()
    close()
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      document.addEventListener('keydown', onKey, true)
      document.body.style.overflow = 'hidden'
      emit('open')
    } else {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey, true)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="fixed inset-0 z-[1000] flex items-start justify-center overflow-auto p-4 sm:p-8">
        <div
          class="absolute inset-0"
          :style="{ background: 'var(--c-mask)', backdropFilter: 'blur(1px)' }"
          @click="maskClosable && close()"
        />
        <div
          class="relative anim-pop w-full my-auto"
          :style="{
            maxWidth: widthValue,
            background: 'var(--c-elevated)',
            border: '1px solid var(--c-line)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-lg)',
          }"
        >
          <div v-if="!bare" class="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
            <div class="min-w-0">
              <h3 class="text-[15px] font-semibold truncate">{{ title }}</h3>
              <p v-if="subtitle" class="text-xs text-text-3 mt-0.5">{{ subtitle }}</p>
            </div>
            <button class="btn btn-ghost btn-sm -mr-2" title="关闭" @click="close">
              <Icon name="close" :size="16" />
            </button>
          </div>

          <div class="px-5 py-4">
            <slot />
          </div>

          <div v-if="$slots.footer" class="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">
            <slot name="footer" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
