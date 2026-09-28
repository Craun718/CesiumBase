import * as Cesium from "cesium"
import type { MapDrawCoordinate, MapDrawGeometry, MapDrawGeometryType } from "../../../types"
import type { CameraControllerSnapshot, DragState } from "./types.js"
import { POLAR_LATITUDE_LIMIT } from "./types.js"

/** 从 viewer 读取当前相机控制器开关的快照。 */
export function snapshotCameraController(viewer: Cesium.Viewer): CameraControllerSnapshot {
  const controller = viewer.scene.screenSpaceCameraController

  return {
    enableRotate: controller.enableRotate,
    enableTranslate: controller.enableTranslate,
    enableZoom: controller.enableZoom,
    enableTilt: controller.enableTilt,
    enableLook: controller.enableLook,
  }
}

/** 拖拽期间关闭屏幕空间相机控制，避免 LEFT_DOWN 触发旋转/平移。 */
export function disableCameraController(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableRotate = false
  controller.enableTranslate = false
  controller.enableZoom = false
  controller.enableTilt = false
  controller.enableLook = false
}

/** 按快照恢复屏幕空间相机控制。 */
export function restoreCameraController(viewer: Cesium.Viewer, snapshot: CameraControllerSnapshot) {
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableRotate = snapshot.enableRotate
  controller.enableTranslate = snapshot.enableTranslate
  controller.enableZoom = snapshot.enableZoom
  controller.enableTilt = snapshot.enableTilt
  controller.enableLook = snapshot.enableLook
}

/** 将屏幕坐标转换为地球表面的经纬度和高程；命中失败返回 undefined。 */
export function pickCoordinate(
  viewer: Cesium.Viewer,
  position: Cesium.Cartesian2,
): MapDrawCoordinate | undefined {
  const ray = viewer.camera.getPickRay(position)
  const cartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  if (!cartesian) return undefined

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)

  return {
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    height: cartographic.height,
  }
}

/** 经纬度坐标 → Cesium 笛卡尔坐标。 */
export function toCartesian(coordinate: MapDrawCoordinate) {
  return Cesium.Cartesian3.fromDegrees(coordinate.longitude, coordinate.latitude, coordinate.height)
}

/** 经纬度坐标沿经纬度方向平移；用于编辑整体移动。 */
export function shiftCoordinate(
  coordinate: MapDrawCoordinate,
  deltaLng: number,
  deltaLat: number,
): MapDrawCoordinate {
  return {
    longitude: coordinate.longitude + deltaLng,
    latitude: coordinate.latitude + deltaLat,
    height: coordinate.height,
  }
}

/**
 * 从起点出发，给定椭球距离（米）与方位角（度，北基准顺时针 0-360）计算终点。
 * 用球面三角精确计算；不考虑椭球高度差。
 */
export function destinationPoint(
  origin: MapDrawCoordinate,
  distanceMeters: number,
  bearingDegreesValue: number,
): MapDrawCoordinate {
  const radius = 6_371_008.8
  const δ = distanceMeters / radius
  const θ = Cesium.Math.toRadians(bearingDegreesValue)
  const φ1 = Cesium.Math.toRadians(origin.latitude)
  const λ1 = Cesium.Math.toRadians(origin.longitude)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))

  return {
    longitude: Cesium.Math.toDegrees(λ2),
    latitude: Cesium.Math.toDegrees(φ2),
    height: origin.height,
  }
}

/** 计算一组坐标的几何中心（简单平均），用于 translate 把手位置。 */
export function geometryCentroid(coordinates: readonly MapDrawCoordinate[]): MapDrawCoordinate {
  if (coordinates.length === 0) {
    return { longitude: 0, latitude: 0, height: 0 }
  }
  let sumLng = 0
  let sumLat = 0
  let sumHeight = 0
  for (const coord of coordinates) {
    sumLng += coord.longitude
    sumLat += coord.latitude
    sumHeight += coord.height
  }

  return {
    longitude: sumLng / coordinates.length,
    latitude: sumLat / coordinates.length,
    height: sumHeight / coordinates.length,
  }
}

/** 解析 vertex-0 / vertex-12 中的数字部分；非法时返回 -1。 */
export function parseVertexIndex(handleId: string): number {
  const match = /^vertex-(\d+)$/.exec(handleId)
  if (!match) return -1

  return Number.parseInt(match[1] ?? "", 10)
}

