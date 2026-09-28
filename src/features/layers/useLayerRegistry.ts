import { inject, onScopeDispose, provide, type InjectionKey } from "vue"
import type { MapController } from "../../map"
import { CesiumLayerRegistry } from "./layerRegistry.js"
import type { LayerRegistry } from "./types"

export const layerRegistryKey: InjectionKey<LayerRegistry> = Symbol("LayerRegistry")

/** 在应用外壳提供地图图层注册器，并随当前组件作用域释放。 */
export function provideLayerRegistry(mapController: MapController) {
  const registry = new CesiumLayerRegistry(mapController)

  provide(layerRegistryKey, registry)
  onScopeDispose(() => {
    registry.dispose()
  })

  return registry
}

/** 获取图层注册器；未提供时抛出明确错误。 */
export function useLayerRegistry() {
  const registry = inject(layerRegistryKey)

  if (!registry) {
    throw new Error("provideLayerRegistry must be called before useLayerRegistry")
  }

  return registry
}
