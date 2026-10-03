/**
 * 模拟后端服务（Mock Server）
 * ------------------------------------------------------------------
 * 一个「假 axios」的运行时内核：把 HTTP 请求按 URL 路由到 mock-data/*.json。
 *
 * 约定：
 *   GET    /api/xxx            → 从 mock-data/xxx.json 读取并按 query 做分页/筛选/排序
 *   GET    /api/xxx/:id        → 读取集合中匹配的那条
 *   POST/PUT/PATCH/DELETE      → 一律返回 { code: 0, message: '操作成功' }，不落库
 *
 * 想改返回内容：只改 /mock-data/*.json 即可，无需动这个文件。
 * 想加新接口：在下面 ROUTES 里加一行。
 */
import { table, clone, RAW, TABLES } from './mock-data'

/* ============================ 基础工具 ============================ */

/** 统一响应体：和真实后端约定保持一致 */
function ok(data, message = '操作成功') {
  return { code: 0, success: true, message, data }
}
function fail(message, code = 500) {
  return { code, success: false, message, data: null }
}

/** 集合 → Map(id 索引) */
function indexById(list, key = 'id') {
  const map = new Map()
  for (const row of list || []) map.set(String(row[key]), row)
  return map
}

/** 取嵌套值：'shop.name' → obj.shop.name */
function getByPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

/** 模糊匹配：任意字段包含关键字即命中 */
function matchKeyword(row, keyword, fields) {
  if (!keyword) return true
  const kw = String(keyword).trim().toLowerCase()
  if (!kw) return true
  const keys = fields && fields.length ? fields : Object.keys(row)
  return keys.some((k) => {
    const v = row[k]
    if (v == null) return false
    if (typeof v === 'object') return JSON.stringify(v).toLowerCase().includes(kw)
    return String(v).toLowerCase().includes(kw)
  })
}

/**
 * 通用列表处理：关键字 + 精确筛选 + 日期区间 + 排序 + 分页
 * @param {Array} list 原始集合
 * @param {Object} query 请求参数
 * @param {Object} opt { searchFields, dateField, defaultSort }
 */
function queryList(list, query = {}, opt = {}) {
  const {
    searchFields = [],
    dateField = 'createdAt',
    defaultSort = { field: 'createdAt', order: 'desc' },
  } = opt
  let rows = (list || []).slice()

  // 1) 关键字
  if (query.keyword) rows = rows.filter((r) => matchKeyword(r, query.keyword, searchFields))

  // 2) 通用筛选：未识别的参数按「字段=值」精确匹配（字段名一致即可）
  const RESERVED = new Set([
    'page', 'pageSize', 'keyword', 'sortBy', 'sortOrder', 'startDate', 'endDate',
    '_t', '_ts', 'fields', 'exact',
  ])
  if (query.exact) {
    const pairs = String(query.exact).split(',').filter(Boolean)
    for (const pair of pairs) {
      const [k, v] = pair.split(':')
      if (!k) continue
      rows = rows.filter((r) => String(getByPath(r, k) ?? '') === String(v ?? ''))
    }
  }
  for (const [k, v] of Object.entries(query)) {
    if (RESERVED.has(k) || v === '' || v == null || v === 'all') continue
    const sample = rows[0]
    if (!sample || !(k in sample)) continue
    rows = rows.filter((r) => String(r[k]) === String(v))
  }

  // 3) 日期区间
  if (query.startDate) rows = rows.filter((r) => String(r[dateField] || '') >= String(query.startDate))
  if (query.endDate) {
    const end = String(query.endDate)
    rows = rows.filter((r) => String(r[dateField] || '').slice(0, 10) <= end.slice(0, 10))
  }

  // 4) 排序
  const sortBy = query.sortBy || defaultSort.field
  const sortOrder = String(query.sortOrder || defaultSort.order).toLowerCase()
  if (sortBy) {
    rows.sort((a, b) => {
      const x = getByPath(a, sortBy)
      const y = getByPath(b, sortBy)
      let r
      if (typeof x === 'number' && typeof y === 'number') r = x - y
      else r = String(x ?? '').localeCompare(String(y ?? ''), 'zh-CN')
      return sortOrder === 'asc' ? r : -r
    })
  }

  // 5) 分页
  const total = rows.length
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 0)
  if (pageSize > 0) {
    const start = (page - 1) * pageSize
    rows = rows.slice(start, start + pageSize)
  }
  return { list: rows, total, page, pageSize: pageSize || total }
}

