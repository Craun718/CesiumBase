import type { MapEngineId, MapEngineLoader } from "./types"
import { logMapDiagnostic } from "./diagnostics"

export const mapEngineId: MapEngineId = "cesium"

export const loadMapEngine: MapEngineLoader = async () => {
  logMapDiagnostic("engine-import:start")

  const { createMapEngine } = await import("@cesium-base/map-engine-entry")

  logMapDiagnostic("engine-import:complete")

  return createMapEngine
}
