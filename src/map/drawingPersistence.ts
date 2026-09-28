import type { MapDraw3DFeature, MapDrawBufferSource, MapDrawFeature } from "./types"
import { migrateLegacy3DFeature, migrateLegacyFeature } from "./featureMigration.js"

/** 迁移并过滤本机持久化的二维绘制成果。 */
export function restoreDrawingFeatures(features: readonly unknown[]): MapDrawFeature[] {
  const restored: MapDrawFeature[] = []

  for (const raw of features) {
    const feature = migrateLegacyFeature(raw)
    if (feature) restored.push(feature)
  }

  return restored
}

/** 迁移并过滤本机持久化的三维绘制成果。 */
export function restoreDrawing3DFeatures(features: readonly unknown[]): MapDraw3DFeature[] {
  const restored: MapDraw3DFeature[] = []

  for (const raw of features) {
    const feature = migrateLegacy3DFeature(raw)
    if (feature) restored.push(feature)
  }

  return restored
}

/** 序列化二维绘制成果，阻断引擎状态与本机存储之间的对象引用。 */
export function serializeDrawingFeatures(features: readonly MapDrawFeature[]): MapDrawFeature[] {
  return features.map((feature) => ({
    id: feature.id,
    name: feature.name,
    type: feature.type,
    geometry: cloneDrawingGeometry(feature.geometry),
    createdAt: feature.createdAt,
  }))
}

/** 按几何类型复制二维绘制几何。 */
function cloneDrawingGeometry(geometry: MapDrawFeature["geometry"]): MapDrawFeature["geometry"] {
  switch (geometry.type) {
    case "point":
      return { type: "point", coordinate: { ...geometry.coordinate } }
    case "polyline":
    case "polygon":
      return { type: geometry.type, coordinates: geometry.coordinates.map((item) => ({ ...item })) }
    case "rectangle":
      return {
        type: "rectangle",
        southwest: { ...geometry.southwest },
        northeast: { ...geometry.northeast },
      }
    case "circle":
      return {
        type: "circle",
        center: { ...geometry.center },
        radiusMeters: geometry.radiusMeters,
      }
    case "ellipse":
      return {
        type: "ellipse",
        center: { ...geometry.center },
        semiMajorMeters: geometry.semiMajorMeters,
        semiMinorMeters: geometry.semiMinorMeters,
        rotationDegrees: geometry.rotationDegrees,
      }
    case "corridor":
      return {
        type: "corridor",
        path: geometry.path.map((item) => ({ ...item })),
        widthMeters: geometry.widthMeters,
      }
    case "buffer":
      return {
        type: "buffer",
        distanceMeters: geometry.distanceMeters,
        polygon: geometry.polygon.map((item) => ({ ...item })),
        source: cloneBufferSource(geometry.source),
      }
  }
}

/** 复制二维缓冲区的原始几何来源。 */
function cloneBufferSource(source: MapDrawBufferSource): MapDrawBufferSource {
  if (source.type === "point") {
    return { type: "point", coordinate: { ...source.coordinate } }
  }

  return {
    type: source.type,
    coordinates: source.coordinates.map((item) => ({ ...item })),
  }
}

/** 序列化三维绘制成果，阻断引擎状态与本机存储之间的对象引用。 */
export function serializeDrawing3DFeatures(
  features: readonly MapDraw3DFeature[],
): MapDraw3DFeature[] {
  return features.map((feature) => ({
    id: feature.id,
    name: feature.name,
    type: feature.type,
    geometry: cloneDrawing3DGeometry(feature.geometry),
    style: cloneDrawing3DStyle(feature.style),
    createdAt: feature.createdAt,
  }))
}

/** 按几何形态复制三维绘制几何。 */
function cloneDrawing3DGeometry(
  geometry: MapDraw3DFeature["geometry"],
): MapDraw3DFeature["geometry"] {
  if (geometry.form === "point") {
    return { form: "point", coordinate: { ...geometry.coordinate } }
  }

  return {
    form: geometry.form,
    coordinates: geometry.coordinates.map((item) => ({ ...item })),
  }
}

/** 复制三维绘制样式中的可变数组。 */
function cloneDrawing3DStyle(style: MapDraw3DFeature["style"]): MapDraw3DFeature["style"] {
  return {
    ...style,
    dimensions: style.dimensions ? ([...style.dimensions] as [number, number, number]) : undefined,
    shape: style.shape?.map((point) => ({ ...point })),
  }
}
