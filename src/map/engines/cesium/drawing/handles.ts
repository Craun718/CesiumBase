import type { MapDrawCoordinate, MapDrawGeometry } from "../../../types"
import {
  bearingDegrees,
  computeResizedCircle,
  computeResizedCorridorWidth,
  computeResizedEllipse,
  computeResizedRectangle,
  destinationPoint,
  geodesicDistance,
  geometryCentroid,
  moveVertex,
  parseVertexIndex,
  translateGeometry,
} from "./geometry.js"
import type { EditingDraft, HandlePlacement } from "./types.js"

/** 计算编辑把手的位置列表；按 geometry.type 分派。 */
export function computeHandlePlacements(geometry: MapDrawGeometry): HandlePlacement[] {
  switch (geometry.type) {
    case "point":
      return [{ handleId: "translate", position: geometry.coordinate }]
    case "polyline":
    case "polygon":
      return [
        ...geometry.coordinates.map((coord, index): HandlePlacement => ({
          handleId: `vertex-${index}`,
          position: coord,
        })),
        {
          handleId: "translate",
          position: geometryCentroid(geometry.coordinates),
          pixelOffset: { x: 0, y: -18 },
        },
      ]
    case "rectangle": {
      const { southwest, northeast } = geometry
      const nw: MapDrawCoordinate = {
        longitude: southwest.longitude,
        latitude: northeast.latitude,
        height: southwest.height,
      }
      const se: MapDrawCoordinate = {
        longitude: northeast.longitude,
        latitude: southwest.latitude,
        height: southwest.height,
      }
      const center: MapDrawCoordinate = {
        longitude: (southwest.longitude + northeast.longitude) / 2,
        latitude: (southwest.latitude + northeast.latitude) / 2,
        height: southwest.height,
      }
      return [
        { handleId: "sw", position: southwest },
        { handleId: "se", position: se },
        { handleId: "ne", position: northeast },
        { handleId: "nw", position: nw },
        { handleId: "translate", position: center, pixelOffset: { x: 0, y: -18 } },
      ]
    }
    case "circle": {
      const radiusTip = destinationPoint(geometry.center, geometry.radiusMeters, 0)
      return [
        { handleId: "radius", position: radiusTip },
        { handleId: "translate", position: geometry.center, pixelOffset: { x: 0, y: -18 } },
      ]
    }
    case "ellipse": {
      // Cesium rotation 是东基准逆时针；handle 用 bearingDegrees（北基准顺时针）反算
      const bearingDeg = (90 - geometry.rotationDegrees + 360) % 360
      const semiMajorTip = destinationPoint(geometry.center, geometry.semiMajorMeters, bearingDeg)
      const semiMinorTip = destinationPoint(
        geometry.center,
        geometry.semiMinorMeters,
        (bearingDeg + 90) % 360,
      )
      return [
        { handleId: "semiMajor", position: semiMajorTip },
        { handleId: "semiMinor", position: semiMinorTip },
        {
          handleId: "translate",
          position: geometry.center,
          pixelOffset: { x: 0, y: -18 },
        },
      ]
    }
    case "corridor": {
      const vertices = geometry.path.map((coord, index): HandlePlacement => ({
        handleId: `vertex-${index}`,
        position: coord,
      }))
      if (geometry.path.length >= 2) {
        const midIndex = Math.floor(geometry.path.length / 2)
        const pathCenter = geometry.path[midIndex]!
        const pathBearing = bearingDegrees(geometry.path[0]!, geometry.path[1]!)
        const normalBearing = (pathBearing + 90) % 360
        const halfWidth = Math.max(geometry.widthMeters / 2, 1)
        vertices.push({
          handleId: "width-positive",
          position: destinationPoint(pathCenter, halfWidth, normalBearing),
        })
        vertices.push({
          handleId: "width-negative",
          position: destinationPoint(pathCenter, halfWidth, (normalBearing + 180) % 360),
        })
      }
      const midIndex = Math.floor(geometry.path.length / 2)
      vertices.push({
        handleId: "translate",
        position: geometry.path[midIndex] ??
          geometry.path[0] ?? {
            longitude: 0,
            latitude: 0,
            height: 0,
          },
        pixelOffset: { x: 0, y: -18 },
      })
      return vertices
    }
    case "buffer": {
      const polygonCenter = geometry.polygon[0] ?? {
        longitude: 0,
        latitude: 0,
        height: 0,
      }
      const distanceHandle = destinationPoint(
        polygonCenter,
        Math.max(geometry.distanceMeters, 1),
        0,
      )
      return [
        { handleId: "distance", position: distanceHandle },
        {
          handleId: "translate",
          position: polygonCenter,
          pixelOffset: { x: 0, y: -18 },
        },
      ]
    }
  }
}

