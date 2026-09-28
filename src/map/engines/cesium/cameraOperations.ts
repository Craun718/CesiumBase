import * as Cesium from "cesium"
import type {
  CameraFlightOptions,
  CameraState,
  MapBounds,
  MapCoordinate,
  OrbitFlightSettings,
  OrbitFlightState,
  ViewportState,
} from "../../types"
import { clampCameraHeight } from "../../cameraLimits.js"
import { createThumbnailFromCanvas, exportCanvasToDataUrl } from "../../screenshotThumbnail.js"

const MIN_CAMERA_PITCH = -89.9
const MAX_CAMERA_PITCH = 89.9

/** 环绕飞行完成一圈的默认时长，单位秒。 */
const DEFAULT_ORBIT_DURATION_SECONDS = 20
/** 环绕飞行一周期的下限，单位秒。 */
const MIN_ORBIT_DURATION_SECONDS = 5
/** 环绕飞行一周期的上限，单位秒。 */
const MAX_ORBIT_DURATION_SECONDS = 120

const TWO_PI = Math.PI * 2

type OrbitCameraControlsState = {
  enableRotate: boolean
  enableTranslate: boolean
  enableZoom: boolean
  enableTilt: boolean
  enableLook: boolean
}

type OrbitRuntime = {
  center: Cesium.Cartesian3
  axis: Cesium.Cartesian3
  offset: Cesium.Cartesian3
  direction: Cesium.Cartesian3
  up: Cesium.Cartesian3
  angle: number
  durationSeconds: number
  status: "playing" | "paused"
  removeTick?: () => void
  lastTickAt?: number
  /** 启动瞬间锁定的中心点地理坐标，pause/resume/seek 均保持不变。 */
  centerCartographic?: Cesium.Cartographic
  previousCameraControls?: OrbitCameraControlsState
}

const orbitRuntimes = new WeakMap<Cesium.Viewer, OrbitRuntime>()
const orbitStateListeners = new WeakMap<Cesium.Viewer, Set<(state: OrbitFlightState) => void>>()
const orbitLastNotifiedAt = new WeakMap<Cesium.Viewer, number>()
/** 进度推送节流间隔，单位毫秒。 */
const ORBIT_PROGRESS_NOTIFY_THROTTLE_MS = 100

const scratchOrbitQuaternion = new Cesium.Quaternion()
const scratchOrbitRotation = new Cesium.Matrix3()
const scratchOrbitVector = new Cesium.Cartesian3()
const scratchOrbitDestination = new Cesium.Cartesian3()
const scratchOrbitDirection = new Cesium.Cartesian3()
const scratchOrbitUp = new Cesium.Cartesian3()

export function setInitialCamera(viewer: Cesium.Viewer) {
  // Bounds derived from the Guangxi city boundary GeoJSON.
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(105, 21, 112.0569, 26.5),
  })
}

export function flyToBounds(viewer: Cesium.Viewer, bounds: MapBounds): Promise<boolean> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
      ),
      duration: 1,
      complete: () => resolve(true),
      cancel: () => resolve(false),
    })
  })
}

export function flyToCoordinate(viewer: Cesium.Viewer, coordinate: MapCoordinate) {
  if (!isValidCoordinate(coordinate)) return

  const camera = viewer.camera
  const current = camera.positionCartographic

  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      coordinate.longitude,
      coordinate.latitude,
      current.height,
    ),
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
    duration: 1.5,
  })
}

/** 归一化分屏视口朝向到 0 <= heading < 360。 */
export function normalizeViewportHeading(heading: number) {
  const degrees = ((heading % 360) + 360) % 360

  return degrees === 360 ? 0 : degrees
}

/** 计算相机到屏幕中心地面点的直线距离；非法输入按 0 处理。 */
export function calculateViewportDistance(
  cameraPosition: { readonly x: number; readonly y: number; readonly z: number },
  groundPosition: { readonly x: number; readonly y: number; readonly z: number },
) {
  const dx = cameraPosition.x - groundPosition.x
  const dy = cameraPosition.y - groundPosition.y
  const dz = cameraPosition.z - groundPosition.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

  return Number.isFinite(distance) ? distance : 0
}

