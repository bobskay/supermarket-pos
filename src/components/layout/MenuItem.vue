<script setup>
/**
 * 侧栏菜单项
 * 抽成独立组件的原因：菜单同时存在「平铺的一级项」和「分组下的子项」两种情况，
 * 样式与选中逻辑完全一致，抽出来才能真正保证两处不会走样。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  item: { type: Object, required: true },
  /** 侧栏是否处于折叠态（只显示图标） */
  collapsed: { type: Boolean, default: false },
  /** 平铺的一级项：去掉分组子项的缩进感，图标也随之放大一档 */
  flat: { type: Boolean, default: false },
})
const emit = defineEmits(['navigate'])

const route = useRoute()
const { t } = useI18n()

/** 菜单标题走后端字典，缺键时回退到 menu 里声明的中文 title */
const label = computed(() => (props.item.i18nKey ? t(props.item.i18nKey, undefined, props.item.title) : props.item.title))

/** 详情页高亮到它所属的列表页 */
const activeName = computed(() => {
  const n = route.name
  if (n === 'order-detail') return 'orders'
  if (n === 'member-detail' || n === 'member-create') return 'members'
  if (n === 'product-create' || n === 'product-edit') return 'products'
  return n
})

const active = computed(() => activeName.value === props.item.name)
</script>

<template>
  <RouterLink
    :to="{ name: item.name }"
    class="group relative flex items-center gap-2.5 h-[34px] rounded-md transition-colors"
    :style="{
      padding: collapsed ? '0' : '0 9px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      background: active ? 'var(--c-sidebar-active-bg)' : 'transparent',
      color: active ? 'var(--c-sidebar-active)' : 'var(--c-sidebar-text)',
      fontWeight: active ? 600 : 400,
    }"
    :title="collapsed ? label : ''"
    @click="emit('navigate')"
  >
    <span
      v-if="active && !collapsed"
      class="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
      :style="{ width: '2.5px', height: '16px', background: 'var(--c-primary)' }"
    />
    <Icon :name="item.icon" :size="flat ? 16 : 15" />
    <span v-if="!collapsed" class="text-[13.5px] flex-1 truncate">{{ label }}</span>
    <span
      v-if="!collapsed && item.badge === 'hot'"
      class="text-[10px] px-1 rounded"
      :style="{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }"
      >{{ t('nav.hourly') }}</span
    >
  </RouterLink>
</template>
