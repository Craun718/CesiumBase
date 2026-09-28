import assert from "node:assert/strict"
import test from "node:test"
import { createPinia, setActivePinia } from "pinia"
import { createSSRApp, type App } from "vue"
import { renderToString } from "vue/server-renderer"
import { useCatalogStore } from "../src/features/catalog/store.js"
import { layerRegistryKey } from "../src/features/layers/useLayerRegistry.js"
import type { LayerRegistry } from "../src/features/layers/types.js"
import type { MapController } from "../src/map/mapController.js"
import type { SceneControls } from "../src/components/dashboard/composables/useSceneControls.js"
import { useLayerWorkspace } from "../src/components/dashboard/composables/useLayerWorkspace.js"

type LayerWorkspaceInstance = ReturnType<typeof useLayerWorkspace>

/** 在 Vue 作用域中创建图层工作区，满足 Pinia 与图层注册器注入要求。 */
async function createLayerWorkspace() {
  setActivePinia(createPinia())
  const layerCatalog = useCatalogStore()
  layerCatalog.loadStatus = "ready"

  const registry = {
    applyScheme: () => Promise.resolve([]),
    clearScheme: () => Promise.resolve([]),
  } as unknown as LayerRegistry
  const mapController = {
    flyToBounds: () => {},
  } as unknown as MapController
  const scene = {
    sceneMode: "3d",
    setSceneMode: () => {},
  } as unknown as SceneControls

  let instance: LayerWorkspaceInstance | undefined
  const app: App = createSSRApp({
    setup() {
      app.provide(layerRegistryKey, registry)
      instance = useLayerWorkspace(mapController, scene)
      return {}
    },
    render: () => null,
  })

  await renderToString(app)
  assert.ok(instance)
  return instance
}

test("图层树关闭回调脱离对象调用时仍能更新状态", async () => {
  const layers = await createLayerWorkspace()
  layers.toggleLayerTree()
  assert.equal(layers.layerTreeOpen, true)

  const closeLayerTree = layers.closeLayerTree

  closeLayerTree()

  assert.equal(layers.layerTreeOpen, false)
})
