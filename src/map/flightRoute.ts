import { clampCameraHeight } from "./cameraLimits"
import type { FlightRoute, FlightWaypoint } from "./types"

export const MAX_FLIGHT_WAYPOINTS = 2000
export const DEFAULT_FLIGHT_HEIGHT = 500
export const DEFAULT_FLIGHT_CLEARANCE = 50
export const DEFAULT_FLIGHT_SPEED = 60
export const DEFAULT_FLIGHT_PITCH = -20

type GeoJsonPosition = number[]

type LineStringGeometry = {
  type: "LineString"
  coordinates: GeoJsonPosition[]
}

type LineStringFeature = {
  properties?: Record<string, unknown>
  geometry: LineStringGeometry
}

type GeoJsonRoot = {
  type?: unknown
  features?: unknown
  properties?: Record<string, unknown>
  geometry?: unknown
}

/** 创建一条使用默认飞行参数的本地航线。 */
export function createFlightRoute(name = "未命名航线"): FlightRoute {
  const now = new Date().toISOString()
  return {
    id: createFlightRouteId(),
    name,
    waypoints: [],
    defaultHeight: DEFAULT_FLIGHT_HEIGHT,
    safetyClearance: DEFAULT_FLIGHT_CLEARANCE,
    speed: DEFAULT_FLIGHT_SPEED,
    pitch: DEFAULT_FLIGHT_PITCH,
    loop: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** 解析仅包含一条 WGS84 LineString 的 GeoJSON 航线文件。 */
export function parseFlightRouteGeoJson(content: string, fallbackName: string): FlightRoute {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error("文件不是有效 JSON")
  }

  const feature = getSingleLineStringFeature(parsed)
  if (!feature) throw new Error("仅支持包含一条 LineString 的 GeoJSON")

  const waypoints = parseWaypoints(feature.geometry.coordinates)
  const properties = feature.properties ?? {}
  const name = readString(properties.name) || fallbackName

  return normalizeFlightRoute({
    ...createFlightRoute(name),
    waypoints,
    defaultHeight: readNumber(properties.defaultHeight, DEFAULT_FLIGHT_HEIGHT),
    safetyClearance: readNumber(properties.safetyClearance, DEFAULT_FLIGHT_CLEARANCE),
    speed: readNumber(properties.speed, DEFAULT_FLIGHT_SPEED),
    loop: properties.loop === true,
  })
}

/** 将航线序列化为可再次导入的 GeoJSON Feature。 */
export function serializeFlightRouteGeoJson(route: FlightRoute) {
  const safeRoute = normalizeFlightRoute(route)
  const coordinates = safeRoute.waypoints.map((waypoint) => [
    Number(waypoint.longitude.toFixed(8)),
    Number(waypoint.latitude.toFixed(8)),
    Math.round(waypoint.height ?? safeRoute.defaultHeight),
  ])

  return JSON.stringify(
    {
      type: "Feature",
      properties: {
        name: safeRoute.name,
        defaultHeight: safeRoute.defaultHeight,
        safetyClearance: safeRoute.safetyClearance,
        speed: safeRoute.speed,
        loop: safeRoute.loop,
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    },
    null,
    2,
  )
}

/** 规范化航线字段，剔除非法航点并钳制飞行参数。 */
export function normalizeFlightRoute(route: FlightRoute): FlightRoute {
  const name = typeof route.name === "string" ? route.name.trim().slice(0, 50) : ""

  return {
    ...route,
    name: name || "未命名航线",
    waypoints: (Array.isArray(route.waypoints) ? route.waypoints : [])
      .filter(isValidWaypoint)
      .slice(0, MAX_FLIGHT_WAYPOINTS)
      .map((waypoint) => ({
        longitude: waypoint.longitude,
        latitude: waypoint.latitude,
        height:
          waypoint.height !== undefined && Number.isFinite(waypoint.height)
            ? clampCameraHeight(waypoint.height)
            : undefined,
      })),
    defaultHeight: clampCameraHeight(
      Number.isFinite(route.defaultHeight) ? route.defaultHeight : DEFAULT_FLIGHT_HEIGHT,
    ),
    safetyClearance: clampNumber(route.safetyClearance, 10, 500, DEFAULT_FLIGHT_CLEARANCE),
    speed: clampNumber(route.speed, 1, 500, DEFAULT_FLIGHT_SPEED),
    pitch: DEFAULT_FLIGHT_PITCH,
    loop: route.loop === true,
  }
}

/** 生成航线本地 ID，优先使用浏览器安全随机 UUID。 */
export function createFlightRouteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `flight-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 从 GeoJSON 根对象中提取唯一的 LineString Feature。 */
function getSingleLineStringFeature(value: unknown): LineStringFeature | undefined {
  if (!isRecord(value)) return undefined
  const root = value as GeoJsonRoot

  if (root.type === "FeatureCollection") {
    if (!Array.isArray(root.features) || root.features.length !== 1) return undefined
    return getSingleLineStringFeature(root.features[0])
  }

  if (root.type !== "Feature" || !isRecord(root.geometry)) return undefined
  const geometry = root.geometry as Partial<LineStringGeometry>
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return undefined
  if (root.properties !== undefined && !isRecord(root.properties)) return undefined

  return {
    properties: root.properties,
    geometry: {
      type: "LineString",
      coordinates: geometry.coordinates,
    },
  }
}

/** 校验并转换 GeoJSON LineString 坐标为航点。 */
function parseWaypoints(coordinates: GeoJsonPosition[]) {
  if (coordinates.length < 2 || coordinates.length > MAX_FLIGHT_WAYPOINTS) {
    throw new Error(`航点数量必须在 2 到 ${MAX_FLIGHT_WAYPOINTS} 之间`)
  }

  const waypoints = coordinates.map((position, index) => {
    if (
      !Array.isArray(position) ||
      position.length < 2 ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1]) ||
      position[0] < -180 ||
      position[0] > 180 ||
      position[1] < -90 ||
      position[1] > 90 ||
      (position.length >= 3 && !Number.isFinite(position[2]))
    ) {
      throw new Error(`第 ${index + 1} 个坐标无效`)
    }

    return {
      longitude: position[0],
      latitude: position[1],
      height: position.length >= 3 ? position[2] : undefined,
    } satisfies FlightWaypoint
  })

  return waypoints
}

/** 判断航点经纬度和可选高度是否有效。 */
function isValidWaypoint(waypoint: FlightWaypoint) {
  return (
    typeof waypoint === "object" &&
    waypoint !== null &&
    Number.isFinite(waypoint.longitude) &&
    Number.isFinite(waypoint.latitude) &&
    waypoint.longitude >= -180 &&
    waypoint.longitude <= 180 &&
    waypoint.latitude >= -90 &&
    waypoint.latitude <= 90 &&
    (waypoint.height === undefined || Number.isFinite(waypoint.height))
  )
}

/** 读取有限数字，非法值回退到默认值。 */
function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** 读取并截断字符串属性。 */
function readString(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 50) : ""
}

/** 将数字钳制到指定区间，非法值使用回退值。 */
function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
