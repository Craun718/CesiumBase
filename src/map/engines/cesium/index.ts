import "cesium/Source/Widgets/widgets.css"
import "./cesiumMap.scss"

import type { MapEngineId } from "../../types"

export const mapEngineId: MapEngineId = "cesium"

export { createCesiumMapEngine as createMapEngine } from "./CesiumMapEngine"
