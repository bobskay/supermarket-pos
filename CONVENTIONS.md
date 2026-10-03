# 超市收银系统 · 开发规范（页面作者必读）

> 本文件是给「在这个项目里新增/修改页面」的人（或 AI 协作方）看的契约。请严格遵守，
> 否则界面风格、交互反馈、主题切换会出现不一致。

## 一、项目结构与技术栈

```
src/
  api/
    mock-data.js       # 用 import.meta.glob 把 mock-data/*.json 内联进产物
    mock-server.js     # 「假后端」：路由表 ROUTES，把 URL 映射到 JSON
    request.js         # 「假 axios」：与 axios API 一致（拦截器/Delay/pending 计数）
    index.js           # 领域 API 出口：authApi / productApi / stockApi ...
  composables/
    useAuth.js         # 登录态与权限（hasPermission）
    useTheme.js        # 两套皮肤切换
    useToast.js        # 轻提示
    useConfirm.js      # Promise 化的确认框
    useTable.js        # 列表页数据编排（提效核心）
  components/
    layout/            # AppShell / SideNav / TopBar / PageShell / ProgressBar / SearchPalette
    ui/                # AppButton / DataTable / Pagination / AppModal / AppDrawer / ...
  styles/
    main.css           # Tailwind 入口 + 基础样式 + 组件类（.btn/.card/.badge/.kpi/.field...）
    theme.css          # 两套主题的 CSS 变量 + @theme 映射
  pages/               # 业务页面（新增页面加在对应子目录）
mock-data/*.json       # 唯一数据源，纯 JSON，可直接手改
scripts/gen-mock-data.mjs  # 模拟数据生成脚本（改完重跑即可重新生成）
```

技术栈：**Vue 3.5 + Vite 6 + TailwindCSS 4 + vue-router 4（hash 模式）+ ECharts 5**。
无 UI 组件库、无 Pinia、无 axios —— 组件与「假 axios」都是本项目自带。

## 二、硬性约定

1. **不要引入新的第三方依赖**。需要图标就在 `Icon.vue` 的 `PATHS` 里加一条；
   需要图表用 `AppChart`；需要表格用 `DataTable`。
2. **颜色只能来自主题变量**。可用 Tailwind 语义类：
   `bg-bg / bg-surface / bg-surface-2 / bg-surface-3 / bg-elevated / bg-hover / bg-primary-soft`
   `text-text / text-text-2 / text-text-3 / text-primary / text-success / text-warning / text-danger`
   `border-line / border-line-strong`
   以及组件类 `.btn .card .badge .kpi .field .seg .switch .table-flat .price .num .empty .skeleton`。
   **禁止**写 `#fff`、`bg-gray-100`、`text-blue-600` 这类硬编码颜色（少量 `#fff` 用于按钮文字可以）。
   需要特殊色值时必须用 `var(--c-xxx)` 内联 style。
3. 两套主题（`clean` 清爽白 / `midnight` 曜石蓝）必须都好看：不要在浅色主题下能看清、
   深色主题下变成黑底黑字。凡是用内联 style 设色的地方，一律用 `var(--c-*)`。
4. **所有写操作（新增/编辑/删除/停用/退款/入库/调整）都直接提示成功**，
   不要用 try/catch 去判断失败；调用 API 后 `toast.ok('xxx成功')` 并更新本地列表，让界面立刻有变化。
5. 页面文案使用简体中文，金额用 `money()`，日期用 `format.js` 里的工具，不要自己拼字符串。
6. 代码注释用中文，只在「为什么这么做」的地方写注释，不要逐行翻译代码。

## 三、页面骨架

标准列表/详情页：

```vue
<script setup>
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
// ...
</script>

<template>
  <PageShell>
    <PageHeader title="商品档案" desc="维护商品基础信息与售价" icon="product">
      <template #actions>
        <AppButton icon="download" @click="onExport">导出</AppButton>
        <AppButton variant="primary" icon="plus" @click="openCreate">新增商品</AppButton>
      </template>
    </PageHeader>

    <!-- 内容 -->
  </PageShell>
</template>
```

`PageShell` 自带滚动与内边距；**不要**再套 `overflow-y-auto` 的容器。
收银台这类满屏页面用 `<PageShell bare>` 或自定义 flex 布局。

## 四、可用组件与 API 速查

### 组件（路径 `@/components/ui/...`）

