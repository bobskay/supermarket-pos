# 交接文档 · 超市收银系统演示版

> 写给「下一个接手的人或 AI」。先读这一页，再决定要不要翻其他文档。
> 最后更新：项目首版完工时。

---

## 〇、给 AI 协作者的工作约定（最重要，请先读这一节）

这几条是上一轮开发踩过坑之后总结出来的，**照做能省掉大量时间**。

### 1. 视觉验证交给用户，不要自己开浏览器

**背景**：上一轮最耗时的环节就是「开无头浏览器验证界面」。我写过两个浏览器诊断脚本，结果是：
每次启动 Chrome 都要几十秒，而且把 Chrome 的临时目录建在项目里，还**把 Vite 的 dev server 搞崩了好几次**
（`EBUSY: resource busy or locked, watch '...tmpdir/xxx.tmp'`），用户看到的现象是「页面一直转圈」。
排查这个崩溃本身又花了很多轮对话。

**规则**：

- **不要**为了让界面「更好看」而调用无头浏览器（headless Chrome / Puppeteer / Playwright）去截图或 dump DOM
- 需要确认「界面长什么样、布局对不对、颜色能不能看清、切换语言/皮肤是否正常」时：
  让用户自己打开 `http://127.0.0.1:5178/` 看，**AI 只负责把「请确认什么」讲清楚**
- 具体做法：**弹一个「是否合格」的确认对话框**（`ask_user_question`），把要看的点列成选项，
  例如「① 登录页按钮对不对 ② 语言切换是否生效 ③ 皮肤颜色是否清楚」，
  用户点选后 AI 再决定要不要改
- 允许 AI 自己做的验证，**仅限于不依赖浏览器的静态检查**（见第六节的 7 个脚本）：
  编译器校验、假后端断言、模板扫描、构建。这些几秒就跑完，而且结论确定

**一句话**：**AI 负责「讲清楚看什么」，用户负责「看一眼说 OK 不 OK」。**

### 2. 预计超过 2 分钟的工具调用，先说明再执行

**背景**：`pnpm install`、`vite build`、`git clone`、批量文件操作、多轮轮询 CI 状态这些，
动辄 1~5 分钟。上一轮有些调用是闷头跑的，用户不知道在等什么，体验很差。

**规则**：

- 调用前先**用一句话说明要执行什么、大概多久、为什么需要它**，得到用户确认后再跑
- 典型需要确认的操作：
  - `pnpm install` / 依赖重装（可能重建 node_modules，几分钟）
  - `vite build`（约 5 秒，一般不用问；但如果同时要构建 + 推送 + 验证，整体超过 2 分钟就要说明）
  - `git clone` / `git push`（网络原因可能很慢，尤其是 GitHub）
  - 轮询 CI 状态（每轮 20 秒 × N 轮，很容易超 2 分钟）
  - 批量改写大量文件
- 几秒钟的调用（读文件、跑自检脚本、grep）**不用问**，问了反而啰嗦

### 3. 全部用中文

- 思考过程、回复、代码注释、提交信息、文档——**一律中文**，不要再夹英文思考
- 代码里的技术名词（变量名、API 名、文件路径）保持原样即可

### 4. 改动前先跑自检，改完再跑一次

第六节列了 7 个脚本，几秒就能跑完，是这套项目最划算的质量保险。
**尤其** `check-sfc.mjs`（模板语法）和 `check-i18n-keys.mjs`（文案键完整性），
能挡住绝大多数「改完才发现在界面上是坏的」这类问题。

---

## 一、项目是什么

面向中小型超市门店的经营系统**前端演示工程**，给甲方评审用。打包成纯静态站点，
所有数据来自本地模拟 JSON，写操作只弹成功提示、不落库、不需要任何后端。

- 技术栈：Vue 3.5 + Vite 6 + TailwindCSS 4 + vue-router 4（hash 模式）+ ECharts 5
- **零第三方 UI 框架 / 零图标库 / 零 Pinia / 零 i18n 库**：组件、图标、多语言、假后端全部自带
- 三套皮肤：清爽白 `clean` / 清新绿 `fresh` / 曜石蓝 `midnight`
- 双语界面：简体中文 `zh` / English `en`（右上角切换，共 1379 个文案键，两边完全对齐）
- 商品图片：61 张脚本生成的扁平插图，放在 `public/products/<条码>.svg`

