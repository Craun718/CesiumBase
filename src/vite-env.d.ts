/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 天地图浏览器端 Key，在项目根目录 .env 中配置 */
  readonly VITE_TIANDITU_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.vue" {
  import type { Component } from "vue"
  const component: Component
  export default component
}
