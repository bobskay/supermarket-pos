/**
 * 皮肤切换（右上角一键换肤 + 登录页右上角）
 * ------------------------------------------------------------------
 * 三套皮肤：clean 清爽白 / fresh 清新绿 / midnight 曜石蓝
 * 只切换 html[data-theme]，颜色由 CSS 变量自动接管，组件代码零改动。
 */
import { ref, computed } from 'vue'

export const THEMES = [
  {
    key: 'clean',
    name: '清爽白',
    desc: '浅色商务风，明亮通透',
    preview: ['#ffffff', '#f4f6fa', '#1a6df0'],
  },
  {
    key: 'fresh',
    name: '清新绿',
    desc: '绿色主色，柔和护眼',
    preview: ['#ffffff', '#f2f8f2', '#2f8f4e'],
  },
  {
    key: 'midnight',
    name: '曜石蓝',
    desc: '深色护眼风，适合长时收银',
    preview: ['#151b24', '#0d1117', '#4c8dff'],
  },
]

const STORAGE_KEY = 'pos.theme'
const valid = THEMES.map((t) => t.key)

const theme = ref(valid.includes(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'clean')

function apply(key) {
  document.documentElement.setAttribute('data-theme', key)
  // 加过渡类做一次颜色过渡，280ms 后移除，避免影响后续交互性能
  const root = document.documentElement
  root.classList.add('theme-anim')
  clearTimeout(apply._t)
  apply._t = setTimeout(() => root.classList.remove('theme-anim'), 280)
}

apply(theme.value)

export function useTheme() {
  const current = computed(() => THEMES.find((t) => t.key === theme.value) || THEMES[0])
  const isDark = computed(() => theme.value === 'midnight')

  function setTheme(key) {
    if (!valid.includes(key) || key === theme.value) return
    theme.value = key
    localStorage.setItem(STORAGE_KEY, key)
    apply(key)
  }

  /** 在「浅色系」里轮换：清爽白 ⇄ 清新绿（深色用 setTheme 指定） */
  function toggleTheme() {
    setTheme(theme.value === 'clean' ? 'fresh' : 'clean')
  }

  return { theme, themes: THEMES, current, isDark, setTheme, toggleTheme }
}
