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
  const isCesiumMode = mode !== "deck-gl"

  return {
    define: isCesiumMode ? { CESIUM_BASE_URL: JSON.stringify("/cesium/") } : {},
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
        {
          find: /^@\/(.*)$/,
          replacement: path.resolve(projectDir, "src", "$1"),
        },
        {
          find: /^@tests\/(.*)$/,
          replacement: path.resolve(projectDir, "tests", "$1"),
        },
      ],
    },
    plugins: [
      vue(),
      tailwindcss(),
      ...(isCesiumMode
        ? [
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
          ]
        : []),
    ],
  }
})
