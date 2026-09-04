# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 语言规则

- 始终使用中文回复与沟通；文档、提交说明使用中文。
- 代码标识符、命令、API 与配置名称保持英文；新增代码注释使用中文。

## 代理行为准则

- 开发服务器只能由人工启动。LLM 不得通过任何命令或脚本运行、重启、代理或变相启动 `pnpm dev` / `pnpm dev:deck` / `pnpm preview` / `pnpm preview:deck`；不得停止或接管用户已启动的开发服务。运行时问题只能基于用户提供的 URL、日志、控制台输出、网络请求信息，或生产构建等显式允许的验证方式排查。
- 除非用户在当前请求中明确要求或 skill 的流程有实际需求，LLM 不得查看或推断 Git 历史，包括但不限于 `git log`、`git blame`、`git show`、历史 diff、旧提交内容、旧文件版本和分支演变。分析只能以当前工作区状态为准。允许使用 `git status`、`git diff --cached` 和 `git diff` 检查当前未提交状态。
- 不得读取 `.git` 目录、缓存快照、备份目录或其他工作区副本中的旧版内容来还原、比较或解释当前实现。用户明确要求查看历史时，也只读取其指定的对象。
- 不得自动 stage 用户未选择的文件；`git commit` 智能处理已经在 stage 里的文件而且必须先展示待提交内容；未经用户明确要求不得 `git push`。

## 概述

Vue 3 + TypeScript + Vite 的 GIS 大屏（数字态势监控中心），以广西区域为中心，围绕一个共享的地图应用层构建，可选用两个渲染引擎：Cesium 与 deck.gl。

当前只做 Cesium 实现，不做 deck.gl：双引擎架构保留作为骨架，但新功能只往 Cesium 引擎加；deck.gl 引擎仅作最小占位，不投入新工作。

## UI/UX 风格

- 当前界面按深色 GIS 大屏设计：近黑底、半透明深蓝面板、青色作为主强调色，蓝色作为次强调色；告警与错误使用琥珀色和玫红色。文本保持高对比，指标和坐标优先使用等宽字体。
- 大屏骨架固定为顶部状态栏、中央全幅地图、底部状态栏；左右操作栏浮在地图上方，面板从操作栏旁边展开。地图视口是视觉主体，新增 UI 不得遮挡关键读数、指北针或状态栏；面板必须限制宽度并使用内部滚动，不得为内容撑开屏幕布局。
- 面板外壳优先复用 `FloatingWindow`，保持统一的内边距、标题、标签、关闭按钮、阴影和毛玻璃效果；不得为同类功能另建弹窗、抽屉或卡片容器。列表、表单和工具区块放在功能面板内部，避免面板套面板、卡片套卡片。
- 导航层级固定为“一级侧栏 → 二级菜单 → 三级功能面板”。二级菜单仅允许放置 `command` 与 `trigger` 两类入口：`command` 点击后立即执行并给出反馈，`trigger` 切换状态或模式。入口点击后还需要输入、选择、编辑、确认或其他后续操作时，必须放入三级功能面板。
- 二级菜单与三级功能面板使用独立状态源：打开或切换三级只更新对应面板状态，关闭三级只清空该状态，不得在关闭事件里推断或恢复二级；关闭二级只清空二级状态，不隐式关闭独立的三级面板。同一层级互相替换，不同层级互不借用生命周期。
- 新增能力先按交互类型分类：无需额外操作的 `command` / `trigger` 可进入二级菜单；需要表单、列表、配置、多步操作或持续反馈的功能，归入既有分类下的三级功能面板，用标签页、分区或工具组承载，不得提升为二级入口。确需调整信息架构时，先说明分类依据和交互收益。
- 控件选型必须匹配语义：立即动作用按钮，二元状态用开关，数值范围用滑杆并配数字输入，互斥选项用单选组，文本输入用表单字段。图标按钮必须提供 `title` 与可访问名称，危险操作必须二次确认。
- 禁用项必须说明原因；悬停、焦点、激活、打开、加载和失败状态要有明确视觉反馈。操作反馈优先显示在所属功能面板内，不得用全局浮层打断地图操作。
- 可访问性按现有模式实现：面板使用 `role="region"` 和中文 `aria-label`，菜单用 `aria-expanded` / `aria-controls`，互斥选择用 `role="radiogroup"` / `role="radio"`，开关用 `aria-pressed`，并支持 Escape 关闭面板。
- 图标统一使用 Bootstrap Icons；界面文案使用中文，标签、状态和模式可用大写英文短标签。标题、按钮和列表文本必须在窄面板内换行或截断，不得溢出、遮盖相邻控件。面板和控件保持紧凑的小圆角，避免营销化排版、大面积留白和影响地图读数的强视觉噪声。
- 设计令牌集中在 `src/styles/global.css` 的 Tailwind `@theme` 中，并通过 `:root` 暴露面板、文本和强调色别名。新增界面必须优先复用现有颜色、字号、边框、阴影和间距令牌；不得引入近似色、渐变装饰或一次性魔法值。组件级状态、布局和修饰样式放在所属组件的 scoped SCSS 中，全局样式只保留设计令牌与基础重置。