/** 排序并取前 n 条 */
function top(list, field, n) {
  return (list || []).slice().sort((a, b) => (b[field] || 0) - (a[field] || 0)).slice(0, n)
}

/** 简单 id 生成 */
let idSeq = 9000
function nextId(prefix) {
  idSeq += 1
  return `${prefix}${idSeq}`
}

/* ============================ 内存态 ============================ */
/** 会话信息（登录后写入，仅存在于当前浏览器标签页） */
const session = {
  token: '',
  user: null,
}

/* ============================ 路由表 ============================ */
/**
 * 每条路由：
 *   path   : '/api/products' 或 '/api/products/:id'（":xxx" 为占位符）
 *   method : 'get' | 'post' | 'put' | 'delete'
 *   handler: ({ params, query, body }) => any   // 返回值会被塞进 data
 */
const ROUTES = [
  /* --------------------------- 认证 / 账号 --------------------------- */
  {
    path: '/auth/login',
    method: 'post',
    handler: ({ body }) => {
      const users = table('users') || []
      const { username, password } = body || {}
      const found = users.find((u) => u.username === String(username || '').trim())
      if (!found) return fail('账号不存在，请检查后重试', 401)
      if (found.password !== password) return fail('密码错误，请重新输入', 401)
      if (found.status !== 'active') return fail('该账号已被停用，请联系店长', 403)
      session.token = `mock-token-${found.id}-${Date.now()}`
      // 不把密码带出去
      const { password: _p, ...safeUser } = found
      session.user = safeUser
      return ok(
        {
          token: session.token,
          user: safeUser,
          permissions: found.role === 'manager' ? ['*'] : (table('settings')?.permissions?.cashier || []),
        },
        '登录成功',
      )
    },
  },
  {
    path: '/auth/me',
    method: 'get',
    handler: () => {
      if (!session.user) return fail('登录状态已失效', 401)
      return ok({ user: session.user })
    },
  },
  { path: '/auth/logout', method: 'post', handler: () => (session.user = null, ok(null, '已安全退出')) },
  {
    path: '/auth/password',
    method: 'post',
    handler: ({ body }) => {
      const users = table('users') || []
      const u = users.find((x) => x.id === session.user?.id)
      if (u && body?.oldPassword && u.password !== body.oldPassword) return fail('原密码不正确', 400)
      return ok(null, '密码修改成功')
    },
  },

  /* ------------------------------- 用户 ------------------------------- */
  {
    path: '/users',
    method: 'get',
    handler: ({ query }) => {
      const rows = (table('users') || []).map(({ password, ...u }) => u)
      return ok(queryList(rows, query, { searchFields: ['name', 'username', 'phone', 'employeeNo'] }))
    },
  },
  {
    path: '/users/:id',
    method: 'get',
    handler: ({ params }) => {
      const u = (table('users') || []).find((x) => x.id === params.id)
      if (!u) return fail('账号不存在', 404)
      const { password, ...safe } = u
      return ok(safe)
    },
  },
  {
    path: '/users/:id/reset-password',
    method: 'post',
    handler: () => ok({ password: '123456' }, '密码已重置为初始密码 123456'),
  },

  /* ------------------------------- 会员 ------------------------------- */
  {
    path: '/members',
    method: 'get',
    handler: ({ query }) =>
      ok(queryList(table('members'), query, { searchFields: ['name', 'phone', 'memberNo', 'id'] })),
  },
  {
    path: '/members',
    method: 'post',
    handler: ({ body }) => {
      const id = nextId('M')
      return ok(
        {
          id,
          memberNo: body?.memberNo || `VIP${String(id).replace(/\D/g, '')}`,
          name: body?.name,
          phone: body?.phone,
          level: body?.level || 'normal',
          levelName: '普通会员',
          points: 0,
          balance: 0,
          status: 'active',
        },
        `会员「${body?.name || ''}」创建成功`,
      )
    },
  },
  {
    path: '/members/search',
    method: 'get',
    handler: ({ query }) => {
      const kw = String(query.keyword || '').trim()
      const rows = table('members') || []
      const hit = rows.filter(
        (m) => m.phone === kw || m.memberNo.toLowerCase() === kw.toLowerCase() || m.id === kw,
      )
      return ok(hit.length ? hit[0] : null, hit.length ? '已匹配到会员' : '未找到该会员')
    },
  },
  {
    path: '/members/:id',
    method: 'get',
    handler: ({ params }) => {
      const m = (table('members') || []).find((x) => x.id === params.id)
      if (!m) return fail('会员不存在', 404)
      const orders = (table('orders') || []).filter((o) => o.memberId === m.id)
      const pointLogs = orders
        .filter((o) => o.pointsEarned || o.pointsUsed || o.refund)
        .slice(0, 30)
        .map((o) => ({
          id: `PT-${o.id}`,
          memberId: m.id,
          change: o.refund ? -o.pointsEarned : o.pointsEarned - o.pointsUsed,
          type: o.refund ? 'refund' : o.pointsUsed ? 'deduct' : 'earn',
          typeName: o.refund ? '退款扣回' : o.pointsUsed ? '积分抵扣' : '消费累计',
          orderNo: o.orderNo,
          amount: o.finalAmount,
          balance: null,
          operator: o.operatorName,
          createdAt: o.createdAt,
        }))
      return ok({ ...m, orders: orders.slice(0, 50), pointLogs })
    },
  },
  {
    path: '/members/:id/orders',
    method: 'get',
    handler: ({ params, query }) => {
      const rows = (table('orders') || []).filter((o) => o.memberId === params.id)
      return ok(queryList(rows, query, { searchFields: ['orderNo'] }))
    },
  },
  {
    path: '/members/:id/points',
    method: 'get',
    handler: ({ params }) => {
      const m = (table('members') || []).find((x) => x.id === params.id)
      return ok({ points: m?.points || 0, balance: m?.balance || 0 })
    },
  },

  /* ------------------------------- 商品 ------------------------------- */
  {
    path: '/categories',
    method: 'get',
    handler: ({ query }) => ok(queryList(table('categories'), query, { sortBy: 'sort' })),
  },
  {
    path: '/products',
    method: 'get',
    handler: ({ query }) => {
      let rows = (table('products') || []).slice()
      if (query.status) rows = rows.filter((p) => p.status === query.status)
      if (query.categoryId) rows = rows.filter((p) => p.categoryId === query.categoryId)
      return ok(
        queryList(rows, { ...query, status: '', categoryId: '' }, {
          searchFields: ['name', 'barcode', 'id', 'categoryName'],
          defaultSort: { field: 'id', order: 'asc' },
        }),
      )
    },
  },
  {
    path: '/products/barcode/:barcode',
    method: 'get',
    handler: ({ params }) => {
      const code = String(params.barcode || '').trim()
      const p = (table('products') || []).find((x) => x.barcode === code)
      if (!p) return fail(`未找到条码 ${code} 对应的商品`, 404)
      if (p.status !== 'active') return fail(`商品「${p.name}」已停用，无法销售`, 400)
      return ok(p, '已带出商品信息')
    },
  },
  {
    path: '/products/:id',
    method: 'get',
    handler: ({ params }) => {
      const p = (table('products') || []).find((x) => x.id === params.id)
      return p ? ok(p) : fail('商品不存在', 404)
    },
  },

  /* ------------------------------- 库存 ------------------------------- */
  {
    path: '/stock',
    method: 'get',
    handler: ({ query }) => {
      let rows = (table('stock') || []).slice()
      if (query.categoryId) rows = rows.filter((s) => s.categoryId === query.categoryId)
      if (query.stockState) rows = rows.filter((s) => s.stockState === query.stockState)
      return ok(
        queryList(rows, { ...query, categoryId: '', stockState: '' }, {
          searchFields: ['name', 'barcode', 'productId'],
          defaultSort: { field: 'stock', order: 'asc' },
        }),
      )
    },
  },
  {
    path: '/stock/summary',
    method: 'get',
    handler: () => {
      const rows = table('stock') || []
      return ok({
        skuCount: rows.length,
        totalQty: rows.reduce((s, r) => s + r.stock, 0),
        totalAmount: Math.round(rows.reduce((s, r) => s + r.stockAmount, 0) * 100) / 100,
        lowCount: rows.filter((r) => r.stockState === 'low').length,
        emptyCount: rows.filter((r) => r.stockState === 'empty').length,
        warningList: rows.filter((r) => r.stockState !== 'normal').sort((a, b) => a.stock - b.stock),
      })
    },
  },
  {
    path: '/stock/logs',
    method: 'get',
    handler: ({ query }) =>
      ok(queryList(table('stock-logs'), query, { searchFields: ['productName', 'barcode', 'reason', 'relatedNo'] })),
  },
  {
    path: '/stock/purchase-orders',
    method: 'get',
    handler: ({ query }) =>
      ok(queryList(table('purchase-orders'), query, { searchFields: ['purchaseNo', 'supplier'] })),
  },
  {
    path: '/stock/purchase-orders/:id',
    method: 'get',
    handler: ({ params }) => {
      const po = (table('purchase-orders') || []).find((x) => x.id === params.id)
      return po ? ok(po) : fail('进货单不存在', 404)
    },
  },

  /* ------------------------------- 订单 ------------------------------- */
  {
    path: '/orders',
    method: 'get',
    handler: ({ query }) => {
      let rows = (table('orders') || []).slice()
      if (query.status) rows = rows.filter((o) => o.status === query.status)
      if (query.type) rows = rows.filter((o) => o.type === query.type)
      if (query.operatorId) rows = rows.filter((o) => o.operatorId === query.operatorId)
      if (query.amountMin) rows = rows.filter((o) => o.finalAmount >= Number(query.amountMin))
      if (query.amountMax) rows = rows.filter((o) => o.finalAmount <= Number(query.amountMax))
      return ok(
        queryList(rows, { ...query, status: '', type: '', operatorId: '', amountMin: '', amountMax: '' }, {
          searchFields: ['orderNo', 'memberName', 'memberPhone', 'memberNo', 'operatorName'],
        }),
      )
    },
  },
  {
    path: '/orders',
    method: 'post',
    handler: ({ body }) => {
      const items = body?.items || []
      return ok(
        {
          id: nextId('O'),
          orderNo: body?.orderNo || `SO${Date.now().toString().slice(-10)}`,
          finalAmount: body?.finalAmount ?? 0,
          pointsEarned: body?.pointsEarned ?? 0,
          itemCount: items.length,
          status: 'paid',
        },
        `结算成功，实收 ${Number(body?.finalAmount ?? 0).toFixed(2)} 元`,
      )
    },
  },
  {
    path: '/orders/:id',
    method: 'get',
    handler: ({ params }) => {
      const o = (table('orders') || []).find((x) => x.id === params.id || x.orderNo === params.id)
      return o ? ok(o) : fail('订单不存在', 404)
    },
  },
  {
    path: '/orders/:id/refund',
    method: 'post',
    handler: ({ params, body }) => {
      const o = (table('orders') || []).find((x) => x.id === params.id)
      if (!o) return fail('订单不存在', 404)
      const amount = body?.type === 'partial' ? Number(body.amount || 0) : o.finalAmount
      return ok(
        {
          refundNo: `TK${Date.now().toString().slice(-8)}`,
          orderNo: o.orderNo,
          amount,
          type: body?.type || 'full',
          pointsRollback: o.pointsEarned,
          stockRollback: o.items.length,
        },
        `退款成功，已返还库存并扣回 ${o.pointsEarned} 积分`,
      )
    },
  },
  {
    path: '/orders/:id/print',
    method: 'post',
    handler: ({ params }) => ok({ printed: true, orderId: params.id }, '小票已发送至打印机（模拟）'),
  },

  /* --------------------------- 挂单 / 取单 --------------------------- */
  { path: '/holds', method: 'get', handler: () => ok(table('holds') || []) },
  {
    path: '/holds/:id',
    method: 'get',
    handler: ({ params }) => {
      const h = (table('holds') || []).find((x) => x.id === params.id)
      return h ? ok(h) : fail('挂单不存在', 404)
    },
  },

  /* ------------------------------- 日志 ------------------------------- */
  {
    path: '/logs/operation',
    method: 'get',
    handler: ({ query }) => {
      let rows = (table('operation-logs') || []).slice()
      if (query.module) rows = rows.filter((r) => r.module === query.module)
      if (query.result) rows = rows.filter((r) => r.result === query.result)
      return ok(
        queryList(rows, { ...query, module: '', result: '' }, {
          searchFields: ['operatorName', 'username', 'detail', 'action'],
        }),
      )
    },
  },
  {
    path: '/logs/login',
    method: 'get',
    handler: ({ query }) => {
      const rows = (table('operation-logs') || []).filter((r) => r.module === '认证')
      return ok(queryList(rows, query, { searchFields: ['operatorName', 'username', 'detail'] }))
    },
  },
  {
    path: '/logs/modules',
    method: 'get',
    handler: () => {
      const rows = table('operation-logs') || []
      const mods = [...new Set(rows.map((r) => r.module))]
      return ok(mods)
    },
  },

  /* --------------------------- 看板 / 报表 --------------------------- */
  {
    path: '/dashboard',
    method: 'get',
    handler: () => {
      const d = clone(table('dashboard'))
      const stock = table('stock') || []
      const orders = table('orders') || []
      // 看板附加：最近订单、热销榜、库存预警
      return ok({
        ...d,
        recentOrders: orders.slice(0, 8),
        hotProducts: top(table('reports')?.productRank || [], 'amount', 6),
        warningList: stock.filter((s) => s.stockState !== 'normal').slice(0, 8),
        categoryStats: table('reports')?.categoryStats || [],
        trend: (table('reports')?.trend || []).slice(-14),
      })
    },
  },
  { path: '/reports', method: 'get', handler: ({ query }) => {
    const r = clone(table('reports'))
    const range = Number(query.days || 0)
    if (range > 0) r.trend = r.trend.slice(-range)
    return ok(r)
  } },
  { path: '/reports/trend', method: 'get', handler: ({ query }) => ok((table('reports')?.trend || []).slice(-Number(query.days || 14))) },
  { path: '/reports/product-rank', method: 'get', handler: ({ query }) => ok(top(table('reports')?.productRank || [], 'amount', Number(query.limit || 20))) },
  { path: '/reports/category', method: 'get', handler: () => ok(table('reports')?.categoryStats || []) },
  { path: '/reports/cashier', method: 'get', handler: () => ok(table('reports')?.cashierStats || []) },
  { path: '/reports/payment', method: 'get', handler: () => ok(table('reports')?.payStats || []) },
  { path: '/reports/hour', method: 'get', handler: () => ok(table('reports')?.hourStats || []) },
  {
    path: '/reports/export',
    method: 'post',
    handler: ({ body }) => ok({ file: `${body?.name || '报表'}_${Date.now()}.xlsx` }, '导出成功，文件已生成'),
  },

  /* ------------------------------- 设置 ------------------------------- */
  { path: '/settings', method: 'get', handler: () => ok(clone(table('settings'))) },
]