/** 整体平移几何体：所有经纬度坐标累加 deltaLng / deltaLat。 */
export function translateGeometry(
  geometry: MapDrawGeometry,
  deltaLng: number,
  deltaLat: number,
): MapDrawGeometry {
  switch (geometry.type) {
    case "point":
      return {
        type: "point",
        coordinate: shiftCoordinate(geometry.coordinate, deltaLng, deltaLat),
      }
    case "polyline":
    case "polygon":
      return {
        type: geometry.type,
        coordinates: geometry.coordinates.map((c) => shiftCoordinate(c, deltaLng, deltaLat)),
      }
    case "rectangle":
      return {
        type: "rectangle",
        southwest: shiftCoordinate(geometry.southwest, deltaLng, deltaLat),
        northeast: shiftCoordinate(geometry.northeast, deltaLng, deltaLat),
      }
    case "circle":
    case "ellipse":
      return {
        ...geometry,
        center: shiftCoordinate(geometry.center, deltaLng, deltaLat),
      }
    case "corridor":
      return {
        ...geometry,
        path: geometry.path.map((c) => shiftCoordinate(c, deltaLng, deltaLat)),
      }
    case "buffer": {
      const polygon = geometry.polygon.map((c) => shiftCoordinate(c, deltaLng, deltaLat))
      if (geometry.source.type === "point") {
        return {
          ...geometry,
          polygon,
          source: {
            type: "point",
            coordinate: shiftCoordinate(geometry.source.coordinate, deltaLng, deltaLat),
          },
        }
      }

      return {
        ...geometry,
        polygon,
        source: {
          type: geometry.source.type,
          coordinates: geometry.source.coordinates.map((c) =>
            shiftCoordinate(c, deltaLng, deltaLat),
          ),
        },
      }
    }
  }
}

/** 替换已确认节点的指定索引位置；用于 polyline / polygon / corridor / buffer 的顶点编辑。 */
export function moveVertex(
  geometry: MapDrawGeometry,
  vertexIndex: number,
  newCoordinate: MapDrawCoordinate,
): MapDrawGeometry | null {
  if (vertexIndex < 0) return null

  switch (geometry.type) {
    case "polyline":
    case "polygon":
      if (vertexIndex >= geometry.coordinates.length) return null
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((c, i) => (i === vertexIndex ? newCoordinate : c)),
      }
    case "corridor":
      if (vertexIndex >= geometry.path.length) return null
      return {
        ...geometry,
        path: geometry.path.map((c, i) => (i === vertexIndex ? newCoordinate : c)),
      }
    case "buffer":
      // buffer 的 polygon 是 turf.buffer 输出，与 source 不一一对应；仅修改 polygon，source 保留原值
      if (vertexIndex >= geometry.polygon.length) return null
      return {
        ...geometry,
        polygon: geometry.polygon.map((c, i) => (i === vertexIndex ? newCoordinate : c)),
      }
    default:
      return null
  }
}

/** 矩形编辑：拖动某一角时，固定对角点，新角点跟随鼠标。 */
export function computeResizedRectangle(
  geometry: MapDrawGeometry,
  handleId: string,
  current: MapDrawCoordinate,
): MapDrawGeometry | null {
  if (geometry.type !== "rectangle") return null

  const { southwest, northeast } = geometry
  let sw: MapDrawCoordinate = southwest
  let ne: MapDrawCoordinate = northeast

  switch (handleId) {
    case "sw":
      sw = { longitude: current.longitude, latitude: sw.latitude, height: sw.height }
      ne = { longitude: ne.longitude, latitude: current.latitude, height: ne.height }
      break
    case "se":
      sw = { longitude: sw.longitude, latitude: current.latitude, height: sw.height }
      ne = { longitude: current.longitude, latitude: ne.latitude, height: ne.height }
      break
    case "ne":
      sw = { longitude: sw.longitude, latitude: current.latitude, height: sw.height }
      ne = { longitude: current.longitude, latitude: ne.latitude, height: ne.height }
      break
    case "nw":
      sw = { longitude: current.longitude, latitude: ne.latitude, height: sw.height }
      ne = { longitude: ne.longitude, latitude: sw.latitude, height: ne.height }
      break
    default:
      return null
  }

  return {
    type: "rectangle",
    southwest: {
      longitude: Math.min(sw.longitude, ne.longitude),
      latitude: Math.min(sw.latitude, ne.latitude),
      height: sw.height,
    },
    northeast: {
      longitude: Math.max(sw.longitude, ne.longitude),
      latitude: Math.max(sw.latitude, ne.latitude),
      height: ne.height,
    },
  }
}

/** 圆编辑：拖动半径方向把手，仅修改半径。 */
export function computeResizedCircle(
  geometry: MapDrawGeometry,
  current: MapDrawCoordinate,
): MapDrawGeometry | null {
  if (geometry.type !== "circle") return null

  return {
    ...geometry,
    radiusMeters: Math.max(geodesicDistance(geometry.center, current), 1),
  }
}

