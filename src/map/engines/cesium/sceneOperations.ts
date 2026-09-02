import * as Cesium from "cesium"
import type { SceneMode } from "../../types"
import { resetCameraNorth } from "./cameraOperations"

// Keep the controller state that was active before north lock was enabled so
// toggling the feature does not unexpectedly change other camera settings.
const northLockPreviousRotateState = new WeakMap<Cesium.Viewer, boolean>()

export function configureScene(viewer: Cesium.Viewer) {
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030a18")
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#081b35")
  viewer.scene.globe.showGroundAtmosphere = true

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true
  }

  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false
  }

  if (viewer.scene.sun) {
    viewer.scene.sun.show = false
  }

  if (viewer.scene.moon) {
    viewer.scene.moon.show = false
  }

  viewer.scene.fog.enabled = true
}

export function setSceneMode(viewer: Cesium.Viewer, mode: SceneMode) {
  viewer.scene.mode = mode === "2d" ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D
}

export function setRotateBrowse(_viewer: Cesium.Viewer, _enabled: boolean) {}

export function setNorthLock(viewer: Cesium.Viewer, enabled: boolean) {
  if (viewer.isDestroyed()) return

  const controller = viewer.scene.screenSpaceCameraController

  if (enabled) {
    // Preserve the pre-lock state only once; repeated calls while locked must
    // not overwrite it with `false`.
    if (!northLockPreviousRotateState.has(viewer)) {
      northLockPreviousRotateState.set(viewer, controller.enableRotate)
    }

    controller.enableRotate = false
    resetCameraNorth(viewer, 3)
    return
  }

  const previousRotateState = northLockPreviousRotateState.get(viewer)

  // If there was no matching enable call, leave the controller untouched.
  if (previousRotateState === undefined) return

  // Unlocking should not leave a pending five-second flight that continues to
  // pull the camera back toward north after rotation has been re-enabled.
  viewer.camera.cancelFlight()
  controller.enableRotate = previousRotateState
  northLockPreviousRotateState.delete(viewer)
}

export function setTerrainExaggeration(viewer: Cesium.Viewer, enabled: boolean, scale: number) {
  viewer.scene.verticalExaggeration = enabled ? Math.max(scale, 1) : 1
}

export function setTerrainExaggerationScale(viewer: Cesium.Viewer, scale: number) {
  viewer.scene.verticalExaggeration = Math.max(scale, 1)
}
