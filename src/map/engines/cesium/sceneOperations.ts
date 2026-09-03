import * as Cesium from "cesium"
import type { SceneMode } from "../../types"
import { MAX_CAMERA_HEIGHT, MIN_CAMERA_HEIGHT } from "../../cameraLimits"
import { getGroundCenter, resetCameraNorth } from "./cameraOperations"

// Keep the controller state that was active before north lock was enabled so
// toggling the feature does not unexpectedly change other camera settings.
const northLockPreviousRotateState = new WeakMap<Cesium.Viewer, boolean>()

export function configureScene(viewer: Cesium.Viewer) {
  updateCameraZoomLimits(viewer)
  viewer.scene.preUpdate.addEventListener(() => updateCameraZoomLimits(viewer))

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
  const sceneMode = mode === "2d" ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D

  if (viewer.scene.mode === sceneMode) return

  // Cesium 零动画切换以相机位置为基准，倾斜视角下屏幕中心会偏移；
  // 因此切换前记录地面中心，切换后按当前 2D 视野宽度重新定位。
  const groundCenter = mode === "2d" ? getGroundCenter(viewer) : undefined

  viewer.scene.mode = sceneMode

  if (!groundCenter) return

  const viewHeight = viewer.camera.positionCartographic.height

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(groundCenter.longitude),
      Cesium.Math.toDegrees(groundCenter.latitude),
      viewHeight,
    ),
  })
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

function updateCameraZoomLimits(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController

  if (viewer.scene.mode !== Cesium.SceneMode.SCENE2D) {
    controller.minimumZoomDistance = MIN_CAMERA_HEIGHT
    controller.maximumZoomDistance = MAX_CAMERA_HEIGHT
    return
  }

  // 2D 的 zoom distance 使用视口较大边，而相机高度语义是视野宽度。
  const canvas = viewer.canvas
  const viewportRatio =
    canvas.clientWidth > 0 && canvas.clientHeight > 0
      ? Math.max(1, canvas.clientHeight / canvas.clientWidth)
      : 1

  controller.minimumZoomDistance = MIN_CAMERA_HEIGHT * viewportRatio
  controller.maximumZoomDistance = MAX_CAMERA_HEIGHT * viewportRatio
}
