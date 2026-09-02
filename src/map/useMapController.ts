import { inject, provide, type InjectionKey } from "vue"
import { MapController } from "./mapController"

export const mapControllerKey: InjectionKey<MapController> = Symbol("MapController")

export function provideMapController() {
  const controller = new MapController()

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
