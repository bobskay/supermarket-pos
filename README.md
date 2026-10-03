# 超市收银系统 · 演示版

面向中小型超市门店的经营系统前端演示工程。**用于甲方评审演示**，打包为纯静态站点，
所有数据来自本地模拟数据目录，写操作仅返回成功提示，不依赖任何后端服务。

- 技术栈：**Vue 3.5 + Vite 6 + TailwindCSS 4 + vue-router 4 + ECharts 5**
- 三套皮肤：**清爽白 / 清新绿 / 曜石蓝**，右上角（登录页也有）一键切换
- 视觉风格：简约商务、扁平化、无渐变无多余装饰
- 离线可跑：`dist` 目录可直接双击 `index.html` 打开（哈希路由 + 相对资源路径）
- 零 UI 框架 / 零图标库 / 零 Pinia：组件库、图标、假后端全部自带

---

## 一、在线演示与本地运行

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发预览 http://127.0.0.1:5178
pnpm build            # 打包静态站点到 dist/
pnpm preview          # 本地预览打包产物
```

演示账号（登录页提供两个一键登录按钮，点一下直接进系统）：

| 角色 | 账号 | 密码 | 可见范围 |
| --- | --- | --- | --- |
| 店长 | `admin` | `123456` | 全部模块（看板 / 商品 / 库存 / 会员 / 订单 / 报表 / 用户 / 日志） |
| 收银员 | `cashier01` | `123456` | 收银开单、订单（仅本人）、会员管理 |

> 用两个账号分别登录，可以直观演示「角色权限隔离」这个卖点：
> 收银员看不到经营看板、商品、库存、报表、用户与日志，直接访问这些地址会被拦到 403。

---

## 二、目录结构

```
shop/
├─ mock-data/                 ★ 唯一数据源，纯 JSON，可直接手改
│  ├─ products.json           61 个商品
│  ├─ categories.json         8 个分类
│  ├─ users.json              5 个账号（店长 / 收银员）
│  ├─ members.json            36 个会员
│  ├─ orders.json             346 笔订单（含混合支付、退款、挂单）
│  ├─ stock.json              61 行实时库存
│  ├─ stock-logs.json         96 条库存流水
│  ├─ purchase-orders.json    14 张进货单
│  ├─ operation-logs.json     90 条操作日志
│  ├─ settings.json           门店 / 收银 / 会员 / 权限配置
│  ├─ dashboard.json          首页 KPI
│  ├─ reports.json            报表聚合（趋势 / 支付 / 排行 / 品类 / 收银员 / 时段）
│  └─ holds.json              挂单
│
├─ public/products/           61 张商品图（文件名 = 商品条码，见第七章）
│
├─ scripts/
│  ├─ gen-mock-data.mjs       模拟数据生成脚本（可重复运行，数据自洽）
│  ├─ gen-product-images.mjs  商品图片生成脚本（按品类配色生成扁平插图）
│  ├─ verify-mock-api.mjs     假后端自检（53 项断言，不需要浏览器）
│  ├─ check-sfc.mjs           用 Vue 官方编译器校验全部 SFC
│  ├─ check-template-refs.mjs 检查模板里对响应式对象的多余 .value
│  └─ audit-pages.mjs         页面规范静态审查（颜色 / 图标 / 组件导入）
│
├─ .github/workflows/deploy-pages.yml   GitHub Pages 自动部署
│
├─ src/
│  ├─ api/
│  │  ├─ mock-data.js         用 import.meta.glob 把 mock-data/*.json 内联进产物
│  │  ├─ mock-server.js       「假后端」：路由表 ROUTES，URL → JSON
│  │  ├─ request.js           「假 axios」：与 axios API 完全一致
│  │  └─ index.js             领域 API 出口
│  ├─ components/
│  │  ├─ layout/              AppShell / SideNav / MenuItem / TopBar / ThemePicker / PageShell / ProgressBar
│  │  ├─ ui/                  自建组件库（15 个，见第八章）
│  │  └─ ReceiptPaper.vue     80mm 小票（收银台与订单详情共用）
│  ├─ composables/            useAuth / useTheme / useToast / useConfirm / useTable
│  ├─ pages/                  业务页面（24 个）
│  ├─ router/index.js         哈希路由 + 登录守卫 + 角色权限守卫
│  ├─ styles/
│  │  ├─ main.css             Tailwind 入口 + 基础样式 + 组件类
│  │  └─ theme.css            ★ 三套皮肤的 CSS 变量 + @theme 映射
│  └─ utils/                  format.js / export.js / product-image.js
│
└─ CONVENTIONS.md             ★ 开发规范（新增页面必读）
```

---

## 三、「假 axios」是怎么工作的

这是本项目最核心的一个设计：**页面代码按真实后端的方式写，但数据来自本地 JSON**。

```
页面  →  @/api (productApi.list)  →  @/api/request.js「假 axios」
                                      ↓  按 URL 路由
                                   @/api/mock-server.js  ROUTES
                                      ↓  读表 / 分页 / 筛选 / 排序
                                   mock-data/*.json
```

**请求约定**

| 请求 | 行为 |
| --- | --- |
| `GET /api/products?page=1&pageSize=20&keyword=苹果` | 读 `products.json`，自动完成分页、筛选、排序 |
| `GET /api/products/barcode/6900000000137` | 按条码取单个商品，取不到返回业务失败 |
| `GET /api/xxx`（未登记路由） | 自动回退映射到 `mock-data/xxx.json` |
| `POST / PUT / PATCH / DELETE` | **一律返回 `{ code: 0, message: '操作成功' }`**，不落库 |

**统一响应体**

```js
{ code: 0, success: true, message: '操作成功', data: ... }
```

列表接口的 `data` 结构为 `{ list, total, page, pageSize }`。

**通用查询参数**（所有列表接口都支持）

`page` `pageSize`（传 0 取全量）`keyword` `sortBy` `sortOrder` `startDate` `endDate`
`exact=字段:值,字段:值`，以及任意与数据字段同名的精确筛选（如 `status=active`、`categoryId=C01`）。

**换成真实后端**：只需在 `src/main.js` 里把 `@/api/request.js` 替换为 axios 实例，
业务代码一行都不用改（拦截器、错误处理、loading 约定全部一致）。

---

## 四、三套皮肤怎么实现

所有颜色都收敛成 CSS 变量（`src/styles/theme.css`），页面里只写语义类名：

```
bg-bg / bg-surface / bg-surface-2 / bg-surface-3 / bg-elevated / bg-hover
text-text / text-text-2 / text-text-3 / text-primary / text-success / text-warning / text-danger
border-line / border-line-strong
```

切换皮肤 = 切换 `html[data-theme]`，变量值随之变化，**组件代码零改动**：

```js
import { useTheme } from '@/composables/useTheme'
const { theme, setTheme, toggleTheme } = useTheme()
```

| 皮肤 | 说明 |
| --- | --- |
| `clean` 清爽白 | 白底浅灰、蓝色主色，适合明亮门店 |
| `fresh` 清新绿 | 白底为主、绿色主色，柔和护眼 |
| `midnight` 曜石蓝 | 深色底、靛蓝高亮，适合长时间盯屏的收银岗 |

皮肤切换面板是**三宫格色板预览**，点当前已选中的那套会直接收起面板。
图表（ECharts）会监听主题变化并重新读取 CSS 变量，换肤时图表颜色同步更新。
选择结果写入 `localStorage`，刷新不丢。

---

## 五、页面清单（对照功能清单）

### 概览与收银
| 页面 | 路由 | 权限 |
| --- | --- | --- |
| 经营看板 | `/dashboard` | 店长（KPI、销售走势、待办、库存预警、热销榜、品类占比） |
| **收银开单** | `/pos` | 收银员 + 店长（本项目主场景，见第六章） |
| 订单管理 | `/orders` | 收银员（仅本人订单）+ 店长（全部，可按单号/时间/会员/收银员筛选） |
| 订单详情 | `/orders/:id` | 同上（小票预览、打印、退款） |

### 会员
| 页面 | 路由 | 权限 |
| --- | --- | --- |
| 会员管理 | `/members` | 收银员 + 店长（新建、编辑、积分调整、注销仅店长） |
| 会员详情 | `/members/:id` | 收银员 + 店长（消费记录 + 积分明细 + 消费趋势） |
| 新建会员 | `/members/create` | 收银员 + 店长（手机号查重、等级权益对照） |

### 商品与库存（店长专属）
| 页面 | 路由 |
| --- | --- |
| 商品档案 | `/products`（列表带商品图片列、点击看大图、导出） |
| 商品新增 / 编辑 | `/products/create`、`/products/:id`（含图片上传、毛利率自动计算） |
| 商品分类 | `/categories`（分类维护 + 销售占比饼图） |
| 实时库存 | `/stock`（库存预警、库存调整：损耗/破损/盘盈） |
| 采购入库 | `/purchase`（新建进货单、明细抽屉、确认入库） |
| 库存流水 | `/stock/logs`（采购/损耗/破损/盘盈全留痕） |
| 库存盘点 | `/stock/check`（可编辑盘点表、盈亏实时计算、导出盘点表） |

### 数据与系统（店长专属）
| 页面 | 路由 |
| --- | --- |
| 报表统计 | `/reports`（趋势 / 支付结构 / 商品排行 / 品类结构 / 收银员业绩 / 时段分布） |
| 用户管理 | `/users`（创建账号、重置密码、停用/启用、角色权限对照表） |
| 操作日志 | `/logs`（全部日志 / 登录登出两个页签） |
| 系统设置 | `/settings`（门店信息 / 收银设置 / 会员积分 / 权限说明） |
| 个人中心 | `/profile`（资料修改、修改密码、本月表现） |

---

## 六、收银台（`/pos`）的效率设计

演示时最抓眼球的一页，专门做了收银现场的提效细节：

- **扫码即开单**：条码框常驻焦点，扫码枪回车即入车，同商品自动累加；成功/失败有「嘀」声反馈（WebAudio 合成，无音频文件）
- **不加车弹窗**：加车反馈是「商品行高亮 800ms + 提示音」，连续扫码时多行可同时高亮，不打断收银节奏
- **条码兜底**：条码查不到时自动降级为名称模糊搜索，命中唯一结果直接入车
- **热销榜快捷加车**：左侧常驻热销榜，每行带商品小图，**点小图看大图预览**（弹窗内可直接加车）
- **键盘全流程**：`F1` 聚焦扫码 / `F2` 结算 / `F4` 清空 / `F8` 取单 / `F9` 挂单 / `Ctrl+Enter` 结算
- **数量微调**：`↑` `↓` 调数量，改成 0 即删除该行
- **会员**：手机号/会员号回车绑定，自动算等级折扣、积分抵扣与可得积分；支持现场新建会员并自动绑定
- **混合支付**：一笔订单可拆成现金 + 微信 + 支付宝 + 储值卡多笔，现金支持快捷面额与自动找零
- **挂单 / 取单 / 结算收款**：三个按钮集中在「应收合计」下方，收银员视线不用上下跳
- **滚动策略**：热销榜与购物车各自独立滚动；结算收款面板与弹窗内不出现滚动条
- **小票**：结算后直接出 80mm 小票预览，可打印（`@media print` 只输出小票）

---

## 七、商品图片怎么维护

61 个商品都配了扁平风格插图（苹果是红圆带绿叶、牛奶是蓝白纸盒、薯片是黄袋、卷纸是白卷…），
由 `scripts/gen-product-images.mjs` 按品类配色生成，**不依赖外网图床**。

- 文件位置：`public/products/<商品条码>.svg`，例如红富士苹果 `6900000000137.svg`
- 前端取值：`src/utils/product-image.js` 按条码拼路径，并用 Vite 的 `BASE_URL` 前缀，
  因此**部署在子目录（GitHub Pages）或直接双击 `index.html` 都能正确加载**
- 换成真实照片：把同名 `.jpg/.png` 放进 `public/products/`，再改一下 `product-image.js` 的后缀即可
- 店长新建商品时，只要把图片按「条码.svg」命名丢进该目录，商品档案与收银台就会自动显示

```bash
node scripts/gen-product-images.mjs   # 重新生成全部商品图
```

---

## 八、组件库与组合式函数

本项目没有引入 UI 框架，组件都是自建的，因此风格与打包体积完全可控。

| 组件 | 用途 | 关键属性 |
| --- | --- | --- |
| `AppButton` | 按钮 | `variant` `size` `icon` `loading` `block` |
| `DataTable` | 数据表格 | `columns` `list` `loading` `sortable` 插槽 `#cell-<key>` |
| `Pagination` | 分页 | `v-model:page` `v-model:pageSize` `total` |
| `AppModal` / `AppDrawer` | 弹窗 / 侧滑抽屉 | `v-model` `title` `width` `#footer` |
| `StatusTag` | 状态标签 | `value` + `map` 映射徽章配色 |
| `FormField` / `SwitchBox` / `SearchInput` | 表单控件 | 校验提示 / 开关 / 防抖搜索（可接扫码枪） |
| `AppChart` | 图表 | `line` `bar` `pie` `stackBar` `hbar`，自动跟随皮肤 |
| `Empty` / `Icon` / `PageHeader` / `PageShell` | 基础 | 空状态 / 80+ 内联 SVG 图标 / 页面骨架 |

组合式函数：

| Composable | 作用 |
| --- | --- |
| `useAuth` | 登录态、角色判断、`hasPermission`、按角色算默认首页 |
| `useTheme` | 三套皮肤切换 |
| `useToast` | 轻提示（窗口失焦自动收起） |
| `useConfirm` | Promise 化确认框（危险操作用 `danger: true`） |
| `useTable` | 列表页编排：loading / 筛选 / 分页 / 排序 / 本地合并 / 12 秒兜底超时 |

> ⚠️ 使用 `useTable` 的约定：**在脚本里解构出 ref 后再给模板用**，不要在模板里写 `t.list` 这类嵌套访问。
> 模板对普通对象内 ref 的自动解包不可靠，本项目所有列表页统一用：
> ```js
> const t = useTable(api.list, { ... })
> const { list, total, loading, query, page, size, refresh, reset } = t
> ```
> `node scripts/check-template-refs.mjs` 会扫出模板里多余的 `.value`。

---

## 九、模拟数据维护与自检

数据由脚本生成，保证自洽（库存 = 入库 − 销售 + 调整、积分 = 消费金额累计）：

```bash
node scripts/gen-mock-data.mjs        # 重新生成 mock-data/*.json
node scripts/verify-mock-api.mjs      # 假后端自检（53 项断言，不需要浏览器）
node scripts/check-sfc.mjs            # 用 Vue 官方编译器校验全部 .vue
node scripts/check-template-refs.mjs  # 检查模板里多余的 .value
node scripts/audit-pages.mjs          # 页面规范审查（硬编码颜色 / 未定义图标 / 未导入组件）
```

**日常改数据不需要碰脚本**，直接编辑 `mock-data/*.json` 即可（改完刷新页面生效）。
想新增一张表：把 `xxx.json` 放进 `mock-data/`，`GET /api/xxx` 会自动可用。

---

## 十、部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy-pages.yml`），推送到 `main` 即自动构建并发布。

**首次配置（在 GitHub 网页上操作一次）**

1. 新建一个空仓库（不要勾选初始化 README），例如 `supermarket-pos`
2. 本地把代码推上去：
   ```bash
   git init
   git add .
   git commit -m "feat: 超市收银系统演示版"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 仓库页面 → **Settings → Pages** → `Build and deployment` 的 Source 选择 **GitHub Actions**
4. 等 Actions 跑完（约 1~2 分钟），访问 `https://<你的用户名>.github.io/<仓库名>/`

**关于子路径**：`vite.config.js` 会读取 Actions 提供的 `GITHUB_REPOSITORY` 自动推导 `/<仓库名>/` 作为 `base`，
本地开发和 `dist` 双击打开时则使用相对路径，两种场景都不会 404。
如需手动指定，设置环境变量 `VITE_BASE=/你的路径/` 即可。

---

## 十一、演示建议路径

1. **登录页**：点「店长登录」一键进入，说明演示账号与权限设计
2. **经营看板**：今日销售额、待办事项、库存预警、热销榜
3. **收银台**：扫码加商品 → 绑定会员（演示折扣与积分）→ 混合支付 → 小票预览打印
   - 顺手演示：条码查不到时的名称搜索兜底、挂单取单、键盘快捷键、热销榜点图看大图
4. **订单管理**：找到刚才的单 → 订单详情 → 退款（演示积分扣回与库存返还）
5. **库存**：库存预警 → 库存调整（损耗）→ 库存流水留痕 → 库存盘点表
6. **报表统计**：切换统计周期、导出 Excel
7. **右上角切换皮肤**，同一批页面在清爽白 / 清新绿 / 曜石蓝之间秒切
8. **退出，用收银员账号登录**：菜单只剩收银开单 / 订单 / 会员，访问店长页面得到 403 提示

---

## 十二、已知边界

- 所有写操作**不会改变** `mock-data/*.json`，页面内通过本地合并数据让界面立刻变化；
  刷新页面后恢复初始数据。这是演示版的刻意设计。
- 上传的商品图片以 Base64 保存在当前页面，刷新后回到初始图片；真实项目需接后端上传接口。
- 小票「打印」调用浏览器打印，未接真实小票机；导出为前端生成的 CSV / Excel 文件。
- 会员储值只做了余额展示与充值入口，未做完整资金流水。
