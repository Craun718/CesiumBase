import * as Cesium from "cesium"
import type { CameraFlightOptions, CameraState, MapBounds, MapCoordinate } from "../../types"
import { clampCameraHeight } from "../../cameraLimits"
import { createThumbnailFromCanvas, exportCanvasToDataUrl } from "../../screenshotThumbnail"

const MIN_CAMERA_PITCH = -89.9
const MAX_CAMERA_PITCH = 89.9

export function setInitialCamera(viewer: Cesium.Viewer) {
  // Bounds derived from the Guangxi city boundary GeoJSON.
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(105, 21, 112.0569, 26.5),
  })
}

export function flyToBounds(viewer: Cesium.Viewer, bounds: MapBounds) {
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
    duration: 1,
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

function normalizeHeading(heading: number) {
  const degrees = ((heading % 360) + 360) % 360

  return degrees === 360 ? 0 : degrees
}

export function getCameraHeading(viewer: Cesium.Viewer) {
  return normalizeHeading(Cesium.Math.toDegrees(viewer.camera.heading))
}

export function getCameraState(viewer: Cesium.Viewer): CameraState {
  const position = viewer.camera.positionCartographic

  return {
    longitude: normalizeLongitude(Cesium.Math.toDegrees(position.longitude)),
    latitude: Cesium.Math.toDegrees(position.latitude),
    height: position.height,
    heading: getCameraHeading(viewer),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
  }
}

export function setCameraHeading(viewer: Cesium.Viewer, heading: number) {
  if (!Number.isFinite(heading)) return

  const camera = viewer.camera

  camera.setView({
    destination: camera.position,
    orientation: {
      heading: Cesium.Math.toRadians(normalizeHeading(heading)),
      pitch: camera.pitch,
      roll: camera.roll,
    },
  })
}

export function setCameraState(
  viewer: Cesium.Viewer,
  state: Partial<Omit<CameraState, "longitude" | "latitude">>,
) {
  const camera = viewer.camera
  const current = getCameraState(viewer)
  const nextHeight = clampCameraHeight(state.height ?? current.height)
  const nextHeading =
    state.heading === undefined ? current.heading : normalizeHeading(state.heading)
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
      heading: Cesium.Math.toRadians(normalizeHeading(state.heading)),
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

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}
