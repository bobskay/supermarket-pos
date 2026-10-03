/**
 * i18n 键完整性校验（开发期工具，常驻）
 * 运行：node scripts/check-i18n-keys.mjs
 *
 * 检查三件事：
 *   1) 源码里 t('x.y') 用到的键，字典里是否存在（缺失会在界面上显示成 "x.y" 这种字面量）
 *   2) zh 与 en 的键是否一一对应（英文缺键会静默回退中文，容易漏翻）
 *   3) 字典里定义了但没人用的键（提示冗余，仅供参考）
 *
 * 说明：动态键（如 t(STATE_KEY[row.status])）无法静态分析，会被跳过。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

/* ------------------------- 载入字典 ------------------------- */
const dictModule = await import(pathToFileURL(join(SRC, 'i18n/dict.js')).href)
const { DICTS } = dictModule

/** 把嵌套字典拍平成 'a.b.c' 列表 */
function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.push(key)
  }
  return out
}

const zhKeys = new Set(flatten(DICTS.zh))
const enKeys = new Set(flatten(DICTS.en))

/* ------------------------- 扫描源码 ------------------------- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|js)$/.test(p)) out.push(p)
  }
  return out
}

// 匹配 t('a.b') / $t('a.b') / t("a.b")，允许第二个参数
const CALL_RE = /(?<![\w$])\$?t\(\s*['"]([a-zA-Z][\w]*(?:\.[\w]+)*)['"]/g

const used = new Map() // key -> Set(文件)
for (const file of walk(SRC)) {
  if (file.includes(`${join('i18n', 'dict.js')}`)) continue
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  for (const m of src.matchAll(CALL_RE)) {
    const key = m[1]
    // 过滤掉明显不是字典键的调用（如 t(' ') 之类），并且要求含点号或首段属于字典一级分区
    const top = key.split('.')[0]
    if (!key.includes('.') && !Object.prototype.hasOwnProperty.call(DICTS.zh, top)) continue
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(rel)
  }
}

/* ------------------------- 结果 ------------------------- */
const missingInZh = []
const missingInEn = []
for (const [key, files] of used) {
  if (!zhKeys.has(key)) missingInZh.push({ key, files: [...files] })
  if (!enKeys.has(key)) missingInEn.push({ key, files: [...files] })
}

const unused = [...zhKeys].filter((k) => !used.has(k))

console.log(`\n字典键：zh ${zhKeys.size} 个 / en ${enKeys.size} 个`)
console.log(`源码引用：${used.size} 个不同的键\n`)

let bad = 0

if (missingInZh.length) {
  bad += missingInZh.length
  console.log(`✗ zh 缺失 ${missingInZh.length} 个键（界面会直接显示键名）：`)
  for (const m of missingInZh.slice(0, 30)) console.log(`    ${m.key}   ← ${m.files.join(', ')}`)
  if (missingInZh.length > 30) console.log(`    … 其余 ${missingInZh.length - 30} 个省略`)
  console.log('')
} else {
  console.log('✓ 源码用到的键在 zh 里都存在')
}

if (missingInEn.length) {
  bad += missingInEn.length
  console.log(`\n✗ en 缺失 ${missingInEn.length} 个键（会静默回退中文）：`)
  for (const m of missingInEn.slice(0, 30)) console.log(`    ${m.key}   ← ${m.files.join(', ')}`)
  if (missingInEn.length > 30) console.log(`    … 其余 ${missingInEn.length - 30} 个省略`)
  console.log('')
} else {
  console.log('✓ en 与 zh 的键完全对应')
}

if (unused.length) {
  console.log(`\n· 未被引用的键 ${unused.length} 个（可能是预留，仅供参考）：`)
  console.log(`    ${unused.slice(0, 20).join(', ')}${unused.length > 20 ? ' …' : ''}`)
}

console.log(`\n${bad ? `✗ 存在 ${bad} 个问题需要修复` : '✓ 键完整性检查通过'}\n`)

// 说明：未被引用的键只是提示（可能是为扩展语言预留），不作为失败条件
process.exitCode = bad ? 1 : 0
