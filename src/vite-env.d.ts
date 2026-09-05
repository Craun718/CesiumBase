/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 天地图浏览器端 Key，在项目根目录 .env 中配置 */
  readonly VITE_TIANDITU_KEY: string
  /** Cesium ion 访问令牌，在项目根目录 .env 中配置；用于加载 Cesium World Terrain 地形 */
  readonly VITE_CESIUM_ION_ACCESS_TOKEN: string
  /** DEM 地形服务根地址（包含 layer.json 的目录，以 / 结尾）；留空则不加载地形 */
  readonly VITE_DEM_SERVICE_URL: string
  /** 可选：通过 Authorization: Bearer 头发送的静态认证 Token */
  readonly VITE_DEM_SERVICE_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.vue" {
  import type { Component } from "vue"
  const component: Component
  export default component
}
