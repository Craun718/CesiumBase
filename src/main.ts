import { createPinia } from "pinia"
import piniaPluginPersistedstate from "pinia-plugin-persistedstate"
import { createApp } from "vue"
import "bootstrap-icons/font/bootstrap-icons.css"
import "./styles/global.css"
import App from "./App.vue"
import { registerTileCacheServiceWorker } from "./tileCacheServiceWorker"

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).mount("#app")

registerTileCacheServiceWorker()
