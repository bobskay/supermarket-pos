/**
 * 模板 ref 误用检查（开发期工具）
 * 运行：node scripts/check-template-refs.mjs
 *
 * 背景（本次踩过的坑）：
 *   Vue 模板对 setup 返回对象里的 ref 会「自动解包」。
 *   所以在模板中 t.list 已是数组，再写 t.list.value 会得到 undefined
 *   （此时 t.total 反而是对的）——这类不一致极难肉眼发现，必须靠检查。
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

const files = walk(SRC)
const issues = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')

  // 只看模板部分：从 <template> 到最后一个 </template>
  const start = src.indexOf('<template>')
  if (start === -1) continue
  const end = src.lastIndexOf('</template>')
  const template = src.slice(start, end)
  const offsetLine = src.slice(0, start).split(/\r?\n/).length

  template.split(/\r?\n/).forEach((line, i) => {
    // 形如 t.list.value / t.total.value（模板里多写了 .value）
    const m = line.match(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\.value\b/g)
    if (m) {
      issues.push({ rel, line: offsetLine + i, code: line.trim().slice(0, 110), hits: m })
    }
  })
}

console.log(`\n扫描 ${files.length} 个 .vue 文件\n`)
if (!issues.length) {
  console.log('✓ 模板中未发现多余的 .value（自动解包已正确处理）\n')
} else {
  console.log(`发现 ${issues.length} 处模板里多余的 .value：\n`)
  for (const it of issues) {
    console.log(`  ${it.rel}:${it.line}`)
    console.log(`     ${it.code}`)
    console.log(`     → ${it.hits.join(', ')}`)
  }
  console.log('')
}
