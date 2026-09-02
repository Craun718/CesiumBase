import * as Cesium from "cesium"
import type { MapBounds } from "../../types"

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

function normalizeHeading(heading: number) {
  const degrees = ((heading % 360) + 360) % 360

  return degrees === 360 ? 0 : degrees
}

export function getCameraHeading(viewer: Cesium.Viewer) {
  return normalizeHeading(Cesium.Math.toDegrees(viewer.camera.heading))
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
