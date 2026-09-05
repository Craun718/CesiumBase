import * as Cesium from "cesium"
import type {
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightPlaybackStatus,
  FlightRoute,
  MapCoordinate,
} from "../../types"
import { clampCameraHeight } from "../../cameraLimits"
import {
  DEFAULT_FLIGHT_CLEARANCE,
  DEFAULT_FLIGHT_PITCH,
  DEFAULT_FLIGHT_SPEED,
} from "../../flightRoute"

const SAMPLE_SPACING = 200
const MAX_SAMPLES = 4096
const MIN_SPEED = 1
const MAX_SPEED = 500
const MIN_CLEARANCE = 10
const MAX_CLEARANCE = 500

type FlightSample = {
  longitude: number
  latitude: number
  height: number
  heading: number
  cumulativeDistance: number
}

type CameraControlsState = {
  enableRotate: boolean
  enableTranslate: boolean
  enableZoom: boolean
  enableTilt: boolean
  enableLook: boolean
}

type FlightRuntime = {
  generation: number
  status: FlightPlaybackStatus
  progress: number
  speed: number
  pitch: number
  loop: boolean
  totalDistance: number
  error?: string
  samples: FlightSample[]
  removeTick?: () => void
  previousCameraControls?: CameraControlsState
  lastTickAt?: number
  lastStateNotifyAt: number
  previewKey?: string
  previewEntities: Cesium.Entity[]
  listeners: Set<(state: FlightPlaybackState) => void>
}

const flightRuntimes = new WeakMap<Cesium.Viewer, FlightRuntime>()

/** 读取指定 viewer 的飞行漫游状态。 */
export function getFlightPlaybackState(viewer: Cesium.Viewer): FlightPlaybackState {
  const runtime = flightRuntimes.get(viewer)
  return runtime ? createPlaybackState(runtime) : createDefaultPlaybackState()
}

/** 监听飞行漫游状态变化，返回取消监听函数。 */
export function onFlightPlaybackStateChange(
  viewer: Cesium.Viewer,
  listener: (state: FlightPlaybackState) => void,
) {
  const runtime = getRuntime(viewer)
  runtime.listeners.add(listener)
  return () => {
    runtime.listeners.delete(listener)
  }
}

/** 更新航线预览实体；非法航线会清理旧预览。 */
export function setFlightRoutePreview(viewer: Cesium.Viewer, route: FlightRoute) {
  const runtime = getRuntime(viewer)
  const previewKey = createPreviewKey(route)
  if (runtime.previewKey === previewKey) return

  clearFlightRoutePreview(viewer)
  if (!isValidPreviewRoute(route)) return

  runtime.previewKey = previewKey
  const positions = route.waypoints.map((waypoint) =>
    Cesium.Cartesian3.fromDegrees(
      waypoint.longitude,
      waypoint.latitude,
      clampCameraHeight(waypoint.height ?? route.defaultHeight),
    ),
  )
  const polyline =
    positions.length >= 2
      ? viewer.entities.add({
          polyline: {
            positions,
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString("#48e5ff").withAlpha(0.9),
              dashLength: 16,
            }),
          },
        })
      : undefined
  const points = positions.map((position) =>
    viewer.entities.add({
      position,
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString("#030a18"),
        outlineColor: Cesium.Color.fromCssColorString("#48e5ff"),
        outlineWidth: 2,
      },
    }),
  )
  runtime.previewEntities = [...(polyline ? [polyline] : []), ...points]
}

/** 清理航线预览实体。 */
export function clearFlightRoutePreview(viewer: Cesium.Viewer) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime) return

  for (const entity of runtime.previewEntities) {
    if (!viewer.isDestroyed()) viewer.entities.remove(entity)
  }
  runtime.previewEntities = []
  runtime.previewKey = undefined
}