/** 椭圆编辑：长半轴同步改 rotation，短半轴锁定 rotation。 */
export function computeResizedEllipse(
  geometry: MapDrawGeometry,
  handleId: string,
  current: MapDrawCoordinate,
): MapDrawGeometry | null {
  if (geometry.type !== "ellipse") return null

  if (handleId === "semiMajor") {
    const bearingDeg = bearingDegrees(geometry.center, current)
    const rotationDegrees = (((90 - bearingDeg) % 360) + 360) % 360

    return {
      ...geometry,
      semiMajorMeters: Math.max(geodesicDistance(geometry.center, current), 1),
      rotationDegrees,
    }
  }

  if (handleId === "semiMinor") {
    return {
      ...geometry,
      semiMinorMeters: Math.max(geodesicDistance(geometry.center, current), 1),
    }
  }

  return null
}

/** 走廊带宽度编辑：把 handle 当前位置到 path 中心的距离作为新半宽。 */
export function computeResizedCorridorWidth(
  geometry: MapDrawGeometry,
  current: MapDrawCoordinate,
): MapDrawGeometry | null {
  if (geometry.type !== "corridor" || geometry.path.length === 0) return null

  const midIndex = Math.floor(geometry.path.length / 2)
  const pathCenter = geometry.path[midIndex]!
  const halfWidth = Math.max(geodesicDistance(pathCenter, current), 0.5)

  return { ...geometry, widthMeters: Math.max(halfWidth * 2, 1) }
}

/** 计算两个屏幕坐标之间的像素距离，用于判定拖拽是否成立。 */
export function screenDistance(a: Cesium.Cartesian2, b: Cesium.Cartesian2) {
  const dx = a.x - b.x
  const dy = a.y - b.y

  return Math.sqrt(dx * dx + dy * dy)
}

/** 计算两个 MapDrawCoordinate 之间的椭球距离（米）。 */
export function geodesicDistance(a: MapDrawCoordinate, b: MapDrawCoordinate) {
  return Cesium.Cartesian3.distance(toCartesian(a), toCartesian(b))
}

/** 计算两个 MapDrawCoordinate 之间的方位角（度，从正北顺时针 0-360）。 */
export function bearingDegrees(from: MapDrawCoordinate, to: MapDrawCoordinate) {
  const φ1 = Cesium.Math.toRadians(from.latitude)
  const φ2 = Cesium.Math.toRadians(to.latitude)
  const Δλ = Cesium.Math.toRadians(to.longitude - from.longitude)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)

  return (Cesium.Math.toDegrees(θ) + 360) % 360
}

/** 根据拖拽起点和终点计算 rectangle 几何。 */
export function computeRectangle(
  start: MapDrawCoordinate,
  end: MapDrawCoordinate,
): MapDrawGeometry {
  const southwest: MapDrawCoordinate = {
    longitude: Math.min(start.longitude, end.longitude),
    latitude: Math.min(start.latitude, end.latitude),
    height: start.height,
  }
  const northeast: MapDrawCoordinate = {
    longitude: Math.max(start.longitude, end.longitude),
    latitude: Math.max(start.latitude, end.latitude),
    height: start.height,
  }

  return { type: "rectangle", southwest, northeast }
}

/** 根据拖拽起点和终点计算 circle 几何；半径为椭球距离（米）。 */
export function computeCircle(start: MapDrawCoordinate, end: MapDrawCoordinate): MapDrawGeometry {
  return {
    type: "circle",
    center: start,
    radiusMeters: Math.max(geodesicDistance(start, end), 1),
  }
}

/** 根据拖拽起点和终点计算 ellipse 几何；中心 = 起点，长半轴沿"起点→终点"方向。 */
export function computeEllipse(start: MapDrawCoordinate, end: MapDrawCoordinate): MapDrawGeometry {
  const semiMajor = Math.max(geodesicDistance(start, end), 1)

  // 持久化的 rotationDegrees 采用 Cesium EllipseGraphics.rotation 语义（东基准逆时针）；
  // bearingDegrees 是北基准顺时针，两者相差 90°。
  const bearingDeg = bearingDegrees(start, end)
  const rotationDegrees = (((90 - bearingDeg) % 360) + 360) % 360

  return {
    type: "ellipse",
    center: start,
    semiMajorMeters: semiMajor,
    semiMinorMeters: semiMajor / 2,
    rotationDegrees,
  }
}

/** 检查几何中心点是否在极地异常区域内；用于 circle/ellipse。 */
export function isNearPole(coordinate: MapDrawCoordinate) {
  return Math.abs(coordinate.latitude) >= POLAR_LATITUDE_LIMIT
}

/** 拖拽预览需要的最小状态视图；渲染层不修改交互状态。 */
export interface DraftPreviewSource {
  readonly mode: MapDrawGeometryType | null
  readonly dragState?: DragState
  readonly previewCoordinates: readonly MapDrawCoordinate[]
  readonly previewCartesians: readonly Cesium.Cartesian3[]
}
