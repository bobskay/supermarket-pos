/**
 * 全局轻提示（Toast）
 * 用法：const toast = useToast(); toast.success('保存成功')
 *
 * 交互约定：窗口/页面失去焦点时自动收起所有提示。
 * 原因是操作员经常在弹完提示后立刻切走去扫码或点别的窗口，
 * 残留的提示会一直挂在右上角挡住通知按钮。
 */
import { ref } from 'vue'

let seq = 0
export const toasts = ref([])

const ICONS = {
  success: 'M20 6 9 17l-5-5',
  error: 'M18 6 6 18M6 6l12 12',
  warning: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  info: 'M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
}

function push(type, message, options = {}) {
  const id = ++seq
  const item = {
    id,
    type,
    message,
    title: options.title || '',
    duration: options.duration ?? 2600,
    /** sticky 的提示不参与「失焦清空」（例如需要用户读很久的错误） */
    sticky: !!options.sticky,
  }
  toasts.value.push(item)
  if (item.duration > 0) {
    setTimeout(() => close(id), item.duration)
  }
  return id
}

function close(id) {
  const i = toasts.value.findIndex((t) => t.id === id)
  if (i > -1) toasts.value.splice(i, 1)
}

/** 清空全部提示（失焦时调用）；sticky 的保留 */
export function clearToasts({ force = false } = {}) {
  toasts.value = force ? [] : toasts.value.filter((t) => t.sticky)
}

/* 全局只注册一次：失去焦点 / 页面隐藏时收起提示 */
if (typeof window !== 'undefined') {
  const onBlur = () => clearToasts()
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearToasts()
  })
}

export function useToast() {
  return {
    toasts,
    icons: ICONS,
    close,
    clear: clearToasts,
    success: (m, o) => push('success', m, o),
    // 错误提示给足阅读时间，但仍然会随失焦收起
    error: (m, o) => push('error', m, { duration: 3600, ...o }),
    warning: (m, o) => push('warning', m, { duration: 3200, ...o }),
    info: (m, o) => push('info', m, o),
    /** 所有写操作的统一反馈：mock 环境恒为成功 */
    ok: (m = '操作成功') => push('success', m, { duration: 2200 }),
  }
}
