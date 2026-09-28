import { reactive, watch } from "vue"
import { useCatalogStore } from "../../../features/catalog/store.js"
import { useLayerRegistry } from "../../../features/layers/useLayerRegistry.js"
import type { MapController } from "@/map/mapController.js"
import { createLayerTreeControls } from "./layerTreeControls.js"
import { useCompareControls } from "./useCompareControls.js"
import type { SceneControls } from "./useSceneControls.js"

/** 图层工作区：目录加载、图层方案应用和资源定位请求。 */
export function useLayerWorkspace(mapController: MapController, scene: SceneControls) {
  const layerCatalog = useCatalogStore()
  const layerRegistry = useLayerRegistry()
  const compare = useCompareControls({
    mapController,
    layerRegistry,
    catalog: layerCatalog,
    scene,
  })

  if (layerCatalog.loadStatus !== "ready") {
    void layerCatalog.loadCatalog()
  }

  /** 应用当前已发布图层方案；未挂载时由 LayerRegistry 暂存。 */
  function applyActiveLayerScheme() {
    if (layerCatalog.activeBundle) {
      void layerRegistry.applyScheme(layerCatalog.activeBundle)
      return
    }

    void layerRegistry.clearScheme()
  }

  watch(
    () => layerCatalog.activeBundle,
    () => applyActiveLayerScheme(),
    { immediate: true },
  )

  /** 消费图层管理页发起的资源定位请求。 */
  function consumePendingFlyToResource() {
    const resourceId = layerCatalog.pendingFlyToResourceId
    if (!resourceId) return

    const resource = [...layerCatalog.catalog.resources, ...layerCatalog.temporaryResources].find(
      (item) => item.id === resourceId,
    )
    const extent = resource?.extent
    if (!extent) {
      layerCatalog.pendingFlyToResourceId = undefined
      return
    }

    mapController.flyToBounds({
      west: extent.west,
      south: extent.south,
      east: extent.east,
      north: extent.north,
    })
    layerCatalog.pendingFlyToResourceId = undefined
  }

  return reactive({
    ...createLayerTreeControls(),
    consumePendingFlyToResource,
    compare,
  })
}

export type LayerWorkspaceControls = ReturnType<typeof useLayerWorkspace>
