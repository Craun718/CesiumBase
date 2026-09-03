import * as Cesium from "cesium"
import type { CoordinateReadout } from "../../types"
import { getGroundCenter } from "./cameraOperations"

export function getPointerReadout(
  viewer: Cesium.Viewer,
  windowPosition: Cesium.Cartesian2,
): CoordinateReadout {
  const pickedPosition = viewer.scene.pickPositionSupported
    ? viewer.scene.pickPosition(windowPosition)
    : undefined

  if (pickedPosition) {
    return toReadout(Cesium.Cartographic.fromCartesian(pickedPosition), "pointer")
  }

  const pickRay = viewer.camera.getPickRay(windowPosition)
  const surfacePosition = pickRay ? viewer.scene.globe.pick(pickRay, viewer.scene) : undefined

  if (surfacePosition) {
    return toReadout(Cesium.Cartographic.fromCartesian(surfacePosition), "pointer")
  }

  const ellipsoidPosition = viewer.camera.pickEllipsoid(
    windowPosition,
    viewer.scene.globe.ellipsoid,
  )

  if (ellipsoidPosition) {
    return toReadout(Cesium.Cartographic.fromCartesian(ellipsoidPosition), "pointer")
  }

  return getViewReadout(viewer)
}

export function getViewReadout(viewer: Cesium.Viewer): CoordinateReadout {
  const center = getGroundCenter(viewer)

  if (center) {
    return toReadout(center, "view")
  }

  return getCameraReadout(viewer)
}

function getCameraReadout(viewer: Cesium.Viewer): CoordinateReadout {
  return toReadout(viewer.camera.positionCartographic, "view")
}

function toReadout(
  position: Cesium.Cartographic,
  source: CoordinateReadout["source"],
): CoordinateReadout {
  const longitude = Cesium.Math.toDegrees(position.longitude)

  return {
    longitude: ((((longitude + 180) % 360) + 360) % 360) - 180,
    latitude: Cesium.Math.toDegrees(position.latitude),
    height: position.height,
    source,
  }
}
