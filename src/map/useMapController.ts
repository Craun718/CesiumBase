import { inject, provide, type InjectionKey } from "vue"
import { MapController } from "./mapController"
import { createCesiumMapEngine } from "./engineProvider"
import type { MapEngineFactory } from "./types"

export const mapControllerKey: InjectionKey<MapController> = Symbol("MapController")

export function provideMapController(createEngine: MapEngineFactory = createCesiumMapEngine) {
  const controller = new MapController(createEngine)

  provide(mapControllerKey, controller)

  return controller
}

export function useMapController() {
  const controller = inject(mapControllerKey)

  if (!controller) {
    throw new Error("provideMapController must be called before useMapController")
  }

  return controller
}
