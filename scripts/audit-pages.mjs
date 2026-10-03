/**
 * 页面静态审查（开发期使用）
 * 运行：node scripts/audit-pages.mjs
 * 检查：硬编码颜色 / 使用了未定义的图标 / 隐式依赖未导入的组件 / 直接 fetch
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

/* ------------------------- 收集已知的图标名 ------------------------- */
const iconSrc = readFileSync(join(SRC, 'components/ui/Icon.vue'), 'utf8')
const iconBlock = iconSrc.slice(iconSrc.indexOf('const PATHS = {'), iconSrc.indexOf('\n}\n', iconSrc.indexOf('const PATHS = {')))
const KNOWN_ICONS = new Set([...iconBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]))

/* ------------------------- 收集 UI 组件名 ------------------------- */
const uiDir = join(SRC, 'components/ui')
const layoutDir = join(SRC, 'components/layout')
const KNOWN_COMPONENTS = new Set()
for (const d of [uiDir, layoutDir]) {
  for (const f of readdirSync(d)) if (f.endsWith('.vue')) KNOWN_COMPONENTS.add(f.replace('.vue', ''))
}
KNOWN_COMPONENTS.add('ReceiptPaper')
KNOWN_COMPONENTS.add('HotProducts')
KNOWN_COMPONENTS.add('PaymentPanel')
KNOWN_COMPONENTS.add('RouterView')
KNOWN_COMPONENTS.add('RouterLink')
KNOWN_COMPONENTS.add('Transition')
KNOWN_COMPONENTS.add('TransitionGroup')
KNOWN_COMPONENTS.add('Teleport')
KNOWN_COMPONENTS.add('KeepAlive')

/* ------------------------- 逐个文件检查 ------------------------- */
const files = walk(join(SRC, 'pages')).concat(walk(join(SRC, 'components')))
const issues = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = src.split(/\r?\n/)

  lines.forEach((line, i) => {
    const no = i + 1
    // 1) 硬编码颜色（允许：#fff/#ffffff 用于按钮文字、纯黑小票、border-radius 无关）
    const hexes = [...line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
    for (const h of hexes) {
      const lower = h.toLowerCase()
      if (['#fff', '#ffffff'].includes(lower)) continue
      if (lower.startsWith('#111') || lower.startsWith('#1a1a1a') || lower.startsWith('#666') || lower.startsWith('#999')) continue
      // 允许在注释里说明色值
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      issues.push({ rel, no, kind: '硬编码颜色', detail: `${h}  →  ${line.trim().slice(0, 100)}` })
    }
    if (/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|blue|green|yellow|orange|purple|pink|indigo|teal|cyan|emerald|amber|lime|rose|violet|fuchsia|sky)-[0-9]{2,3}\b/.test(line)) {
      issues.push({ rel, no, kind: '硬编码 Tailwind 调色板', detail: line.trim().slice(0, 110) })
    }

    // 2) <Icon name="xxx"> 是否存在
    for (const m of line.matchAll(/<Icon[^>]*\bname="([A-Za-z][A-Za-z0-9]*)"/g)) {
      if (!KNOWN_ICONS.has(m[1])) {
        issues.push({ rel, no, kind: '图标不存在', detail: `name="${m[1]}"` })
      }
    }

    // 3) 直接 fetch/axios（应该走 @/api）
    if (/\bawait\s+fetch\(|from ['"]axios['"]/.test(line)) {
      issues.push({ rel, no, kind: '绕过假 axios', detail: line.trim().slice(0, 100) })
    }
  })

  // 4) 模板里用了但没 import 的 PascalCase 组件
  const scriptPart = src.slice(0, src.lastIndexOf('</script>') + 9)
  const templatePart = src.slice(src.indexOf('<template>'))
  const used = new Set(
    [...templatePart.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]),
  )
  for (const comp of used) {
    if (!KNOWN_COMPONENTS.has(comp)) continue
    if (!src.includes(`${comp}.vue`) && !src.includes(`'${comp}'`)) {
      issues.push({ rel, no: 0, kind: '组件未导入', detail: `<${comp}> 未在该文件中 import` })
    }
  }
}

/* ------------------------- 输出 ------------------------- */
const byKind = {}
for (const it of issues) (byKind[it.kind] ||= []).push(it)

console.log(`\n审查文件数：${files.length}   图标库：${KNOWN_ICONS.size} 个   组件：${KNOWN_COMPONENTS.size} 个\n`)
if (!issues.length) {
  console.log('✓ 未发现问题')
} else {
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`【${kind}】${list.length} 处`)
    for (const it of list.slice(0, 40)) {
      console.log(`   ${it.rel}${it.no ? `:${it.no}` : ''}  ${it.detail}`)
    }
    if (list.length > 40) console.log(`   … 其余 ${list.length - 40} 处省略`)
    console.log()
  }
}
console.log(`合计 ${issues.length} 处待确认\n`)