| 组件 | 关键 props / 用法 |
| --- | --- |
| `AppButton` | `variant`: primary/default/soft/ghost/danger/danger-soft/success；`size`: sm/md/lg；`icon`、`iconRight`、`loading`、`disabled`、`block`；`@click` |
| `Icon` | `name`（见 `Icon.vue` 的 PATHS）、`size`、`stroke`。常用 name：`plus edit trash search refresh download print eye check close chevronDown chevronRight arrowLeft arrowRight filter calendar money wallet card scan barcode alert info success question warning clock user members product tag stock truck receipt chart chartBar settings log package layers history undo percent gift bank phone location calculator ruler flame medal target store storeFront save copy keyboard hold lock key palette sun moon grid list sort inbox trendUp trendDown activity pie file fileAdd folder pause play power globe sparkle shieldCheck shield` |
| `DataTable` | `columns` `[{key,label,width,align,sortable,format(row),class}]`、`list`、`loading`、`emptyText`、`emptyHint`、`rowKey`、`sortBy`、`sortOrder`、`activeKey`、`maxHeight`；事件 `@sort({key,order})`、`@row-click(row,index)`；插槽 `#cell-<key>="{ row, index, value }"` |
| `Pagination` | `v-model:page`、`v-model:pageSize`、`total`、`pageSizes`、`simple`；`@change({page,pageSize})` |
| `StatusTag` | `:value="row.status"` + `:map="ORDER_STATUS_STYLE"`；或 `label` + `tone="badge-warning"` |
| `AppModal` | `v-model`、`title`、`subtitle`、`width`（数字=px 或字符串）、`maskClosable`；插槽默认 + `#footer="{ close }"` |
| `AppDrawer` | `v-model`、`title`、`width`、`placement`；插槽默认 + `#footer` |
| `Empty` | `icon`、`title`、`desc`、`size` |
| `FormField` | `label`、`required`、`error`、`hint`、`span`（栅格列数，配合 `class="grid grid-cols-2 gap-3"`） |
| `SwitchBox` | `v-model`、`label`、`hint`、`disabled` |
| `SearchInput` | `v-model`、`placeholder`、`width`、`debounce`、`icon`；`@search`、`@enter` |
| `PageHeader` | `title`、`desc`、`icon`、`bare`；插槽 `#actions` |
| `AppChart` | `type`: line/bar/pie/stackBar/hbar；`:data` + `xKey` + `:series="[{key,name,color,area,stack}]"`；或直接 `:option`；`height`、`legend`、`money`、`valueKey`、`nameKey`、`colors` |

### composables

```js
import { useToast } from '@/composables/useToast'
const toast = useToast()
toast.success('保存成功'); toast.error('xx'); toast.warning('xx'); toast.info('xx'); toast.ok('操作成功')

import { useConfirm } from '@/composables/useConfirm'
const confirm = useConfirm()
if (await confirm({ title: '停用商品', content: '停用后不影响历史订单', danger: true })) { ... }

import { useAuth } from '@/composables/useAuth'
const { user, isManager, isCashier, displayName, roleName, hasPermission } = useAuth()
// 模板里用 isManager 控制「店长专属」按钮的显示/禁用

import { useTable } from '@/composables/useTable'
const t = useTable(productApi.list, {
  filters: { keyword: '', status: '', categoryId: '' },
  pageSize: 20,
})
// t.list t.total t.loading t.page t.size t.query t.sort
// t.reload() t.refresh() t.setFilter({...}) t.reset() t.onPageChange({page,pageSize}) t.onSort({key,order})
// t.setList(rows) t.patchLocal(id, patch) t.removeLocal(id) t.unshiftLocal(row) t.fetchAll()
```

### 工具函数

```js
import { money, thousands, qty, percent, timeShort, dateOnly, fromNow, dateStr, genNo,
         debounce, clone, sumBy, calc, ORDER_STATUS_STYLE, MEMBER_LEVEL_STYLE,
         STOCK_STATE_STYLE } from '@/utils/format'
import { exportCsv, exportObjects, exportXls, printElement } from '@/utils/export'
```

### API（`@/api`）

```js
authApi.login/logout/me/changePassword
userApi.list/detail/create/update/disable/enable/resetPassword
memberApi.list/detail/search/create/update/remove/orders/points/adjustPoints/recharge
productApi.list/detail/byBarcode/create/update/disable/enable/remove
categoryApi.list/create/update
stockApi.list/summary/logs/adjust/purchaseOrders/purchaseDetail/createPurchase/confirmPurchase
orderApi.list/detail/create/refund/print/holds/holdDetail/createHold/removeHold
logApi.operation/login/modules
reportApi.dashboard/overview/trend/productRank/category/cashier/payment/hour/export
settingApi.detail/update
```

