/**
 * 统一 API 出口：页面只 import 这里，不直接碰 http，方便将来换真实后端。
 * 说明：所有写操作（增/删/改）后端都会返回「操作成功」，演示时不落库。
 */
import http from './request'

/* ================================ 认证 ================================ */
export const authApi = {
  login: (data) => http.post('/auth/login', data),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me'),
  changePassword: (data) => http.post('/auth/password', data),
}

/* ================================ 用户 ================================ */
export const userApi = {
  list: (params) => http.get('/users', params),
  detail: (id) => http.get(`/users/${id}`),
  create: (data) => http.post('/users', data),
  update: (id, data) => http.put(`/users/${id}`, data),
  disable: (id) => http.put(`/users/${id}`, { status: 'disabled' }),
  enable: (id) => http.put(`/users/${id}`, { status: 'active' }),
  resetPassword: (id) => http.post(`/users/${id}/reset-password`),
}

/* ================================ 会员 ================================ */
export const memberApi = {
  list: (params) => http.get('/members', params),
  detail: (id) => http.get(`/members/${id}`),
  /** 按手机号 / 会员号精确检索，用于收银台绑定会员 */
  search: (keyword) => http.get('/members/search', { keyword }),
  create: (data) => http.post('/members', data),
  update: (id, data) => http.put(`/members/${id}`, data),
  remove: (id) => http.delete(`/members/${id}`),
  orders: (id, params) => http.get(`/members/${id}/orders`, params),
  points: (id) => http.get(`/members/${id}/points`),
  adjustPoints: (id, data) => http.post(`/members/${id}/points`, data),
  recharge: (id, data) => http.post(`/members/${id}/recharge`, data),
}

/* ============================== 商品 / 分类 ============================== */
export const productApi = {
  list: (params) => http.get('/products', params),
  detail: (id) => http.get(`/products/${id}`),
  /** 扫码 / 输入条码取商品 */
  byBarcode: (barcode) => http.get(`/products/barcode/${barcode}`, {}, { silent: true }),
  create: (data) => http.post('/products', data),
  update: (id, data) => http.put(`/products/${id}`, data),
  disable: (id) => http.put(`/products/${id}`, { status: 'inactive' }),
  enable: (id) => http.put(`/products/${id}`, { status: 'active' }),
  remove: (id) => http.delete(`/products/${id}`),
}

export const categoryApi = {
  list: (params) => http.get('/categories', params),
  create: (data) => http.post('/categories', data),
  update: (id, data) => http.put(`/categories/${id}`, data),
}

/* ================================ 库存 ================================ */
export const stockApi = {
  list: (params) => http.get('/stock', params),
  summary: () => http.get('/stock/summary'),
  logs: (params) => http.get('/stock/logs', params),
  adjust: (data) => http.post('/stock/adjust', data),
  purchaseOrders: (params) => http.get('/stock/purchase-orders', params),
  purchaseDetail: (id) => http.get(`/stock/purchase-orders/${id}`),
  createPurchase: (data) => http.post('/stock/purchase-orders', data),
  confirmPurchase: (id) => http.post(`/stock/purchase-orders/${id}/confirm`),
  exportCheck: (params) => http.post('/stock/export', params),
}

/* ================================ 订单 ================================ */
export const orderApi = {
  list: (params) => http.get('/orders', params),
  detail: (id) => http.get(`/orders/${id}`),
  /** 收银台结算：写操作，直接返回成功 */
  create: (data) => http.post('/orders', data),
  refund: (id, data) => http.post(`/orders/${id}/refund`, data),
  print: (id) => http.post(`/orders/${id}/print`),
  holds: () => http.get('/holds'),
  holdDetail: (id) => http.get(`/holds/${id}`),
  createHold: (data) => http.post('/holds', data),
  removeHold: (id) => http.delete(`/holds/${id}`),
}

/* ================================ 日志 ================================ */
export const logApi = {
  operation: (params) => http.get('/logs/operation', params),
  login: (params) => http.get('/logs/login', params),
  modules: () => http.get('/logs/modules'),
}

/* ============================== 看板 / 报表 ============================== */
export const reportApi = {
  dashboard: () => http.get('/dashboard'),
  overview: (params) => http.get('/reports', params),
  trend: (days) => http.get('/reports/trend', { days }),
  productRank: (limit) => http.get('/reports/product-rank', { limit }),
  category: () => http.get('/reports/category'),
  cashier: () => http.get('/reports/cashier'),
  payment: () => http.get('/reports/payment'),
  hour: () => http.get('/reports/hour'),
  export: (data) => http.post('/reports/export', data),
}

/* ================================ 设置 ================================ */
export const settingApi = {
  detail: () => http.get('/settings'),
  update: (data) => http.put('/settings', data),
}

export default {
  authApi,
  userApi,
  memberApi,
  productApi,
  categoryApi,
  stockApi,
  orderApi,
  logApi,
  reportApi,
  settingApi,
}
