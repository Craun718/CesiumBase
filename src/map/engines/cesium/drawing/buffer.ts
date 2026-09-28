import bufferImpl from "@turf/buffer"
import {
  lineString as turfLineString,
  point as turfPoint,
  polygon as turfPolygon,
} from "@turf/helpers"
import type {
  Feature,
  MultiPolygon as GeoJsonMultiPolygon,
  Polygon as GeoJsonPolygon,
} from "geojson"
import type { MapDrawCoordinate } from "../../../types"
import { BUFFER_STEPS } from "./types.js"

/** 提取 GeoJSON Polygon / MultiPolygon 中面积最大的外环；buffer 完成时取最大多边形渲染。 */
function extractLargestPolygon(
  feature: Feature<GeoJsonPolygon | GeoJsonMultiPolygon>,
): readonly (readonly [number, number])[] {
  const geometry = feature.geometry

  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] ?? []) as unknown as readonly (readonly [number, number])[]
  }

  // MultiPolygon：每个 polygon 的第一个 LinearRing 是外环，按外环顶点数选最大多边形。
  let largestArea = -1
  let largestRing: readonly (readonly [number, number])[] = []

  for (const polygon of geometry.coordinates) {
    const outerRing = polygon[0]
    if (!outerRing) continue

    // 简单采用外环顶点数作为近似面积权重；buffer 输出环均为有效多边形。
    const area = outerRing.reduce((sum, point) => sum + point.length, 0)

    if (area > largestArea) {
      largestArea = area
      largestRing = outerRing as unknown as readonly (readonly [number, number])[]
    }
  }

  return largestRing
}

/** 把任意 Position[] 规整为 Cesium PolygonHierarchy 可消费的 [lng, lat] 闭合环。 */
function normalizeBufferRing(ring: readonly (readonly [number, number])[]) {
  if (ring.length === 0) return []

  const points: [number, number][] = []
  for (const point of ring) {
    const longitude = point[0]
    const latitude = point[1]
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    points.push([longitude, latitude])
  }

  if (points.length < 3) return []

  const [firstLng, firstLat] = points[0]!
  const last = points[points.length - 1]!
  if (last[0] !== firstLng || last[1] !== firstLat) {
    points.push([firstLng, firstLat])
  }

  return points
}

/** 调用 turf.buffer 计算缓冲区多边形；提取最大面积多边形的外环并规整为 Cesium 合法环。 */
export function computeBufferPolygon(
  path: readonly MapDrawCoordinate[],
  distanceMeters: number,
  closed = false,
): readonly MapDrawCoordinate[] {
  if (path.length === 0) return []

  const positions = path.map((coord) => [coord.longitude, coord.latitude] as [number, number])
  // 按节点数分派：1 → 点缓冲，2 → 线缓冲，≥3 → 线 / 多边形缓冲。
  // closed=true 时强制按多边形缓冲；不足 3 节点回退为线缓冲，避免 polygon 被误当 lineString。
  // GeoJSON Polygon 要求首末点等价（闭合环），拼接首点收尾再交给 turfPolygon。
  let source: ReturnType<typeof turfPoint | typeof turfLineString | typeof turfPolygon>
  if (positions.length >= 3 && closed) {
    source = turfPolygon([[...positions, positions[0]!]])
  } else if (positions.length === 1) {
    source = turfPoint(positions[0]!)
  } else {
    source = turfLineString(positions)
  }

  const buffered = bufferImpl(source as never, Math.max(distanceMeters, 1), {
    units: "meters",
    steps: BUFFER_STEPS,
  }) as Feature<GeoJsonPolygon | GeoJsonMultiPolygon> | undefined

  if (!buffered) return []

  const ring = normalizeBufferRing(extractLargestPolygon(buffered))
  if (ring.length === 0) return []

  const baseHeight = path[0]!.height
  return ring.map(([longitude, latitude]) => ({ longitude, latitude, height: baseHeight }))
}
