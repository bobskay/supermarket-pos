/**
 * 轻量多语言（无第三方依赖）
 * ------------------------------------------------------------------
 * 设计要点：
 *   1) 只维护一个响应式 locale，t() 在调用时读取它的值，
 *      因此模板里已有的 t('x') 会在语言切换后自动重新渲染。
 *   2) 缺失的 en 键自动回退到 zh，新增文案先写中文也能跑起来。
 *   3) tl(record, field) 用于「数据里的状态文案」：mock 数据同时带中英字段时按语言取。
 *
 * 用法：
 *   const { t, tl, locale, setLocale } = useI18n()
 *   {{ t('nav.dashboard') }}                 // 界面文案
 *   {{ tl(row, 'statusName') }}              // 数据的 name 字段（statusNameEn 等）
 */
import { ref, computed } from 'vue'
import { DICTS, LOCALES } from './dict'

const STORAGE_KEY = 'pos.locale'
const valid = LOCALES.map((l) => l.key)

/** 读取浏览器语言作为默认值，中文环境默认 CN */
function detectDefault() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (valid.includes(saved)) return saved
  const nav = (navigator.language || 'zh').toLowerCase()
  return nav.startsWith('zh') ? 'zh' : 'en'
}

export const locale = ref(detectDefault())

/** 给 <html lang> 同步语言，便于无障碍与字体回退 */
function syncHtmlLang(value) {
  document.documentElement.setAttribute('lang', value === 'zh' ? 'zh-CN' : 'en')
}
syncHtmlLang(locale.value)

export function setLocale(next) {
  if (!valid.includes(next) || next === locale.value) return
  locale.value = next
  localStorage.setItem(STORAGE_KEY, next)
  syncHtmlLang(next)
  // 让 .lang-anim 做一次淡入，切换时有轻微反馈而不是硬闪
  const root = document.documentElement
  root.classList.add('lang-anim')
  clearTimeout(setLocale._t)
  setLocale._t = setTimeout(() => root.classList.remove('lang-anim'), 260)
}

/**
 * 当前语言对应的字典（一次合并，避免每次 t() 都查两张表）
 * 缺失的键由 zh 兜底。
 */
const dict = computed(() => ({ ...DICTS.zh, ...(DICTS[locale.value] || {}) }))

/** 'a.b.c' → dict.a.b.c，找不到时返回 fallback 或 key 本身 */
function lookup(key, fallback) {
  const parts = String(key).split('.')
  let cur = dict.value
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') {
      cur = undefined
      break
    }
    cur = cur[p]
  }
  if (cur === undefined || cur === null) {
    // 只在开发期提示，避免线上刷屏
    if (import.meta.env.DEV && !fallback) console.warn(`[i18n] 缺少文案：${key}`)
    return fallback !== undefined ? fallback : String(key)
  }
  return cur
}

/** 把 {name} 这类占位替换成真实值 */
function interpolate(text, params) {
  if (!params || typeof text !== 'string') return text
  return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`))
}

/**
 * 取界面文案
 * @param {string} key 形如 'nav.dashboard'
 * @param {object} [params] 占位参数，例如 { n: 12 }
 * @param {string} [fallback] 缺键时的回退文本
 */
export function t(key, params, fallback) {
  const raw = lookup(key, fallback)
  return interpolate(raw, params)
}

/**
 * 取数据里的本地化字段。
 * mock 数据可以同时提供中英两份，例如：
 *   { statusName: '已结算', statusNameEn: 'Paid' }
 * 传入字段基名即可，自动补 En 后缀。
 *
 * @param {object} record
 * @param {string} field 例如 'statusName'
 * @returns {string}
 */
export function tl(record, field, fallback = '') {
  if (!record) return fallback
  // 中文环境优先原始字段
  if (locale.value === 'zh') {
    return record[field] ?? record[`${field}En`] ?? fallback
  }
  return record[`${field}En`] ?? record[field] ?? fallback
}

/** 带语言状态的日期时间格式化（保持各语言可读习惯） */
export function formatDateTime(value) {
  if (!value) return ''
  if (locale.value === 'zh') return value
  // 中文数据格式为 YYYY-MM-DD HH:mm:ss，英文下转成 DD MMM YYYY HH:mm
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2}(?::\d{2})?)?/)
  if (!m) return value
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mon = months[Number(m[2]) - 1] || m[2]
  return `${m[3]} ${mon} ${m[1]}${m[4] ? ` ${m[4]}` : ''}`
}

/** 金额：中文用 ￥ 前缀，英文用 $ 前缀（数值口径不变，只换符号） */
export function formatMoney(value) {
  const n = Number(value || 0).toFixed(2)
  return locale.value === 'zh' ? `￥${n}` : `$${n}`
}

export function useI18n() {
  return {
    locale,
    locales: LOCALES,
    dict,
    t,
    tl,
    setLocale,
    formatDateTime,
    formatMoney,
    /** 当前语言标签，如 CN / EN */
    currentShort: computed(() => LOCALES.find((l) => l.key === locale.value)?.short || 'CN'),
    isZh: computed(() => locale.value === 'zh'),
    isEn: computed(() => locale.value === 'en'),
  }
}
