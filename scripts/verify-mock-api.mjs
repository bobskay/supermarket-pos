/**
 * 假后端自检脚本（开发期使用，不参与打包）
 * 运行：node scripts/verify-mock-api.mjs
 * 作用：不依赖浏览器，直接验证 URL → mock-data 的路由、分页、筛选与写操作兜底。
 *
 * 实现说明：src/api/mock-server.js 通过 import.meta.glob 拿到数据表（浏览器/打包环境的能力），
 * 这里把该 import 去掉，改成用 fs 读 JSON，再以 Function 的形式把依赖注进去。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MOCK_DIR = resolve(__dirname, '../mock-data')

const RAW = {}
for (const f of readdirSync(MOCK_DIR)) {
  if (f.endsWith('.json')) RAW[f] = JSON.parse(readFileSync(resolve(MOCK_DIR, f), 'utf8'))
}
const table = (n) => RAW[n.endsWith('.json') ? n : `${n}.json`]

// 把对 ./mock-data 的 import 行去掉，并抹掉 export 语法，让它能被 Function 构造
const serverSrc = readFileSync(resolve(__dirname, '../src/api/mock-server.js'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.includes("from './mock-data'"))
  .join('\n')
  .replace('import.meta.env.DEV', 'false')
  .replace(/export \{[^}]*\}/g, '')
  .replace(/\bexport\s+/g, '')

const loader = new Function(
  'table',
  'clone',
  'RAW',
  'TABLES',
  `${serverSrc}\nreturn { dispatch, ROUTES }`,
)
const { dispatch, ROUTES } = loader(
  table,
  (v) => (v == null ? v : JSON.parse(JSON.stringify(v))),
  RAW,
  Object.keys(RAW),
)
/* ------------------------------ 断言工具 ------------------------------ */
let pass = 0
let failCount = 0
const failures = []

function check(name, cond, extra) {
  if (cond) {
    pass++
    process.stdout.write(`  ✓ ${name}\n`)
  } else {
    failCount++
    failures.push(name)
    process.stdout.write(`  ✗ ${name}${extra ? `  → ${extra}` : ''}\n`)
  }
}

async function call(method, url, params, data) {
  const res = await dispatch({ method, url, params, data })
  return res
}

/* ------------------------------ 开始 ------------------------------ */
console.log(`\n=== 模拟数据表 ===\n  ${Object.keys(RAW).join(', ')}\n`)
console.log(`=== 路由表 ===\n  已登记 ${ROUTES.length} 条\n`)

console.log('--- 1. 列表读取与分页 ---')
{
  const r = await call('get', '/orders', { page: 1, pageSize: 10 })
  console.log('   DEBUG keys:', Object.keys(r.data?.data || {}).join(','), '| list len:', r.data?.data?.list?.length, '| total:', r.data?.data?.total)
  check('GET /orders 返回 code 0', r.data.code === 0)
  check('分页 list 长度 = 10', r.data.data.list?.length === 10, `实际 ${r.data.data.list?.length}`)
  check('total = 346', r.data.data.total === 346, `实际 ${r.data.data.total}`)
  check('默认按下单时间倒序', r.data.data.list[0].createdAt >= r.data.data.list[9].createdAt)

  const p2 = await call('get', '/orders', { page: 2, pageSize: 10 })
  check('第 2 页与第 1 页不重复', p2.data.data.list[0].id !== r.data.data.list[0].id)

  const all = await call('get', '/orders', { pageSize: 0 })
  check('pageSize=0 返回全部', all.data.data.list.length === 346, `实际 ${all.data.data.list.length}`)
}

console.log('--- 2. 关键字 / 精确筛选 / 排序 ---')
{
  const r = await call('get', '/products', { keyword: '苹果' })
  check('商品名称模糊搜索命中', r.data.data.list.length > 0, `命中 ${r.data.data.list.length}`)

  const b = await call('get', '/products', { keyword: '6900000000137' })
  check('按条码搜索命中 1 条', b.data.data.list.length === 1)

  const st = await call('get', '/products', { status: 'inactive' })
  check('按状态筛选只返回停用商品', st.data.data.list.every((p) => p.status === 'inactive'))

  const mem = await call('get', '/members', { exact: 'phone:' + RAW['members.json'][0].phone })
  check('exact 精确匹配手机号', mem.data.data.list.length === 1)

  const asc = await call('get', '/orders', { sortBy: 'finalAmount', sortOrder: 'asc', pageSize: 5 })
  const amounts = asc.data.data.list.map((o) => o.finalAmount)
  check('按金额升序排序正确', amounts.every((v, i) => i === 0 || amounts[i - 1] <= v), amounts.join(','))

  const range = await call('get', '/orders', { startDate: '2026-03-20', endDate: '2026-03-20', pageSize: 0 })
  check('日期区间筛选只返回当天', range.data.data.list.every((o) => o.date === '2026-03-20'))
}