/** 根据 kind + handleId + current 计算新 geometry。 */
export function computeEditedGeometry(
  draft: Pick<
    EditingDraft,
    "kind" | "handleId" | "startCoordinate" | "startDistanceHandleOffsetMeters"
  >,
  startGeometry: MapDrawGeometry,
  current: MapDrawCoordinate,
  computeBufferPolygon: (
    path: readonly MapDrawCoordinate[],
    distanceMeters: number,
    closed?: boolean,
  ) => readonly MapDrawCoordinate[],
): MapDrawGeometry | null {
  if (draft.kind === "translate") {
    const deltaLng = current.longitude - draft.startCoordinate.longitude
    const deltaLat = current.latitude - draft.startCoordinate.latitude

    return translateGeometry(startGeometry, deltaLng, deltaLat)
  }

  switch (startGeometry.type) {
    case "rectangle":
      return computeResizedRectangle(startGeometry, draft.handleId, current)
    case "circle":
      return computeResizedCircle(startGeometry, current)
    case "ellipse":
      return computeResizedEllipse(startGeometry, draft.handleId, current)
    case "polyline":
    case "polygon":
      return moveVertex(startGeometry, parseVertexIndex(draft.handleId), current)
    case "corridor":
      if (draft.handleId === "width-positive" || draft.handleId === "width-negative") {
        return computeResizedCorridorWidth(startGeometry, current)
      }
      return moveVertex(startGeometry, parseVertexIndex(draft.handleId), current)
    case "buffer":
      if (draft.handleId === "distance") {
        return computeResizedBufferDistance(
          startGeometry,
          draft.startDistanceHandleOffsetMeters,
          current,
          computeBufferPolygon,
        )
      }
      return null
    default:
      return null
  }
}

/**
 * 缓冲区距离编辑：handle 起始位置到 polygon 中心的距离记录为 offset，
 * 拖动时 current 到 polygon 中心的距离 ± offset 即为新 distance。
 */
function computeResizedBufferDistance(
  startGeometry: MapDrawGeometry,
  startDistanceHandleOffsetMeters: number,
  current: MapDrawCoordinate,
  computeBufferPolygon: (
    path: readonly MapDrawCoordinate[],
    distanceMeters: number,
    closed?: boolean,
  ) => readonly MapDrawCoordinate[],
): MapDrawGeometry | null {
  if (startGeometry.type !== "buffer") return null

  const polygonCenter = startGeometry.polygon[0]
  if (!polygonCenter) return null

  const currentOffset = geodesicDistance(polygonCenter, current)
  const nextDistance = Math.max(currentOffset + startDistanceHandleOffsetMeters, 1)

  const sourceCoords =
    startGeometry.source.type === "point"
      ? [startGeometry.source.coordinate]
      : startGeometry.source.coordinates

  const polygon = computeBufferPolygon(
    sourceCoords,
    nextDistance,
    startGeometry.source.type === "polygon",
  )
  if (polygon.length < 3) return null

  return {
    ...startGeometry,
    distanceMeters: nextDistance,
    polygon,
  }
}
