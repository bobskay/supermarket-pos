<script setup>
/**
 * 侧边导航
 * ------------------------------------------------------------------
 * 菜单按 meta.group 自动分组，按 useAuth().hasPermission 过滤，
 * 因此收银员账号登录后只会看到「收银 / 会员」两组，店长看到全部。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import MenuItem from './MenuItem.vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
})
const emit = defineEmits(['navigate'])

const route = useRoute()
const { hasPermission, isManager, user } = useAuth()
const { t } = useI18n()

/** 菜单声明：key = 路由 name；i18nKey 用于多语言，title 作为中文兜底 */
const MENUS = [
  {
    group: '概览',
    i18nKey: 'nav.groupOverview',
    icon: 'grid',
    items: [{ name: 'dashboard', i18nKey: 'nav.dashboard', title: '经营看板', icon: 'dashboard' }],
  },
  {
    group: '收银',
    i18nKey: 'nav.groupCashier',
    icon: 'cart',
    items: [
      { name: 'pos', i18nKey: 'nav.pos', title: '收银开单', icon: 'scan', badge: 'hot' },
      { name: 'orders', i18nKey: 'nav.orders', title: '订单管理', icon: 'receipt' },
    ],
  },
  {
    group: '会员',
    i18nKey: 'nav.groupMember',
    icon: 'members',
    items: [{ name: 'members', i18nKey: 'nav.members', title: '会员管理', icon: 'members' }],
  },
  {
    group: '商品',
    i18nKey: 'nav.groupProduct',
    icon: 'product',
    items: [
      { name: 'products', i18nKey: 'nav.products', title: '商品档案', icon: 'product' },
      { name: 'categories', i18nKey: 'nav.categories', title: '商品分类', icon: 'tag' },
    ],
  },
  {
    group: '库存',
    i18nKey: 'nav.groupStock',
    icon: 'stock',
    items: [
      { name: 'stock', i18nKey: 'nav.stock', title: '实时库存', icon: 'stock' },
      { name: 'purchase', i18nKey: 'nav.purchase', title: '采购入库', icon: 'truck' },
      { name: 'stock-logs', i18nKey: 'nav.stockLogs', title: '库存流水', icon: 'history' },
      { name: 'stock-check', i18nKey: 'nav.stockCheck', title: '库存盘点', icon: 'ruler' },
    ],
  },
  {
    group: '数据',
    i18nKey: 'nav.groupData',
    icon: 'chart',
    items: [{ name: 'reports', i18nKey: 'nav.reports', title: '报表统计', icon: 'chartBar' }],
  },
  {
    group: '系统',
    i18nKey: 'nav.groupSystem',
    icon: 'settings',
    items: [
      { name: 'users', i18nKey: 'nav.users', title: '用户管理', icon: 'users' },
      { name: 'logs', i18nKey: 'nav.logs', title: '操作日志', icon: 'log' },
      { name: 'settings', i18nKey: 'nav.settings', title: '系统设置', icon: 'settings' },
    ],
  },
]

/**
 * 菜单过滤：除了按路由权限过滤，整组「店长专属」的模块再显式挡一层。
 * 原因是库存 / 商品这类模块收银员连入口都不该看到（点进去只会得到 403），
 * 显式判断比依赖单条路由的权限表更不容易出错。
 */
const MANAGER_ONLY_GROUPS = new Set(['商品', '库存'])

/**
 * 呈现规则：只有「多个子项」的分组才保留可折叠的分组标题；
 * 单子项分组（概览/会员/数据）与扁平分组（收银）都直接平铺为一级菜单项，
 * 避免为了一个功能多一层无意义的折叠。
 */
const FLAT_GROUPS = new Set(['收银'])

const menus = computed(() =>
  MENUS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (MANAGER_ONLY_GROUPS.has(g.group) && !isManager.value) return false
      return hasPermission(i.name)
    }),
  })).filter((g) => g.items.length),
)

/** 该组是否平铺展示（不显示分组标题） */
function isFlat(g) {
  return g.items.length === 1 || FLAT_GROUPS.has(g.group)
}

const openGroups = ref(new Set(MENUS.map((m) => m.group)))

