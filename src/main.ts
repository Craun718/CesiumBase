import { createPinia } from "pinia"
import piniaPluginPersistedstate from "pinia-plugin-persistedstate"
import { createApp } from "vue"
import "bootstrap-icons/font/bootstrap-icons.css"
import "./styles/global.css"
import App from "./App.vue"
import { CesiumLayerRegistry } from "./features/layers/layerRegistry"
import { layerRegistryKey } from "./features/layers/useLayerRegistry"
import { MapController, mapControllerKey } from "./map"
import { createAppRouter } from "./router"
import { registerTileCacheServiceWorker } from "./tileCacheServiceWorker"

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)
app.use(createAppRouter())

const mapController = new MapController()
const layerRegistry = new CesiumLayerRegistry(mapController)
app.provide(mapControllerKey, mapController)
app.provide(layerRegistryKey, layerRegistry)

app.mount("#app")

registerTileCacheServiceWorker()
