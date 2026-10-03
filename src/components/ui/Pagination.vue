<script setup>
/** 分页器：简约商务风，页码窗口 + 每页条数 */
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  pageSizes: { type: Array, default: () => [10, 20, 50, 100] },
  simple: { type: Boolean, default: false },
})

const emit = defineEmits(['update:page', 'update:pageSize', 'change'])

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, props.page * props.pageSize))

/** 页码窗口：首尾 + 当前附近，中间用省略号 */
const pages = computed(() => {
  const count = pageCount.value
  const cur = props.page
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out = [1]
  const start = Math.max(2, cur - 1)
  const end = Math.min(count - 1, cur + 1)
  if (start > 2) out.push('...')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < count - 1) out.push('...')
  out.push(count)
  return out
})

function go(p) {
  if (p === '...' || p < 1 || p > pageCount.value || p === props.page) return
  emit('update:page', p)
  emit('change', { page: p, pageSize: props.pageSize })
}

function changeSize(e) {
  const size = Number(e.target.value)
  emit('update:pageSize', size)
  emit('update:page', 1)
  emit('change', { page: 1, pageSize: size })
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="text-xs text-text-3">
      {{ $t('common.total') }} <span class="text-text num font-medium">{{ total }}</span> {{ $t('common.items') }}
      <span v-if="total">· {{ $t('common.current') }} {{ from }}-{{ to }}</span>
    </div>

    <div class="flex items-center gap-2">
      <select
        v-if="!simple"
        class="h-[28px] py-0 text-xs rounded-md"
        :value="pageSize"
        @change="changeSize"
      >
        <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} {{ $t('common.perPage') }}</option>
      </select>

      <div class="flex items-center gap-1">
        <button class="pg-btn" :disabled="page <= 1" @click="go(page - 1)">
          <Icon name="chevronLeft" :size="14" />
        </button>
        <button
          v-for="(p, i) in pages"
          :key="`${p}-${i}`"
          class="pg-btn"
          :class="[p === page && 'is-active', p === '...' && 'is-dots']"
          :disabled="p === '...'"
          @click="go(p)"
        >
          {{ p }}
        </button>
        <button class="pg-btn" :disabled="page >= pageCount" @click="go(page + 1)">
          <Icon name="chevronRight" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--c-line);
  background: var(--c-surface);
  color: var(--c-text-2);
  font-size: 12.5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.pg-btn:hover:not(:disabled):not(.is-active) {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.pg-btn.is-active {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.pg-btn.is-dots {
  border-color: transparent;
  background: transparent;
  cursor: default;
}
</style>
