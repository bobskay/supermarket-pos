# i18n 改造规范（页面作者必读）

> 项目已支持 **CN / EN** 双语，右上角（登录页也有）可切换。
> 这份文档是给「把剩余页面接上多语言」的人/协作者看的硬性约定。

## 一、基础设施（已完成，不要改）

```
src/i18n/dict.js   中英文字典（约 450 个键，按 nav/pos/order/member/product/stock/report/... 分区）
src/i18n/index.js  t() / tl() / formatDateTime() / formatMoney() 以及 locale 状态
src/components/layout/LangPicker.vue   右上角 CN/EN 切换按钮
src/main.js        已全局注入 $t / $tl / $date / $money
```

**在模板里直接用内置助手，不需要 import：**

```vue
{{ $t('common.save') }}
{{ $t('pos.goodsTotal', { n: itemCount }) }}
{{ $t('common.noPermission') }}
```

**在 `<script setup>` 里需要翻译时：**

```js
import { useI18n } from '@/i18n'
const { t, tl } = useI18n()

toast.ok(t('product.saveOk'))
// 表格列：用 labelKey，再在模板里 $t(col.labelKey)
const columns = [{ key: 'name', labelKey: 'product.name' }]
```

## 二、硬性规则

1. **文案一律用 `$t('key')`**，不允许在模板里留中文字面量（注释可以）。
   - 逐个检查：按钮文字、页面标题、描述、表头、表单标签、placeholder、tooltip（`:title`）、
     空状态文案、toast 提示、确认框 title/content、下拉选项文字、KPI 名称与脚注。
2. **数据内容不翻译**：商品名、会员姓名、供应商、地址、单号等来自 `mock-data/*.json` 的内容保持原样。
3. **mock 数据里的「状态文案」要按语言取**：这类字段在 JSON 里是中文（`statusName`、`levelName`、
   `stockStateName`、`typeName`、`resultName`），统一这样做：

   ```vue
   <StatusTag :label="stateText(row)" tone="badge-success" />
   ```
   ```js
   // 状态码 → 文案 key；找不到码时回退到后端给的中文 name
   const STATE_KEY = {
     paid: 'pos.statusPaid', unpaid: 'pos.statusUnpaid',
     refunded: 'pos.statusRefunded', partial_refund: 'pos.statusPartialRefund',
   }
   function stateText(row) {
     return STATE_KEY[row.status] ? t(STATE_KEY[row.status]) : row.statusName
   }
   ```
   > 如果需要的键不在字典里，**在 `dict.js` 对应分区的 `zh` 和 `en` 里各加一条**，
   > key 命名参考该分区已有键（例如 `order.statusPaid`）。禁止只加一边。
4. **不要在页面里 import dict 或直接读 `locale`**，需要判断语言时用 `const { isZh } = useI18n()`。
5. **保留中文兜底**：`$t(key, params, '中文兜底')` 的第三参数可选，用于你不想加字典键的极少数场景；
   但**主要文案必须进字典**，不要滥用兜底。
6. 金额与日期照旧用 `money()` / `dateOnly()` / `timeShort()`（它们输出的是数值格式，与语言无关，
   演示环境不要求换算货币符号）。
7. **不要修改**：`src/i18n/**`、`src/components/layout/**`、`src/main.js`、`mock-data/**`、`vite.config.js`。

## 三、可用字典键（先查再用，避免重复造键）

完整清单见 `src/i18n/dict.js`，以下是各分区主要覆盖面：

| 分区 | 覆盖内容 |
| --- | --- |
| `common.*` | 确定/取消/保存/删除/编辑/新增/查询/重置/刷新/导出/打印/关闭/返回/详情/全部/是/否/状态/类型/开始日期/结束日期/日期/时间/金额/数量/单位/备注/操作人/创建时间/更新时间/操作/提示/成功/失败/启用/停用/权限不足… |
| `nav.*` | 侧栏品牌、分组名、14 个菜单项、门店信息、班次 |
| `topbar.*` | 折叠/皮肤/语言/待办提醒/用户菜单 |
| `login.*` | 登录页全部文案 |
| `dashboard.*` | 看板 KPI、图表标题、待办、热销、库存预警、问候语 |
| `pos.*` | 收银台全部文案（扫码/购物车/会员/金额/支付/挂单/小票/图片预览） |
| `order.*` | 订单列表与详情、退款、小票字段 |
| `member.*` | 会员列表/详情/表单、等级、积分、权益 |
| `product.*` | 商品列表/表单/分类 |
| `stock.*` | 实时库存/库存流水/库存盘点/采购入库 |
| `report.*` | 报表全部图表与表头 |
| `user.*` `log.*` `settings.*` `profile.*` | 用户管理 / 操作日志 / 系统设置 / 个人中心 |
| `forbidden.*` `notFound.*` `theme.*` | 403、404、皮肤名 |

> 缺键就**成对补进 `dict.js`**（zh + en 各一条），命名跟随所在分区。
> 多个页面需要同一个键时，优先复用 `common.*`。

## 四、自检（必须做）

改完后运行，两个都要通过：

```bash
node scripts/check-sfc.mjs        # Vue 官方编译器校验，模板语法错误会直接报出来
node scripts/check-i18n.mjs       # 扫描模板里残留的中文字面量（本规范第 1 条）
node node_modules/vite/bin/vite.js build
```

`check-i18n.mjs` 会把「模板里还有中文字面量」的文件与行号列出来，请把属于你负责的页面清干净
（数据内容、注释、`v-for` 里的数据字段不算）。

## 五、参考实现

登录页已经完整改造，可直接对照：
`src/pages/Login.vue` —— 页面标题、按钮、表单标签、placeholder、页脚说明、toast 提示全部走 `t()`；
`src/components/layout/SideNav.vue` + `MenuItem.vue` —— 菜单分组与项目通过 `i18nKey` 取词。
