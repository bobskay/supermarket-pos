/**
 * 商品图片路径推导
 * ------------------------------------------------------------------
 * 商品图放在 public/products/<条码>.svg，文件名 = 商品条码（61 个商品一一对应）。
 *
 * 为什么不把路径写进 mock-data/products.json：
 *   演示站点要打包成静态页，可能部署在子目录，甚至直接双击 index.html 打开。
 *   绝对路径 /products/x.svg 在这种情况下会 404，因此这里统一用
 *   Vite 的 BASE_URL 拼接，保证任何部署方式、任何商品记录（含新建）都能取到图。
 *
 * 用条码而不是顺序号做文件名，是为了让新增商品也能直接对上：
 * 店长新建商品时只要把图片命名为「条码.svg」放进 public/products/ 即可。
 */

/**
 * 由商品推导图片地址
 * @param {object|string} product 商品对象，或直接传条码
 * @returns {string} 可用在 <img src> 里的地址；条码不可用时返回空串
 */
export function productImage(product) {
  const barcode = typeof product === 'string' ? product : product?.barcode
  const code = String(barcode || '').replace(/\D/g, '')
  // 条码太短说明不是有效商品条码，直接返回空串让调用方显示占位图标
  if (code.length < 6) return ''
  const base = import.meta.env.BASE_URL || '/'
  return `${base}products/${code}.svg`
}

/** 商品图总数（生成脚本产出 61 张） */
export const PRODUCT_IMAGE_COUNT = 61
