import * as Cesium from "cesium"
import type {
  MapDrawGeometry,
  MapDrawCoordinate,
  MapDrawGeometryType,
  MapDrawStartOptions,
} from "../../../types"

/** 点击流类型的最少节点数；点模式单击即结束。缓冲区已迁移为对已有要素的操作，不在此列。 */
export const clickMinimumCoordinates: Partial<Record<MapDrawGeometryType, number>> = {
  point: 1,
  polyline: 2,
  polygon: 3,
  corridor: 2,
}

/** 拖拽流类型：起点确定中心或一角，终点确定对角或半径。 */
export const DRAG_TYPES = new Set<MapDrawGeometryType>(["rectangle", "circle", "ellipse"])

/** 拖拽位移小于该阈值视为误触，自动放弃。 */
export const DRAG_THRESHOLD_PX = 5

/** turf buffer 圆弧分段数；权衡视觉平滑度与计算成本。 */
export const BUFFER_STEPS = 64

/** 极地边界：latitude 绝对值 ≥ 该值时 EllipseGraphics 渲染异常，丢弃。 */
export const POLAR_LATITUDE_LIMIT = 89.5

export const DEFAULT_DRAWING_OPTIONS = {
  widthMeters: 100,
  distanceMeters: 50,
} satisfies Required<MapDrawStartOptions>

/** 拖拽中间态；用于 rectangle/circle/ellipse 的实时预览。 */
export interface DragState {
  readonly mode: "rectangle" | "circle" | "ellipse"
  readonly startScreen: Cesium.Cartesian2
  readonly startCoordinate: MapDrawCoordinate
  currentCoordinate: MapDrawCoordinate
  /** 拖拽期间禁用的相机控制快照；endDrag 时恢复。 */
  readonly cameraSnapshot: CameraControllerSnapshot
}

/** 编辑把手位置描述。 */
export interface HandlePlacement {
  readonly handleId: string
  readonly position: MapDrawCoordinate
  /** 屏幕像素偏移；用于把 translate handle 与其它控制点错开。 */
  readonly pixelOffset?: { x: number; y: number }
}

/** 编辑草图态：进入编辑拖拽时记录基准，落定或回滚时使用。 */
export interface EditingDraft {
  readonly featureId: string
  readonly kind: "translate" | "resize"
  readonly handleId: string
  readonly startScreen: Cesium.Cartesian2
  readonly startCoordinate: MapDrawCoordinate
  /** 进入编辑时的 geometry；commit/cancel 都以此为基准计算。 */
  readonly startGeometry: MapDrawGeometry
  /** distance 编辑时记录 handle 起始位置到 polygon 中心的距离。 */
  readonly startDistanceHandleOffsetMeters: number
  /** corridor width 编辑时记录 handle 起始位置到 path 中心的距离。 */
  readonly startWidthHandleOffsetMeters: number
  readonly cameraSnapshot: CameraControllerSnapshot
}

/** 拖拽期间需要临时禁用的相机控制器开关；恢复时按快照写回。 */
export interface CameraControllerSnapshot {
  enableRotate: boolean
  enableTranslate: boolean
  enableZoom: boolean
  enableTilt: boolean
  enableLook: boolean
}
