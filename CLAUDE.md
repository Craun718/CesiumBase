# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 语言规则

- 始终使用中文回复与沟通；文档、提交说明使用中文。
- 代码标识符、命令、API 与配置名称保持英文；新增代码注释使用中文。

## 代理行为准则

- 开发服务器只能由人工启动。LLM 不得通过命令运行 `pnpm dev` / `pnpm dev:deck` / `pnpm preview` / `pnpm preview:deck`。
- 不得自动 stage 用户未选择的文件；`git commit` / `git push` 之前需用户明确确认。

## 概述

Vue 3 + TypeScript + Vite 的 GIS 大屏（数字态势监控中心），以广西区域为中心，围绕一个共享的地图应用层构建，可选用两个渲染引擎：Cesium 与 deck.gl。

当前只做 Cesium 实现，不做 deck.gl：双引擎架构保留作为骨架，但新功能只往 Cesium 引擎加；deck.gl 引擎仅作最小占位，不投入新工作。

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

Tailwind CSS v4 通过 `@tailwindcss/vite` 加载；其入口（`@import "tailwindcss"`）与共享 `@theme` 设计令牌位于 `src/App.vue` 的全局样式块。Sass 可通过 Vite 使用——组件样式保持在组件内。针对地图引擎生成的 DOM（Cesium 部件、deck 画布）的样式必须使用 Vue 的 `:deep()` 选择器（见 `engines/*/*.scss`）。

## 环境与配置

- Vite 加载 `VITE_` 前缀环境变量，文件查找顺序遵循 Vite 默认（`.env` / `.env.*`）。
- `.gitignore` 已忽略 `.env` 与 `.env.*`；仅 `.env.example` 入库作为模板。
- 不得向 `.env.example` 提交任何真实 Key、令牌或机密。
- 已知变量：`VITE_TIANDITU_KEY`（天地图浏览器端 Key，申请地址 <https://console.tianditu.gov.cn/api/key）、`VITE_MAP_ENGINE`（仅供> UI 标签，模式由 Vite mode 决定）。
