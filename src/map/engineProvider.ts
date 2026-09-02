import type { MapEngineId, MapEngineLoader } from "./types"

export const mapEngineId: MapEngineId =
  import.meta.env.VITE_MAP_ENGINE === "deck-gl" ? "deck-gl" : "cesium"

export const loadMapEngine: MapEngineLoader = async () => {
  const { createMapEngine } = await import("@cesium-base/map-engine-entry")
  return createMapEngine
}
