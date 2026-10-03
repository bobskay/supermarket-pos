/**
 * 商品图片生成脚本（开发期使用）
 * 运行：node scripts/gen-product-images.mjs
 * 产物：public/products/p0001.svg … p0061.svg，并同步更新 mock-data/products.json 的 image 字段
 *
 * 为什么用脚本生成而不是找网图：
 *   1) 演示站点最终要打包成静态页面，不能依赖外网图床
 *   2) 每张图按商品类型给出合理的形状与配色（苹果是红圆、牛奶是蓝白盒、纸巾是白卷…），
 *      比统一的灰色占位块更像真实商品，也不需要引入 61 个二进制文件
 *   3) 想换成真实照片时，只要把同名的 .jpg/.png 放进 public/products/ 并改 products.json 的 image 即可
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'public/products')
const PRODUCTS = resolve(ROOT, 'mock-data/products.json')
mkdirSync(OUT, { recursive: true })

/* 历史版本曾在 products.json 里写过 image 字段，这里顺手清掉，保持数据源干净 */
function cleanupImageField() {
  const rows = JSON.parse(readFileSync(PRODUCTS, 'utf8'))
  let removed = 0
  const cleaned = rows.map((r) => {
    if ('image' in r) {
      removed++
      const { image, ...rest } = r
      return rest
    }
    return r
  })
  if (removed) writeFileSync(PRODUCTS, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8')
  return removed
}
const cleaned = cleanupImageField()

/* ------------------------------------------------------------------
 * 配色：按商品分类给出「主色 / 深色 / 浅底」，同一分类下再用不同色相区分
 * ------------------------------------------------------------------ */
const CATEGORY_THEME = {
  FRESH: { bg: '#eef8ea', deep: '#2f7d32' },
  MEAT: { bg: '#fdeeec', deep: '#b3382f' },
  DAIRY: { bg: '#e9f3fd', deep: '#1c5c96' },
  DRINK: { bg: '#e8f4f8', deep: '#1a6f8c' },
  SNACK: { bg: '#fdf3e4', deep: '#a8600f' },
  GRAIN: { bg: '#faf4e2', deep: '#8a6b18' },
  DAILY: { bg: '#eeeefb', deep: '#4a4a9c' },
  CLEAN: { bg: '#eaf6f4', deep: '#186c60' },
}

/**
 * 商品图元数据：[条码序号, 名称, 分类, 形状, 主色]
 * 形状：round 圆形 / curve 弧形 / box 长方体 / bottle 瓶罐 / bag 袋装 /
 *       roll 卷纸 / bar 条状 / carton 纸盒 / tray 托盘 / pack 集合
 */
const ITEMS = [
  // 生鲜果蔬 —— 圆形 / 弧形，用红、黄、绿区分
  ['红富士苹果', 'FRESH', 'round', '#e0413f'],
  ['海南香蕉', 'FRESH', 'curve', '#e8b431'],
  ['武鸣沃柑', 'FRESH', 'round', '#ef8b2c'],
  ['麒麟西瓜', 'FRESH', 'round', '#1f8a4c'],
  ['本地小青菜', 'FRESH', 'leaf', '#4caf50'],
  ['山东黄瓜', 'FRESH', 'bar', '#3f9d4f'],
  ['沙地土豆', 'FRESH', 'round', '#c9a06a'],
  ['云南西红柿', 'FRESH', 'round', '#e2543f'],
  ['白玉洋葱', 'FRESH', 'round', '#d8c7a8'],
  ['新鲜香菇', 'FRESH', 'tray', '#8a6a4f'],
  // 肉禽蛋品 —— 托盘 / 条状，偏红
  ['带皮五花肉', 'MEAT', 'tray', '#e2766b'],
  ['猪前腿瘦肉', 'MEAT', 'tray', '#d95f52'],
  ['新鲜猪肋排', 'MEAT', 'bar', '#c9503f'],
  ['清远走地鸡', 'MEAT', 'tray', '#e8a03f'],
  ['新鲜鸡腿', 'MEAT', 'bar', '#dd8f4a'],
  ['黄牛腱子肉', 'MEAT', 'tray', '#a83a30'],
  ['散养土鸡蛋', 'MEAT', 'pack', '#e0b678'],
  ['鲜鱿鱼', 'MEAT', 'tray', '#d98b8b'],
  // 乳品烘焙 —— 纸盒 / 袋装，蓝白
  ['伊利纯牛奶250ml', 'DAIRY', 'carton', '#2f7fc1'],
  ['蒙牛特仑苏礼盒', 'DAIRY', 'box', '#1f5fa8'],
  ['光明酸奶100g*8', 'DAIRY', 'pack', '#4a9ad4'],
  ['安佳淡奶油1L', 'DAIRY', 'carton', '#3d7fb0'],
  ['桃李吐司面包', 'DAIRY', 'bag', '#d9a05b'],
  ['现烤红豆餐包', 'DAIRY', 'round', '#c98a4b'],
  // 酒水饮料 —— 瓶罐 / 箱装
  ['农夫山泉550ml', 'DRINK', 'bottle', '#2f9bc9'],
  ['怡宝纯净水1.5L', 'DRINK', 'bottle', '#57b3d9'],
  ['可口可乐330ml', 'DRINK', 'can', '#d63b32'],
  ['雪碧冰爽柠檬味', 'DRINK', 'can', '#3fa84a'],
  ['康师傅冰红茶1L', 'DRINK', 'bottle', '#c8702a'],
  ['青岛啤酒500ml', 'DRINK', 'can', '#1f7a4d'],
  ['长城干红葡萄酒', 'DRINK', 'bottle', '#6b2f3f'],
  ['东鹏特饮500ml', 'DRINK', 'bottle', '#d9a11f'],
  // 休闲零食 —— 袋装 / 盒装
  ['乐事薯片原味', 'SNACK', 'bag', '#e2a52c'],
  ['奥利奥夹心饼干', 'SNACK', 'bag', '#2f5fa8'],
  ['洽洽香瓜子160g', 'SNACK', 'bag', '#d97a2b'],
  ['旺旺雪饼84g', 'SNACK', 'bag', '#e0b13f'],
  ['德芙丝滑牛奶巧克力', 'SNACK', 'bar', '#7a4a2b'],
  ['三只松鼠每日坚果', 'SNACK', 'box', '#c47a3a'],
  ['徐福记酥心糖', 'SNACK', 'bag', '#d94f6a'],
  // 粮油调味 —— 桶 / 瓶 / 袋
  ['金龙鱼调和油5L', 'GRAIN', 'bottle', '#d9a92b'],
  ['福临门东北大米10kg', 'GRAIN', 'bag', '#dcd3c0'],
  ['海天生抽500ml', 'GRAIN', 'bottle', '#5a3826'],
  ['镇江香醋500ml', 'GRAIN', 'bottle', '#4a3020'],
  ['太太乐鸡精200g', 'GRAIN', 'bag', '#e0a83f'],
  ['中盐加碘食用盐', 'GRAIN', 'bag', '#8fb8d9'],
  ['白砂糖400g', 'GRAIN', 'bag', '#e8e0d0'],
  // 日用百货 —— 瓶 / 盒 / 条
  ['蓝月亮洗衣液3kg', 'DAILY', 'bottle', '#3f6fd9'],
  ['舒肤佳香皂', 'DAILY', 'box', '#e08a9a'],
  ['海飞丝洗发水400ml', 'DAILY', 'bottle', '#2f8fb0'],
  ['高露洁牙膏140g', 'DAILY', 'box', '#d94a4a'],
  ['得力中性笔0.5mm', 'DAILY', 'bar', '#3a3a5a'],
  ['5号碱性电池4粒', 'DAILY', 'pack', '#4a4a4a'],
  ['不锈钢衣架10只', 'DAILY', 'bar', '#9aa3ad'],
  ['一次性手套100只', 'DAILY', 'box', '#8fb8d0'],
  // 清洁纸品 —— 卷纸 / 提装
  ['维达卷纸10卷', 'CLEAN', 'roll', '#7fb8d9'],
  ['清风抽纸3层6包', 'CLEAN', 'box', '#6fa8c9'],
  ['心相印手帕纸10包', 'CLEAN', 'pack', '#5f98b9'],
  ['威猛先生洁厕灵', 'CLEAN', 'bottle', '#3f9fa8'],
  ['妙洁保鲜袋100只', 'CLEAN', 'box', '#9ac4b8'],
  ['加厚垃圾袋30只', 'CLEAN', 'roll', '#4a5a6a'],
  ['洁云厨房纸巾2卷', 'CLEAN', 'roll', '#a8c4d0'],
]

/* ------------------------------------------------------------------ */
/* 图形绘制：在 100×100 的画布上，按形状给出简洁的扁平化商品插画          */
/* ------------------------------------------------------------------ */
function shapeSvg(shape, color) {
  const c = color
  const dark = 'rgba(0,0,0,.18)'
  const light = 'rgba(255,255,255,.55)'
  switch (shape) {
    case 'round':
      return `
        <circle cx="50" cy="56" r="27" fill="${c}"/>
        <path d="M50 30c0-7 5-12 12-13-1 8-5 12-12 13z" fill="#3f9d4f"/>
        <ellipse cx="41" cy="47" rx="8" ry="5" fill="${light}" transform="rotate(-28 41 47)"/>`
    case 'curve':
      return `
        <path d="M24 66c0-22 12-34 30-34 8 0 14 3 20 8-9 1-15 5-19 12-5 9-6 14-6 14H24z" fill="${c}"/>
        <path d="M28 62c2-16 12-26 28-27" stroke="${light}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    case 'leaf':
      return `
        <path d="M50 76c-16 0-26-10-26-24 0-12 10-20 26-20s26 8 26 20c0 14-10 24-26 24z" fill="#e8f5e9"/>
        <path d="M50 76c-10 0-18-8-18-20" stroke="#4caf50" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M50 76c10 0 18-8 18-20" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M50 78V52" stroke="#2f7d32" stroke-width="3" stroke-linecap="round"/>`
    case 'bar':
      return `
        <rect x="20" y="40" width="60" height="26" rx="13" fill="${c}"/>
        <rect x="26" y="46" width="34" height="6" rx="3" fill="${light}"/>`
    case 'box':
      return `
        <rect x="18" y="34" width="64" height="42" rx="4" fill="${c}"/>
        <rect x="18" y="34" width="64" height="12" rx="4" fill="rgba(255,255,255,.32)"/>
        <rect x="30" y="56" width="40" height="6" rx="3" fill="${light}"/>
        <rect x="30" y="66" width="24" height="5" rx="2.5" fill="${light}" opacity=".7"/>`
    case 'carton':
      return `
        <path d="M30 26h28l14 12v44H30z" fill="${c}"/>
        <path d="M58 26l14 12H58z" fill="rgba(255,255,255,.4)"/>
        <rect x="36" y="50" width="24" height="5" rx="2.5" fill="${light}"/>
        <rect x="36" y="60" width="16" height="5" rx="2.5" fill="${light}" opacity=".7"/>
        <path d="M30 26h28l14 12" stroke="${dark}" stroke-width="1.5" fill="none"/>`
    case 'bottle':
      return `
        <rect x="42" y="18" width="16" height="10" rx="3" fill="${dark}"/>
        <path d="M38 30h24c4 0 6 3 6 6v34c0 4-3 6-6 6H38c-3 0-6-2-6-6V36c0-3 2-6 6-6z" fill="${c}"/>
        <rect x="36" y="46" width="28" height="16" rx="3" fill="${light}"/>
        <rect x="42" y="52" width="16" height="4" rx="2" fill="${c}" opacity=".55"/>`
    case 'can':
      return `
        <rect x="32" y="26" width="36" height="50" rx="6" fill="${c}"/>
        <ellipse cx="50" cy="27" rx="18" ry="4" fill="rgba(255,255,255,.6)"/>
        <rect x="38" y="44" width="24" height="12" rx="3" fill="${light}"/>
        <ellipse cx="50" cy="75" rx="18" ry="4" fill="${dark}"/>`
    case 'bag':
      return `
        <path d="M26 32h48l-4 44H30z" fill="${c}"/>
        <path d="M26 32h48l-1 10H27z" fill="rgba(255,255,255,.3)"/>
        <rect x="36" y="52" width="28" height="6" rx="3" fill="${light}"/>
        <rect x="36" y="63" width="18" height="5" rx="2.5" fill="${light}" opacity=".7"/>`
    case 'roll':
      return `
        <rect x="22" y="36" width="56" height="34" rx="8" fill="${c}"/>
        <ellipse cx="50" cy="53" rx="10" ry="9" fill="#fff"/>
        <ellipse cx="50" cy="53" rx="4" ry="3.5" fill="${c}" opacity=".5"/>
        <rect x="28" y="42" width="14" height="6" rx="3" fill="${light}"/>`
    case 'tray':
      return `
        <rect x="16" y="40" width="68" height="32" rx="5" fill="#f4f6f8"/>
        <rect x="16" y="40" width="68" height="32" rx="5" fill="none" stroke="${dark}" stroke-width="1"/>
        <path d="M28 62c0-9 6-15 14-15s14 6 14 15z" fill="${c}"/>
        <path d="M58 62c0-7 4-12 10-12s10 5 10 12z" fill="${c}" opacity=".8"/>`
    case 'pack':
      return `
        <circle cx="36" cy="60" r="16" fill="${c}"/>
        <circle cx="62" cy="60" r="16" fill="${c}" opacity=".82"/>
        <circle cx="50" cy="42" r="16" fill="${c}" opacity=".92"/>
        <circle cx="43" cy="37" rx="4" ry="3" r="4" fill="${light}"/>`
    default:
      return `<rect x="24" y="30" width="52" height="44" rx="6" fill="${c}"/>`
  }
}

/** 转义 XML 特殊字符，避免商品名里的 & 破坏 SVG */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSvg(name, category, shape, color, seq) {
  const theme = CATEGORY_THEME[category] || { bg: '#f1f3f6', deep: '#555' }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="${esc(name)}">
  <defs>
    <linearGradient id="bg${seq}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${theme.bg}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg${seq})"/>
  <ellipse cx="50" cy="84" rx="30" ry="5" fill="rgba(0,0,0,.07)"/>
  ${shapeSvg(shape, color)}
  <text x="50" y="95" text-anchor="middle" font-size="8.5" font-family="PingFang SC, Microsoft YaHei, sans-serif" fill="${theme.deep}" opacity="0.92">${esc(name.length > 9 ? name.slice(0, 9) + '…' : name)}</text>
</svg>
`
}

/* ------------------------------------------------------------------ */
/* 生成 SVG（不改动 products.json：图片路径由 src/utils/product-image.js 按条码推导， */
/* 这样静态站点部署在子目录或 file:// 打开时也能正确取到图）               */
/* ------------------------------------------------------------------ */
const productsPath = resolve(ROOT, 'mock-data/products.json')
const items = JSON.parse(readFileSync(productsPath, 'utf8'))

const byName = new Map(ITEMS.map((it) => [it[0], it]))
let matched = 0
let generated = 0

items.forEach((p, i) => {
  const seq = String(i + 1).padStart(4, '0')
  const meta = byName.get(p.name) || ['', p.categoryCode, 'box', '#8a93a3']
  if (byName.has(p.name)) matched++

  // 文件名用条码：前端 src/utils/product-image.js 直接按条码拼路径，不做任何推断
  const file = `${String(p.barcode).replace(/\D/g, '')}.svg`
  writeFileSync(resolve(OUT, file), buildSvg(p.name, meta[1] || p.categoryCode, meta[2], meta[3], seq), 'utf8')
  generated++
})

/* 清理旧命名（p0001.svg）留下的文件，避免 public 里堆积无用资源 */
let stale = 0
for (const f of readdirSync(OUT)) {
  if (/^p\d{4}\.svg$/i.test(f)) {
    rmSync(resolve(OUT, f))
    stale++
  }
}

console.log(`✓ 生成商品图片 ${generated} 张 → public/products/<条码>.svg`)
if (stale) console.log(`✓ 清理旧命名文件 ${stale} 个`)
console.log(`✓ 配色匹配 ${matched}/${items.length} 个商品（未匹配的用默认形状）`)
const unmatched = items.filter((p) => !byName.has(p.name)).map((p) => p.name)
if (unmatched.length) console.log(`! 未匹配：${unmatched.join('、')}`)
console.log('说明：products.json 不需要 image 字段，路径由条码拼接（见 src/utils/product-image.js）')
