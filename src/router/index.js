/**
 * 路由表
 * ------------------------------------------------------------------
 * - 采用 hash 模式：演示站点打包后双击 index.html 也能正常跳转，不需要服务器 rewrite
 * - meta.perm 声明可访问角色；meta.title / meta.group 用于面包屑与页签标题
 * - meta.hidden 的页面不出现在菜单（详情页、403 等）
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/Login.vue'),
    meta: { title: '登录', public: true, blank: true },
  },
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/pages/Dashboard.vue'),
    meta: { title: '经营看板', group: '概览' },
  },
  {
    path: '/pos',
    name: 'pos',
    component: () => import('@/pages/pos/Checkout.vue'),
    meta: { title: '收银开单', group: '收银', full: true },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/pages/order/OrderList.vue'),
    meta: { title: '订单管理', group: '收银' },
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: () => import('@/pages/order/OrderDetail.vue'),
    meta: { title: '订单详情', group: '收银', hidden: true, permFrom: 'orders' },
  },
  {
    path: '/members',
    name: 'members',
    component: () => import('@/pages/member/MemberList.vue'),
    meta: { title: '会员管理', group: '会员' },
  },
  {
    path: '/members/:id',
    name: 'member-detail',
    component: () => import('@/pages/member/MemberDetail.vue'),
    meta: { title: '会员详情', group: '会员', hidden: true, permFrom: 'members' },
  },
  {
    path: '/members/create',
    name: 'member-create',
    component: () => import('@/pages/member/MemberForm.vue'),
    meta: { title: '新建会员', group: '会员', hidden: true, permFrom: 'members' },
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/pages/product/ProductList.vue'),
    meta: { title: '商品档案', group: '商品' },
  },
  {
    path: '/products/create',
    name: 'product-create',
    component: () => import('@/pages/product/ProductForm.vue'),
    meta: { title: '新增商品', group: '商品', hidden: true, permFrom: 'products' },
  },
  {
    path: '/products/:id',
    name: 'product-edit',
    component: () => import('@/pages/product/ProductForm.vue'),
    meta: { title: '编辑商品', group: '商品', hidden: true, permFrom: 'products' },
  },
  {
    path: '/categories',
    name: 'categories',
    component: () => import('@/pages/product/CategoryList.vue'),
    meta: { title: '商品分类', group: '商品' },
  },
  {
    path: '/stock',
    name: 'stock',
    component: () => import('@/pages/stock/StockList.vue'),
    meta: { title: '库存管理', group: '库存' },
  },
  {
    path: '/stock/logs',
    name: 'stock-logs',
    component: () => import('@/pages/stock/StockLogs.vue'),
    meta: { title: '库存流水', group: '库存' },
  },
  {
    path: '/stock/check',
    name: 'stock-check',
    component: () => import('@/pages/stock/StockCheck.vue'),
    meta: { title: '库存盘点', group: '库存' },
  },
  {
    path: '/purchase',
    name: 'purchase',
    component: () => import('@/pages/stock/PurchaseList.vue'),
    meta: { title: '采购入库', group: '库存' },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@/pages/system/UserList.vue'),
    meta: { title: '用户管理', group: '系统' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/pages/system/LogList.vue'),
    meta: { title: '操作日志', group: '系统' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/pages/report/ReportCenter.vue'),
    meta: { title: '报表统计', group: '数据' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/system/Settings.vue'),
    meta: { title: '系统设置', group: '系统' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/pages/system/Profile.vue'),
    meta: { title: '个人中心', hidden: true },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/pages/Forbidden.vue'),
    meta: { title: '无访问权限', hidden: true, blank: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFound.vue'),
    meta: { title: '页面不存在', blank: true, hidden: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const { isLogin, hasPermission, homeRoute } = useAuth()

  if (to.meta.public) {
    // 已登录时访问登录页：直接进本角色的默认首页（收银员进收银台，不进看板）
    if (isLogin.value && to.name === 'login') return homeRoute()
    return true
  }

  if (!isLogin.value) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  // 权限：显式 meta.permFrom 或按名字查表
  const permKey = to.meta.permFrom || to.name
  if (!hasPermission(permKey)) {
    // / 会先重定向到 /dashboard，收银员没有看板权限 → 落到他自己的默认首页
    if (to.name === 'dashboard') return homeRoute()
    return { name: 'forbidden', query: { from: to.fullPath } }
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · 超市收银系统` : '超市收银系统'
})

export default router