/* ============================ 路由匹配与分发 ============================ */

function splitPath(path) {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0]
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
}

function matchRoute(method, url) {
  const segs = splitPath(url)
  let best = null
  for (const route of ROUTES) {
    if (route.method !== method) continue
    const rSegs = splitPath(route.path)
    if (rSegs.length !== segs.length) continue
    const params = {}
    let hit = true
    for (let i = 0; i < rSegs.length; i++) {
      const r = rSegs[i]
      if (r.startsWith(':')) params[r.slice(1)] = decodeURIComponent(segs[i])
      else if (r !== segs[i]) {
        hit = false
        break
      }
    }
    if (hit) {
      best = { route, params }
      break
    }
  }
  return best
}

/* ============================ 写操作的兜底 ============================ */
/**
 * 演示约定：任何未显式登记的写操作都一律返回成功。
 * 这样页面可以「无条件 toast 成功」，不必为了演示环境加防御性 catch；
 * 将来把本文件换成真实后端时，这里删掉即可，业务代码无需改动。
 */
const WRITE_FALLBACK_MESSAGE = {
  post: '操作成功',
  put: '保存成功',
  patch: '保存成功',
  delete: '删除成功',
}

function writeFallback(method, url) {
  const segs = splitPath(url)
  return {
    status: 200,
    data: ok(
      { echo: { method: method.toUpperCase(), url, at: new Date().toISOString() } },
      WRITE_FALLBACK_MESSAGE[method] || '操作成功',
    ),
    // 标记为兜底命中，方便开发时排查（DEV 环境会打印）
    fallback: true,
  }
}

