/**
 * 模拟数据生成脚本（仅开发期使用，不参与打包）
 * 运行：node scripts/gen-mock-data.mjs
 * 产物：mock-data/*.json
 *
 * 说明：为了让演示数据看起来真实且自洽（库存=入库-销售+调整、积分=消费金额取整），
 * 这里用脚本统一生成，而不是手写 JSON。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../mock-data')
mkdirSync(OUT, { recursive: true })

/* ---------------------------------- 随机工具（固定种子，保证可复现） --------------------------------- */
let seed = 20240519
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min
const pick = (arr) => arr[ri(0, arr.length - 1)]
const pad = (n, len = 2) => String(n).padStart(len, '0')

/* ---------------------------------- 日期工具 --------------------------------- */
const DAY = 86400000
const now = new Date('2026-03-20T10:30:00')
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = (d) =>
  `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const dateOffset = (days) => new Date(dayStart(now).getTime() + days * DAY)

/* ---------------------------------- 分类 ---------------------------------- */
const categories = [
  { id: 'C01', code: 'FRESH', name: '生鲜果蔬', sort: 1, remark: '每日补货，损耗较高' },
  { id: 'C02', code: 'MEAT', name: '肉禽蛋品', sort: 2, remark: '冷链商品' },
  { id: 'C03', code: 'DAIRY', name: '乳品烘焙', sort: 3, remark: '注意保质期' },
  { id: 'C04', code: 'DRINK', name: '酒水饮料', sort: 4, remark: '' },
  { id: 'C05', code: 'SNACK', name: '休闲零食', sort: 5, remark: '' },
  { id: 'C06', code: 'GRAIN', name: '粮油调味', sort: 6, remark: '' },
  { id: 'C07', code: 'DAILY', name: '日用百货', sort: 7, remark: '含洗化用品' },
  { id: 'C08', code: 'CLEAN', name: '清洁纸品', sort: 8, remark: '' },
]

/* ---------------------------------- 商品 ---------------------------------- */
// [名称, 分类, 进价, 售价, 单位]
const items = [
  ['红富士苹果', 'FRESH', 5.2, 8.8, '斤'],
  ['海南香蕉', 'FRESH', 3.0, 5.5, '斤'],
  ['武鸣沃柑', 'FRESH', 3.6, 6.9, '斤'],
  ['麒麟西瓜', 'FRESH', 2.2, 3.98, '斤'],
  ['本地小青菜', 'FRESH', 1.8, 3.5, '斤'],
  ['山东黄瓜', 'FRESH', 2.0, 3.8, '斤'],
  ['沙地土豆', 'FRESH', 1.6, 2.9, '斤'],
  ['云南西红柿', 'FRESH', 2.4, 4.5, '斤'],
  ['白玉洋葱', 'FRESH', 1.5, 2.8, '斤'],
  ['新鲜香菇', 'FRESH', 6.0, 9.9, '盒'],
  ['带皮五花肉', 'MEAT', 15.8, 24.9, '斤'],
  ['猪前腿瘦肉', 'MEAT', 13.5, 21.8, '斤'],
  ['新鲜猪肋排', 'MEAT', 22.0, 33.8, '斤'],
  ['清远走地鸡', 'MEAT', 18.0, 28.8, '只'],
  ['新鲜鸡腿', 'MEAT', 9.5, 15.8, '斤'],
  ['黄牛腱子肉', 'MEAT', 38.0, 56.8, '斤'],
  ['散养土鸡蛋', 'MEAT', 0.75, 1.2, '个'],
  ['鲜鱿鱼', 'MEAT', 16.0, 25.8, '斤'],
  ['伊利纯牛奶250ml', 'DAIRY', 2.6, 3.8, '盒'],
  ['蒙牛特仑苏礼盒', 'DAIRY', 42.0, 59.9, '箱'],
  ['光明酸奶100g*8', 'DAIRY', 14.5, 22.8, '排'],
  ['安佳淡奶油1L', 'DAIRY', 28.0, 42.0, '盒'],
  ['桃李吐司面包', 'DAIRY', 5.5, 8.9, '袋'],
  ['现烤红豆餐包', 'DAIRY', 3.8, 6.5, '个'],
  ['农夫山泉550ml', 'DRINK', 0.9, 2.0, '瓶'],
  ['怡宝纯净水1.5L', 'DRINK', 1.6, 3.0, '瓶'],
  ['可口可乐330ml', 'DRINK', 2.2, 3.5, '罐'],
  ['雪碧冰爽柠檬味', 'DRINK', 2.2, 3.5, '罐'],
  ['康师傅冰红茶1L', 'DRINK', 3.2, 5.0, '瓶'],
  ['青岛啤酒500ml', 'DRINK', 3.8, 6.5, '罐'],
  ['长城干红葡萄酒', 'DRINK', 45.0, 78.0, '瓶'],
  ['东鹏特饮500ml', 'DRINK', 3.9, 6.0, '瓶'],
  ['乐事薯片原味', 'SNACK', 4.8, 8.5, '袋'],
  ['奥利奥夹心饼干', 'SNACK', 6.2, 10.9, '盒'],
  ['洽洽香瓜子160g', 'SNACK', 5.0, 8.8, '袋'],
  ['旺旺雪饼84g', 'SNACK', 3.6, 6.0, '袋'],
  ['德芙丝滑牛奶巧克力', 'SNACK', 8.5, 13.9, '排'],
  ['三只松鼠每日坚果', 'SNACK', 19.0, 29.9, '盒'],
  ['徐福记酥心糖', 'SNACK', 12.0, 19.9, '袋'],
  ['金龙鱼调和油5L', 'GRAIN', 58.0, 79.9, '桶'],
  ['福临门东北大米10kg', 'GRAIN', 52.0, 69.9, '袋'],
  ['海天生抽500ml', 'GRAIN', 6.4, 9.9, '瓶'],
  ['镇江香醋500ml', 'GRAIN', 4.8, 7.9, '瓶'],
  ['太太乐鸡精200g', 'GRAIN', 7.2, 11.5, '袋'],
  ['中盐加碘食用盐', 'GRAIN', 1.2, 2.0, '袋'],
  ['白砂糖400g', 'GRAIN', 3.8, 5.9, '袋'],
  ['蓝月亮洗衣液3kg', 'DAILY', 29.0, 42.9, '瓶'],
  ['舒肤佳香皂', 'DAILY', 4.2, 7.5, '块'],
  ['海飞丝洗发水400ml', 'DAILY', 33.0, 48.9, '瓶'],
  ['高露洁牙膏140g', 'DAILY', 9.8, 15.9, '支'],
  ['得力中性笔0.5mm', 'DAILY', 1.1, 2.5, '支'],
  ['5号碱性电池4粒', 'DAILY', 6.5, 11.9, '板'],
  ['不锈钢衣架10只', 'DAILY', 8.0, 13.9, '把'],
  ['一次性手套100只', 'DAILY', 7.5, 12.9, '盒'],
  ['维达卷纸10卷', 'CLEAN', 18.5, 27.9, '提'],
  ['清风抽纸3层6包', 'CLEAN', 13.6, 21.9, '提'],
  ['心相印手帕纸10包', 'CLEAN', 6.8, 11.5, '条'],
  ['威猛先生洁厕灵', 'CLEAN', 9.5, 15.5, '瓶'],
  ['妙洁保鲜袋100只', 'CLEAN', 5.8, 9.9, '盒'],
  ['加厚垃圾袋30只', 'CLEAN', 4.5, 8.0, '卷'],
  ['洁云厨房纸巾2卷', 'CLEAN', 8.2, 13.5, '提'],
]

const catOf = (code) => categories.find((c) => c.code === code)
let barcodeSeq = 6900000000000
const products = items.map((it, i) => {
  const [name, cat, cost, price, unit] = it
  const c = catOf(cat)
  const id = `P${pad(i + 1, 4)}`
  const status = i === 22 || i === 44 || i === 59 ? 'inactive' : 'active' // 少量停用商品
  return {
    id,
    barcode: String(barcodeSeq + (i + 1) * 137),
    name,
    categoryId: c.id,
    categoryName: c.name,
    categoryCode: c.code,
    unit,
    costPrice: cost,
    price,
    memberPrice: Math.round(price * 0.95 * 100) / 100,
    stock: 0, // 稍后回填
    warnThreshold: pick([10, 15, 20, 30, 50]),
    status,
    remark: i % 9 === 0 ? '旺季主推商品' : '',
    createdAt: fmtTime(dateOffset(-ri(120, 400))),
    updatedAt: fmtTime(dateOffset(-ri(1, 60))),
  }
})
const prodByBarcode = new Map(products.map((p) => [p.barcode, p]))

/* ---------------------------------- 用户 ---------------------------------- */
const users = [
  {
    id: 'U001',
    username: 'admin',
    password: '123456',
    name: '张国强',
    role: 'manager',
    roleName: '店长',
    phone: '13800001111',
    employeeNo: 'M001',
    status: 'active',
    lastLoginAt: fmtTime(new Date(now.getTime() - 3600 * 1000)),
    createdAt: fmtTime(dateOffset(-500)),
  },
  {
    id: 'U002',
    username: 'cashier01',
    password: '123456',
    name: '李小燕',
    role: 'cashier',
    roleName: '收银员',
    phone: '13800002222',
    employeeNo: 'C001',
    status: 'active',
    lastLoginAt: fmtTime(new Date(now.getTime() - 2 * 3600 * 1000)),
    createdAt: fmtTime(dateOffset(-420)),
  },
  {
    id: 'U003',
    username: 'cashier02',
    password: '123456',
    name: '王海涛',
    role: 'cashier',
    roleName: '收银员',
    phone: '13800003333',
    employeeNo: 'C002',
    status: 'active',
    lastLoginAt: fmtTime(dateOffset(-1)),
    createdAt: fmtTime(dateOffset(-360)),
  },
  {
    id: 'U004',
    username: 'cashier03',
    password: '123456',
    name: '陈美玲',
    role: 'cashier',
    roleName: '收银员',
    phone: '13800004444',
    employeeNo: 'C003',
    status: 'disabled',
    lastLoginAt: fmtTime(dateOffset(-40)),
    createdAt: fmtTime(dateOffset(-300)),
  },
  {
    id: 'U005',
    username: 'cashier04',
    password: '123456',
    name: '刘志明',
    role: 'cashier',
    roleName: '收银员',
    phone: '13800005555',
    employeeNo: 'C004',
    status: 'active',
    lastLoginAt: fmtTime(dateOffset(-3)),
    createdAt: fmtTime(dateOffset(-180)),
  },
]

/* ---------------------------------- 会员 ---------------------------------- */
const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗']
const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '建国', '淑兰']

const members = []
const usedPhone = new Set()
for (let i = 0; i < 36; i++) {
  const id = `M${pad(i + 1, 4)}`
  let phone
  do {
    phone = `1${pick([3, 5, 7, 8, 9])}${String(ri(100000000, 999999999))}`
  } while (usedPhone.has(phone))
  usedPhone.add(phone)
  const level = rnd() < 0.12 ? 'diamond' : rnd() < 0.28 ? 'gold' : rnd() < 0.6 ? 'silver' : 'normal'
  const levelName = { normal: '普通会员', silver: '银卡会员', gold: '金卡会员', diamond: '钻石会员' }[level]
  const createdAt = fmtTime(dateOffset(-ri(30, 900)))
  const totalConsume = ri(0, 60) * 27.6
  members.push({
    id,
    memberNo: `VIP${String(10000 + i + 1)}`,
    name: surnames[i % surnames.length] + givenNames[(i * 7) % givenNames.length],
    phone,
    gender: rnd() < 0.45 ? 'female' : 'male',
    level,
    levelName,
    points: Math.round(totalConsume),
    balance: rnd() < 0.35 ? ri(5, 90) * 10 : 0,
    totalConsume: Math.round(totalConsume * 100) / 100,
    orderCount: 0,
    lastConsumeAt: '',
    status: i === 31 ? 'disabled' : 'active',
    remark: level === 'diamond' ? '重点维护客户' : '',
    createdAt,
  })
}

/* ---------------------------------- 订单 ---------------------------------- */
const PAY_METHODS = [
  { code: 'cash', name: '现金' },
  { code: 'wechat', name: '微信' },
  { code: 'alipay', name: '支付宝' },
  { code: 'card', name: '储值卡' },
]
const cashiers = users.filter((u) => u.role === 'cashier' || u.role === 'manager')
const orders = []
let orderSeq = 0

function numberToAmountText(n) {
  return Math.round(n * 100) / 100
}

for (let d = -29; d <= 0; d++) {
  const day = dateOffset(d)
  const weekend = [0, 6].includes(day.getDay())
  const count = ri(weekend ? 12 : 7, weekend ? 20 : 13)
  for (let k = 0; k < count; k++) {
    orderSeq++
    const cashier = pick(cashiers)
    const hour = ri(8, 21)
    const minute = ri(0, 59)
    const created = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, ri(0, 59))
    if (d === 0 && created > now) created.setHours(Math.max(8, now.getHours() - 1))

    const lineCount = ri(1, 6)
    const items_ = []
    const usedProduct = new Set()
    let gross = 0
    for (let j = 0; j < lineCount; j++) {
      const p = pick(products)
      if (usedProduct.has(p.id)) continue
      usedProduct.add(p.id)
      const qty = p.unit === '斤' ? Math.round(ri(5, 30) / 5) * 0.5 : ri(1, 5)
      const subtotal = numberToAmountText(p.price * qty)
      gross += subtotal
      items_.push({
        productId: p.id,
        barcode: p.barcode,
        name: p.name,
        unit: p.unit,
        price: p.price,
        qty,
        subtotal,
      })
    }
    if (!items_.length) continue
    gross = numberToAmountText(gross)

    const isMember = rnd() < 0.45
    const member = isMember ? pick(members) : null
    const discountRate = member && ['gold', 'diamond'].includes(member.level) ? 0.95 : 1
    const discountAmount = numberToAmountText(gross * (1 - discountRate))
    const payable = numberToAmountText(gross - discountAmount)
    const pointsEarned = member ? Math.round(payable) : 0
    const pointsUsed = member && member.level !== 'normal' && rnd() < 0.18 ? ri(5, 40) * 10 : 0
    const finalAmount = numberToAmountText(Math.max(0.01, payable - pointsUsed / 100))

    // 退款 / 挂单 / 取消 造少量样本
    let status = 'paid'
    let refund = null
    const r = rnd()
    if (d < 0 && r < 0.035) status = 'refunded'
    else if (d < 0 && r < 0.05) status = 'partial_refund'
    else if (d === 0 && r < 0.08) status = 'unpaid'

    // 支付方式：支持混合支付
    let payments
    if (rnd() < 0.16) {
      const first = Math.round(finalAmount * 0.6 * 100) / 100
      const second = numberToAmountText(finalAmount - first)
      const [m1, m2] = [pick(PAY_METHODS), pick(PAY_METHODS)]
      payments = [
        { method: m1.code, methodName: m1.name, amount: first },
        { method: m2.code === m1.code ? 'wechat' : m2.code, methodName: m2.code === m1.code ? '微信' : m2.name, amount: second },
      ]
    } else {
      const m = pick(PAY_METHODS)
      payments = [{ method: m.code, methodName: m.name, amount: finalAmount }]
    }

    if (status !== 'paid' && status !== 'unpaid') {
      refund = {
        id: `R${String(orderSeq).padStart(6, '0')}`,
        amount: status === 'refunded' ? finalAmount : numberToAmountText(finalAmount / 2),
        type: status === 'refunded' ? 'full' : 'partial',
        reason: pick(['顾客买错商品', '商品质量问题', '价格标错', '顾客临时不要了', '重复付款']),
        operator: '张国强',
        createdAt: fmtTime(new Date(created.getTime() + ri(1, 5) * 3600 * 1000)),
      }
    }

    orders.push({
      id: `O${String(orderSeq).padStart(6, '0')}`,
      orderNo: `SO${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}${pad(orderSeq, 4)}`,
      status,
      statusName: { paid: '已结算', refunded: '已退款', partial_refund: '部分退款', unpaid: '未结算' }[status],
      type: member ? 'member' : 'normal',
      typeName: member ? '会员订单' : '普通订单',
      memberId: member ? member.id : '',
      memberNo: member ? member.memberNo : '',
      memberName: member ? member.name : '',
      memberPhone: member ? member.phone : '',
      memberLevelName: member ? member.levelName : '',
      items: items_,
      itemCount: items_.reduce((s, x) => s + x.qty, 0),
      grossAmount: gross,
      discountAmount,
      pointsUsed,
      pointsDiscount: numberToAmountText(pointsUsed / 100),
      pointsEarned,
      finalAmount,
      paidAmount: status === 'unpaid' ? 0 : finalAmount,
      payments: status === 'unpaid' ? [] : payments,
      refund,
      operatorId: cashier.id,
      operatorName: cashier.name,
      cashierName: cashier.name,
      remark: '',
      createdAt: fmtTime(created),
      settledAt: status === 'unpaid' ? '' : fmtTime(created),
      date: fmtDate(created),
      time: `${pad(hour)}:${pad(minute)}`,
    })
  }
}
orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

/* ------------------------- 回填会员的消费统计 / 订单统计 ------------------------- */
const memberStat = new Map()
for (const o of orders) {
  if (!o.memberId || o.status === 'unpaid') continue
  const s = memberStat.get(o.memberId) || { amount: 0, count: 0, last: '' }
  s.amount += o.finalAmount
  s.count += 1
  if (o.createdAt > s.last) s.last = o.createdAt
  memberStat.set(o.memberId, s)
}
for (const m of members) {
  const s = memberStat.get(m.id)
  if (s) {
    m.totalConsume = numberToAmountText(s.amount)
    m.orderCount = s.count
    m.lastConsumeAt = s.last
    m.points = Math.round(s.amount)
  } else {
    m.totalConsume = 0
    m.orderCount = 0
    m.lastConsumeAt = ''
    m.points = 0
  }
}

/* ---------------------------------- 库存 ---------------------------------- */
const stockList = []
const stockLogs = []
let logSeq = 0
const stockMap = new Map()

// 采购入库单
const purchaseOrders = []
let poSeq = 0
const suppliers = ['华南生鲜配送中心', '鹏程食品供应商', '百川日用百货', '蒙发乳业华南仓', '中粮粮油贸易商', '联和饮料经销商']

for (let i = 0; i < 14; i++) {
  poSeq++
  const d = -ri(1, 28)
  const created = new Date(dateOffset(d).getTime() + ri(7, 10) * 3600 * 1000)
  const supplier = pick(suppliers)
  const lineCount = ri(3, 8)
  const lines = []
  const used = new Set()
  let total = 0
  for (let j = 0; j < lineCount; j++) {
    const p = pick(products)
    if (used.has(p.id)) continue
    used.add(p.id)
    const qty = ri(2, 12) * 5
    const amount = numberToAmountText(p.costPrice * qty)
    total += amount
    lines.push({
      productId: p.id,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      costPrice: p.costPrice,
      qty,
      amount,
    })
    const cur = stockMap.get(p.id) || 0
    stockMap.set(p.id, cur + qty)
  }
  purchaseOrders.push({
    id: `PO${String(poSeq).padStart(5, '0')}`,
    purchaseNo: `RK${fmtDate(created).replace(/-/g, '')}${pad(poSeq, 3)}`,
    supplier,
    status: i === 0 ? 'pending' : 'received',
    statusName: i === 0 ? '待入库' : '已入库',
    totalQty: lines.reduce((s, x) => s + x.qty, 0),
    totalAmount: numberToAmountText(total),
    itemCount: lines.length,
    items: lines,
    operator: '张国强',
    remark: i % 5 === 0 ? '月结供应商' : '',
    createdAt: fmtTime(created),
  })
  if (i !== 0) {
    for (const l of lines) {
      logSeq++
      stockLogs.push({
        id: `SL${pad(logSeq, 5)}`,
        type: 'purchase',
        typeName: '采购入库',
        productId: l.productId,
        barcode: l.barcode,
        productName: l.name,
        unit: l.unit,
        beforeQty: (stockMap.get(l.productId) || 0) - l.qty,
        changeQty: l.qty,
        afterQty: stockMap.get(l.productId) || 0,
        reason: `采购入库 ${purchaseOrders[purchaseOrders.length - 1].purchaseNo}`,
        relatedNo: purchaseOrders[purchaseOrders.length - 1].purchaseNo,
        operator: '张国强',
        createdAt: fmtTime(created),
      })
    }
  }
}

// 销售出库
for (const o of orders) {
  if (o.status === 'unpaid') continue
  for (const it of o.items) {
    const cur = stockMap.get(it.productId) || 0
    stockMap.set(it.productId, cur - it.qty)
  }
}
// 盘点 / 损耗调整
for (let i = 0; i < 26; i++) {
  const p = pick(products)
  const change = pick([-1, -2, -3, -6, 2, 3, 5])
  const before = stockMap.get(p.id) || 0
  const after = Math.max(0, before + change)
  stockMap.set(p.id, after)
  logSeq++
  stockLogs.push({
    id: `SL${pad(logSeq, 5)}`,
    type: change < 0 ? (i % 3 === 0 ? 'loss' : 'damage') : 'check',
    typeName: change < 0 ? (i % 3 === 0 ? '损耗' : '破损') : '盘盈',
    productId: p.id,
    barcode: p.barcode,
    productName: p.name,
    unit: p.unit,
    beforeQty: before,
    changeQty: change,
    afterQty: after,
    reason: change < 0 ? pick(['生鲜自然损耗', '搬运破损', '临期处理']) : '盘点差异修正',
    relatedNo: '',
    operator: '张国强',
    createdAt: fmtTime(new Date(dateOffset(-ri(1, 25)).getTime() + ri(9, 20) * 3600 * 1000)),
  })
}

for (const p of products) {
  const qty = Math.max(0, stockMap.get(p.id) ?? ri(20, 200))
  p.stock = qty
  const low = qty > 0 && qty < p.warnThreshold
  const empty = qty === 0
  stockList.push({
    productId: p.id,
    barcode: p.barcode,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    unit: p.unit,
    costPrice: p.costPrice,
    price: p.price,
    stock: qty,
    warnThreshold: p.warnThreshold,
    stockAmount: numberToAmountText(qty * p.costPrice),
    status: p.status,
    stockState: empty ? 'empty' : low ? 'low' : 'normal',
    stockStateName: empty ? '已售罄' : low ? '库存不足' : '正常',
    updatedAt: p.updatedAt,
  })
}
stockLogs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

/* ---------------------------------- 操作日志 ---------------------------------- */
const opLogs = []
let opSeq = 0
const addOp = (o) => {
  opSeq++
  opLogs.push({
    id: `L${pad(opSeq, 5)}`,
    ...o,
  })
}
for (let d = -9; d <= 0; d++) {
  const day = dateOffset(d)
  const n = ri(6, 14)
  for (let i = 0; i < n; i++) {
    const u = pick(users.filter((x) => x.status === 'active'))
    const created = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ri(8, 21), ri(0, 59), ri(0, 59))
    if (created > now) continue
    const r = rnd()
    let module, action, detail
    if (r < 0.22) {
      module = '认证'
      action = rnd() < 0.5 ? '登录' : '登出'
      detail = `${u.name}(${u.username}) ${action}系统`
    } else if (r < 0.4) {
      module = '订单'
      const o = pick(orders)
      action = o.status === 'refunded' || o.status === 'partial_refund' ? '退款' : '开单'
      detail = `${action} ${o.orderNo}，金额 ￥${o.finalAmount.toFixed(2)}`
    } else if (r < 0.58) {
      module = '商品'
      const p = pick(products)
      action = pick(['新增商品', '修改商品', '修改售价', '停用商品'])
      detail = `${action}：${p.name}（${p.barcode}）`
    } else if (r < 0.74) {
      module = '库存'
      const s = pick(stockLogs)
      action = s.typeName
      detail = `${s.typeName}：${s.productName} ${s.changeQty > 0 ? '+' : ''}${s.changeQty}${s.unit}`
    } else if (r < 0.88) {
      module = '会员'
      const m = pick(members)
      action = pick(['新增会员', '修改会员', '积分调整'])
      detail = `${action}：${m.name}（${m.memberNo}）`
    } else {
      module = '用户'
      action = pick(['创建账号', '重置密码', '停用账号'])
      detail = `${action}：${pick(users).name}`
    }
    addOp({
      operatorId: u.id,
      operatorName: u.name,
      username: u.username,
      roleName: u.roleName,
      module,
      action,
      detail,
      ip: `192.168.1.${ri(2, 200)}`,
      userAgent: 'Chrome 132 / Windows 11',
      result: rnd() < 0.97 ? 'success' : 'fail',
      resultName: '',
      createdAt: fmtTime(created),
    })
  }
}
for (const l of opLogs) l.resultName = l.result === 'success' ? '成功' : '失败'
opLogs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

/* ---------------------------------- 系统配置 / 字典 ---------------------------------- */
const settings = {
  shop: {
    name: '惠民生活超市（中心店）',
    code: 'HM-001',
    address: '广东省深圳市南山区科技园南路 128 号',
    phone: '0755-8888 6666',
    license: '91440300MA5XXXXXXX',
    manager: '张国强',
  },
  pos: {
    pointsEnabled: true,
    pointsRate: 1, // 每消费 1 元累计 1 分
    pointsDeductRate: 100, // 100 分抵扣 1 元
    memberDiscount: true,
    roundMode: 'round', // 抹零方式
    receiptFooter: '谢谢光临，欢迎下次惠顾！',
    autoPrint: false,
    defaultPayMethod: 'wechat',
    warnThreshold: 20,
  },
  permissions: {
    cashier: ['pos:checkout', 'member:create', 'member:read', 'product:read', 'order:self'],
    manager: ['*'],
  },
  roleMatrix: [
    { module: '收银开单', cashier: true, manager: true },
    { module: '新建会员', cashier: true, manager: true },
    { module: '查询会员', cashier: true, manager: true },
    { module: '查询商品', cashier: true, manager: true },
    { module: '查看本人订单', cashier: true, manager: true },
    { module: '查看全部订单', cashier: false, manager: true },
    { module: '商品管理', cashier: false, manager: true },
    { module: '库存管理', cashier: false, manager: true },
    { module: '会员管理', cashier: false, manager: true },
    { module: '报表统计', cashier: false, manager: true },
    { module: '用户管理', cashier: false, manager: true },
    { module: '系统操作日志', cashier: false, manager: true },
  ],
}

/* ---------------------------------- 首页看板 ---------------------------------- */
const todayOrders = orders.filter((o) => o.date === fmtDate(now) && o.status !== 'unpaid')
const todaySales = numberToAmountText(todayOrders.reduce((s, o) => s + o.finalAmount, 0))
const dashboard = {
  updatedAt: fmtTime(now),
  greeting: '',
  kpi: {
    todaySales,
    todayOrders: todayOrders.length,
    todayMembers: new Set(todayOrders.filter((o) => o.memberId).map((o) => o.memberId)).size,
    todayAvgPrice: todayOrders.length ? numberToAmountText(todaySales / todayOrders.length) : 0,
    todaySalesCompare: 12.6,
    todayOrdersCompare: 8.4,
    grossProfit: numberToAmountText(
      todayOrders.reduce((s, o) => {
        const cost = o.items.reduce((c, it) => {
          const p = products.find((x) => x.id === it.productId)
          return c + (p ? p.costPrice * it.qty : 0)
        }, 0)
        return s + (o.finalAmount - cost)
      }, 0),
    ),
  },
  todo: {
    lowStock: stockList.filter((s) => s.stockState === 'low').length,
    emptyStock: stockList.filter((s) => s.stockState === 'empty').length,
    pendingPurchase: purchaseOrders.filter((p) => p.status === 'pending').length,
    refundToday: orders.filter((o) => o.date === fmtDate(now) && o.refund).length,
  },
}

/* ---------------------------------- 报表 ---------------------------------- */
const trendMap = new Map()
for (const o of orders) {
  if (o.status === 'unpaid') continue
  const s = trendMap.get(o.date) || { date: o.date, amount: 0, orders: 0, cost: 0 }
  s.amount += o.finalAmount
  s.orders += 1
  s.cost += o.items.reduce((c, it) => {
    const p = products.find((x) => x.id === it.productId)
    return c + (p ? p.costPrice * it.qty : 0)
  }, 0)
  trendMap.set(o.date, s)
}
const trend = [...trendMap.values()]
  .sort((a, b) => (a.date < b.date ? -1 : 1))
  .map((s) => ({
    date: s.date,
    amount: numberToAmountText(s.amount),
    orders: s.orders,
    cost: numberToAmountText(s.cost),
    profit: numberToAmountText(s.amount - s.cost),
  }))

const payMap = new Map()
for (const o of orders) {
  if (o.status === 'unpaid') continue
  for (const p of o.payments) {
    const s = payMap.get(p.method) || { method: p.method, name: p.methodName, amount: 0, count: 0 }
    s.amount += p.amount
    s.count += 1
    payMap.set(p.method, s)
  }
}
const payStats = [...payMap.values()]
  .map((s) => ({ ...s, amount: numberToAmountText(s.amount) }))
  .sort((a, b) => b.amount - a.amount)

const productRankMap = new Map()
for (const o of orders) {
  if (o.status === 'unpaid') continue
  for (const it of o.items) {
    const s = productRankMap.get(it.productId) || {
      productId: it.productId,
      name: it.name,
      barcode: it.barcode,
      qty: 0,
      amount: 0,
      unit: it.unit,
    }
    s.qty += it.qty
    s.amount += it.subtotal
    productRankMap.set(it.productId, s)
  }
}
const productRank = [...productRankMap.values()]
  .map((s) => ({ ...s, amount: numberToAmountText(s.amount) }))
  .sort((a, b) => b.amount - a.amount)

const categoryStats = categories
  .map((c) => {
    const ps = stockList.filter((s) => s.categoryId === c.id)
    const amount = numberToAmountText(
      productRank.filter((r) => ps.some((p) => p.productId === r.productId)).reduce((s, r) => s + r.amount, 0),
    )
    return {
      categoryId: c.id,
      name: c.name,
      skuCount: ps.length,
      stockAmount: numberToAmountText(ps.reduce((s, p) => s + p.stockAmount, 0)),
      amount,
    }
  })
  .sort((a, b) => b.amount - a.amount)

const cashierStats = users
  .filter((u) => ['cashier', 'manager'].includes(u.role))
  .map((u) => {
    const os = orders.filter((o) => o.operatorId === u.id && o.status !== 'unpaid')
    const amount = numberToAmountText(os.reduce((s, o) => s + o.finalAmount, 0))
    return {
      operatorId: u.id,
      name: u.name,
      employeeNo: u.employeeNo,
      roleName: u.roleName,
      orderCount: os.length,
      amount,
      avgPrice: os.length ? numberToAmountText(amount / os.length) : 0,
    }
  })
  .sort((a, b) => b.amount - a.amount)

const reports = {
  updatedAt: fmtTime(now),
  trend,
  payStats,
  productRank,
  categoryStats,
  cashierStats,
  hourStats: Array.from({ length: 14 }, (_, i) => {
    const h = i + 8
    const os = orders.filter((o) => Number(o.time.slice(0, 2)) === h && o.status !== 'unpaid')
    return { hour: `${pad(h)}:00`, orders: os.length, amount: numberToAmountText(os.reduce((s, o) => s + o.finalAmount, 0)) }
  }),
}

/* ---------------------------------- 挂单（暂存） ---------------------------------- */
const holds = [
  {
    id: 'H001',
    holdNo: 'GD2026032001',
    memberId: members[2].id,
    memberNo: members[2].memberNo,
    memberName: members[2].name,
    itemCount: 3,
    amount: 78.4,
    operatorName: '李小燕',
    remark: '顾客回去取东西',
    createdAt: fmtTime(new Date(now.getTime() - 25 * 60 * 1000)),
  },
  {
    id: 'H002',
    holdNo: 'GD2026032002',
    memberId: '',
    memberNo: '',
    memberName: '',
    itemCount: 5,
    amount: 156.2,
    operatorName: '王海涛',
    remark: '',
    createdAt: fmtTime(new Date(now.getTime() - 55 * 60 * 1000)),
  },
]

/* ---------------------------------- 落盘 ---------------------------------- */
const files = {
  'categories.json': categories,
  'products.json': products,
  'users.json': users,
  'members.json': members,
  'orders.json': orders,
  'stock.json': stockList,
  'stock-logs.json': stockLogs,
  'purchase-orders.json': purchaseOrders,
  'operation-logs.json': opLogs,
  'settings.json': settings,
  'dashboard.json': dashboard,
  'reports.json': reports,
  'holds.json': holds,
}

for (const [name, data] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), JSON.stringify(data, null, 2), 'utf8')
  const size = Array.isArray(data) ? `${data.length} 条` : `${Object.keys(data).length} 个字段`
  console.log(`✓ ${name.padEnd(24)} ${size}`)
}
console.log(`\n输出目录：${OUT}`)
console.log(`统计：商品 ${products.length} / 会员 ${members.length} / 订单 ${orders.length} / 库存 ${stockList.length} / 日志 ${opLogs.length}`)
