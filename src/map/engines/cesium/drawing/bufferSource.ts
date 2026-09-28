import * as Cesium from "cesium"
import type { MapDrawBufferSource, MapDrawCoordinate, MapDrawGeometry } from "../../../types"
import { destinationPoint } from "./geometry.js"
import { BUFFER_STEPS } from "./types.js"

/** 把任意绘制几何转换为 turf 可缓冲的源；corridor / buffer 暂不开放，返回 null。 */
export function geometryToBufferSource(geometry: MapDrawGeometry): MapDrawBufferSource | null {
  switch (geometry.type) {
    case "point":
      return { type: "point", coordinate: geometry.coordinate }
    case "polyline":
      return { type: "polyline", coordinates: geometry.coordinates }
    case "polygon":
      return { type: "polygon", coordinates: geometry.coordinates }
    case "rectangle": {
      const { southwest, northeast } = geometry
      const baseHeight = southwest.height
      return {
        type: "polygon",
        coordinates: [
          southwest,
          { longitude: northeast.longitude, latitude: southwest.latitude, height: baseHeight },
          northeast,
          { longitude: southwest.longitude, latitude: northeast.latitude, height: baseHeight },
        ],
      }
    }
    case "circle": {
      const positions = sampleCirclePerimeter(geometry.center, geometry.radiusMeters)
      return { type: "polygon", coordinates: positions }
    }
    case "ellipse": {
      const positions = sampleEllipsePerimeter(
        geometry.center,
        geometry.semiMajorMeters,
        geometry.semiMinorMeters,
        geometry.rotationDegrees,
      )
      return { type: "polygon", coordinates: positions }
    }
    default:
      return null
  }
}

/** 取缓冲区源对应的坐标序列；点返回单元素数组。 */
export function sourcePositions(source: MapDrawBufferSource): readonly MapDrawCoordinate[] {
  return source.type === "point" ? [source.coordinate] : source.coordinates
}

/** 在 WGS-84 椭球上沿圆周采样 BUFFER_STEPS 个点；圆缓冲区专用。 */
function sampleCirclePerimeter(
  center: MapDrawCoordinate,
  radiusMeters: number,
): readonly MapDrawCoordinate[] {
  const points: MapDrawCoordinate[] = []
  for (let i = 0; i < BUFFER_STEPS; i++) {
    const bearing = (i / BUFFER_STEPS) * 360
    points.push(destinationPoint(center, radiusMeters, bearing))
  }

  return points
}

/** 沿椭圆周长采样 BUFFER_STEPS 个点；旋转使用 Cesium rotation 语义（东基准逆时针）。 */
function sampleEllipsePerimeter(
  center: MapDrawCoordinate,
  semiMajorMeters: number,
  semiMinorMeters: number,
  rotationDegrees: number,
): readonly MapDrawCoordinate[] {
  const cosRotation = Math.cos(Cesium.Math.toRadians(rotationDegrees))
  const sinRotation = Math.sin(Cesium.Math.toRadians(rotationDegrees))
  // 局部 ENU 近似：1 度纬度 ≈ 111_320 米；经度按当前纬度缩放。
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.cos(Cesium.Math.toRadians(center.latitude))

  const points: MapDrawCoordinate[] = []
  for (let i = 0; i < BUFFER_STEPS; i++) {
    const theta = (i / BUFFER_STEPS) * 2 * Math.PI
    const localX = semiMajorMeters * Math.cos(theta)
    const localY = semiMinorMeters * Math.sin(theta)
    const east = localX * cosRotation - localY * sinRotation
    const north = localX * sinRotation + localY * cosRotation
    points.push({
      longitude: center.longitude + east / metersPerDegLng,
      latitude: center.latitude + north / metersPerDegLat,
      height: center.height,
    })
  }

  return points
}
