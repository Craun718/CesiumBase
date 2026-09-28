import * as Cesium from "cesium"
import type { MapRenderingProfile, SceneMode, SceneModeTransitionOptions } from "@/map/types"
import { clampCameraHeight, MAX_CAMERA_HEIGHT, MIN_CAMERA_HEIGHT } from "@/map/cameraLimits"
import { getGroundCenter, resetCameraNorth, stopOrbitFlight } from "./cameraOperations.js"
import { DEEP_BACK } from "@/map/themeColors"

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

/** 在清晰度和瓦片数量间偏性能；默认 2 会在放大时请求更多高细节瓦片。 */
const GLOBE_MAXIMUM_SCREEN_SPACE_ERROR = 2.5

/** 保留更多已加载地球瓦片，减少缩放往返时的高细节瓦片重复请求。 */
const GLOBE_TILE_CACHE_SIZE = 300

/** 分屏辅助视口放宽瓦片误差，减少缩放过程中的高细节瓦片调度。 */
const SECONDARY_GLOBE_MAXIMUM_SCREEN_SPACE_ERROR = 4

/** 分屏辅助视口降低瓦片缓存，优先减少双 Viewer 的显存与内存压力。 */
const SECONDARY_GLOBE_TILE_CACHE_SIZE = 100

export function configureScene(
  viewer: Cesium.Viewer,
  renderingProfile: MapRenderingProfile = "primary",
) {
  const isSecondary = renderingProfile === "secondary"

  updateCameraZoomLimits(viewer)
  viewer.scene.preUpdate.addEventListener(() => updateCameraZoomLimits(viewer))

  disableRightDragCameraControl(viewer)
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(DEEP_BACK)
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(DEEP_BACK)
  viewer.scene.globe.showGroundAtmosphere = !isSecondary
  viewer.scene.globe.maximumScreenSpaceError = isSecondary
    ? SECONDARY_GLOBE_MAXIMUM_SCREEN_SPACE_ERROR
    : GLOBE_MAXIMUM_SCREEN_SPACE_ERROR
  viewer.scene.globe.tileCacheSize = isSecondary
    ? SECONDARY_GLOBE_TILE_CACHE_SIZE
    : GLOBE_TILE_CACHE_SIZE

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = !isSecondary
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

  viewer.scene.fog.enabled = !isSecondary
}

/** 将场景缩放距离限制同步到共享相机高度范围。 */
function updateCameraZoomLimits(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController
  controller.minimumZoomDistance = MIN_CAMERA_HEIGHT
  controller.maximumZoomDistance = MAX_CAMERA_HEIGHT
}

/** 禁用鼠标右键拖动的相机操作（缩放/倾斜），滚轮与触摸捏合缩放不受影响。 */
function disableRightDragCameraControl(viewer: Cesium.Viewer) {
  const controller = viewer.scene.screenSpaceCameraController

  const withoutRightDrag = (eventTypes: Cesium.CameraEventType | any[] | undefined) =>
    Array.isArray(eventTypes)
      ? eventTypes.filter((eventType) =>
          typeof eventType === "object"
            ? eventType.eventType !== Cesium.CameraEventType.RIGHT_DRAG
            : eventType !== Cesium.CameraEventType.RIGHT_DRAG,
        )
      : eventTypes

  controller.zoomEventTypes = withoutRightDrag(controller.zoomEventTypes)
  controller.tiltEventTypes = withoutRightDrag(controller.tiltEventTypes)
}

export function setSceneMode(
  viewer: Cesium.Viewer,
  mode: SceneMode,
  options?: SceneModeTransitionOptions,
) {
  const sceneMode = mode === "2d" ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D

  if (viewer.scene.mode === sceneMode) return

  if (mode === "2d") {
    stopOrbitFlight(viewer)
    if (options?.immediate) {
      cancelPending2DTransition(viewer)
      viewer.scene.mode = sceneMode
      return
    }
    transitionTo2DWithCameraMove(viewer)
    return
  }

  cancelPending2DTransition(viewer)
  viewer.scene.morphTo3D(0)
}

function transitionTo2DWithCameraMove(viewer: Cesium.Viewer) {
  // Cesium 零动画切换以相机位置为基准，倾斜视角下屏幕中心会偏移；
  // 先把当前中心点飞成正上方俯视，再切 2D 可同时获得过渡并保持视野中心。
  const groundCenter = getGroundCenter(viewer)

  if (!groundCenter) {
    cancelPending2DTransition(viewer)
    viewer.scene.morphTo2D(0)
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

      viewer.scene.morphTo2D(0)

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

/** 开启或关闭地下浏览，并恢复进入前的地表渲染与相机控制状态。 */
export function setUndergroundMode(viewer: Cesium.Viewer, enabled: boolean) {
  if (viewer.isDestroyed()) return

  if (enabled) {
    if (undergroundPreviousStates.has(viewer)) return

    const scene = viewer.scene
    const globe = scene.globe
    const controller = scene.screenSpaceCameraController
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
    return
  }

  const previous = undergroundPreviousStates.get(viewer)
  if (!previous) return

  viewer.scene.screenSpaceCameraController.enableCollisionDetection =
    previous.collisionDetectionEnabled
  viewer.scene.globe.depthTestAgainstTerrain = previous.depthTestAgainstTerrain
  viewer.scene.globe.translucency.enabled = previous.translucencyEnabled
  viewer.scene.globe.translucency.frontFaceAlpha = previous.frontFaceAlpha
  viewer.scene.globe.translucency.backFaceAlpha = previous.backFaceAlpha
  undergroundPreviousStates.delete(viewer)
}

export function setNorthLock(viewer: Cesium.Viewer, enabled: boolean) {
  if (viewer.isDestroyed()) return

  const controller = viewer.scene.screenSpaceCameraController

  if (enabled) {
    stopOrbitFlight(viewer)
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
