/**
 * 假 axios（Fake Axios）
 * ------------------------------------------------------------------
 * 对外暴露的 API 与 axios 完全一致，演示期不发真实网络请求，
 * 所有请求都被路由到 src/api/mock-server.js，再读取 mock-data/*.json。
 *
 * 将来对接真实后端时，只需要把 main.js 里的这一行换掉：
 *   import http from '@/api/request'        →  import axios from 'axios'
 * 业务代码一行都不用改（拦截器 / 错误提示 / loading 约定都保持一致）。
 */
import { dispatch } from './mock-server'

/** 基础配置，模仿 axios.create */
const config = {
  baseURL: '/api',
  timeout: 12000,
  delay: [90, 260], // 模拟网络耗时区间（毫秒），让 loading 有真实观感
}

const TOKEN_KEY = 'pos.token'

/* ------------------------------ 拦截器容器 ------------------------------ */
const requestInterceptors = []
const responseInterceptors = []
const errorHandlers = []

/** 全局 loading / 请求计数，供顶部进度条使用 */
let pending = 0
const pendingListeners = new Set()
function notifyPending() {
  pendingListeners.forEach((fn) => fn(pending))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildQuery(params) {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.append(k, v)
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

/* ------------------------------ 核心请求方法 ------------------------------ */
async function request(method, url, { params, data, silent = false, delay } = {}) {
  let cfg = {
    method: String(method).toLowerCase(),
    url,
    params: params ? { ...params } : {},
    data,
    silent,
  }

  // 请求拦截器：注入 token
  for (const fn of requestInterceptors) cfg = fn(cfg) || cfg
  if (!('Authorization' in cfg.params) && !('token' in cfg.params)) {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) cfg.params.token = token
  }

  pending += 1
  notifyPending()
  try {
    // 模拟网络延迟
    const [min, max] = config.delay
    await sleep(delay ?? Math.round(min + Math.random() * (max - min)))

    let res
    try {
      res = await dispatch({ method: cfg.method, url: cfg.url, params: cfg.params, data: cfg.data })
    } catch (e) {
      res = { status: 500, data: { code: 500, success: false, message: e.message, data: null } }
    }

    // 响应拦截器：可在此统一解包 / 记录日志
    let payload = res.data
    for (const fn of responseInterceptors) payload = fn(payload, res) || payload

    if (res.status >= 400 || payload?.success === false) {
      const err = new Error(payload?.message || `请求失败（${res.status}）`)
      err.code = payload?.code ?? res.status
      err.response = { status: res.status, data: payload }
      for (const fn of errorHandlers) {
        if (fn(err, cfg) === false) throw err // 返回 false 表示自行处理，不抛
      }
      throw err
    }
    return payload
  } finally {
    pending -= 1
    notifyPending()
  }
}

/** 构造一个请求方法，返回 Promise<{code,message,data}> */
const create = (method) => (url, data, options) => {
  // 兼容 axios 两种调用习惯：get(url, {params}) / post(url, body)
  if (method === 'get' || method === 'delete') {
    return request(method, url, { params: data, ...(options || {}) })
  }
  return request(method, url, { data, ...(options || {}) })
}

const http = {
  config,
  get: create('get'),
  delete: create('delete'),
  post: create('post'),
  put: create('put'),
  patch: create('patch'),

  /** 直接请求 */
  request: (cfg) => request(cfg.method, cfg.url, cfg),

  /** 拦截器：签名与 axios 保持一致 */
  interceptors: {
    request: { use: (fn) => requestInterceptors.push(fn) },
    response: { use: (fn) => responseInterceptors.push(fn) },
  },
  onError: (fn) => errorHandlers.push(fn),
  onPendingChange: (fn) => {
    pendingListeners.add(fn)
    return () => pendingListeners.delete(fn)
  },
  getPending: () => pending,
}

/* ------------------------------ 全局默认拦截器 ------------------------------ */

// 1) 自动带 token
http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && cfg.params && !cfg.params.token) cfg.params.token = token
  return cfg
})

// 2) 解包 + 开发期打印，方便演示时给甲方看接口日志
http.interceptors.response.use((payload, res) => {
  if (import.meta.env.DEV) {
    const tag = payload?.success === false ? 'warn' : 'debug'
    // eslint-disable-next-line no-console
    console[tag](`[mock] ${res.status} → ${payload?.message || 'ok'}`, payload?.data)
  }
  return payload
})

export { TOKEN_KEY }
export default http
