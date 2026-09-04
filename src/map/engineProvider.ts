import type { MapEngineId, MapEngineLoader } from "./types"

export const mapEngineId: MapEngineId = "cesium"

export const loadMapEngine: MapEngineLoader = async () => {
  const { createMapEngine } = await import("@cesium-base/map-engine-entry")
  return createMapEngine
}
