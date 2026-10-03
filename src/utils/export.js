/**
 * 表格导出（前端直接生成文件，演示环境不需要后端）
 * - CSV：带 BOM，Excel 打开不乱码
 * - 打印：调用浏览器打印，用于「导出盘点表」这类场景
 */

/** 把二维数组导出为 CSV 并下载 */
export function exportCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** 由对象数组导出：keys 为 [[字段, 表头], ...] */
export function exportObjects(filename, columns, list) {
  exportCsv(
    filename,
    columns.map((c) => c[1]),
    (list || []).map((row) => columns.map((c) => (typeof c[2] === 'function' ? c[2](row) : row[c[0]]))),
  )
}

/** 导出为 Excel 可直接打开的 .xls（HTML 表格伪装，够演示用） */
export function exportXls(filename, headers, rows, title = '数据导出') {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"><style>
table{border-collapse:collapse;font-family:"Microsoft YaHei",sans-serif;font-size:12px}
th{background:#eef1f6;border:1px solid #c9cfda;padding:6px 8px;font-weight:600}
td{border:1px solid #d8dde6;padding:5px 8px}
h3{font-family:"Microsoft YaHei",sans-serif}
</style></head><body>
<h3>${title}</h3>
<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c == null ? '' : String(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' })
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 打印指定元素（小票 / 盘点表） */
export function printElement(el) {
  if (!el) {
    window.print()
    return
  }
  el.classList.add('print-area')
  window.print()
  setTimeout(() => el.classList.remove('print-area'), 300)
}