### 已完成的功能范围

| 模块 | 页面 |
| --- | --- |
| 账号与权限 | 登录、用户管理、个人中心、操作日志、系统设置 |
| 商品与库存 | 商品档案、商品新增/编辑、商品分类、实时库存、采购入库、库存流水、库存盘点 |
| 会员 | 会员管理、会员详情、新建会员 |
| 收银核心 | **收银开单**（主场景）、订单管理、订单详情 |
| 数据 | 经营看板、报表统计 |
| 其他 | 403、404 |

共 34 个页面（`src/pages/`）。

---

## 二、仓库与部署

| 仓库 | 内容 | 说明 |
| --- | --- | --- |
| [supermarket-pos](https://github.com/bobskay/supermarket-pos) | **完整源码** | 开发都在这里，`main` 分支 |
| [supermarket-pos-html](https://github.com/bobskay/supermarket-pos-html) | **只有构建产物** | 纯静态文件，用于在线演示 |

- 线上演示地址：**https://bobskay.github.io/supermarket-pos-html/**
- 本地源码目录：`C:\dsh\shop`
- 本地还有一个临时克隆目录 `C:\dsh\supermarket-pos-html`，内容已推送完毕，可随时删除

### 更新线上演示的流程

```bash
cd C:\dsh\shop
pnpm build                                   # 产物在 dist\
# 把 dist\ 下所有文件覆盖到 HTML 仓库根目录
cd C:\dsh\supermarket-pos-html
git add -A && git commit -m "chore: 更新构建产物" && git push
```

GitHub Pages 用的是「从 main 分支根目录部署」，所以仓库根必须有 `index.html` 和 `.nojekyll`。

### 关于那条 Actions 流水线（现状：未启用成功）

`.github/workflows/deploy-pages.yml` 已写好，构建步骤在 CI 上是绿的，但**卡在创建 Pages 站点**：
GitHub 不允许用工作流的 `GITHUB_TOKEN` 创建 Pages 站点（`configure-pages` 报
`Get Pages site failed / Not Found`，加 `enablement: true` 也无效）。
如果以后想让它自动跑：去 `supermarket-pos` 仓库的 Settings → Pages，把 Source 切成
`GitHub Actions` 即可，之后推送源码就会自动构建部署。

---

## 三、网络环境（这台机器的特殊情况）

这台机器**直连 `github.com:443` 会被重置**，`git` 走 HTTPS 会报 `Connection was reset`。
已配置好的可用通道（不用重复折腾）：

- `~/.ssh/config` 里把 `github.com` 映射到 **`ssh.github.com:443`**，用已有的 `~/.ssh/id_rsa`
- 仓库 remote 用的是 **SSH**：`git@github.com:bobskay/supermarket-pos.git`
- 机器上有代理 `127.0.0.1:7890`（`api.github.com` 能通，但 `github.com` 没走代理，所以别指望它）
- `git` 的全局 `http.proxy` 已经被**撤销**了（试过没用），不要再加回去

**结论**：push 一律走 SSH，不要用 HTTPS。

---

## 四、关键文件与「改哪里」

```
src/
├─ api/
│  ├─ mock-data.js     用 import.meta.glob 把 mock-data/*.json 内联进产物
│  ├─ mock-server.js   ★「假后端」：路由表 ROUTES，URL → JSON
│  ├─ request.js       ★「假 axios」：API 与 axios 一致（拦截器/延迟/pending 计数）
│  └─ index.js         领域 API 出口（authApi / productApi / orderApi ...）
├─ composables/
│  ├─ useAuth.js       登录态、角色判断、按角色算默认首页
│  ├─ useTable.js      ★ 列表页编排（loading/筛选/分页/排序/本地合并/12 秒超时）
│  ├─ useTheme.js      三套皮肤切换
│  ├─ useToast.js      轻提示（窗口失焦自动收起）
│  └─ useConfirm.js    Promise 化确认框
├─ i18n/
│  ├─ dict.js          ★ 中英文字典（1379 键，按 nav/pos/order/... 分区）
│  └─ index.js         t() / tl() / formatDateTime() / formatMoney()
├─ components/
│  ├─ layout/          AppShell / SideNav / MenuItem / TopBar / ThemePicker / LangPicker / PageShell / ProgressBar
│  ├─ ui/              15 个自建组件（AppButton/DataTable/Pagination/AppModal/...）
│  └─ ReceiptPaper.vue 80mm 小票
├─ pages/              34 个业务页面
├─ router/index.js     哈希路由 + 登录守卫 + 角色权限守卫
├─ styles/
│  ├─ main.css         Tailwind 入口 + 基础样式 + 组件类（.btn/.card/.badge/.kpi...）
│  └─ theme.css        ★ 三套皮肤的 CSS 变量 + @theme 映射
└─ utils/              format.js（含 i18n 化的相对时间）/ export.js / product-image.js

mock-data/*.json       唯一数据源，纯 JSON，可直接手改
public/products/       61 张商品图，文件名 = 商品条码
scripts/               数据生成 + 7 个自检脚本
```

### 换真实后端只要改一处

`src/main.js` 里把 `@/api/request.js` 换成真的 axios 实例即可，业务代码**一行都不用改**
（拦截器、错误处理、loading 约定、`{ code, message, data }` 响应体全部对齐）。

---

## 五、环境与命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发预览 http://127.0.0.1:5178
pnpm build            # 打包到 dist/
pnpm preview          # 预览打包产物
```

**演示账号**（登录页有两个一键登录按钮，点一下直接进）：

| 角色 | 账号 | 密码 | 可见范围 |
| --- | --- | --- | --- |
| 店长 | `admin` | `123456` | 全部模块 |
| 收银员 | `cashier01` | `123456` | 收银开单、订单（仅本人）、会员管理 |

### ⚠️ dev server 崩过一次，原因和防范

**现象**：页面「一直转圈」，所有请求挂起。

**原因**：`Vite` 的文件监视器去 watch 了被其他程序锁住的临时文件
（`EBUSY: resource busy or locked, watch '...\.Xxx.vue.1234.xxx.tmpdir\Xxx.vue.tmp'`），
watcher 抛错后整个 dev server 进程退出。

**已修**：`vite.config.js` 里加了 `server.watch.ignored` 白名单：

```js
ignored: ['**/dist/**', '**/.diag-profile/**', '**/.verify-chrome*/**',
          '**/.*.tmpdir/**', '**/*.tmpdir/**', '**/*.tmp', '**/*.swp', '**/*.log']
```

**以后注意**：不要让任何工具把临时目录建在项目里；真崩了直接重启 `pnpm dev` 就行。

---

## 六、自检脚本（改完代码一定要跑）

这几个脚本**不需要浏览器**，几秒完成，是这套项目的质量保险。

```bash
node scripts/check-sfc.mjs            # ① 用 Vue 官方编译器校验全部 .vue（模板语法错误直接报）
node scripts/check-i18n.mjs           # ② 扫模板里未接入多语言的中文字面量
node scripts/check-i18n-keys.mjs      # ③ i18n 键完整性（缺失 / zh-en 不对齐 / 冗余）
node scripts/check-template-refs.mjs  # ④ 模板里对 ref 误写 .value（踩过大坑，见第七节）
node scripts/audit-pages.mjs          # ⑤ 硬编码颜色 / 未定义图标 / 未导入组件
node scripts/verify-mock-api.mjs      # ⑥ 假后端自检（53 项断言）
node scripts/gen-mock-data.mjs        # ⑦ 重新生成模拟数据（改了数据口径才需要）
node scripts/gen-product-images.mjs   # ⑧ 重新生成 61 张商品图
```

理想情况下 ①②③④⑤⑥ 全绿，⑦⑧ 只在改数据/图片时才需要。

---

## 七、踩过的坑（避免重犯）

### 1. Vue 模板里的 ref 解包 —— 症状最迷惑的一个

**症状**：订单管理「分页条正常显示 346 条，但表格数据全空」。

**原因**：同一次改动里混用了两种写法。

```vue
:total="t.total"        <!-- 模板对普通对象内的 ref 会解包 → 正确拿到 346 -->
:list="t.list.value"    <!-- t.list 已被解包成数组，再取 .value → undefined → 表格空 -->
```

**结论**：模板里**不要写 `.value`**，但要统一风格。本项目现在的约定是
（所有列表页都照这个写）：

```js
const t = useTable(...)
const { list, total, loading, query, page, size, refresh, reset } = t
```

然后模板里直接用 `list` / `total` / `loading`。`scripts/check-template-refs.mjs` 专门扫这个坑。

### 2. i18n 里 `t` 变量被遮蔽

`ThemePicker.vue` 里曾经写 `v-for="t in THEMES"`，把 i18n 的 `t()` 函数遮蔽掉了，
翻译调用直接失效。**循环变量不要叫 `t`**（用 `opt` / `item`）。

另外几个页面里 `useTable` 的返回值原本也叫 `t`，和 i18n 的 `t` 撞名，
现在统一改名成 `table`。

### 3. 状态文案的中英文处理

`mock-data/*.json` 里的 `statusName` / `levelName` / `stockStateName` 等是**中文数据**。
约定做法：**状态码 → 字典键** 映射后用 `t()`，未知码再回退 `tl(row, 'statusName')`。
不要直接把中文当界面文案用，否则切到英文就露馅。

### 4. CI 的两个坑（都已修好）

| 报错 | 原因 | 修法 |
| --- | --- | --- |
| `packages field missing or empty` | `pnpm-workspace.yaml` **只要存在**就被当 workspace 解析，缺 `packages` 字段时连 `pnpm store path` 都失败 | 删掉该文件，改用 `.npmrc` 配 `only-built-dependencies[]=esbuild` |
| `安装 pnpm` 步骤失败 | `package.json` 的 `packageManager` 与 `pnpm/action-setup` 的 `version` **两处同时指定版本** | 版本只在 workflow 里指定一处 |

### 5. GitHub Pages 首次启用必须人工

工作流无法创建 Pages 站点（权限限制）。首次部署需要用户去仓库 Settings → Pages 手动选一次
Source，之后就不用再管了。

---

## 八、已知边界与后续建议

### 现状（刻意为之，不是 bug）

- 所有写操作**不修改** `mock-data/*.json`，只做本地合并让界面立刻有变化；刷新后恢复初始数据
- 上传的商品图片以 Base64 存在当前页面，刷新后回到初始图片（真实项目要接后端上传接口）
- 小票「打印」调用浏览器打印，没接真实小票机；导出是前端生成的 CSV / Excel
- 会员储值只做了余额展示与充值入口，没有完整资金流水

### 如果继续做，建议的优先级

1. **列表页虚拟滚动**：订单 346 条还行，真实数据量上来后 `DataTable` 需要虚拟化
2. **表单校验统一封装**：现在各页面的校验逻辑还是各写各的（`errors` 对象 + 手写判断）
3. **`useTable` 支持取消请求**：快速切换筛选时可能有竞态（目前靠 12 秒超时兜底）
4. **字典按需加载**：现在 `dict.js` 1379 键全量打包，加第三门语言可以考虑分包
5. **接口层抽 TypeScript**：类型提示能减少「字段名拼错」这类低级问题

### 加第三门语言（如果需要）

1. `src/i18n/dict.js` 里加一份同结构字典（例如 `ja`），注意与 `zh` 的键一一对应
2. `LOCALES` 里加一条 `{ key: 'ja', label: '日本語', short: 'JP' }`
3. 跑 `node scripts/check-i18n-keys.mjs` 确认无缺失
4. 右上角按钮会自动多出一项，不需要改组件

---

## 九、相关文档

| 文档 | 内容 |
| --- | --- |
| `README.md` | 项目总览、目录结构、假后端原理、三套皮肤、双语、组件库、部署、演示路径 |
| `CONVENTIONS.md` | **新增页面必读**：配色只能用主题变量、组件用法速查、mock 数据字段表 |
| `I18N-GUIDE.md` | **做多语言必读**：`$t` / `tl` 用法、状态文案处理、缺键怎么补 |
| `功能清单.md` | 甲方给的原始需求清单（已全部实现，含进阶项） |

---

## 十、一句话交接

**项目已完工可用，线上演示正常。** 后续改动请：

1. 改代码 → 跑第六节的自检脚本 → 让用户在浏览器里确认界面
2. 需要视觉判断的事情**不要自己开浏览器**，弹确认框让用户看
3. 预计超过 2 分钟的操作先说明再执行
4. 全程中文
