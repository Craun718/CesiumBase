import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium/"),
  },
  plugins: [
    vue(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: [
            "./node_modules/cesium/Build/Cesium/Workers/**",
            "./node_modules/cesium/Build/Cesium/Assets/**",
            "./node_modules/cesium/Build/Cesium/ThirdParty/**",
            "./node_modules/cesium/Build/Cesium/Widgets/**",
          ],
          dest: "cesium",
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
})