export function getCameraHeading(viewer: Cesium.Viewer) {
  return normalizeViewportHeading(Cesium.Math.toDegrees(viewer.camera.heading))
}

/** 读取当前相机参数；引擎未挂载时由调用方提供安全默认值。 */
export function getCameraState(viewer: Cesium.Viewer): CameraState {
  const position = viewer.camera.positionCartographic

  return {
    longitude: normalizeLongitude(Cesium.Math.toDegrees(position.longitude)),
    latitude: Cesium.Math.toDegrees(position.latitude),
    height: clampCameraHeight(position.height),
    heading: getCameraHeading(viewer),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
  }
}

/** 读取以屏幕中心地面点为锚点的分屏同步状态，保持 3D 倾斜时 2D 视野稳定。 */
export function getViewportState(viewer: Cesium.Viewer): ViewportState {
  const groundCenter = getGroundCenter(viewer)
  const groundPosition = groundCenter
    ? viewer.scene.globe.ellipsoid.cartographicToCartesian(groundCenter, new Cesium.Cartesian3())
    : viewer.camera.positionWC

  return {
    longitude: normalizeLongitude(
      Cesium.Math.toDegrees((groundCenter ?? viewer.camera.positionCartographic).longitude),
    ),
    latitude: Cesium.Math.toDegrees((groundCenter ?? viewer.camera.positionCartographic).latitude),
    distanceMeters: clampCameraHeight(
      calculateViewportDistance(viewer.camera.positionWC, groundPosition),
    ),
    heading: getCameraHeading(viewer),
  }
}

/** 以 top-down 视角应用分屏同步状态。 */
export function setViewportState(viewer: Cesium.Viewer, state: ViewportState) {
  if (!isValidViewportState(state)) return

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      normalizeLongitude(state.longitude),
      Math.min(90, Math.max(-90, state.latitude)),
      Math.max(1, state.distanceMeters),
    ),
    orientation: {
      heading: Cesium.Math.toRadians(normalizeViewportHeading(state.heading)),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  })
}

export function setCameraHeading(viewer: Cesium.Viewer, heading: number) {
  if (!Number.isFinite(heading)) return

  const camera = viewer.camera

  camera.setView({
    destination: camera.position,
    orientation: {
      heading: Cesium.Math.toRadians(normalizeViewportHeading(heading)),
      pitch: camera.pitch,
      roll: camera.roll,
    },
  })
}

/** 开启或停止围绕当前视觉中心竖直轴的持续环绕飞行。 */
export function setOrbitFlight(
  viewer: Cesium.Viewer,
  enabled: boolean,
  options?: { readonly durationSeconds?: number },
) {
  if (enabled) {
    startOrbitFlight(viewer, options?.durationSeconds ?? DEFAULT_ORBIT_DURATION_SECONDS)
    return
  }

  stopOrbitFlight(viewer)
}

/** 暂停正在播放的环绕飞行；非 playing 状态为 no-op。 */
export function pauseOrbitFlight(viewer: Cesium.Viewer) {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime || runtime.status === "paused") return

  runtime.status = "paused"
  notifyOrbitFlightStateChange(viewer)
}

/** 恢复暂停的环绕飞行；非 paused 状态为 no-op。 */
export function resumeOrbitFlight(viewer: Cesium.Viewer) {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime || runtime.status === "playing") return

  runtime.status = "playing"
  // 让下一帧 deltaSeconds=0，避免恢复瞬间位置跳变
  runtime.lastTickAt = undefined
  notifyOrbitFlightStateChange(viewer)
}

/** 按 0~1 进度定位环绕角度，立即重定位相机位姿；引擎未启动时为 no-op。 */
export function seekOrbitFlight(viewer: Cesium.Viewer, progress: number) {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime) return
  if (!Number.isFinite(progress)) return

  const clamped = Math.min(1, Math.max(0, progress))
  // 与 tick 减号保持一致：angle 单调递减
  runtime.angle = -TWO_PI * clamped
  applyOrbitCamera(viewer, runtime)
  notifyOrbitFlightStateChange(viewer)
}

