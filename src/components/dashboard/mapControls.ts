import type { ImagerySource, MapDrawGeometryType, MapDrawState, SceneMode } from "../../map"

export type MapOperationId =
  | "scene-mode"
  | "rotate-browse"
  | "north-lock"
  | "terrain"
  | "underground"
  | "basemap"
  | "compass"
  | "drawing"

export type MapOperation = {
  id: MapOperationId
  label: string
  icon: string
  kind: "command" | "mode" | "toggle"
}

export const mapOperations = [
  { id: "scene-mode", label: "2D/3D切换", icon: "bi-layers", kind: "mode" },
  { id: "rotate-browse", label: "旋转浏览", icon: "bi-arrow-repeat", kind: "toggle" },
  { id: "north-lock", label: "正北锁定", icon: "bi-compass", kind: "toggle" },
  { id: "terrain", label: "地形突出", icon: "bi-mountain", kind: "command" },
  { id: "underground", label: "地下模式", icon: "bi-layers-half", kind: "toggle" },
  { id: "basemap", label: "底图切换", icon: "bi-grid-1x2", kind: "command" },
  { id: "compass", label: "显示指北针", icon: "bi-signpost-2", kind: "toggle" },
  { id: "drawing", label: "绘制操作", icon: "bi-pencil", kind: "command" },
] satisfies MapOperation[]

export type ViewOperationId =
  | "view-position"
  | "view-camera"
  | "view-favorites"
  | "view-flight"
  | "view-fullscreen"
  | "view-screenshot"
  | "view-center"

export type ViewOperation = {
  id: ViewOperationId
  label: string
  icon: string
  kind: "panel" | "command" | "toggle"
}

export const viewOperations = [
  { id: "view-position", label: "视角定位", icon: "bi-crosshair", kind: "panel" },
  { id: "view-camera", label: "相机参数", icon: "bi-camera-reels", kind: "panel" },
  { id: "view-favorites", label: "视图收藏", icon: "bi-bookmark-star", kind: "panel" },
  { id: "view-flight", label: "飞行漫游", icon: "bi-signpost-split", kind: "panel" },
  { id: "view-fullscreen", label: "场景全屏", icon: "bi-arrows-fullscreen", kind: "command" },
  { id: "view-screenshot", label: "场景截屏下载", icon: "bi-camera", kind: "command" },
  { id: "view-center", label: "显示视角中心", icon: "bi-crosshair2", kind: "toggle" },
] satisfies ViewOperation[]

export type MapControls = {
  sceneMode: SceneMode
  rotateEnabled: boolean
  northLocked: boolean
  terrainEnabled: boolean
  undergroundEnabled: boolean
  compassVisible: boolean
  viewCenterVisible: boolean
  viewPositionOpen: boolean
  viewCameraOpen: boolean
  viewFavoritesOpen: boolean
  viewFlightOpen: boolean
  selectedFlightRouteId: string
  flightRouteSettingsOpen: boolean
  terrainScale: number
  basemapOpen: boolean
  basemapSources: ImagerySource[]
  drawingState: MapDrawState
  activeBasemapId: string | undefined
  activeBasemapLabel: string
  customBaseMapUrlInput: string
  isMapOperationDisabled: (operationId: MapOperationId) => boolean
  isMapOperationActive: (operationId: MapOperationId) => boolean
  activateMapOperation: (operationId: MapOperationId) => void
  activateViewOperation: (operationId: ViewOperationId) => void
  closeViewPanel: () => void
  closeFlightRouteSettings: () => void
  handleTerrainScaleInput: (event: Event) => void
  closeTerrainPanel: () => void
  closeBasemapPanel: () => void
  startDrawing: (type: MapDrawGeometryType) => void
  finishDrawing: () => void
  cancelDrawing: () => void
  clearDrawings: () => void
  renameDrawing: (event: Event, id: string) => void
  removeDrawing: (id: string) => void
  closeDrawingPanel: () => void
  selectBasemap: (id: string) => void
  applyCustomBasemap: () => void
}