/** 采样地形并启动指定航线播放。 */
export async function startFlight(viewer: Cesium.Viewer, route: FlightRoute) {
  const runtime = getRuntime(viewer)
  stopActivePlayback(runtime, viewer)
  clearFlightRoutePreview(viewer)

  if (!isValidRoute(route)) {
    runtime.error = "航线至少需要 2 个有效航点"
    runtime.status = "idle"
    notify(runtime, true)
    return false
  }

  const generation = ++runtime.generation
  runtime.status = "preparing"
  runtime.progress = 0
  runtime.speed = clampNumber(route.speed, MIN_SPEED, MAX_SPEED, DEFAULT_FLIGHT_SPEED)
  runtime.pitch = DEFAULT_FLIGHT_PITCH
  runtime.loop = route.loop
  runtime.totalDistance = 0
  runtime.error = undefined
  notify(runtime, true)

  try {
    const samples = await prepareSamples(viewer, route)
    if (runtime.generation !== generation || viewer.isDestroyed()) return false

    runtime.samples = samples
    runtime.totalDistance = samples.at(-1)?.cumulativeDistance ?? 0
    if (runtime.totalDistance <= 0) {
      runtime.status = "idle"
      runtime.error = "航线长度不足，无法播放"
      notify(runtime, true)
      return false
    }

    disableCameraControls(runtime, viewer)
    installTick(viewer, runtime)
    runtime.status = "playing"
    runtime.progress = 0
    runtime.lastTickAt = undefined
    applyFlightCamera(viewer, runtime, 0)
    notify(runtime, true)
    return true
  } catch (error) {
    if (runtime.generation !== generation || viewer.isDestroyed()) return false

    runtime.status = "idle"
    runtime.error = "地形采样失败，请检查 DEM 服务后重试"
    runtime.samples = []
    runtime.totalDistance = 0
    restoreCameraControls(runtime, viewer)
    notify(runtime, true)
    console.warn("[Cesium] 飞行漫游地形采样失败", error)
    return false
  }
}

/** 暂停播放并恢复相机输入。 */
export function pauseFlight(viewer: Cesium.Viewer) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime || runtime.status !== "playing") return

  runtime.status = "paused"
  runtime.removeTick?.()
  runtime.removeTick = undefined
  runtime.lastTickAt = undefined
  restoreCameraControls(runtime, viewer)
  notify(runtime, true)
}

/** 从暂停或结束状态继续播放。 */
export function resumeFlight(viewer: Cesium.Viewer) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime || runtime.status !== "paused" || runtime.samples.length < 2) return

  if (runtime.progress >= 1) runtime.progress = 0
  disableCameraControls(runtime, viewer)
  installTick(viewer, runtime)
  runtime.status = "playing"
  runtime.lastTickAt = undefined
  applyFlightCamera(viewer, runtime, runtime.progress, true)
  notify(runtime, true)
}

/** 停止播放并清空当前采样路线。 */
export function stopFlight(viewer: Cesium.Viewer) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime) return

  stopActivePlayback(runtime, viewer)
  notify(runtime, true)
}

/** 按归一化进度定位当前播放路线。 */
export function seekFlight(viewer: Cesium.Viewer, progress: number) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime || runtime.samples.length < 2 || !Number.isFinite(progress)) return

  runtime.progress = Math.min(1, Math.max(0, progress))
  if (runtime.status === "completed") runtime.status = "paused"
  applyFlightCamera(viewer, runtime, runtime.progress, true)
  notify(runtime, true)
}

/** 更新播放期速度和循环参数。 */
export function updateFlightPlayback(viewer: Cesium.Viewer, settings: FlightPlaybackSettings) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime) return

  if (settings.speed !== undefined) {
    runtime.speed = clampNumber(settings.speed, MIN_SPEED, MAX_SPEED, runtime.speed)
  }
  if (settings.loop !== undefined) runtime.loop = settings.loop
  notify(runtime, true)
}

/** 停止播放、清理预览并移除状态监听。 */
export function destroyFlight(viewer: Cesium.Viewer) {
  const runtime = flightRuntimes.get(viewer)
  if (!runtime) return

  stopActivePlayback(runtime, viewer)
  clearFlightRoutePreview(viewer)
  runtime.listeners.clear()
}

/** 拾取屏幕点位对应的地面或椭球体坐标。 */
export function pickFlightCoordinate(viewer: Cesium.Viewer, position: Cesium.Cartesian2) {
  const ray = viewer.camera.getPickRay(position)
  const globePosition = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  if (globePosition) return toCoordinate(Cesium.Cartographic.fromCartesian(globePosition))

  const ellipsoidPosition = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid)
  return ellipsoidPosition
    ? toCoordinate(Cesium.Cartographic.fromCartesian(ellipsoidPosition))
    : undefined
}