/** 监听环绕飞行状态变化，挂载时立即同步一次当前状态，返回取消监听函数。 */
export function onOrbitFlightStateChange(
  viewer: Cesium.Viewer,
  listener: (state: OrbitFlightState) => void,
): () => void {
  let set = orbitStateListeners.get(viewer)
  if (!set) {
    set = new Set()
    orbitStateListeners.set(viewer, set)
  }
  set.add(listener)
  listener(getOrbitFlightState(viewer))
  return () => {
    set?.delete(listener)
  }
}

/** 同步通知所有环绕飞行状态订阅者；无订阅者时跳过。 */
function notifyOrbitFlightStateChange(viewer: Cesium.Viewer) {
  const set = orbitStateListeners.get(viewer)
  if (!set || set.size === 0) return
  const state = getOrbitFlightState(viewer)
  for (const listener of set) listener(state)
}

/** 节流后的进度通知：每帧最多触发一次。 */
function throttledOrbitProgressNotify(viewer: Cesium.Viewer) {
  const now = performance.now()
  const last = orbitLastNotifiedAt.get(viewer) ?? 0
  if (now - last < ORBIT_PROGRESS_NOTIFY_THROTTLE_MS) return
  orbitLastNotifiedAt.set(viewer, now)
  notifyOrbitFlightStateChange(viewer)
}

/** 实时更新运行中的环绕参数；引擎未启动时该调用为 no-op。 */
export function setOrbitFlightSettings(viewer: Cesium.Viewer, settings: OrbitFlightSettings) {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime) return

  if (settings.durationSeconds !== undefined) {
    runtime.durationSeconds = clampOrbitDuration(settings.durationSeconds)
    notifyOrbitFlightStateChange(viewer)
  }
}