console.log('--- 3. 条码查询与详情 ---')
{
  const barcode = RAW['products.json'][0].barcode
  const r = await call('get', `/products/barcode/${barcode}`)
  check('按条码取商品成功', r.data.code === 0 && r.data.data.barcode === barcode)

  const notFound = await call('get', '/products/barcode/0000000000000')
  check('不存在的条码返回业务失败', notFound.data.success === false)

  const id = RAW['orders.json'][0].id
  const d = await call('get', `/orders/${id}`)
  check('订单详情可按 id 取到', d.data.data.id === id)

  const byNo = await call('get', `/orders/${RAW['orders.json'][0].orderNo}`)
  check('订单详情也可按单号取到', byNo.data.data.id === id)

  const m = await call('get', `/members/${RAW['members.json'][0].id}`)
  check('会员详情携带订单与积分明细', Array.isArray(m.data.data.orders) && Array.isArray(m.data.data.pointLogs))
}

console.log('--- 4. 聚合接口 ---')
{
  const sum = await call('get', '/stock/summary')
  check('库存汇总字段完整', ['skuCount', 'totalQty', 'totalAmount', 'lowCount', 'emptyCount', 'warningList'].every((k) => k in sum.data.data))
  check('库存汇总 SKU 数 = 61', sum.data.data.skuCount === 61, `实际 ${sum.data.data.skuCount}`)

  const dash = await call('get', '/dashboard')
  check('看板返回 KPI 与最近订单', !!dash.data.data.kpi && dash.data.data.recentOrders.length === 8)
  check('看板趋势为最近 14 天', dash.data.data.trend.length === 14, `实际 ${dash.data.data.trend.length}`)

  const rep = await call('get', '/reports', { days: 7 })
  check('报表趋势可切周期', rep.data.data.trend.length === 7)
  check('报表含支付/排行/品类/收银员/时段', ['payStats', 'productRank', 'categoryStats', 'cashierStats', 'hourStats'].every((k) => Array.isArray(rep.data.data[k])))

  const mods = await call('get', '/logs/modules')
  check('日志模块枚举非空', Array.isArray(mods.data.data) && mods.data.data.length > 0, mods.data.data?.join('/'))
}

console.log('--- 5. 登录鉴权 ---')
{
  const bad = await call('post', '/auth/login', {}, { username: 'admin', password: 'wrong' })
  check('密码错误被拒绝', bad.data.success === false && bad.status === 401)

  const noUser = await call('post', '/auth/login', {}, { username: 'nobody', password: '123456' })
  check('账号不存在被拒绝', noUser.data.success === false)

  const good = await call('post', '/auth/login', {}, { username: 'admin', password: '123456' })
  check('店长登录成功且返回 token', good.data.code === 0 && !!good.data.data.token)
  check('登录响应不包含密码字段', good.data.data.user.password === undefined)

  const cashier = await call('post', '/auth/login', {}, { username: 'cashier01', password: '123456' })
  check('收银员登录成功且角色正确', cashier.data.data.user.role === 'cashier')
}

console.log('--- 6. 写操作（演示环境一律成功） ---')
{
  const cases = [
    ['post', '/orders', { items: [{ qty: 2 }], finalAmount: 88.8, pointsEarned: 88 }],
    ['post', '/members', { name: '演示会员', phone: '13900000000' }],
    ['put', '/products/P0001', { price: 9.9 }],
    ['delete', '/products/P0001'],
    ['post', '/products', { name: '新商品' }],
    ['post', '/categories', { name: '新分类' }],
    ['post', '/stock/adjust', { type: 'loss', qty: -2 }],
    ['post', '/stock/purchase-orders', { supplier: '测试供应商' }],
    ['post', '/stock/purchase-orders/PO00001/confirm'],
    ['post', '/orders/O000001/refund', { type: 'full', reason: '测试' }],
    ['post', '/orders/O000001/print'],
    ['post', '/holds', { items: [] }],
    ['delete', '/holds/H001'],
    ['put', '/members/M0001', { name: '改名' }],
    ['delete', '/members/M0001'],
    ['post', '/members/M0001/points', { change: 100 }],
    ['put', '/users/U002', { name: '改名' }],
    ['post', '/users/U002/reset-password'],
    ['put', '/settings', { pos: {} }],
    ['post', '/reports/export', { name: '销售报表' }],
    ['post', '/auth/password', { oldPassword: '123456', newPassword: '654321' }],
    ['post', '/orders/O000001/anything-unregistered'],
  ]
  for (const [m, url, body] of cases) {
    const r = await call(m, url, {}, body)
    check(`${m.toUpperCase()} ${url} → 成功`, r.data.success === true, `code=${r.data.code} msg=${r.data.message}`)
  }

  const refund = await call('post', '/orders/O000001/refund', {}, { type: 'full', reason: '商品质量问题' })
  check('退款返回单号与积分回滚信息', !!refund.data.data.refundNo && refund.data.data.pointsRollback >= 0)
}

console.log('--- 7. 未登记的读取应报错（便于开发期发现漏登记） ---')
{
  const r = await call('get', '/not-exist-endpoint')
  check('未登记 GET 返回 404 提示', r.status === 404 && r.data.success === false)
}

console.log(`\n=== 结果：${pass} 通过 / ${failCount} 失败 ===`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
