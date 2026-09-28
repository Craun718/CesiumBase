import type {
  MapDraw3DCoordinate,
  MapDraw3DFeature,
  MapDraw3DFeatureStyle,
  MapDraw3DGeometry,
  MapDraw3DGeometryType,
  MapDrawBufferSource,
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
} from "./types"

const LEGACY_TYPES: ReadonlyArray<"point" | "polyline" | "polygon"> = [
  "point",
  "polyline",
  "polygon",
]
const GEOMETRY_TYPES: ReadonlyArray<MapDrawGeometryType> = [
  "point",
  "polyline",
  "polygon",
  "rectangle",
  "circle",
  "ellipse",
  "corridor",
  "buffer",
]

/** 校验单个坐标字段是否合规；height 可选视为 0。 */
function isValidCoordinate(value: unknown): value is MapDrawCoordinate {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>

  return (
    Number.isFinite(candidate.longitude) &&
    Number.isFinite(candidate.latitude) &&
    (candidate.height === undefined || Number.isFinite(candidate.height))
  )
}

/** 校验坐标序列；非法项整体丢弃。 */
function isValidCoordinateArray(value: unknown): value is readonly MapDrawCoordinate[] {
  if (!Array.isArray(value)) return false

  for (const item of value) {
    if (!isValidCoordinate(item)) return false
  }

  return true
}

/** 校验缓冲区源几何（点 / 折线 / 多边形外环）。 */
function isValidBufferSource(value: unknown): value is MapDrawBufferSource {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>
  const type = candidate.type

  if (type === "point") {
    return isValidCoordinate(candidate.coordinate)
  }

  if (type === "polyline" || type === "polygon") {
    return isValidCoordinateArray(candidate.coordinates)
  }

  return false
}

/** 校验几何体；按 type 分支严格校验字段。 */
function isValidGeometry(value: unknown): value is MapDrawGeometry {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>
  const type = candidate.type

  switch (type) {
    case "point":
      return isValidCoordinate(candidate.coordinate)
    case "polyline":
    case "polygon":
      return isValidCoordinateArray(candidate.coordinates)
    case "rectangle":
      return isValidCoordinate(candidate.southwest) && isValidCoordinate(candidate.northeast)
    case "circle":
      return (
        isValidCoordinate(candidate.center) &&
        typeof candidate.radiusMeters === "number" &&
        Number.isFinite(candidate.radiusMeters) &&
        candidate.radiusMeters > 0
      )
    case "ellipse":
      return (
        isValidCoordinate(candidate.center) &&
        typeof candidate.semiMajorMeters === "number" &&
        Number.isFinite(candidate.semiMajorMeters) &&
        candidate.semiMajorMeters > 0 &&
        typeof candidate.semiMinorMeters === "number" &&
        Number.isFinite(candidate.semiMinorMeters) &&
        candidate.semiMinorMeters > 0 &&
        typeof candidate.rotationDegrees === "number" &&
        Number.isFinite(candidate.rotationDegrees)
      )
    case "corridor":
      return (
        isValidCoordinateArray(candidate.path) &&
        candidate.path.length >= 2 &&
        typeof candidate.widthMeters === "number" &&
        Number.isFinite(candidate.widthMeters) &&
        candidate.widthMeters > 0
      )
    case "buffer":
      return (
        isValidBufferSource(candidate.source) &&
        typeof candidate.distanceMeters === "number" &&
        Number.isFinite(candidate.distanceMeters) &&
        candidate.distanceMeters > 0 &&
        isValidCoordinateArray(candidate.polygon) &&
        candidate.polygon.length >= 3
      )
    default:
      return false
  }
}

/** 把旧 shape 数据（仅 point/polyline/polygon + coordinates）转为新 shape。 */
function migrateLegacyShape(raw: {
  type: string
  coordinates: unknown
  id: string
  name: string
  createdAt: string
}): MapDrawFeature | null {
  const legacyType = raw.type as "point" | "polyline" | "polygon"

  if (!isValidCoordinateArray(raw.coordinates)) return null

  const coordinates = raw.coordinates
  let geometry: MapDrawGeometry | null = null

  if (legacyType === "point") {
    if (coordinates.length !== 1) return null
    geometry = { type: "point", coordinate: coordinates[0]! }
  } else if (legacyType === "polyline") {
    if (coordinates.length < 2) return null
    geometry = { type: "polyline", coordinates }
  } else if (legacyType === "polygon") {
    if (coordinates.length < 3) return null
    geometry = { type: "polygon", coordinates }
  }

  if (!geometry) return null

  return {
    id: raw.id,
    name: raw.name,
    type: legacyType,
    geometry,
    createdAt: raw.createdAt,
  }
}

/**
 * 将 localStorage 中的持久化数据迁移为新 schema；
 * 不可识别的项返回 null，由调用方在 console.warn 后丢弃。
 */
