import * as Cesium from "cesium"
import type { SceneMode } from "../../types"
import { MAX_CAMERA_HEIGHT, MIN_CAMERA_HEIGHT } from "../../cameraLimits"
import { resetCameraNorth, setCameraState } from "./cameraOperations"

// Keep the controller state that was active before north lock was enabled so
// toggling the feature does not unexpectedly change other camera settings.
const northLockPreviousRotateState = new WeakMap<Cesium.Viewer, boolean>()

// 相机最远缩放限制（米）：滚轮/右键拖拽缩小到该相机高度后不再远离地表，防止"飞出太空看到整个地球"。
// 数值与 deck 引擎 DeckMapEngine 的 MIN_ZOOM = 3 视野量级对齐：
//   deck zoom 6 ≈ 广西全省视野（相当于 Cesium 相机高度约 700 km），zoom 每减 1 视野翻倍，
//   zoom 3 比 zoom 6 远 2^3 = 8 倍，700 km × 8 = 5600 km，取整为 5000 km。
// 该值远大于"回到广西"矩形视图所需相机高度（约 1200 km），setInitialCamera / flyToBounds 不受影响。
// Cesium 的最小/最大 zoom distance 也基于地心距离；随后逐帧按椭球海拔精确修正。
export function configureScene(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController
  const ellipsoid = viewer.scene.globe.ellipsoid

  // Cesium 的 zoom distance 表示相机到地心的距离，必须叠加地球半径才是海拔高度。
  controller.minimumZoomDistance = ellipsoid.minimumRadius + MIN_CAMERA_HEIGHT
  controller.maximumZoomDistance = ellipsoid.maximumRadius + MAX_CAMERA_HEIGHT
  viewer.scene.preUpdate.addEventListener(() => enforceCameraHeightLimits(viewer))

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

function enforceCameraHeightLimits(viewer: Cesium.Viewer) {
  const currentHeight = viewer.camera.positionCartographic.height
  if (!Number.isFinite(currentHeight)) return

  const height = Math.min(MAX_CAMERA_HEIGHT, Math.max(MIN_CAMERA_HEIGHT, currentHeight))

  if (height === currentHeight) return

  setCameraState(viewer, { height })
}