/**
 * 核心分发：把请求变成响应
 * @returns {Promise<{status:number, data:any}>}
 */
export async function dispatch({ method = 'get', url, params, data }) {
  const m = String(method).toLowerCase()
  const matched = matchRoute(m, url)

  if (!matched) {
    // 写操作兜底：POST / PUT / PATCH / DELETE 一律成功
    if (m !== 'get') {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(`[mock] 写接口兜底成功：${m.toUpperCase()} ${url}`)
      }
      return writeFallback(m, url)
    }

    // 读操作兜底：GET /api/xxx 自动映射到 mock-data/xxx.json
    const segs = splitPath(url)
    const last = segs[segs.length - 1]
    // 形如 /api/xxx/:id 的读取 → 从 xxx.json 里按 id 找
    const secondLast = segs[segs.length - 2]
    if (table(last)) {
      return { status: 200, data: ok(queryList(table(last), { ...(params || {}), ...(data || {}) })) }
    }
    if (secondLast && table(secondLast)) {
      const row = (table(secondLast) || []).find(
        (r) => String(r.id) === String(last) || String(r.orderNo) === String(last),
      )
      if (row) return { status: 200, data: ok(row) }
      if (params?.pageSize === 0) return { status: 200, data: ok(table(secondLast)) }
    }

    return {
      status: 404,
      data: fail(
        `[Mock] 未配置接口 ${m.toUpperCase()} ${url}。` +
          `已有数据表：${TABLES.join(' / ')}；请在 src/api/mock-server.js 的 ROUTES 中登记。`,
        404,
      ),
    }
  }

  try {
    const result = matched.route.handler({ params: matched.params, query: params || {}, body: data })
    const payload = result && typeof result === 'object' && 'code' in result ? result : ok(result)
    const status = payload.success ? 200 : payload.code && payload.code >= 400 ? payload.code : 400
    return { status, data: payload }
  } catch (err) {
    return { status: 500, data: fail(`[Mock] 接口执行异常：${err.message}`, 500) }
  }
}

export { ROUTES, session }
