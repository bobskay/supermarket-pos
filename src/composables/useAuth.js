/**
 * 登录态 / 权限
 * - token 存 localStorage（刷新不掉线）
 * - 权限用一个简单的字符串数组模拟：'*' 代表全部
 * - 收银员只能看到「收银台 / 订单 / 会员」，店长看全部
 */
import { ref, computed } from 'vue'
import { authApi } from '@/api'

const TOKEN_KEY = 'pos.token'
const USER_KEY = 'pos.user'

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const token = ref(localStorage.getItem(TOKEN_KEY) || '')
const user = ref(readUser())

export const ROLE_NAME = { manager: '店长', cashier: '收银员' }

/** 菜单 / 路由权限：键为路由 name */
export const MENU_PERMISSION = {
  dashboard: ['manager'],
  reports: ['manager'],
  products: ['manager'],
  categories: ['manager'],
  stock: ['manager'],
  purchase: ['manager'],
  members: ['cashier', 'manager'],
  users: ['manager'],
  logs: ['manager'],
  settings: ['manager'],
  pos: ['cashier', 'manager'],
  orders: ['cashier', 'manager'],
}

/**
 * 进站顺序：登录后落到第一个有权限的模块。
 * 店长 → 经营看板；收银员没有看板权限 → 直接进收银台。
 */
const HOME_ORDER = ['dashboard', 'pos', 'orders', 'members', 'products', 'categories', 'stock', 'purchase', 'reports', 'users', 'logs', 'settings']

/** 根据角色算出默认首页（返回 router 可直接消费的路由对象） */
export function homeRoute(role) {
  const name = HOME_ORDER.find((n) => (MENU_PERMISSION[n] || []).includes(role)) || 'pos'
  return { name }
}

export function useAuth() {
  const isLogin = computed(() => !!token.value && !!user.value)
  const isManager = computed(() => user.value?.role === 'manager')
  const isCashier = computed(() => user.value?.role === 'cashier')
  const displayName = computed(() => user.value?.name || '未登录')
  const roleName = computed(() => user.value?.roleName || ROLE_NAME[user.value?.role] || '-')
  /** 头像文字：取姓名最后一个字 */
  const avatarText = computed(() => (user.value?.name || '?').slice(-1))

  function hasPermission(name) {
    if (!user.value) return false
    const allow = MENU_PERMISSION[name]
    if (!allow) return true
    return allow.includes(user.value.role)
  }

  async function login(payload) {
    const res = await authApi.login(payload)
    const { token: tk, user: u } = res.data
    token.value = tk
    user.value = u
    localStorage.setItem(TOKEN_KEY, tk)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    return u
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function patchUser(patch) {
    user.value = { ...user.value, ...patch }
    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  return {
    token,
    user,
    isLogin,
    isManager,
    isCashier,
    displayName,
    roleName,
    avatarText,
    hasPermission,
    /** 本角色的默认首页 */
    homeRoute: () => homeRoute(user.value?.role),
    login,
    logout: async () => {
      try {
        await authApi.logout()
      } catch {
        /* 演示环境忽略退出接口异常 */
      }
      logout()
    },
    patchUser,
  }
}

export { token, user }
