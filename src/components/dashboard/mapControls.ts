import type { MeasurementMode } from "../../map"

export type MapOperationId =
  | "scene-mode"
  | "rotate-browse"
  | "north-lock"
  | "terrain"
  | "underground"
  | "compass"

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
  { id: "terrain", label: "地形夸张", icon: "bi-bar-chart-steps", kind: "command" },
  { id: "underground", label: "地下模式", icon: "bi-layers-half", kind: "toggle" },
  { id: "compass", label: "显示指北针", icon: "bi-signpost-2", kind: "toggle" },
] satisfies MapOperation[]

export type ViewOperationId =
  | "view-position"
  | "view-camera"
  | "view-favorites"
  | "view-flight"
  | "view-orbit-flight"
  | "view-fullscreen"
  | "view-screenshot"
  | "view-center"
  | "view-swipe-compare"
  | "view-split-compare"

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
  { id: "view-orbit-flight", label: "环绕飞行", icon: "bi-arrow-clockwise", kind: "panel" },
  { id: "view-fullscreen", label: "场景全屏", icon: "bi-arrows-fullscreen", kind: "command" },
  { id: "view-screenshot", label: "场景截屏下载", icon: "bi-camera", kind: "command" },
  { id: "view-center", label: "显示视角中心", icon: "bi-crosshair2", kind: "toggle" },
  { id: "view-swipe-compare", label: "卷帘比对", icon: "bi-layout-split", kind: "panel" },
  { id: "view-split-compare", label: "分屏联动", icon: "bi-columns-gap", kind: "panel" },
] satisfies ViewOperation[]

export type MeasurementOperationId = MeasurementMode

export type MeasurementOperation = {
  id: MeasurementOperationId
  label: string
  icon: string
  kind: "panel"
}

export const measurementOperations = [
  { id: "length", label: "长度测量", icon: "bi-arrow-left-right", kind: "panel" },
  { id: "area", label: "面积测量", icon: "bi-hexagon", kind: "panel" },
  { id: "point-height", label: "点位高度", icon: "bi-triangle", kind: "panel" },
  { id: "point-terrain-height", label: "点位地形高度", icon: "bi-triangle-half", kind: "panel" },
] satisfies MeasurementOperation[]