export function migrateLegacyFeature(raw: unknown): MapDrawFeature | null {
  if (!raw || typeof raw !== "object") return null

  const candidate = raw as Record<string, unknown>
  const { id, name, type, createdAt } = candidate

  if (typeof id !== "string" || id.length === 0) return null
  if (typeof name !== "string" || typeof createdAt !== "string") return null
  if (typeof type !== "string" || !GEOMETRY_TYPES.includes(type as MapDrawGeometryType)) return null

  // 新 shape：含 geometry 字段
  if (isValidGeometry(candidate.geometry)) {
    if ((candidate.geometry as { type: string }).type !== type) return null

    return {
      id,
      name,
      type: type as MapDrawGeometryType,
      geometry: candidate.geometry,
      createdAt,
    }
  }

  // 旧 shape：仅前三种类型 + 顶层 coordinates
  if (LEGACY_TYPES.includes(type as "point" | "polyline" | "polygon")) {
    return migrateLegacyShape({
      id,
      name,
      type,
      createdAt,
      coordinates: candidate.coordinates,
    })
  }

  return null
}

const GEOMETRY_3D_TYPES: ReadonlyArray<MapDraw3DGeometryType> = [
  "label",
  "billboard",
  "model3d",
  "box",
  "cylinder",
  "sphere",
  "wall",
  "polylineVolume",
  "waterSurface",
  "videoSurface",
]
const POINT_3D_TYPES: ReadonlyArray<MapDraw3DGeometryType> = [
  "label",
  "billboard",
  "model3d",
  "box",
  "cylinder",
  "sphere",
]
const LINE_3D_TYPES: ReadonlyArray<MapDraw3DGeometryType> = [
  "wall",
  "polylineVolume",
  "videoSurface",
]

/** 校验三维坐标各字段；height 为必填字段。 */
function isValid3DCoordinate(value: unknown): value is MapDraw3DCoordinate {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>

  return (
    Number.isFinite(candidate.longitude) &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.height)
  )
}

/** 校验三维坐标序列。 */
function isValid3DCoordinateArray(value: unknown): value is MapDraw3DCoordinate[] {
  if (!Array.isArray(value)) return false

  for (const item of value) {
    if (!isValid3DCoordinate(item)) return false
  }

  return true
}

/** 校验正数数值字段：存在时必须为有限正数。 */
function isValidPositiveNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value > 0)
}

/** 校验三维成果渲染参数；字段全部可选，但存在时必须合规。 */
function isValid3DStyle(value: unknown): value is MapDraw3DFeatureStyle {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>

  if (candidate.color !== undefined && typeof candidate.color !== "string") {
    return false
  }
  if (candidate.text !== undefined && typeof candidate.text !== "string") return false
  if (candidate.imageUrl !== undefined && typeof candidate.imageUrl !== "string") return false

  if (
    !isValidPositiveNumber(candidate.length) ||
    !isValidPositiveNumber(candidate.topRadius) ||
    !isValidPositiveNumber(candidate.bottomRadius) ||
    !isValidPositiveNumber(candidate.radiusMeters) ||
    !isValidPositiveNumber(candidate.heightMeters)
  ) {
    return false
  }

  if (candidate.dimensions !== undefined) {
    if (
      !Array.isArray(candidate.dimensions) ||
      candidate.dimensions.length !== 3 ||
      !candidate.dimensions.every((item) => isValidPositiveNumber(item))
    ) {
      return false
    }
  }

  if (candidate.shape !== undefined) {
    if (!Array.isArray(candidate.shape) || candidate.shape.length < 3) return false

    for (const point of candidate.shape) {
      if (!point || typeof point !== "object") return false

      const shapeCandidate = point as Record<string, unknown>
      if (!Number.isFinite(shapeCandidate.x) || !Number.isFinite(shapeCandidate.y)) return false
    }
  }

  return true
}

/** 校验三维几何体；form 必须与类型族匹配（点类 point / 线类 line / 面类 polygon）。 */
function isValid3DGeometry(
  value: unknown,
  type: MapDraw3DGeometryType,
): value is MapDraw3DGeometry {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>
  const form = candidate.form

  if (POINT_3D_TYPES.includes(type)) {
    return form === "point" && isValid3DCoordinate(candidate.coordinate)
  }

  if (LINE_3D_TYPES.includes(type)) {
    return (
      form === "line" &&
      isValid3DCoordinateArray(candidate.coordinates) &&
      candidate.coordinates.length >= 2
    )
  }

  return (
    form === "polygon" &&
    isValid3DCoordinateArray(candidate.coordinates) &&
    candidate.coordinates.length >= 3
  )
}

/**
 * 校验持久化的三维绘制成果并迁移为新 schema；
 * 三维绘制无旧版 shape，异常项直接返回 null 丢弃。
 */
export function migrateLegacy3DFeature(raw: unknown): MapDraw3DFeature | null {
  if (!raw || typeof raw !== "object") return null

  const candidate = raw as Record<string, unknown>
  const { id, name, type, createdAt } = candidate

  if (typeof id !== "string" || id.length === 0) return null
  if (typeof name !== "string" || typeof createdAt !== "string") return null
  if (typeof type !== "string" || !GEOMETRY_3D_TYPES.includes(type as MapDraw3DGeometryType)) {
    return null
  }
  if (!isValid3DGeometry(candidate.geometry, type as MapDraw3DGeometryType)) return null
  if (!isValid3DStyle(candidate.style)) return null

  return {
    id,
    name,
    type: type as MapDraw3DGeometryType,
    geometry: candidate.geometry,
    style: candidate.style,
    createdAt,
  }
}
