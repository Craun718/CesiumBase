import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { viteStaticCopy } from "vite-plugin-static-copy"
import { defineConfig } from "vite"

const projectDir = fileURLToPath(new URL("./", import.meta.url))
const cesiumEngineEntry = path.resolve(projectDir, "src/map/engines/cesium/index.ts")

// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium/"),
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
})