/** 获取或初始化 viewer 绑定的飞行运行时。 */
function getRuntime(viewer: Cesium.Viewer): FlightRuntime {
  const existing = flightRuntimes.get(viewer)
  if (existing) return existing

  const runtime: FlightRuntime = {
    generation: 0,
    status: "idle",
    progress: 0,
    speed: DEFAULT_FLIGHT_SPEED,
    pitch: DEFAULT_FLIGHT_PITCH,
    loop: false,
    totalDistance: 0,
    samples: [],
    previewEntities: [],
    listeners: new Set(),
    lastStateNotifyAt: 0,
  }
  flightRuntimes.set(viewer, runtime)
  return runtime
}

/** 创建未开始播放时的默认状态。 */
function createDefaultPlaybackState(): FlightPlaybackState {
  return {
    status: "idle",
    progress: 0,
    speed: DEFAULT_FLIGHT_SPEED,
    pitch: DEFAULT_FLIGHT_PITCH,
    loop: false,
    totalDistance: 0,
  }
}

/** 从运行时生成只读播放状态。 */
function createPlaybackState(runtime: FlightRuntime): FlightPlaybackState {
  return {
    status: runtime.status,
    progress: runtime.progress,
    speed: runtime.speed,
    pitch: runtime.pitch,
    loop: runtime.loop,
    totalDistance: runtime.totalDistance,
    error: runtime.error,
  }
}

/** 通知状态监听器，非强制通知按帧节流。 */
function notify(runtime: FlightRuntime, force = false) {
  const now = performance.now()
  if (!force && now - runtime.lastStateNotifyAt < 60) return

  runtime.lastStateNotifyAt = now
  const state = createPlaybackState(runtime)
  for (const listener of runtime.listeners) {
    listener(state)
  }
}

/** 沿测地线加密航线并采样地形生成安全飞行样本。 */
async function prepareSamples(viewer: Cesium.Viewer, route: FlightRoute) {
  const waypoints = route.waypoints
  const cartographics = waypoints.map((waypoint) =>
    Cesium.Cartographic.fromDegrees(waypoint.longitude, waypoint.latitude),
  )
  const segmentLengths: number[] = []
  let desiredSteps = 0

  for (let i = 0; i < cartographics.length - 1; i += 1) {
    const geodesic = new Cesium.EllipsoidGeodesic(cartographics[i], cartographics[i + 1])
    const length = Math.max(geodesic.surfaceDistance, 1)
    segmentLengths.push(length)
    desiredSteps += Math.ceil(length / SAMPLE_SPACING)
  }

  const availableSteps = MAX_SAMPLES - waypoints.length
  const stepScale = desiredSteps > availableSteps ? Math.max(0, availableSteps) / desiredSteps : 1
  const sampledCartographics: Cesium.Cartographic[] = []
  const targetHeights: number[] = []

  for (let i = 0; i < cartographics.length - 1; i += 1) {
    const start = cartographics[i]
    const end = cartographics[i + 1]
    const rawSteps = Math.ceil(segmentLengths[i] / SAMPLE_SPACING)
    const steps = Math.max(1, Math.round(rawSteps * stepScale))
    const geodesic = new Cesium.EllipsoidGeodesic(start, end)
    const startHeight = clampCameraHeight(waypoints[i].height ?? route.defaultHeight)
    const endHeight = clampCameraHeight(waypoints[i + 1].height ?? route.defaultHeight)

    for (let step = i === 0 ? 0 : 1; step <= steps; step += 1) {
      const fraction = step / steps
      const surfacePosition = geodesic.interpolateUsingFraction(fraction, new Cesium.Cartographic())
      sampledCartographics.push(surfacePosition.clone())
      targetHeights.push(startHeight + (endHeight - startHeight) * fraction)
    }
  }

  const sampledTerrain = await Cesium.sampleTerrainMostDetailed(
    viewer.terrainProvider,
    sampledCartographics,
  )
  const exaggeration = Math.max(viewer.scene.verticalExaggeration, 1)
  const clearance = clampNumber(
    route.safetyClearance,
    MIN_CLEARANCE,
    MAX_CLEARANCE,
    DEFAULT_FLIGHT_CLEARANCE,
  )
  const samples: FlightSample[] = []

  for (let i = 0; i < sampledTerrain.length; i += 1) {
    const cartographic = sampledTerrain[i]
    const safeHeight = clampCameraHeight(
      Math.max(targetHeights[i], (cartographic.height ?? 0) * exaggeration + clearance),
    )
    samples.push({
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: safeHeight,
      heading: 0,
      cumulativeDistance: 0,
    })
  }

  smoothHeadings(samples)
  accumulateDistances(samples)
  return samples
}

