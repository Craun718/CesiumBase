# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 语言规则

- 始终使用中文回复与沟通；文档、提交说明使用中文。
- 代码标识符、命令、API 与配置名称保持英文；新增代码注释使用中文。

## 代理行为准则

- 开发服务器只能由人工启动。LLM 不得通过任何命令或脚本运行、重启、代理或变相启动 `pnpm dev` / `pnpm preview`；不得停止或接管用户已启动的开发服务。运行时问题只能基于用户提供的 URL、日志、控制台输出、网络请求信息，或生产构建等显式允许的验证方式排查。
- 除非用户在当前请求中明确要求或 skill 的流程有实际需求，LLM 不得查看或推断 Git 历史，包括但不限于 `git log`、`git blame`、`git show`、历史 diff、旧提交内容、旧文件版本和分支演变。分析只能以当前工作区状态为准。允许使用 `git status`、`git diff --cached` 和 `git diff` 检查当前未提交状态。
- 不得读取 `.git` 目录、缓存快照、备份目录或其他工作区副本中的旧版内容来还原、比较或解释当前实现。用户明确要求查看历史时，也只读取其指定的对象。
- 不得自动 stage 用户未选择的文件；`git commit` 智能处理已经在 stage 里的文件而且必须先展示待提交内容；未经用户明确要求不得 `git push`。

## 概述

Vue 3 + TypeScript + Vite 的 GIS 大屏（数字态势监控中心），以广西区域为中心，围绕一个共享的地图应用层构建。本分支只包含并启用 Cesium 渲染引擎。

当前分支只做 Cesium 实现，不包含 deck.gl 实现和依赖。引擎无关的地图应用层与构建期入口抽象保留，后续如需接入其他引擎，应在专门分支中补充对应引擎工作区。

应用只保留 `/` 地图大屏，共享 `src/features` 的目录模型与 `src/map` 的地图应用层。

## UI/UX 风格

