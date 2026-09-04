import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { viteStaticCopy } from "vite-plugin-static-copy"
import { defineConfig } from "vite"

const projectDir = fileURLToPath(new URL("./", import.meta.url))
const selectedEngineEntry = (mode: string) =>
  path.resolve(
    projectDir,
    mode === "deck-gl" ? "src/map/engines/deck/index.ts" : "src/map/engines/cesium/index.ts",
  )

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const define: Record<string, string> = {}

  if (mode !== "deck-gl") {
    define.CESIUM_BASE_URL = JSON.stringify("/cesium/")
  }

  return {
    define,
    server: {
      // 监听所有网卡，允许局域网内其他设备访问
      host: true,
    },
    resolve: {
      alias: [
        {
          find: /^@cesium-base\/map-engine-entry$/,
          replacement: selectedEngineEntry(mode),
        },
      ],
    },
    plugins: [
      vue(),
      tailwindcss(),
      ...(mode === "deck-gl"
        ? []
        : [
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
          ]),
    ],
  }
})