/** 用相邻样本方位角平滑相机朝向。 */
function smoothHeadings(samples: FlightSample[]) {
  const headings = samples.map((sample, index) => {
    const next = samples[index + 1]
    const previous = samples[index - 1]
    return next ? getBearing(sample, next) : previous ? getBearing(previous, sample) : 0
  })

  samples.forEach((_sample, index) => {
    const from = Math.max(0, index - 2)
    const to = Math.min(samples.length - 1, index + 2)
    let x = 0
    let y = 0

    for (let i = from; i <= to; i += 1) {
      const angle = Cesium.Math.toRadians(headings[i])
      x += Math.cos(angle)
      y += Math.sin(angle)
    }
    samples[index].heading = normalizeHeading(Cesium.Math.toDegrees(Math.atan2(y, x)))
  })
}

/** 计算每个样本的三维累计里程。 */
function accumulateDistances(samples: FlightSample[]) {
  let previous = Cesium.Cartesian3.fromDegrees(
    samples[0].longitude,
    samples[0].latitude,
    samples[0].height,
  )

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    const position = Cesium.Cartesian3.fromDegrees(sample.longitude, sample.latitude, sample.height)
    const distance = i === 0 ? 0 : Cesium.Cartesian3.distance(previous, position)
    sample.cumulativeDistance = (i === 0 ? 0 : samples[i - 1].cumulativeDistance) + distance
    previous = position
  }
}

/** 计算两个样本之间的初始方位角。 */
function getBearing(start: FlightSample, end: FlightSample) {
  const startLongitude = Cesium.Math.toRadians(start.longitude)
  const startLatitude = Cesium.Math.toRadians(start.latitude)
  const endLongitude = Cesium.Math.toRadians(end.longitude)
  const endLatitude = Cesium.Math.toRadians(end.latitude)
  const deltaLongitude = endLongitude - startLongitude
  const y = Math.sin(deltaLongitude) * Math.cos(endLatitude)
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(deltaLongitude)
  return normalizeHeading(Cesium.Math.toDegrees(Math.atan2(y, x)))
}

/** 安装场景更新监听并按恒定速度推进播放。 */
function installTick(viewer: Cesium.Viewer, runtime: FlightRuntime) {
  runtime.removeTick?.()
  const removeListener = viewer.scene.preUpdate.addEventListener(() => {
    if (runtime.status !== "playing" || viewer.isDestroyed()) return

    const now = performance.now()
    const delta =
      runtime.lastTickAt === undefined ? 0 : Math.min((now - runtime.lastTickAt) / 1000, 0.5)
    runtime.lastTickAt = now
    runtime.progress += (runtime.speed * delta) / Math.max(runtime.totalDistance, 1)

    if (runtime.progress >= 1) {
      if (runtime.loop) {
        runtime.progress %= 1
      } else {
        runtime.progress = 1
        runtime.status = "completed"
        runtime.removeTick?.()
        runtime.removeTick = undefined
        restoreCameraControls(runtime, viewer)
      }
    }

    applyFlightCamera(viewer, runtime, runtime.progress, true)
    notify(runtime)
  })
  runtime.removeTick = removeListener
}

/** 按归一化进度插值样本并设置相机；可选择保留用户当前视角。 */
function applyFlightCamera(
  viewer: Cesium.Viewer,
  runtime: FlightRuntime,
  progress: number,
  preserveOrientation = false,
) {
  const samples = runtime.samples
  if (samples.length < 2) return

  const targetDistance = progress * runtime.totalDistance
  let index = 0
  while (index < samples.length - 2 && samples[index + 1].cumulativeDistance < targetDistance) {
    index += 1
  }

  const current = samples[index]
  const next = samples[index + 1]
  const segmentLength = next.cumulativeDistance - current.cumulativeDistance
  const fraction =
    segmentLength <= 0 ? 0 : (targetDistance - current.cumulativeDistance) / segmentLength
  const safeFraction = Math.min(1, Math.max(0, fraction))
  const longitude = current.longitude + (next.longitude - current.longitude) * safeFraction
  const latitude = current.latitude + (next.latitude - current.latitude) * safeFraction
  const height = current.height + (next.height - current.height) * safeFraction
  const heading = interpolateHeading(current.heading, next.heading, safeFraction)

  const camera = viewer.camera
  const orientation = preserveOrientation
    ? {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      }
    : {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(runtime.pitch),
        roll: 0,
      }

  camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation,
  })
}

