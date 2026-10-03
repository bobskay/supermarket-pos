<script setup>
/**
 * 通用数据表格
 * ------------------------------------------------------------------
 * 把「列定义 + 数据 + 排序 + loading + 空状态」这套高频逻辑做成一个组件，
 * 各业务页面只需要传 columns 和 list。
 *
 * columns: [{ key, label, width, align, sortable, format(row), class }]
 * 需要自定义单元格时用插槽：#cell-<key>="{ row, index, value }"
 */
import Icon from './Icon.vue'

const props = defineProps({
  columns: { type: Array, required: true },
  list: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  emptyHint: { type: String, default: '' },
  sortBy: { type: String, default: '' },
  sortOrder: { type: String, default: '' },
  /** 行点击高亮（收银台选中商品用） */
  activeKey: { type: [String, Number], default: '' },
  hover: { type: Boolean, default: true },
  maxHeight: { type: String, default: '' },
  zebra: { type: Boolean, default: false },
})

const emit = defineEmits(['sort', 'row-click'])

function cellValue(row, col) {
  if (typeof col.format === 'function') return col.format(row)
  return row[col.key]
}

function onSort(col) {
  if (!col.sortable) return
  const same = props.sortBy === col.key
  emit('sort', { key: col.key, order: same && props.sortOrder === 'asc' ? 'desc' : 'asc' })
}

function alignClass(align) {
  return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
}
</script>

<template>
  <div class="table-wrap" :style="maxHeight ? { maxHeight, overflow: 'auto' } : null">
    <table class="table-flat">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :class="[alignClass(col.align), col.sortable && 'cursor-pointer select-none']"
            :style="col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : null"
            @click="onSort(col)"
          >
            <span class="inline-flex items-center gap-1">
              {{ col.label }}
              <template v-if="col.sortable">
                <Icon
                  :name="sortBy === col.key ? (sortOrder === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort'"
                  :size="13"
                  :class="sortBy === col.key ? 'text-primary' : 'text-text-3 opacity-60'"
                />
              </template>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- loading 骨架 -->
        <template v-if="loading">
          <tr v-for="i in 6" :key="`sk-${i}`">
            <td v-for="col in columns" :key="col.key">
              <div class="skeleton" style="height: 14px" :style="{ width: `${45 + ((i * 13) % 45)}%` }" />
            </td>
          </tr>
        </template>

        <!-- 空状态 -->
        <tr v-else-if="!list.length">
          <td :colspan="columns.length" style="border-bottom: none">
            <div class="empty">
              <Icon name="inbox" :size="30" class="text-text-3 opacity-70" />
              <div class="text-text-2 text-sm">{{ emptyText }}</div>
              <div v-if="emptyHint" class="text-xs text-text-3">{{ emptyHint }}</div>
            </div>
          </td>
        </tr>

        <!-- 数据 -->
        <template v-else>
          <tr
            v-for="(row, index) in list"
            :key="row[rowKey] ?? index"
            :class="[
              hover && 'cursor-default',
              activeKey !== '' && activeKey === row[rowKey] && 'row-active',
            ]"
            @click="emit('row-click', row, index)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              :class="[alignClass(col.align), col.class]"
              :style="col.cellStyle ? col.cellStyle(row) : null"
            >
              <slot :name="`cell-${col.key}`" :row="row" :index="index" :value="cellValue(row, col)">
                {{ cellValue(row, col) }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.row-active td {
  background: var(--c-primary-soft) !important;
}
.row-active td:first-child {
  box-shadow: inset 3px 0 0 var(--c-primary);
}
</style>
