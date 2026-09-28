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
  const pickedReadout = toCartographic(pickedPosition)

  if (pickedReadout) {
    return toReadout(pickedReadout, "pointer")
  }

  const pickRay = viewer.camera.getPickRay(windowPosition)
  const surfacePosition = pickRay ? viewer.scene.globe.pick(pickRay, viewer.scene) : undefined
  const surfaceReadout = toCartographic(surfacePosition)

  if (surfaceReadout) {
    return toReadout(surfaceReadout, "pointer")
  }

  const ellipsoidPosition = viewer.camera.pickEllipsoid(
    windowPosition,
    viewer.scene.globe.ellipsoid,
  )
  const ellipsoidReadout = toCartographic(ellipsoidPosition)

  if (ellipsoidReadout) {
    return toReadout(ellipsoidReadout, "pointer")
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

/** 只接受分量均为有限数值的笛卡尔坐标，避免把 NaN 交给 Cesium 抛异常。 */
function toCartographic(position: Cesium.Cartesian3 | undefined): Cesium.Cartographic | undefined {
  if (
    !position ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return undefined
  }

  return Cesium.Cartographic.fromCartesian(position)
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
