/**
 * 确认对话框服务（无需在每个页面写弹窗）
 * 用法：
 *   const confirm = useConfirm()
 *   if (await confirm({ title: '停用商品', content: '停用后不影响历史订单，确定继续？' })) { ... }
 */
import { ref } from 'vue'

export const confirmState = ref({
  visible: false,
  title: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  icon: 'warning',
  _resolve: null,
})

export function useConfirm() {
  return (options = {}) =>
    new Promise((resolve) => {
      confirmState.value = {
        visible: true,
        title: options.title || '操作确认',
        content: options.content || '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        danger: options.danger ?? false,
        icon: options.icon || (options.danger ? 'warning' : 'question'),
        _resolve: resolve,
      }
    })
}

export function resolveConfirm(result) {
  const s = confirmState.value
  s.visible = false
  s._resolve?.(result)
  s._resolve = null
}

/**
 * 表单弹窗服务：把「编辑某个实体」的弹窗交给页面自己渲染内容
 * 这里只提供 Promise 化的 open/close 状态。
 */
export const dialogState = ref({ visible: false, title: '', width: 520, _resolve: null })

export function useDialog() {
  return (options = {}) =>
    new Promise((resolve) => {
      dialogState.value = {
        visible: true,
        title: options.title || '',
        width: options.width || 520,
        _resolve: resolve,
      }
    })
}

export function closeDialog(result) {
  const s = dialogState.value
  s.visible = false
  s._resolve?.(result)
  s._resolve = null
}