function toggleGroup(group) {
  const s = new Set(openGroups.value)
  s.has(group) ? s.delete(group) : s.add(group)
  openGroups.value = s
}

const activeName = computed(() => {
  const n = route.name
  if (n === 'order-detail') return 'orders'
  if (n === 'member-detail' || n === 'member-create') return 'members'
  if (n === 'product-create' || n === 'product-edit') return 'products'
  return n
})

function isActive(name) {
  return activeName.value === name
}

function groupHasActive(group) {
  return group.items.some((i) => isActive(i.name))
}

const initials = computed(() => (user.value?.employeeNo || '').slice(0, 3))
</script>

<template>
  <aside
    class="h-full flex flex-col shrink-0"
    :style="{
      width: collapsed ? '60px' : '216px',
      background: 'var(--c-sidebar)',
      borderRight: '1px solid var(--c-line)',
      transition: 'width 0.2s ease',
    }"
  >
    <!-- 品牌 -->
    <div
      class="flex items-center gap-2.5 h-[52px] px-3 shrink-0 border-b border-line overflow-hidden"
    >
      <div
        class="shrink-0 flex items-center justify-center rounded-md"
        :style="{ width: '28px', height: '28px', background: 'var(--c-primary)', color: '#fff' }"
      >
        <Icon name="storeFront" :size="17" />
      </div>
      <div v-if="!collapsed" class="min-w-0">
        <div class="text-[13.5px] font-semibold leading-tight truncate">{{ t('nav.brand') }}</div>
        <div class="text-[10.5px] text-text-3 leading-tight tracking-wide">{{ t('nav.brandSub') }}</div>
      </div>
    </div>

    <!-- 菜单 -->
    <nav class="flex-1 overflow-y-auto scroll-thin py-2 px-2">
      <div v-for="g in menus" :key="g.group" class="mb-1">
        <!-- 平铺组：单子项分组 + 扁平分组，直接铺成一级菜单 -->
        <template v-if="isFlat(g)">
          <MenuItem
            v-for="item in g.items"
            :key="item.name"
            :item="item"
            :collapsed="collapsed"
            flat
            @navigate="emit('navigate')"
          />
        </template>

        <!-- 多子项组：保留分组标题 + 折叠 -->
        <template v-else>
          <button
            v-if="!collapsed"
            class="w-full flex items-center gap-2 px-2 h-[30px] rounded-md text-[12px] font-medium tracking-wide transition-colors"
            :style="{
              color: groupHasActive(g) ? 'var(--c-text)' : 'var(--c-text-3)',
            }"
            @click="toggleGroup(g.group)"
          >
            <Icon :name="g.icon" :size="13" />
            <span class="flex-1 text-left">{{ g.i18nKey ? t(g.i18nKey, undefined, g.group) : g.group }}</span>
            <Icon
              :name="openGroups.has(g.group) ? 'chevronDown' : 'chevronRight'"
              :size="12"
              class="opacity-60"
            />
          </button>
          <div v-else class="h-px mx-2 my-2" :style="{ background: 'var(--c-line)' }" />

          <div v-show="collapsed || openGroups.has(g.group)" class="space-y-0.5">
            <MenuItem
              v-for="item in g.items"
              :key="item.name"
              :item="item"
              :collapsed="collapsed"
              @navigate="emit('navigate')"
            />
          </div>
        </template>
      </div>
    </nav>

    <!-- 底部：当前门店 + 班次 -->
    <div class="shrink-0 border-t border-line p-2">
      <div
        v-if="!collapsed"
        class="rounded-md px-2.5 py-2"
        :style="{ background: 'var(--c-surface-2)' }"
      >
        <div class="flex items-center gap-1.5 text-[11.5px] text-text-2">
          <span class="w-1.5 h-1.5 rounded-full" :style="{ background: 'var(--c-success)' }" />
          {{ t('nav.online') }}
        </div>
        <div class="text-[11px] text-text-3 mt-1 truncate">{{ t('nav.storeName') }}</div>
        <div class="text-[11px] text-text-3 truncate">{{ t('nav.shift', { no: initials || '—' }) }}</div>
      </div>
      <div v-else class="flex justify-center py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :style="{ background: 'var(--c-success)' }" />
      </div>
    </div>
  </aside>
</template>
