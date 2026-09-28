# CesiumBase

实景三维与数字孪生可视化平台的 GIS 大屏，以广西区域为中心，围绕一个引擎无关的地图应用层构建。

技术栈：Vue 3 + TypeScript + Vite + Cesium + Pinia + Tailwind CSS v4。

本分支只包含并启用 Cesium 渲染引擎；引擎无关的地图应用层与构建期入口抽象保留，后续接入其他引擎时在专门分支补充对应引擎工作区。

## 快速开始

```bash
pnpm install                  # 根目录安装，会一并装好引擎工作区的依赖
cp .env.example .env          # 按需填写环境变量（见下表）
pnpm dev                      # 启动开发服务器
```

应用以 `/` 的大屏为唯一面向，由顶部状态栏、中央地图、底部状态栏和左右操作栏组成。

### 环境变量

`.env` 不入库，`.env.example` 是模板。变量留空只影响对应图层或功能能否使用；目录、瓦片和地形服务由部署环境或外部服务直接提供。

| 变量                                              | 用途                                                                                            | 何时必填                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `VITE_TIANDITU_KEY`                               | 天地图 WMTS 影像与注记（目录方案接管前作为启动兜底）                                            | 需要天地图底图时（[申请 Key](https://console.tianditu.gov.cn/api/key)） |
| `VITE_CESIUM_ION_ACCESS_TOKEN`                    | Cesium ion 托管资源与无生效 DEM 时的世界地形兜底（[申请 Token](https://ion.cesium.com/tokens)） | 使用 ion 资源或官方地形兜底时                                           |
| `VITE_LAYER_CATALOG_API_BASE_URL`                 | 图层目录 API 同源根路径，默认 `/api`                                                            | 后端就绪后指向真实服务                                                  |
| `RUSTFS_DEV_ACCESS_KEY` / `RUSTFS_DEV_SECRET_KEY` | `scripts/upload_terrain.py` 上传 DEM 切片用的凭据，不带 `VITE_` 前缀                            | 仅运行上传脚本时                                                        |

## 常用命令

```bash
pnpm dev            # 开发服务器
pnpm build          # vue-tsc -b + 生产构建
pnpm preview        # 生产预览
pnpm typecheck      # 类型检查
pnpm test           # 编译 tests 后用 node:test 运行
pnpm lint           # oxlint
pnpm lint:fix       # oxlint --fix
pnpm format         # oxfmt --write
pnpm format:check   # oxfmt --check
pnpm check:tokens   # 设计令牌静态检查
pnpm check:contrast # 令牌对比度实算
```

运行单个测试文件：

```bash
pnpm exec tsc -p tsconfig.test.json
node --import ./scripts/registerTestAliases.mjs --test dist-test/tests/catalogRules.test.js
```

改完界面后依次跑 `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；触及颜色、字号、间距、圆角、z-index、焦点环或 `src/styles/global.css` 令牌时，必须加跑 `pnpm check:tokens` 与 `pnpm check:contrast`。这两项不在自动化里（pre-commit 只跑类型检查和 lint-staged），漏跑不会被拦下。

## 项目结构

```
src/
  map/                     引擎无关的地图应用层
    types.ts               MapEngine 契约与引擎无关类型
    mapController.ts       封装单个引擎，保护异步挂载
    engines/cesium/        当前唯一的引擎工作区（独立 package.json）
  features/                业务域
    catalog/               资源与图层目录：领域模型、协议发现、Pinia store
    layers/                运行时图层注册表与图层树
    regions/               政区树与定位
  components/
    base/                  基于 Reka UI 的基础控件（弹窗、下拉、开关、单选组、折叠组、通知）
    dashboard/             大屏外壳、左右操作栏与三级功能面板
  styles/global.css        设计令牌唯一出处（@theme + :root）
docs/规范/                 组件、字体字号、资源与图层管理规范
tests/                     node:test 单元测试
```

## 架构要点

- **共享地图层与引擎分离**：`src/map` 定义引擎契约，界面层不直接导入具体引擎。引擎入口由 Vite 构建期别名 `@cesium-base/map-engine-entry` 提供，本分支固定映射到 `src/map/engines/cesium/index.ts`；`engineProvider.ts` 动态导入该别名。
- **引擎是独立工作区**：`pnpm-workspace.yaml` 把 `src/map/engines/cesium` 设为拥有独立 `package.json` 的包（`@cesium-base/map-engine-cesium`）。引擎依赖加到该 manifest，然后在根目录 `pnpm install`。只有相机、渲染、图层、地形等因引擎而异的部分才进引擎目录。
- **数据面与地图面**：`features/catalog` 是离线数据面（资源、协议发现、图层方案），`features/layers` 是运行时地图面，通过「已启用图层方案」衔接，翻译成引擎无关的图层描述符后交给 `MapController`。底图、注记、地形、3D Tiles 与 XYZ 图层由图层方案统一下发；目录接口暂不可用时，Viewer 会按 `VITE_TIANDITU_KEY` 创建天地图启动兜底，方案加载影像后由 `LayerRegistry` 接管并移除兜底层。

## 样式

Tailwind CSS v4 由 `@tailwindcss/vite` 加载，入口（`@import "tailwindcss"`）与全部设计令牌在 `src/styles/global.css`，分 `@theme` 调色板层与 `:root` 语义角色层，组件只引用令牌、不写颜色字面量。Sass 通过 Vite 可用，组件样式保留在组件内；针对引擎生成的 DOM（如 Cesium 部件）必须用 Vue 的 `:deep()` 选择器。

## 相关文档

- `CLAUDE.md` —— 面向协作工具与开发者的完整约定：编码命名、UI/UX 规则、架构说明、提交约定。
- `TODO.md` —— 本期排班与交付清单。
- `docs/规范/组件规范-v2.0.md` —— 生效中的 UI 长期契约（令牌三层结构、组件 API、无障碍基线、违规清单）。
- `docs/规范/字体与字号规范-v1.0.md` —— 字号档位、字号角色映射、字重与行高。
- `docs/规范/资源与图层管理设计规范-v1.0.md` —— 服务接入 → 资源目录 → 图层管理的数据模型与流程。
- `docs/规范/组件规范-v1.0.md` —— 已废止，仅存档。
