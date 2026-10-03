/**
 * 模拟数据注册表
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 数据来源：项目根目录 /mock-data/*.json（唯一数据源，纯 JSON，可直接改）  │
 * │ 打包方式：Vite 的 import.meta.glob 在构建期把 JSON 内联进产物，           │
 * │           因此 dist 目录脱离服务器（甚至 file:// 双击）也能正常显示。     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 新增一张表：把 xxx.json 放进 mock-data/，这里不用改代码，
 * 然后在 src/api/mock-server.js 的 ROUTES 里加一行路由即可。
 */

const modules = import.meta.glob('../../mock-data/*.json', { eager: true, import: 'default' })

/** @type {Record<string, any>} 形如 { 'products.json': [...] } */
export const RAW = {}
for (const [path, data] of Object.entries(modules)) {
  const name = path.split('/').pop()
  RAW[name] = data
}

/** 取一张表（去掉 .json 后缀） */
export function table(name) {
  const key = name.endsWith('.json') ? name : `${name}.json`
  return RAW[key]
}

/** 深拷贝，避免页面直接改到"数据库" */
export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/** 所有可用表名 */
export const TABLES = Object.keys(RAW)

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(`[mock-data] 已加载 ${TABLES.length} 张模拟数据表：${TABLES.join(', ')}`)
}