- 当前界面按深色 GIS 大屏设计：近黑底、半透明面板、**绿色**（`--color-accent: #4aee86`）作为主强调色、Slate 中性色（`--neutral`）作为次强调；告警用琥珀（`--color-accent-amber`）、错误用玫红（`--color-accent-rose`）。这是**无色相方案**：描边与内线一律走中性色，蓝色边框属于语义错误。文本保持高对比，指标和坐标优先使用等宽字体。色值以 `src/styles/global.css` 为准（唯一出处）。
- 大屏骨架固定为顶部状态栏、中央全幅地图、底部状态栏；左右操作栏浮在地图上方，面板从操作栏旁边展开。地图视口是视觉主体，新增 UI 不得遮挡关键读数、指北针或状态栏；面板必须限制宽度并使用内部滚动，不得为内容撑开屏幕布局。
- 面板外壳优先复用 `FloatingWindow`，保持统一的内边距、标题、标签、关闭按钮、阴影和毛玻璃效果；不得为同类功能另建弹窗、抽屉或卡片容器。列表、表单和工具区块放在功能面板内部，避免面板套面板、卡片套卡片。
- 导航层级固定为“一级侧栏 → 二级菜单 → 三级功能面板”。二级菜单仅允许放置 `command` 与 `trigger` 两类入口：`command` 点击后立即执行并给出反馈，`trigger` 切换状态或模式。入口点击后还需要输入、选择、编辑、确认或其他后续操作时，必须放入三级功能面板。
- 二级菜单与三级功能面板使用独立状态源：打开或切换三级只更新对应面板状态，关闭三级只清空该状态，不得在关闭事件里推断或恢复二级；关闭二级时同步关闭该入口对应的三级面板。同一层级互相替换，不同层级互不借用生命周期。
- 新增能力先按交互类型分类：无需额外操作的 `command` / `trigger` 可进入二级菜单；需要表单、列表、配置、多步操作或持续反馈的功能，归入既有分类下的三级功能面板，用标签页、分区或工具组承载，不得提升为二级入口。确需调整信息架构时，先说明分类依据和交互收益。
- 控件选型必须匹配语义：立即动作用按钮，二元状态用开关，数值范围用滑杆并配数字输入，互斥选项用单选组，文本输入用表单字段。图标按钮必须提供 `title` 与可访问名称，危险操作必须二次确认。
- **有交互语义的控件必须复用 `src/components/base/` 的 Reka 封装，不得手写**：`AppDialog`（焦点陷阱、Esc、滚动锁）、`AppSelect`（收敛原 17 处原生 `<select>` 皮肤）、`AppSwitch`、`AppRadioGroup` / `AppRadio`、`AppCollapsibleGroup`、`ToastProvider`（经 `useToast()` 取用，inject 不到会直接抛错，因此必须包住 `RouterView`）。`AppDialog` 的 `open` 必须受控，调用处不得再包 `v-if`（否则退场动画丢失），也不得再写 `@keydown.esc`（会双次关闭）。无交互语义的布局容器不要往组件库搬；面板外壳一律用 `FloatingWindow`（`RailPanel.vue` 是唯一直接使用点）。原生 `type="range"`、纯展示表格保持原生。
- 禁用项必须说明原因；悬停、焦点、激活、打开、加载和失败状态要有明确视觉反馈。操作反馈优先显示在所属功能面板内，不得用全局浮层打断地图操作。
- 可访问性按现有模式实现：面板使用 `role="region"` 和中文 `aria-label`，菜单用 `aria-expanded` / `aria-controls`，互斥选择用 `role="radiogroup"` / `role="radio"`，开关用 `role="switch"`（由 Reka 提供，**不是 `aria-pressed`**），并支持 Escape 关闭面板。焦点环由 `global.css` 统一提供，组件内不得局部 `outline: none`。
- 图标统一使用 Bootstrap Icons；界面文案使用中文，标签、状态和模式可用大写英文短标签。标题、按钮和列表文本必须在窄面板内换行或截断，不得溢出、遮盖相邻控件。面板和控件保持紧凑的小圆角，避免营销化排版、大面积留白和影响地图读数的强视觉噪声。
- 设计令牌按规范 §4.1 的**三层结构**组织：`@theme`（Tailwind 调色板层，原子的无语义值：`--color-*` / `--font-*` / `--text-*` 字号 / `--space-*` / `--radius-*` / `--icon-*` / `--motion-*` / `--ring-*`，可生成工具类）→ `:root`（语义角色层：`--surface-*`、`--panel-*`、`--text-*` 文本色、`--accent|neutral|warning|danger`、圆角/字号/间距/控件尺寸角色、`--z-*`）→ 组件 scoped SCSS（只引用前两层）。两层都在 `src/styles/global.css`。**新增语义令牌进 `:root`，不进 `@theme`**。新增界面必须优先复用现有颜色、字号、边框、阴影和间距令牌；不得引入近似色、渐变装饰或一次性魔法值。组件级状态、布局和修饰样式放在所属组件的 scoped SCSS 中，全局样式只保留设计令牌与基础重置。
- 地图侧颜色走 `src/map/themeColors.ts`（Cesium 读不到 CSS 变量），它是引擎侧唯一颜色出处，且 `ACCENT` / `DEEP_BACK` / `FOREGROUND` / `WARNING` 必须与 `global.css` 对应令牌同值；`src/map/**` 的 `.ts` 里不得直接写颜色字面量。

## 代码结构