/** 读取当前环绕飞行状态；无运行时返回默认值。 */
export function getOrbitFlightState(viewer: Cesium.Viewer): OrbitFlightState {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime) {
    return {
      status: "idle",
      active: false,
      durationSeconds: DEFAULT_ORBIT_DURATION_SECONDS,
      progress: 0,
    }
  }

  // angle 是负向递减；progress = (-angle) / 2π mod 1
  const rawProgress = (((-runtime.angle % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI
  return {
    status: runtime.status,
    active: true,
    durationSeconds: runtime.durationSeconds,
    progress: rawProgress,
    center: runtime.centerCartographic && {
      longitude: Cesium.Math.toDegrees(runtime.centerCartographic.longitude),
      latitude: Cesium.Math.toDegrees(runtime.centerCartographic.latitude),
      height: runtime.centerCartographic.height,
    },
  }
}

/** 停止环绕飞行并恢复进入前的相机交互配置。 */
export function stopOrbitFlight(viewer: Cesium.Viewer) {
  const runtime = orbitRuntimes.get(viewer)
  if (!runtime) return

  runtime.removeTick?.()
  runtime.removeTick = undefined
  runtime.lastTickAt = undefined
  restoreOrbitCameraControls(runtime, viewer)
  orbitRuntimes.delete(viewer)
  orbitLastNotifiedAt.delete(viewer)
  notifyOrbitFlightStateChange(viewer)
}

/** 使用启动瞬间的视觉中心和视线参数安装持续环绕动画。 */
function startOrbitFlight(viewer: Cesium.Viewer, durationSeconds: number) {
  if (
    viewer.isDestroyed() ||
    viewer.scene.mode !== Cesium.SceneMode.SCENE3D ||
    orbitRuntimes.has(viewer)
  ) {
    return
  }

  const groundCenter = getGroundCenter(viewer)
  if (!groundCenter) return

  const center = Cesium.Cartesian3.fromRadians(
    groundCenter.longitude,
    groundCenter.latitude,
    groundCenter.height,
  )
  const camera = viewer.camera
  const runtime: OrbitRuntime = {
    center,
    axis: viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(center, new Cesium.Cartesian3()),
    offset: Cesium.Cartesian3.subtract(camera.positionWC, center, new Cesium.Cartesian3()),
    direction: Cesium.Cartesian3.clone(camera.directionWC, new Cesium.Cartesian3()),
    up: Cesium.Cartesian3.clone(camera.upWC, new Cesium.Cartesian3()),
    angle: 0,
    durationSeconds: clampOrbitDuration(durationSeconds),
    status: "playing",
    centerCartographic: groundCenter,
  }

  viewer.camera.cancelFlight()
  disableOrbitCameraControls(runtime, viewer)
  orbitRuntimes.set(viewer, runtime)

  const removeListener = viewer.scene.preUpdate.addEventListener(() => {
    if (viewer.isDestroyed() || !orbitRuntimes.has(viewer)) return

    const current = orbitRuntimes.get(viewer)
    if (!current || current.status === "paused") return

    const now = performance.now()
    const deltaSeconds =
      current.lastTickAt === undefined ? 0 : Math.min((now - current.lastTickAt) / 1000, 0.5)
    current.lastTickAt = now

    // 负角度绕本地竖直轴旋转，使相机从上方看按顺时针方向环绕中心点。
    current.angle = (current.angle - (TWO_PI * deltaSeconds) / current.durationSeconds) % TWO_PI
    applyOrbitCamera(viewer, current)
    throttledOrbitProgressNotify(viewer)
  })
  runtime.removeTick = removeListener
  notifyOrbitFlightStateChange(viewer)
}

/** 将环绕周期钳制到合法区间；非法值回退到默认值。 */
function clampOrbitDuration(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ORBIT_DURATION_SECONDS

  return Math.min(MAX_ORBIT_DURATION_SECONDS, Math.max(MIN_ORBIT_DURATION_SECONDS, value))
}

/** 按当前累计角旋转相机位置和视线，保持中心点在屏幕中央。 */
function applyOrbitCamera(viewer: Cesium.Viewer, runtime: OrbitRuntime) {
  const rotation = Cesium.Matrix3.fromQuaternion(
    Cesium.Quaternion.fromAxisAngle(runtime.axis, runtime.angle, scratchOrbitQuaternion),
    scratchOrbitRotation,
  )
  const rotatedOffset = rotateOrbitVector(rotation, runtime.offset, scratchOrbitVector)
  const destination = Cesium.Cartesian3.add(runtime.center, rotatedOffset, scratchOrbitDestination)
  const direction = rotateOrbitVector(rotation, runtime.direction, scratchOrbitDirection)
  const up = rotateOrbitVector(rotation, runtime.up, scratchOrbitUp)

  viewer.camera.setView({
    destination,
    orientation: { direction, up },
  })
}

/** 用同一个旋转矩阵变换三维向量。 */
function rotateOrbitVector(
  rotation: Cesium.Matrix3,
  vector: Cesium.Cartesian3,
  result: Cesium.Cartesian3,
) {
  return Cesium.Matrix3.multiplyByVector(rotation, vector, result)
}

/** 记录并关闭环绕期间的鼠标相机输入。 */
function disableOrbitCameraControls(runtime: OrbitRuntime, viewer: Cesium.Viewer) {
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
  controller.enableTilt = false
  controller.enableLook = false
}

/** 恢复环绕前的鼠标相机输入。 */
function restoreOrbitCameraControls(runtime: OrbitRuntime, viewer: Cesium.Viewer) {
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

export function setCameraState(
  viewer: Cesium.Viewer,
  state: Partial<Omit<CameraState, "longitude" | "latitude">>,
) {
  const camera = viewer.camera
  const current = getCameraState(viewer)
  const nextHeight = clampCameraHeight(state.height ?? current.height)
  const nextHeading =
    state.heading === undefined ? current.heading : normalizeViewportHeading(state.heading)
  const nextPitch = clampNumber(state.pitch ?? current.pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH)
  const position = camera.positionCartographic

  camera.setView({
    destination: Cesium.Cartesian3.fromRadians(position.longitude, position.latitude, nextHeight),
    orientation: {
      heading: Cesium.Math.toRadians(nextHeading),
      pitch: Cesium.Math.toRadians(nextPitch),
      roll: camera.roll,
    },
  })
}

export function flyToCameraState(
  viewer: Cesium.Viewer,
  state: CameraState,
  options: CameraFlightOptions = {},
) {
  if (!isValidCameraState(state)) {
    options.onCancel?.()
    return
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      normalizeLongitude(state.longitude),
      Math.min(90, Math.max(-90, state.latitude)),
      clampCameraHeight(state.height),
    ),
    orientation: {
      heading: Cesium.Math.toRadians(normalizeViewportHeading(state.heading)),
      pitch: Cesium.Math.toRadians(clampNumber(state.pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH)),
      roll: viewer.camera.roll,
    },
    duration: 1.5,
    complete: options.onComplete,
    cancel: options.onCancel,
  })
}

export function resetCameraNorth(viewer: Cesium.Viewer, duration = 5) {
  const camera = viewer.camera

  camera.flyTo({
    destination: camera.position,
    orientation: {
      heading: 0,
      pitch: camera.pitch,
      roll: camera.roll,
    },
    duration,
  })
}

export function onCameraHeadingChange(viewer: Cesium.Viewer, listener: (heading: number) => void) {
  const removeListener = viewer.scene.preUpdate.addEventListener(() => {
    listener(getCameraHeading(viewer))
  })

  return () => {
    removeListener()
  }
}

export function onCameraStateChange(viewer: Cesium.Viewer, listener: (state: CameraState) => void) {
  let lastNotifyTime = 0
  const removeListener = viewer.scene.preUpdate.addEventListener(() => {
    const now = performance.now()

    // 相机参数面板不需要逐帧刷新，节流后仍足以实时反映滑块和地图拖动。
    if (now - lastNotifyTime < 100) return

    lastNotifyTime = now
    listener(getCameraState(viewer))
  })

  return () => {
    removeListener()
  }
}

/** 节流监听分屏同步视口状态变化。 */
export function onViewportStateChange(
  viewer: Cesium.Viewer,
  listener: (state: ViewportState) => void,
) {
  let lastNotifyTime = 0
  const removeListener = viewer.scene.preUpdate.addEventListener(() => {
    const now = performance.now()
    if (now - lastNotifyTime < 100) return

    lastNotifyTime = now
    listener(getViewportState(viewer))
  })

  return () => {
    removeListener()
  }
}

export function getGroundCenter(viewer: Cesium.Viewer) {
  const canvas = viewer.canvas

  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return undefined

  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  const pickRay = viewer.camera.getPickRay(center)

  if (pickRay) {
    const groundPosition = viewer.scene.globe.pick(pickRay, viewer.scene)

    if (groundPosition) {
      return Cesium.Cartographic.fromCartesian(groundPosition)
    }
  }

  const ellipsoidPosition = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid)

  if (ellipsoidPosition) {
    return Cesium.Cartographic.fromCartesian(ellipsoidPosition)
  }

  return Cesium.Cartographic.fromCartesian(viewer.camera.positionWC)
}

