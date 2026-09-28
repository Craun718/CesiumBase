import type {
  MapDrawBufferSource,
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
} from "../../../types"
import { isNearPole } from "./geometry.js"

/** 类型中文化名（保留原命名风格）。 */
export function featureTypeName(type: MapDrawGeometryType) {
  switch (type) {
    case "point":
      return "点"
    case "polyline":
      return "折线"
    case "polygon":
      return "多边形"
    case "rectangle":
      return "矩形"
    case "circle":
      return "圆"
    case "ellipse":
      return "椭圆"
    case "corridor":
      return "走廊"
    case "buffer":
      return "缓冲区"
  }
}

/** 校验 MapDrawCoordinate 各字段有限。 */
export function isFiniteCoordinate(coord: MapDrawCoordinate) {
  return (
    Number.isFinite(coord.longitude) &&
    Number.isFinite(coord.latitude) &&
    Number.isFinite(coord.height)
  )
}

/** 校验缓冲区源几何字段；用于持久化校验。 */
export function isValidBufferSourceShape(source: MapDrawBufferSource) {
  switch (source.type) {
    case "point":
      return isFiniteCoordinate(source.coordinate)
    case "polyline":
    case "polygon":
      return source.coordinates.every(isFiniteCoordinate)
  }
}

/** 提取几何体的"中心点"用于极地过滤。 */
export function featureCenter(geometry: MapDrawGeometry): MapDrawCoordinate {
  switch (geometry.type) {
    case "point":
      return geometry.coordinate
    case "circle":
    case "ellipse":
      return geometry.center
    case "rectangle":
      return {
        longitude: (geometry.southwest.longitude + geometry.northeast.longitude) / 2,
        latitude: (geometry.southwest.latitude + geometry.northeast.latitude) / 2,
        height: geometry.southwest.height,
      }
    case "polyline":
    case "polygon":
      return geometry.coordinates[0] ?? { longitude: 0, latitude: 0, height: 0 }
    case "corridor":
      return geometry.path[0] ?? { longitude: 0, latitude: 0, height: 0 }
    case "buffer":
      return geometry.polygon[0] ?? { longitude: 0, latitude: 0, height: 0 }
  }
}

/** 校验持久化数据，避免异常 localStorage 内容破坏地图初始化。 */
export function isValidFeature(feature: MapDrawFeature) {
  if (
    !feature ||
    typeof feature.id !== "string" ||
    feature.id.length === 0 ||
    typeof feature.name !== "string" ||
    typeof feature.createdAt !== "string"
  ) {
    return false
  }

  const { geometry, type } = feature
  if (!geometry || geometry.type !== type) return false

  if (isNearPole(featureCenter(geometry))) return false

  switch (geometry.type) {
    case "point":
      return isFiniteCoordinate(geometry.coordinate)
    case "polyline":
    case "polygon":
      return geometry.coordinates.every(isFiniteCoordinate)
    case "rectangle":
      return isFiniteCoordinate(geometry.southwest) && isFiniteCoordinate(geometry.northeast)
    case "circle":
      return (
        isFiniteCoordinate(geometry.center) &&
        Number.isFinite(geometry.radiusMeters) &&
        geometry.radiusMeters > 0
      )
    case "ellipse":
      return (
        isFiniteCoordinate(geometry.center) &&
        Number.isFinite(geometry.semiMajorMeters) &&
        geometry.semiMajorMeters > 0 &&
        Number.isFinite(geometry.semiMinorMeters) &&
        geometry.semiMinorMeters > 0 &&
        Number.isFinite(geometry.rotationDegrees)
      )
    case "corridor":
      return (
        geometry.path.every(isFiniteCoordinate) &&
        geometry.path.length >= 2 &&
        Number.isFinite(geometry.widthMeters) &&
        geometry.widthMeters > 0
      )
    case "buffer":
      return (
        geometry.polygon.every(isFiniteCoordinate) &&
        geometry.polygon.length >= 3 &&
        Number.isFinite(geometry.distanceMeters) &&
        geometry.distanceMeters > 0 &&
        isValidBufferSourceShape(geometry.source)
      )
  }
}