- `src/App.vue` 只作为应用外壳（顶栏 + `RouterView`）；大屏主界面由 `src/components/dashboard/DashboardWorkspace.vue` 承载，组织地图舞台、左右操作栏、浮动面板与底部状态栏，复杂面板拆成 `src/components/dashboard` 下的独立组件。
- `src/components` 放通用或界面级组件：`base/` 是基于 Reka UI 的基础控件（见「UI/UX 风格」的选型规则），`dashboard/` 是大屏外壳与功能面板，根目录放地图视口、指北针、错误边界、浮窗容器等跨场景组件。组件使用 `<script setup lang="ts">`，显示状态就近维护。
- `src/features` 放业务域，是「数据与图层管理」的全部实现：`catalog`（资源/图层目录领域模型、协议发现、Pinia store）、`layers`（运行时图层注册表与图层树）、`regions`（政区树与定位）。详见「架构 · 数据与图层域」。
- `src/router/index.ts` 定义路由：`/` 是大屏（`DashboardWorkspace`，被 `KeepAlive` 缓存），其余路径均显式重定向回大屏。`src/http/httpClient.ts` 是唯一的 HTTP 客户端（axios + `getJsonResponse`）。
- `src/map` 是引擎无关层：`types.ts` 定义引擎契约，`mapController.ts` 封装调用和异步挂载保护，`useMapController.ts` 暴露 provide/inject 的 key 与辅助函数，`engineProvider.ts` 加载构建期入口。`main.ts` 创建 `MapController` 与图层注册表并在应用级 provide。界面层不直接导入具体地图引擎。
- `src/map/engines/cesium` 是当前唯一的引擎工作区，按创建 viewer、相机、场景、边界和图源等职责拆分。新增地图能力先扩展共享契约，再在 Cesium 引擎实现。
- `src/stores` 放 Pinia setup store；跨会话数据使用 `localStore` 与 `localStorage`，标签页会话数据使用 `sessionStore` 与 `sessionStorage`。持久化配置由 `pinia-plugin-persistedstate` 处理。
- 样式入口和全局令牌在 `src/styles/global.css`；普通 UI 用 scoped SCSS 或 Tailwind，地图引擎生成的 DOM 用引擎目录内的 SCSS 配合 `:deep()` 选择器处理。

## 命令

```bash
pnpm dev          # Cesium 开发服务器（只能由人工启动）
pnpm build        # vue-tsc -b + Cesium 生产构建
pnpm typecheck    # vue-tsc -b 类型检查
pnpm test         # tsc 编译 tests 到 dist-test 后用 node:test 运行
pnpm preview      # 生产预览

pnpm lint         # oxlint
pnpm lint:fix     # oxlint --fix
pnpm format       # oxfmt --write
pnpm format:check # oxfmt --check

pnpm check:tokens   # 设计令牌静态检查（scripts/checkDesignTokens.mjs）
pnpm check:contrast # 令牌对比度实算（scripts/checkContrast.mjs）
```

### 测试

单元测试使用 Node 内置 `node:test`：`pnpm test` 先经 `tsc -p tsconfig.test.json` 编译到 `dist-test`，再运行 `node --test`。

运行单个测试文件（编译无法跳过，直接跑产物）：

```bash
pnpm exec tsc -p tsconfig.test.json
node --import ./scripts/registerTestAliases.mjs --test dist-test/tests/catalogRules.test.js
```

- `tests/**/*.ts` 编译成 ESM，导入 `src` 时写相对路径并保留 `.js` 后缀（如 `../src/features/layers/layerRegistry.js`）；根路径别名（`@/`、`@tests/`）也可用，由 `scripts/registerTestAliases.mjs` 在运行期映射到 `dist-test/`，`tests/importAliases.test.ts` 守住这两条链路。
- `tsconfig.test.json` 的 `include` 只列 `tests/**/*.ts` 与两个显式纳入的 `src` 文件（`src/features/layers/types.ts`、`src/map/engines/cesium/layerOperations.ts`），其余 `src` 文件靠静态 import 连带编译。测试报「找不到模块」时，先检查是否要同步补 `include`。
- 引擎入口在测试里由 `@cesium-base/map-engine-entry` → `tests/mapEngineEntryStub.ts` 顶替，测试不加载真实 Cesium。
- 纯逻辑（协议规则、图层树、绘制几何、UI 文案表）先落成 `.ts` 纯函数并补测试，组件只消费已测模块。