function renderScreenshotCanvas(viewer: Cesium.Viewer) {
  const canvas = viewer.canvas

  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    console.warn("[Cesium] 场景截屏画布不可用", {
      hasCanvas: Boolean(canvas),
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
    })
    return undefined
  }

  try {
    viewer.scene.render()

    return canvas
  } catch (error) {
    console.warn("[Cesium] 场景截屏渲染失败", error)
    return undefined
  }
}

export function captureScreenshot(viewer: Cesium.Viewer) {
  const canvas = renderScreenshotCanvas(viewer)

  return canvas ? exportCanvasToDataUrl(canvas, "image/png") : undefined
}

export function captureScreenshotThumbnail(viewer: Cesium.Viewer) {
  const canvas = renderScreenshotCanvas(viewer)

  return canvas ? createThumbnailFromCanvas(canvas) : undefined
}

function isValidCoordinate(coordinate: MapCoordinate) {
  const { longitude, latitude } = coordinate

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  )
}

function isValidCameraState(state: CameraState) {
  return (
    isValidCoordinate(state) &&
    Number.isFinite(state.height) &&
    Number.isFinite(state.heading) &&
    Number.isFinite(state.pitch)
  )
}

function isValidViewportState(state: ViewportState) {
  return (
    isValidCoordinate(state) &&
    Number.isFinite(state.distanceMeters) &&
    state.distanceMeters >= 0 &&
    Number.isFinite(state.heading)
  )
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}
