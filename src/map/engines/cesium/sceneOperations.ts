import * as Cesium from "cesium"
import type { SceneMode } from "../../types"
import { clampCameraHeight, MAX_CAMERA_HEIGHT, MIN_CAMERA_HEIGHT } from "../../cameraLimits"
import { getGroundCenter, resetCameraNorth } from "./cameraOperations"

// Keep the controller state that was active before north lock was enabled so
// toggling the feature does not unexpectedly change other camera settings.
const northLockPreviousRotateState = new WeakMap<Cesium.Viewer, boolean>()

// 记录待完成的 2D 切换，避免相机飞行途中再次切换时旧回调继续生效。
const pending2DTransitionTokens = new WeakMap<Cesium.Viewer, object>()

// 地下模式需要临时改写场景显示与相机控制；这里保存进入前的状态供退出时还原。
type UndergroundSceneState = {
  collisionDetectionEnabled: boolean
  depthTestAgainstTerrain: boolean
  translucencyEnabled: boolean
  frontFaceAlpha: number
  backFaceAlpha: number
}

const undergroundPreviousStates = new WeakMap<Cesium.Viewer, UndergroundSceneState>()

/** 3D 转 2D 前的俯视运镜时长，单位秒。 */
const SCENE_MORPH_DURATION = 1.2

/** 地下模式下的地表透明度；保留轮廓感，避免地图空间完全消失。 */
const UNDERGROUND_FRONT_FACE_ALPHA = 0.55
const UNDERGROUND_BACK_FACE_ALPHA = 0.15

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

  if (mode === "2d") {
    transitionTo2DWithCameraMove(viewer)
    return
  }

  cancelPending2DTransition(viewer)
  viewer.scene.mode = sceneMode
}

function transitionTo2DWithCameraMove(viewer: Cesium.Viewer) {
  // Cesium 零动画切换以相机位置为基准，倾斜视角下屏幕中心会偏移；
  // 先把当前中心点飞成正上方俯视，再切 2D 可同时获得过渡并保持视野中心。
  const groundCenter = getGroundCenter(viewer)

  if (!groundCenter) {
    cancelPending2DTransition(viewer)
    viewer.scene.mode = Cesium.SceneMode.SCENE2D
    return
  }

  cancelPending2DTransition(viewer)
  const token = {}
  pending2DTransitionTokens.set(viewer, token)
  const viewHeight = clampCameraHeight(viewer.camera.positionCartographic.height)

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(groundCenter.longitude),
      Cesium.Math.toDegrees(groundCenter.latitude),
      viewHeight,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
    duration: SCENE_MORPH_DURATION,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    complete: () => {
      if (pending2DTransitionTokens.get(viewer) !== token) return

      pending2DTransitionTokens.delete(viewer)
      if (viewer.isDestroyed()) return

      viewer.scene.mode = Cesium.SceneMode.SCENE2D

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          Cesium.Math.toDegrees(groundCenter.longitude),
          Cesium.Math.toDegrees(groundCenter.latitude),
          viewHeight,
        ),
      })
    },
    cancel: () => {
      if (pending2DTransitionTokens.get(viewer) === token) {
        pending2DTransitionTokens.delete(viewer)
      }
    },
  })
}

function cancelPending2DTransition(viewer: Cesium.Viewer) {
  pending2DTransitionTokens.delete(viewer)
  viewer.camera.cancelFlight()
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

export function setUndergroundMode(viewer: Cesium.Viewer, enabled: boolean) {
  const globe = viewer.scene.globe
  const controller = viewer.scene.screenSpaceCameraController

  if (!enabled) {
    const previousState = undergroundPreviousStates.get(viewer)
    if (!previousState) return

    controller.enableCollisionDetection = previousState.collisionDetectionEnabled
    globe.depthTestAgainstTerrain = previousState.depthTestAgainstTerrain
    globe.translucency.enabled = previousState.translucencyEnabled
    globe.translucency.frontFaceAlpha = previousState.frontFaceAlpha
    globe.translucency.backFaceAlpha = previousState.backFaceAlpha
    undergroundPreviousStates.delete(viewer)
    return
  }

  if (undergroundPreviousStates.has(viewer)) return

  undergroundPreviousStates.set(viewer, {
    collisionDetectionEnabled: controller.enableCollisionDetection,
    depthTestAgainstTerrain: globe.depthTestAgainstTerrain,
    translucencyEnabled: globe.translucency.enabled,
    frontFaceAlpha: globe.translucency.frontFaceAlpha,
    backFaceAlpha: globe.translucency.backFaceAlpha,
  })

  controller.enableCollisionDetection = false
  globe.depthTestAgainstTerrain = false
  globe.translucency.enabled = true
  globe.translucency.frontFaceAlpha = UNDERGROUND_FRONT_FACE_ALPHA
  globe.translucency.backFaceAlpha = UNDERGROUND_BACK_FACE_ALPHA
}

function updateCameraZoomLimits(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController

  if (viewer.scene.mode !== Cesium.SceneMode.SCENE2D) {
    // 地下模式必须允许镜头推进到地表高度以下；碰撞检测关闭后由 0 下限接管。
    controller.minimumZoomDistance = undergroundPreviousStates.has(viewer) ? 0 : MIN_CAMERA_HEIGHT
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
