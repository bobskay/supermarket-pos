/** 通用格式化 / 小工具 */

import { locale, t } from '@/i18n'

/** 金额：￥12.30 */
export function money(n, withSymbol = true) {
  const v = Number(n || 0)
  return (withSymbol ? '￥' : '') + v.toFixed(2)
}

/** 千分位：12,345 */
export function thousands(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

/** 数量：整数不带小数，含小数保留两位并去掉末尾 0 */
export function qty(n) {
  const v = Number(n || 0)
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)))
}

/** 百分比 */
export function percent(n, digits = 1) {
  return `${Number(n || 0).toFixed(digits)}%`
}

/** 2026-03-20 09:12:33 → 09:12 */
export function timeShort(s) {
  return String(s || '').slice(11, 16)
}

/** 只取日期部分 */
export function dateOnly(s) {
  return String(s || '').slice(0, 10)
}

/**
 * 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 2 天前
 * 英文环境走字典，避免切换语言后这里还显示中文
 */
export function fromNow(str) {
  if (!str) return '-'
  const time = new Date(String(str).replace(/-/g, '/')).getTime()
  if (Number.isNaN(time)) return str
  const diff = Date.now() - time
  if (diff < 60_000) return t('common.justNow')
  if (diff < 3600_000) return t('common.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('common.hoursAgo', { n: Math.floor(diff / 3600_000) })
  if (diff < 2592000_000) return t('common.daysAgo', { n: Math.floor(diff / 86400_000) })
  return dateOnly(str)
}

/** 今天 / N 天前的日期字符串 */
export function dateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 生成业务单号：前缀 + 年月日 + 4 位随机 */
export function genNo(prefix = 'SO') {
  const d = new Date()
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `${prefix}${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(
    Math.floor(Math.random() * 10000),
    4,
  )}`
}

/** 防抖 */
export function debounce(fn, wait = 280) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

/** 节流 */
export function throttle(fn, wait = 200) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last >= wait) {
      last = now
      fn.apply(this, args)
    }
  }
}

/** 深拷贝 */
export function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

/** 简单金额求和，避免浮点误差 */
export function sumBy(list, fn) {
  return Math.round((list || []).reduce((s, x) => s + (Number(fn(x)) || 0), 0) * 100) / 100
}

/** 金额计算（两位小数） */
export function calc(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

/** 订单状态 → 徽章配色 */
export const ORDER_STATUS_STYLE = {
  paid: { label: '已结算', class: 'badge-success' },
  unpaid: { label: '未结算', class: 'badge-warning' },
  refunded: { label: '已退款', class: 'badge-danger' },
  partial_refund: { label: '部分退款', class: 'badge-purple' },
  void: { label: '已作废', class: 'badge-muted' },
}

export const MEMBER_LEVEL_STYLE = {
  normal: 'badge-muted',
  silver: 'badge-info',
  gold: 'badge-warning',
  diamond: 'badge-purple',
}

export const STOCK_STATE_STYLE = {
  normal: 'badge-success',
  low: 'badge-warning',
  empty: 'badge-danger',
}

/** 数字滚动动画（看板用） */
export function useCountUp() {
  // 保持轻量：返回一个纯函数，在组件里用 requestAnimationFrame 自行驱动
  return (from, to, duration = 500, onUpdate) => {
    const start = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      onUpdate(from + (to - from) * eased)
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
}
