import type { MapEngineId, MapEngineLoader } from "./types"
import { logMapDiagnostic } from "./diagnostics.ts"

export const mapEngineId: MapEngineId =
  import.meta.env?.VITE_MAP_ENGINE === "deck-gl" ? "deck-gl" : "cesium"

export const loadMapEngine: MapEngineLoader = async () => {
  logMapDiagnostic("engine-import:start")

  const { createMapEngine } = await import("@cesium-base/map-engine-entry")

  logMapDiagnostic("engine-import:complete")

  return createMapEngine
}