## 代码结构

- `src/App.vue` 是大屏外壳，组织顶栏、左右操作栏、浮动面板、底栏和屏幕级 UI 状态；复杂面板尽量拆成 `src/components` 下的独立组件。
- `src/components` 放通用或界面级组件，例如地图视口、指北针、错误边界、浮窗容器和视角操作面板。组件使用 `<script setup lang="ts">`，显示状态就近维护。
- `src/map` 是引擎无关层：`types.ts` 定义引擎契约，`mapController.ts` 封装调用和异步挂载保护，`useMapController.ts` 通过 provide/inject 提供实例，`engineProvider.ts` 按构建期模式加载入口。界面层不直接导入 Cesium 或 deck.gl。
- `src/map/engines/cesium` 是当前唯一重点实现的引擎工作区，按创建 viewer、相机、场景、边界和图源等职责拆分；`src/map/engines/deck` 只保留最小占位。新增地图能力先扩展共享契约，再在 Cesium 引擎实现。
- `src/stores` 放 Pinia setup store；跨会话数据使用 `localStore` 与 `localStorage`，标签页会话数据使用 `sessionStore` 与 `sessionStorage`。持久化配置由 `pinia-plugin-persistedstate` 处理。
- 样式入口和全局令牌在 `src/styles/global.css`；普通 UI 用 scoped SCSS 或 Tailwind，地图引擎生成的 DOM 用引擎目录内的 SCSS 配合 `:deep()` 选择器处理。

## 命令

```bash
pnpm dev          # Cesium 开发服务器（默认模式）
pnpm dev:deck     # deck.gl 开发服务器（deck-gl 模式）
pnpm build        # vue-tsc -b + Cesium 生产构建（build:deck 为 deck.gl）
pnpm preview      # 生产预览（preview:deck 为 deck.gl）

pnpm lint         # oxlint
pnpm lint:fix     # oxlint --fix
pnpm format       # oxfmt --write
pnpm format:check # oxfmt --check
```

无测试框架。类型检查通过 `pnpm build` 中的 `vue-tsc -b` 完成。Lint 使用 oxlint/oxfmt（而非 ESLint/Prettier）。

## 编码与命名约定

- 风格以 `.oxfmtrc.json` 为准：双引号、无分号、2 空格缩进。lint/format 由 `pnpm lint` / `pnpm format` 触发；pre-commit 经 lint-staged 对暂存文件跑 `oxlint --fix` + `oxfmt --write`。
- 组件文件名 PascalCase；composable 文件/导出以 `useXxx` 命名。
- 代码注释与界面文案统一使用中文。
- 样式与状态就近放在所属组件或模块内；避免不必要的全局副作用。

## 提交约定

- 格式：`<type>(scope): description`，type 取 `feat` / `fix` / `docs` / `refactor` / `perf` / `build` / `chore` / `test` / `ci` / `style` / `revert`；破坏性变更加 `!`。
- scope 用模块/包名（如 `map`、`engines/cesium`、`engines/deck`），从历史中判断；不强行加 scope。
- 中文祈使句摘要，首字母小写，无句号，不超过 72 字符；改动原因不明显时附 body。
- 无 PR/MR 模板；标题沿用同一约定；在 GitCode 上以 MR 合并。

## 架构

### 构建期引擎选择