约定：
- 列表接口返回 `{ code, message, data: { list, total, page, pageSize } }` 或 `data: [...]`
- 详情返回 `data: { ... }`
- 写接口返回 `{ code: 0, message, data }`，**一律成功**
- 分页/筛选/排序参数：`page` `pageSize` `keyword` `sortBy` `sortOrder` `startDate` `endDate`
  + 与字段同名的精确筛选（如 `status=active`、`categoryId=C01`、`operatorId=U002`）

## 五、模拟数据（mock-data/*.json）

| 文件 | 内容 | 关键字段 |
| --- | --- | --- |
| `products.json` | 61 个商品 | id, barcode, name, categoryId, categoryName, categoryCode, unit, costPrice, price, memberPrice, stock, warnThreshold, status(active/inactive), remark, createdAt, updatedAt |
| `categories.json` | 8 个分类 | id, code, name, sort, remark |
| `users.json` | 5 个账号 | id, username, password, name, role(manager/cashier), roleName, phone, employeeNo, status(active/disabled), lastLoginAt, createdAt |
| `members.json` | 36 个会员 | id, memberNo, name, phone, gender, level(normal/silver/gold/diamond), levelName, points, balance, totalConsume, orderCount, lastConsumeAt, status, remark, createdAt |
| `orders.json` | 346 笔订单 | id, orderNo, status(paid/unpaid/refunded/partial_refund), statusName, type(member/normal), memberId/memberNo/memberName/memberPhone/memberLevelName, items[], itemCount, grossAmount, discountAmount, pointsUsed, pointsDiscount, pointsEarned, finalAmount, paidAmount, payments[{method,methodName,amount}], refund{...}, operatorId, operatorName, cashierName, createdAt, settledAt, date, time |
| `stock.json` | 61 行库存 | productId, barcode, name, categoryId, categoryName, unit, costPrice, price, stock, warnThreshold, stockAmount, stockState(normal/low/empty), stockStateName, updatedAt |
| `stock-logs.json` | 96 条库存流水 | id, type(purchase/loss/damage/check), typeName, productId, barcode, productName, unit, beforeQty, changeQty, afterQty, reason, relatedNo, operator, createdAt |
| `purchase-orders.json` | 14 张进货单 | id, purchaseNo, supplier, status(pending/received), statusName, totalQty, totalAmount, itemCount, items[], operator, remark, createdAt |
| `operation-logs.json` | 90 条操作日志 | id, operatorId, operatorName, username, roleName, module(认证/订单/商品/库存/会员/用户), action, detail, ip, userAgent, result(success/fail), resultName, createdAt |
| `settings.json` | 门店与收银配置 | shop{}, pos{}, permissions{}, roleMatrix[] |
| `dashboard.json` | 看板 KPI | updatedAt, kpi{}, todo{} |
| `reports.json` | 报表聚合 | trend[], payStats[], productRank[], categoryStats[], cashierStats[], hourStats[] |
| `holds.json` | 挂单 | id, holdNo, memberId, memberNo, memberName, itemCount, amount, operatorName, remark, createdAt |

**需要新数据时**：优先直接改对应 JSON。若要在 mock-server 里加接口，
在 `ROUTES` 里加一条 `{ path, method, handler }` 即可；没有显式路由的 `GET /api/xxx`
会自动回退到 `mock-data/xxx.json` 并自动分页筛选。

## 六、交互与视觉规范

- 扁平化：**不要渐变、不要重投影、不要大圆角**。圆角统一 4/6/8/10px，边框 1px `var(--c-line)`。
- 表格：用 `DataTable`，金额列用 `price` 类右对齐，数量列用 `num` 类右对齐。
- 空状态：用 `DataTable` 的 `emptyText/emptyHint` 或 `Empty` 组件，不要留白。
- 筛选栏放表格上方的 `.card` 里：搜索框 + 下拉 + 日期 + 「查询 / 重置」按钮。
- 写操作后要给「界面立刻变化」的反馈（本地合并草稿行 + toast），这是演示的关键体验点。
- 危险操作（停用/删除/退款）必须二次确认，用 `useConfirm`，`danger: true`。
- 表单弹窗宽度 520–720px；字段用 `FormField` + `class="grid grid-cols-2 gap-3"`。
- 店长专属功能：收银员进来时应看到明确的「权限不足」提示而不是空白表。
  列表页可以用 `v-if="isManager"` 隐藏入口，但页面本身仍要有兜底提示。

## 七、命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 本地开发 http://127.0.0.1:5178
pnpm build            # 打包静态站点到 dist/
node scripts/gen-mock-data.mjs   # 重新生成模拟数据
```