### UI 改动的验收链

改完界面后依次跑：`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；凡触及颜色、字号、间距、圆角、z-index、焦点环、`src/styles/global.css` 令牌或 `src/map/themeColors.ts` 的改动，**必须**加跑 `pnpm check:tokens` 与 `pnpm check:contrast`。注意这两项**不在自动化里**：`.husky/pre-commit` 只跑 `pnpm typecheck` + lint-staged（`oxlint --fix` + `oxfmt --write`），仓库没有 CI 工作流，漏跑没人拦。

类型检查通过 `pnpm build` / `pnpm typecheck` 中的 `vue-tsc -b` 完成。Lint 使用 oxlint/oxfmt（而非 ESLint/Prettier）。

## 编码与命名约定

- 风格以 `.oxfmtrc.json` 为准：双引号、无分号、2 空格缩进。lint/format 由 `pnpm lint` / `pnpm format` 触发；pre-commit 经 lint-staged 对暂存文件跑 `oxlint --fix` + `oxfmt --write`。
- 在 .ts 文件和 .vue 组件中编写函数时必须使用 JSDoc 声明函数的作用。
- 项目内部导入路径从项目根开始解析；新增文件和新增导入必须按目标目录使用 `@/`（`src`）、`@tests/`（`tests`）根路径别名，跨目录项目导入不得新增 `../`。同目录文件继续使用 `./`，第三方包与子工作区包导入除外。存量父目录相对导入暂不迁移，后续专项处理；`import/no-relative-parent-imports` 目前为 warning。别名尚未覆盖目标目录时，先同步补充 Vite alias 与对应 tsconfig paths。
- 组件文件名 PascalCase；composable 文件/导出以 `useXxx` 命名。
- 代码注释与界面文案统一使用中文。
- 样式与状态就近放在所属组件或模块内；避免不必要的全局副作用。

## 提交约定

- 格式：`<type>(scope): description`，type 取 `feat` / `fix` / `docs` / `refactor` / `perf` / `build` / `chore` / `test` / `ci` / `style` / `revert`；破坏性变更加 `!`。
- scope 用模块/包名（如 `map`、`engines/cesium`），从历史中判断；不强行加 scope。
- 中文祈使句摘要，首字母小写，无句号，不超过 72 字符；改动原因不明显时附 body。
- 每次 commit 前必须检查 staged 内容；如果改动推动了项目进度，先更新 todo 文件再提交。
- 无 PR/MR 模板；标题沿用同一约定；在 GitCode 上以 MR 合并。

## 架构

### 构建期引擎入口

引擎入口由 Vite 构建期别名 `@cesium-base/map-engine-entry` 提供，本分支固定映射到 `src/map/engines/cesium/index.ts`。`tsconfig.app.json` 为类型检查镜像了该别名。`src/map/engineProvider.ts` 动态导入该别名，并向共享层暴露 `mapEngineId`。

### 共享地图层 → 引擎契约

- `src/map/types.ts` 定义引擎无关的类型与 `MapEngine` 接口（mount/unmount、相机、场景模式、图层、地形、飞行漫游、绘制、测量、坐标读数、截图与事件监听）。任何与引擎无关的内容都应放在这里或 `MapController` 中。共享层辅助模块另有 `cameraLimits.ts`（相机高度钳制）、`flightRoute.ts`（航线模型与 GeoJSON 导入导出）、`screenshotThumbnail.ts`（截图与缩略图导出）和 `diagnostics.ts`（`?debugMap` 诊断）。
- `src/map/mapController.ts` —— `MapController` 封装单个引擎，使用世代计数器保护异步挂载，并暴露类型化操作。共享 UI 绝不直接接触引擎。
- `src/map/useMapController.ts` —— Vue provide/inject 的 key 与辅助函数；`main.ts` 在应用级 provide `MapController`，`MapViewport.vue` 通过 `useMapController()` 消费并负责挂载容器的生命周期。
- `src/App.vue` 是应用外壳（顶栏 + 路由出口）；`DashboardWorkspace.vue` 承载大屏侧栏、`FloatingWindow` 面板与地图操作子菜单，`MapViewport.vue` 消费 `MapController` 并渲染 `MapCompass.vue` 反映引擎相机朝向。

### 数据与图层域（`src/features`）

分层与依赖方向单向向下，`catalog` 是**离线数据面**，`layers` 是**运行时/地图面**，二者通过「已启用图层方案」衔接：

- `catalog/model`（纯类型 + `rules.ts` 纯函数 + `clone.ts`，零外部依赖）是最底层；`catalog/protocols` 在其上（协议适配器：从 `tileset.json` / `layer.json` / 元数据推导候选资源，纯计算，不发请求）；`catalog/discovery.ts` 是唯一用裸 `fetch` 的发现编排（带 8s 超时，把失败降级成 `VerificationIssue`），调用协议适配器；`catalog/layerScheme.ts` / `usage.ts` 是纯派生（方案引用的资源与服务闭包、引用统计）；`catalog/api.ts` 是唯一后端接口 `GET {VITE_LAYER_CATALOG_API_BASE_URL || /api}/layer-catalog`，含手写运行时结构校验；`catalog/store.ts` 是**唯一的领域 store**，mutation 一律返回 `{ok, error}` 而不抛异常。
- **协议是静态表 + `switch`，不是运行时注册**：协议清单同时散落在 `protocols/protocols.json`、`protocols/registry.ts`、`api.ts` 三处（另有 `catalog/ui/labels.ts` 文案与 `data/protocolFields.ts` 资源类型映射）。新增一个协议需要同步改这 6 处、新建 `protocols/<name>.ts` 并在两个 `switch`（`registry.discoverByProtocol`、`discovery.discoverSource`）加分支；漏改 `api.ts` 会把合法目录判为「目录数据校验失败」。若新协议还要能上地图，再补 `layers/layerRegistry.ts` 的 descriptor 分支（必要时扩展 `src/map/types.ts` 与 `layerOperations.ts`）。
- `layers/layerRegistry.ts`（`CesiumLayerRegistry`，在 `main.ts` 中构造并 provide）把「方案 + 资源 + 服务」翻译成引擎无关的 `SceneXxxLayerDescriptor` 再交给 `MapController`：`applyScheme` → `MapController.addImageryLayer/addVectorLayer/addTilesetLayer/addModelLayer/setTerrainSource` → `MapEngine` → `CesiumMapEngine` → `layerOperations.ts`。它只依赖 `MapController` 的公共方法，**不碰 Cesium**。地图未挂载时暂存 `pendingBundle`，靠 `onMountStateChange` 回调重放；图层加载快照经 `onLayerSnapshotsChange` 推给 UI，**刻意不进 Pinia**（避免响应式代理包裹 Cesium 对象）。`layers/layerTree.ts` 把方案、临时图层、显隐覆盖与快照合并成渲染树，有一条被测试守住的不变量：children 不全局排序，靠「先 push 子分组、再 push 图层」保证两段式渲染。
- `regions/` 无状态、无 store，寄生在 WFS 矢量图层上：`findRegionWfsSource(activeBundle)` 从当前方案里取第一个 WFS 矢量图层作政区源，`regionLocator.ts` 封装「飞行 → 叠加高亮层 → 2s 后移除」的生命周期，用世代计数器防止过期回写。WFS 取数复用 `layers/wfsFeatureCache.ts`（按 `url + authToken` 去重）。
- **状态放哪**：跨页面共享的领域状态放 `catalog/store.ts`；草稿、筛选、折叠、弹窗目标、loading 等 UI 瞬时态留在组件 `ref`；运行时地图态放 `CesiumLayerRegistry` 实例字段。跨面板命令用 store 上的「一次性字段 + 消费后清空」传递（如 `pendingFlyToResourceId`）。持久化只用 `src/stores` 的 `localStore` / `sessionStore`（收藏视角、航线、绘制成果）；catalog 侧不持久化，仅 `activeSchemeId` 单独读写 `sessionStorage`。
- HTTP 一律经 `src/http/httpClient.ts` 的 `appHttpClient` + `getJsonResponse<T>()`（解析失败抛 `SyntaxError`）；入口函数统一接受 `httpClient: AxiosInstance = appHttpClient` 以支持测试注入。裸 `fetch` 只允许出现在 `catalog/discovery.ts` 与 `layers/wfsFeatureCache.ts`，且都接受 `fetchImpl` 参数便于测试。

### 引擎工作区（pnpm）

`pnpm-workspace.yaml` 将引擎目录设为拥有**独立** `package.json` 的工作区包（`@cesium-base/map-engine-cesium`）。引擎依赖请添加到对应引擎的 manifest，然后在根目录执行 `pnpm install`。引擎内部按关注点拆分代码（例如 Cesium：`createViewer`、`cameraOperations`、`sceneOperations`、`provinceBoundaries` + `geojson` 辅助函数）。

### Cesium 静态资源

Cesium 构建时，`vite-plugin-static-copy` 将 Cesium 引擎工作区 `node_modules` 中的 `Workers/Assets/ThirdParty/Widgets` 复制到 `/cesium/`（配合 `rename.stripBase`），并将 `CESIUM_BASE_URL` 定义为 `"/cesium/"`。如果 Cesium 资源请求出现 404，优先检查此复制配置。

### 底图与环境

Cesium 底图为天地图 WMTS 影像 + 注记。需要在根目录 `.env` 中配置 `VITE_TIANDITU_KEY`（从 `.env.example` 复制；Key 申请地址 [console.tianditu.gov.cn](https://console.tianditu.gov.cn/api/key)）——目录接口暂不可用时，`createViewer` 用该 Key 创建启动兜底；图层方案加载影像后由 `LayerRegistry` 接管并移除兜底层，未配置 Key 时无兜底底图。广西边界 GeoJSON 位于 `public/vector/`，由 `provinceBoundaries.ts` 在运行时获取。

天地图瓦片另有持久化缓存：`src/tileCacheServiceWorker.ts` 在 `load` 之后注册 `public/tile-cache-service-worker.js` 并申请持久化存储。排查「换了图源却仍看到旧瓦片」时先怀疑这层缓存。

## 样式

Tailwind CSS v4 通过 `@tailwindcss/vite` 加载；其入口（`@import "tailwindcss"`）、`@theme` 调色板与 `:root` 语义令牌都在 `src/styles/global.css`，由 `main.ts` 引入。Sass 可通过 Vite 使用——组件样式保持在组件内。针对地图引擎生成的 DOM（如 Cesium 部件）的样式必须使用 Vue 的 `:deep()` 选择器（见 `engines/cesium/*.scss`）。

- **`--text-*` 前缀有三重含义，误用不报错、静默失效**：`@theme` 的 `--text-2xs`…`--text-3xl` 是**字号**；`:root` 的 `--text-display|title|subheading|body|label|caption|overline` 是**字号角色别名**；`:root` 的 `--text-primary|secondary|muted|disabled` 是**颜色**。写 `font-size: var(--text-muted)` 会静默回落到继承的 16px。新增令牌不要再往 `--text-*` 里塞。
- 共享样式用 Sass `@use`（无 `@import`）：`src/styles/_fields.scss` **只放 mixin**（`field-control` / `glass-control` / `field-controls` / `property-row` / `search-shell` / `slider-geometry`），必须 `@use "../../styles/fields" as fields`——一旦在其中写裸规则，十几个引用方会各输出一份；`dashboard/railPanel.scss`（面板几何）、`operationsRail.scss`、`operationsMenu.scss` 同理由对应组件 `@use`。
- **修饰类必须按容器配对**：共享 partial 里的按钮皮肤写成「容器 + 元素」组合（`.panel-header button` 等），裸单类选择器（如 `.danger`）特异性会输给它们而只在 hover 显形。加变体时逐容器补齐，不要靠 `!important`；`.panel-button` 是「不在任何容器里」的显式挂点。
- 面板与操作栏的几何变量（`--rail-map-gap` / `--rail-width` / `--map-menu-width`）由 `DashboardWorkspace.vue` 的 `.content-grid` 定义，下游用 `var(--x, 默认值)` 读取。
- `pnpm check:tokens` 拦 8 类绕过令牌的写法（颜色字面量只许出现在 `global.css`、`color-mix()` 参数不得写字面量、`z-index` ≥ 10 必须用 `--z-*`、焦点环不得局部抹掉、`var()` 必须已定义、引擎侧颜色必须来自 `themeColors.ts` 且与令牌同值、数据 URL 里的 `%23rrggbb` 必须在色板内）；`pnpm check:contrast` 递归展开 `var()` 与 `color-mix()`，按 5 种底图样本实算文本 4.5:1、非文本 3:1 与相邻文本比 ≥ 1.25。两者令牌缺失一律硬失败。

## 文档索引

- `TODO.md` —— 本期（9 月）排班与交付清单，任务完成即勾选；改动推动项目进度时先更新它再提交。
- `docs/规范/组件规范-v2.0.md` —— **生效中**的 UI 长期契约（令牌三层结构、表面阶梯、组件 API 契约 `FloatingWindow` 为唯一面板外壳、二级/三级独立状态源、无障碍基线、§12 违规清单、§13 准入流程）。规则以该文档为准，但**色板名可能滞后**（文档里仍有 `--cyan` / `--shadow-1` 等已不存在的令牌）——数值一律以 `src/styles/global.css` 为准。
- `docs/规范/组件规范-v1.0.md` —— 已明文废止，不得据此实施，保留仅为存档。
- `docs/规范/字体与字号规范-v1.0.md` —— 字号 8 档、字号角色唯一映射、字重/行高、图标档位、数字必须等宽 + `tabular-nums`、角色类元素不得再写 `font-size` / `font-weight` / `line-height`。
- `docs/规范/资源与图层管理设计规范-v1.0.md` —— 服务接入 → 资源目录 → 图层管理三层职责链路、数据模型（实体 ID / binding key / 目录快照 / 指纹 / 删除规则）、协议注册表与 Profile 检测、方案保存与启用校验。改 `src/features/{catalog,layers}` 时适用。

## 环境与配置

- Vite 加载 `VITE_` 前缀环境变量，文件查找顺序遵循 Vite 默认（`.env` / `.env.*`）。
- `.gitignore` 已忽略 `.env` 与 `.env.*`；仅 `.env.example` 入库作为模板。
- 不得向 `.env.example` 提交任何真实 Key、令牌或机密。
- 已知变量：`VITE_TIANDITU_KEY`（天地图浏览器端 Key，申请地址 <https://console.tianditu.gov.cn/api/key>）、`VITE_CESIUM_ION_ACCESS_TOKEN`（可选的 Cesium ion 访问令牌，用于访问 ion 托管资源，并在无生效 DEM 时作为 Cesium World Terrain 兜底，申请地址 <https://ion.cesium.com/tokens>）、`VITE_LAYER_CATALOG_API_BASE_URL`（图层目录 API 同源根路径，默认 `/api`）。数据瓦片与地形服务地址由图层目录资源配置或部署环境提供。
- 后端脚本专用：`RUSTFS_DEV_ACCESS_KEY` / `RUSTFS_DEV_SECRET_KEY`（`scripts/upload_terrain.py` 读取的 RustFS/S3 凭据，不带 `VITE_` 前缀，由 Python 直接通过 `os.getenv` 读取）。
