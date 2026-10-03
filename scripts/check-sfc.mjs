/**
 * SFC 编译自检（开发期工具，常驻）
 * 运行：node scripts/check-sfc.mjs
 *
 * 用 Vue 官方编译器把 src 下所有 .vue 编译一遍，任何模板结构问题
 * （v-if/v-else 不成对、标签未闭合、插槽用法错误等）都会在这里报出来。
 * 这是不依赖浏览器、也不依赖 Vite 的权威检查。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

/** 从 pnpm 的 .pnpm 目录里定位 @vue/compiler-sfc */
function loadCompiler() {
  const pnpmDir = join(ROOT, 'node_modules/.pnpm')
  if (!existsSync(pnpmDir)) throw new Error('找不到 node_modules/.pnpm')
  const dirs = readdirSync(pnpmDir).filter((d) => d.startsWith('@vue+compiler-sfc@'))
  if (!dirs.length) throw new Error('未安装 @vue/compiler-sfc')
  const entry = join(pnpmDir, dirs[0], 'node_modules/@vue/compiler-sfc/dist/compiler-sfc.cjs.js')
  if (!existsSync(entry)) throw new Error(`找不到编译器入口：${entry}`)
  return { entry, version: dirs[0].replace('@vue+compiler-sfc@', '') }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

const { entry, version } = loadCompiler()
const compiler = await import(pathToFileURL(entry).href)
const parse = compiler.parse || compiler.default?.parse
const compileTemplate = compiler.compileTemplate || compiler.default?.compileTemplate
const compileScript = compiler.compileScript || compiler.default?.compileScript

const files = walk(SRC)
let errors = 0

console.log(`\n使用 @vue/compiler-sfc ${version} 编译 ${files.length} 个 .vue 文件\n`)

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const source = readFileSync(file, 'utf8')
  const problems = []

  try {
    const { descriptor, errors: parseErrors } = parse(source, { filename: file })
    for (const e of parseErrors || []) problems.push(`parse: ${e.message}`)

    if (descriptor.template) {
      const res = compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: rel,
      })
      for (const e of res.errors || []) {
        problems.push(`template: ${typeof e === 'string' ? e : e.message}`)
      }
    }

    if (descriptor.scriptSetup || descriptor.script) {
      try {
        compileScript(descriptor, { id: rel })
      } catch (e) {
        problems.push(`script: ${e.message}`)
      }
    }
  } catch (e) {
    problems.push(`致命错误: ${e.message}`)
  }

  if (problems.length) {
    errors++
    console.log(`  ✗ ${rel}`)
    for (const p of problems.slice(0, 6)) console.log(`      ${p}`)
  }
}

if (!errors) console.log('  ✓ 全部文件编译通过\n')
else console.log(`\n✗ ${errors} 个文件存在编译问题\n`)

process.exitCode = errors ? 1 : 0
