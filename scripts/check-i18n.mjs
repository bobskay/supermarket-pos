/**
 * 模板中文残留扫描（开发期工具）
 * 运行：node scripts/check-i18n.mjs
 *
 * 用途：找出 <template> 里还没接入多语言的中文字面量
 *   · 文本节点里的中文（{{ $t('x') }} 里没有中文，所以不会误报）
 *   · 静态属性值里的中文（placeholder="请输入…" / :title="'查看' + x"）
 *
 * 会跳过：注释、<script> 区、纯数据绑定（{{ row.name }} 这类不含中文的表达式）。
 * 数据内容（商品名等来自 mock-data）本来就不翻译，因此这里只提示前 N 处供人工判断。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')

const CJK = /[\u4e00-\u9fff]/
const MAX_PER_FILE = 12

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 用二分查找把偏移量换算成行号 */
function lineOf(text, index) {
  let lo = 0
  let hi = text.length
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

const files = walk(SRC)
let total = 0
const report = []

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const start = raw.indexOf('<template>')
  const end = raw.lastIndexOf('</template>')
  if (start === -1 || end === -1) continue

  let tpl = raw.slice(start, end)
  // 去掉 HTML 注释，避免把说明文字算进去
  tpl = tpl.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))

  const hits = []

  // 1) 静态属性值里的中文
  for (const m of tpl.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
    if (CJK.test(m[2])) {
      hits.push({ index: m.index, text: `${m[1]}="${m[2]}"` })
    }
  }

  // 2) 标签之间的文本节点里有中文
  for (const m of tpl.matchAll(/>([^<>{}]+)</g)) {
    if (CJK.test(m[1])) {
      hits.push({ index: m.index, text: m[1].trim().slice(0, 60) })
    }
  }

  if (hits.length) {
    total += hits.length
    report.push({
      rel: relative(ROOT, file).replace(/\\/g, '/'),
      count: hits.length,
      items: hits
        .sort((a, b) => a.index - b.index)
        .slice(0, MAX_PER_FILE)
        .map((h) => ({ line: lineOf(tpl, h.index), text: h.text })),
    })
  }
}

console.log(`\n扫描 ${files.length} 个 .vue 文件的 <template> 区\n`)
if (!report.length) {
  console.log('  ✓ 没有发现未国际化的中文文案\n')
} else {
  report.sort((a, b) => b.count - a.count)
  for (const r of report) {
    console.log(`  ${r.rel}   ${r.count} 处`)
    for (const it of r.items) console.log(`      ${it.line}: ${it.text}`)
    if (r.count > MAX_PER_FILE) console.log(`      … 其余 ${r.count - MAX_PER_FILE} 处省略`)
  }
  console.log(`\n合计 ${total} 处中文字面量（数据内容与注释不算，请人工判断）\n`)
}

process.exitCode = 0
