/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 天地图浏览器端 Key，在项目根目录 .env 中配置 */
  readonly VITE_TIANDITU_KEY: string
  /** Cesium ion 访问令牌，在项目根目录 .env 中配置；用于 ion 托管资源与官方世界地形兜底 */
  readonly VITE_CESIUM_ION_ACCESS_TOKEN: string
  /** 图层目录 API 同源根路径或 http(s) 地址，默认 /api */
  readonly VITE_LAYER_CATALOG_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.vue" {
  import type { Component } from "vue"
  const component: Component
  export default component
}