引擎由 Vite **模式**决定，而非运行时状态。`vite.config.ts` 将别名 `@cesium-base/map-engine-entry` 映射到 `src/map/engines/cesium/index.ts`（默认）或 `src/map/engines/deck/index.ts`（`deck-gl` 模式），因此每个构建只包含一个引擎。`tsconfig.app.json` 为类型检查镜像了该别名（默认指向 Cesium 入口）。`src/map/engineProvider.ts` 动态导入该别名；它还会读取 `VITE_MAP_ENGINE`（在 `.env` / `.env.deck-gl` 中设置），但仅用于向 UI 提供 `mapEngineId` 标签——请保持这些环境变量与所构建的模式一致。

### 共享地图层 → 引擎契约

- `src/map/types.ts` 定义 `MapEngine` 接口（mount/unmount、相机、场景模式、旋转/正北锁定、地形夸张、朝向变化监听）。任何与引擎无关的内容都应放在这里或 `MapController` 中。
- `src/map/mapController.ts` —— `MapController` 封装单个引擎，使用世代计数器保护异步挂载，并暴露类型化操作。共享 UI 绝不直接接触引擎。
- `src/map/useMapController.ts` —— Vue provide/inject 装配；`App.vue` 调用 `provideMapController()`，`MapViewport.vue` 消费它并负责挂载容器的生命周期。
- `src/App.vue` 是大屏外壳（顶栏、侧栏、`FloatingWindow` 面板、地图操作子菜单）；`MapCompass.vue` 反映引擎相机朝向。

### 引擎工作区（pnpm）

`pnpm-workspace.yaml` 将每个引擎目录设为拥有**独立** `package.json` 的工作区包（`@cesium-base/map-engine-cesium`、`@cesium-base/map-engine-deck`）。根包刻意不依赖 Cesium/deck.gl。引擎依赖请添加到对应引擎的 manifest，然后在根目录执行 `pnpm install`。引擎内部按关注点拆分代码（例如 Cesium：`createViewer`、`cameraOperations`、`sceneOperations`、`provinceBoundaries` + `geojson` 辅助函数）。

### Cesium 静态资源

Cesium 构建时，`vite-plugin-static-copy` 将 Cesium 引擎工作区 `node_modules` 中的 `Workers/Assets/ThirdParty/Widgets` 复制到 `/cesium/`（配合 `rename.stripBase`），并将 `CESIUM_BASE_URL` 定义为 `"/cesium/"`。如果 Cesium 资源请求出现 404，优先检查此复制配置。

### 底图与环境

Cesium 底图为天地图 WMTS 影像 + 注记。需要在根目录 `.env` 中配置 `VITE_TIANDITU_KEY`（从 `.env.example` 复制；Key 申请地址 [console.tianditu.gov.cn](https://console.tianditu.gov.cn/api/key)）——未配置时 `createViewer` 会直接抛错。广西边界 GeoJSON 位于 `public/vector/`，由 `provinceBoundaries.ts` 在运行时获取。

## 样式

Tailwind CSS v4 通过 `@tailwindcss/vite` 加载；其入口（`@import "tailwindcss"`）与共享 `@theme` 设计令牌位于 `src/styles/global.css`。Sass 可通过 Vite 使用——组件样式保持在组件内。针对地图引擎生成的 DOM（Cesium 部件、deck 画布）的样式必须使用 Vue 的 `:deep()` 选择器（见 `engines/*/*.scss`）。

## 环境与配置

- Vite 加载 `VITE_` 前缀环境变量，文件查找顺序遵循 Vite 默认（`.env` / `.env.*`）。
- `.gitignore` 已忽略 `.env` 与 `.env.*`；仅 `.env.example` 入库作为模板。
- 不得向 `.env.example` 提交任何真实 Key、令牌或机密。
- 已知变量：`VITE_TIANDITU_KEY`（天地图浏览器端 Key，申请地址 <<https://console.tianditu.gov.cn/api/key）、`VITE_CESIUM_ION_ACCESS_TOKEN`（Cesium> ion 访问令牌，用于加载 Cesium World Terrain 地形，申请地址 <https://ion.cesium.com/tokens>）、`VITE_MAP_ENGINE`（仅供 UI 标签，模式由 Vite mode 决定）。
