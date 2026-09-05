import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { viteStaticCopy } from "vite-plugin-static-copy"
import { defineConfig, loadEnv, type ProxyOptions } from "vite"

const projectDir = fileURLToPath(new URL("./", import.meta.url))
const cesiumEngineEntry = path.resolve(projectDir, "src/map/engines/cesium/index.ts")

/** 去除 DEM 同源地址末尾斜杠，得到 Vite 代理前缀。 */
function getDemProxyPath(serviceUrl: string | undefined) {
  const url = serviceUrl?.trim()
  if (!url?.startsWith("/")) return undefined

  return url.replace(/\/+$/, "")
}

/** 组装 DEM 开发代理，让浏览器只请求当前 Vite 源。 */
function createDemProxy(proxyPath: string | undefined, proxyTarget: string | undefined) {
  if (!proxyPath) return undefined

  if (!proxyTarget || !/^https?:\/\//i.test(proxyTarget)) {
    throw new Error("已配置同源 VITE_DEM_SERVICE_URL 时，必须设置 http(s) 开头的 DEM_PROXY_TARGET")
  }

  return {
    [proxyPath]: {
      target: proxyTarget,
      changeOrigin: true,
    } satisfies ProxyOptions,
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDir, "")
  const demProxyPath = getDemProxyPath(env.VITE_DEM_SERVICE_URL)
  const demProxy = createDemProxy(demProxyPath, env.DEM_PROXY_TARGET)

  return {
    define: {
      CESIUM_BASE_URL: JSON.stringify("/cesium/"),
    },
    server: {
      // 监听所有网卡，允许局域网内其他设备访问
      host: true,
      proxy: demProxy,
    },
    preview: {
      proxy: demProxy,
    },
    resolve: {
      alias: [
        {
          find: /^@cesium-base\/map-engine-entry$/,
          replacement: cesiumEngineEntry,
        },
      ],
    },
    plugins: [
      vue(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: [
              "./src/map/engines/cesium/node_modules/cesium/Build/Cesium/Workers/**",
              "./src/map/engines/cesium/node_modules/cesium/Build/Cesium/Assets/**",
              "./src/map/engines/cesium/node_modules/cesium/Build/Cesium/ThirdParty/**",
              "./src/map/engines/cesium/node_modules/cesium/Build/Cesium/Widgets/**",
            ],
            dest: "cesium",
            // Strip through .../cesium/Build/Cesium so requests use /cesium/{Workers,Assets,...}.
            rename: { stripBase: 8 },
          },
        ],
      }),
    ],
  }
})
