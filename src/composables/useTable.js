/**
 * useTable —— 表格页面数据编排（本项目提效最明显的一个封装）
 * ------------------------------------------------------------------
 * 把每个列表页都要写的「loading / 筛选 / 分页 / 刷新 / 重置」收敛成一份逻辑：
 *
 *   const t = useTable(productApi.list, {
 *     filters: { keyword: '', status: 'active', categoryId: '' },
 *     pageSize: 20,
 *   })
 *   t.list / t.total / t.loading / t.query / t.setFilter() / t.reload() / t.reset()
 *
 * 注意：演示环境后端不落库，所以「新增/修改成功后要看到变化」依赖各页面
 * 自行把草稿行合并进本地列表（见各页面的 paint* 方法）。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useToast } from './useToast'

/** 列表请求的兜底超时（毫秒） */
const TIMEOUT_MS = 12000

export function useTable(fetcher, options = {}) {
  const {
    filters = {},
    pageSize = 20,
    immediate = true,
    /** 是否本地分页（mock 后端已支持分页，默认交给后端） */
    sortBy = '',
    sortOrder = '',
  } = options

  const toast = useToast()

  const list = ref([])
  const total = ref(0)
  const loading = ref(false)
  const errorMsg = ref('')
  const page = ref(1)
  const size = ref(pageSize)
  const query = reactive({ ...filters })
  const sort = reactive({ by: sortBy, order: sortOrder })

  /** 组装请求参数：去掉空值，避免后端把空串当成筛选条件 */
  function params() {
    const out = { page: page.value, pageSize: size.value }
    for (const [k, v] of Object.entries(query)) {
      if (v !== '' && v !== null && v !== undefined && v !== 'all') out[k] = v
    }
    if (sort.by) {
      out.sortBy = sort.by
      out.sortOrder = sort.order || 'desc'
    }
    return out
  }

  async function fetchData(extra = {}) {
    loading.value = true
    errorMsg.value = ''
    try {
      // 兜底超时：万一请求因为环境问题迟迟不返回，也要结束 loading 状态，
      // 不能让表格一直停在骨架屏上（收银现场最忌讳看起来「卡住」）
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求超时，请点击刷新重试')), TIMEOUT_MS),
      )
      const res = await Promise.race([fetcher({ ...params(), ...extra }), timeout])
      const d = res.data
      if (Array.isArray(d)) {
        list.value = d
        total.value = d.length
      } else {
        list.value = d.list || []
        total.value = d.total || 0
      }
      return res
    } catch (e) {
      errorMsg.value = e.message
      list.value = []
      total.value = 0
      toast.error(e.message || '数据加载失败')
      return null
    } finally {
      loading.value = false
    }
  }

  /** 重新加载（回到第一页） */
  function reload() {
    page.value = 1
    return fetchData()
  }

  /** 保持当前页刷新 */
  function refresh() {
    return fetchData()
  }

  function setFilter(patch, { reset = true } = {}) {
    Object.assign(query, patch)
    if (reset) page.value = 1
    return fetchData()
  }

  function reset() {
    for (const k of Object.keys(query)) query[k] = filters[k] ?? ''
    sort.by = sortBy
    sort.order = sortOrder
    page.value = 1
    return fetchData()
  }

  function onPageChange({ page: p, pageSize: s }) {
    if (p) page.value = p
    if (s) size.value = s
    return fetchData()
  }

  function onSort({ key, order }) {
    sort.by = key
    sort.order = order
    return fetchData()
  }

  /** 直接改本地列表（演示环境用：写操作后手动合并，界面立刻有反馈） */
  function setList(rows, newTotal) {
    list.value = rows
    if (newTotal != null) total.value = newTotal
  }
  function patchLocal(id, patch, key = 'id') {
    const i = list.value.findIndex((r) => r[key] === id)
    if (i > -1) list.value[i] = { ...list.value[i], ...patch }
  }
  function removeLocal(id, key = 'id') {
    const i = list.value.findIndex((r) => r[key] === id)
    if (i > -1) {
      list.value.splice(i, 1)
      total.value = Math.max(0, total.value - 1)
    }
  }
  function unshiftLocal(row) {
    list.value.unshift(row)
    total.value += 1
  }

  /** 全量拉取（不分页），用于导出 / 统计 */
  async function fetchAll(extra = {}) {
    const p = { ...params(), page: 1, pageSize: 0, ...extra }
    const res = await fetcher(p)
    const d = res.data
    return Array.isArray(d) ? d : d.list || []
  }

  const isEmpty = computed(() => !loading.value && list.value.length === 0)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)))

  if (immediate) onMounted(() => fetchData())

  return {
    list,
    total,
    loading,
    errorMsg,
    page,
    size,
    query,
    sort,
    isEmpty,
    pageCount,
    params,
    fetchData,
    reload,
    refresh,
    setFilter,
    reset,
    onPageChange,
    onSort,
    setList,
    patchLocal,
    removeLocal,
    unshiftLocal,
    fetchAll,
    toast,
  }
}