/** 停止当前播放并清空运行时路线数据。 */
function stopActivePlayback(runtime: FlightRuntime, viewer: Cesium.Viewer) {
  runtime.generation += 1
  runtime.removeTick?.()
  runtime.removeTick = undefined
  runtime.lastTickAt = undefined
  runtime.samples = []
  runtime.totalDistance = 0
  runtime.progress = 0
  runtime.status = "idle"
  runtime.error = undefined
  restoreCameraControls(runtime, viewer)
}

/** 记录相机交互配置，播放期仅禁用会改变路径观察点的导航输入。 */
function disableCameraControls(runtime: FlightRuntime, viewer: Cesium.Viewer) {
  if (runtime.previousCameraControls) return

  const controller = viewer.scene.screenSpaceCameraController
  runtime.previousCameraControls = {
    enableRotate: controller.enableRotate,
    enableTranslate: controller.enableTranslate,
    enableZoom: controller.enableZoom,
    enableTilt: controller.enableTilt,
    enableLook: controller.enableLook,
  }
  controller.enableRotate = false
  controller.enableTranslate = false
  controller.enableZoom = false
  controller.enableTilt = true
  controller.enableLook = true
}

/** 恢复进入播放前记录的相机交互配置。 */
function restoreCameraControls(runtime: FlightRuntime, viewer: Cesium.Viewer) {
  const previous = runtime.previousCameraControls
  if (!previous) return

  if (!viewer.isDestroyed()) {
    const controller = viewer.scene.screenSpaceCameraController
    controller.enableRotate = previous.enableRotate
    controller.enableTranslate = previous.enableTranslate
    controller.enableZoom = previous.enableZoom
    controller.enableTilt = previous.enableTilt
    controller.enableLook = previous.enableLook
  }
  runtime.previousCameraControls = undefined
}

/** 按最短角差插值方位角。 */
function interpolateHeading(from: number, to: number, fraction: number) {
  const difference = normalizeHeading(to - from + 180) - 180
  return normalizeHeading(from + difference * fraction)
}

/** 将方位角规范到 0~360 度。 */
function normalizeHeading(heading: number) {
  const normalized = ((heading % 360) + 360) % 360
  return normalized === 360 ? 0 : normalized
}

/** 将数字钳制到指定区间，非法值使用回退值。 */
function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 判断航线是否具备播放所需的有效航点。 */
function isValidRoute(route: FlightRoute) {
  return (
    Array.isArray(route.waypoints) &&
    route.waypoints.length >= 2 &&
    route.waypoints.every(isValidWaypoint)
  )
}

/** 判断航线是否具备预览所需的有效航点。 */
function isValidPreviewRoute(route: FlightRoute) {
  return (
    Array.isArray(route.waypoints) &&
    route.waypoints.length > 0 &&
    route.waypoints.every(isValidWaypoint)
  )
}

/** 判断单个航点坐标和高度是否有效。 */
function isValidWaypoint(waypoint: FlightRoute["waypoints"][number]) {
  return (
    Number.isFinite(waypoint.longitude) &&
    Number.isFinite(waypoint.latitude) &&
    waypoint.longitude >= -180 &&
    waypoint.longitude <= 180 &&
    waypoint.latitude >= -90 &&
    waypoint.latitude <= 90 &&
    (waypoint.height === undefined || Number.isFinite(waypoint.height))
  )
}

/** 生成只依赖航线几何的预览缓存 key。 */
function createPreviewKey(route: FlightRoute) {
  const defaultHeight = clampCameraHeight(route.defaultHeight)
  const waypoints = (Array.isArray(route.waypoints) ? route.waypoints : [])
    .map(
      (waypoint) =>
        `${waypoint.longitude},${waypoint.latitude},${clampCameraHeight(waypoint.height ?? defaultHeight)}`,
    )
    .join(";")
  return `${route.id}:${defaultHeight}:${waypoints}`
}

/** 将 Cesium 大地坐标转换为共享地图坐标。 */
function toCoordinate(cartographic: Cesium.Cartographic): MapCoordinate {
  return {
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
  }
}
