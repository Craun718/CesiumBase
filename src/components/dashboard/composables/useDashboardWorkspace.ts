import { onScopeDispose, reactive, ref } from "vue"
import { useMapController } from "../../../map"
import type { MeasurementMode } from "../../../map"
import { useLocalStore } from "../../../stores"
import type { MapOperationId, ViewOperationId } from "../mapControls"
import { useCoordinateReadout } from "./useCoordinateReadout"
import { useDrawing3DControls } from "./useDrawing3DControls"
import { useDrawingControls } from "./useDrawingControls"
import { useLayerWorkspace } from "./useLayerWorkspace"
import { useMeasurementControls } from "./useMeasurementControls"
import { useSceneControls } from "./useSceneControls"
import { useViewControls } from "./useViewControls"
import { handleCompareEscape, resolveWorkspaceEscapePriority } from "./compareVisibility"

/** 大屏工作区组合根：装配功能域并集中处理跨域互斥。 */
export function useDashboardWorkspace() {
  const mapController = useMapController()
  const localStore = useLocalStore()

  const scene = useSceneControls(mapController)
  const view = useViewControls(mapController)
  const measurement = useMeasurementControls(mapController)
  const drawing2d = useDrawingControls(mapController)
  const drawing3d = useDrawing3DControls(mapController)
  const layers = useLayerWorkspace(mapController, scene)
  const compare = layers.compare
  const readout = useCoordinateReadout(mapController)
  const engineReady = ref(false)

  /** 关闭二维和三维绘制面板。 */
  function closeDrawingPanels() {
    drawing2d.closePanel()
    drawing3d.closePanel()
  }

  /** 响应左侧地图操作菜单。 */
  function activateMapOperation(operationId: MapOperationId) {
    if (
      operationId === "scene-mode" &&
      compare.compareUnavailableReason("scene-switch") !== undefined
    ) {
      return
    }
    if (scene.isOperationDisabled(operationId)) return

    if (operationId === "scene-mode") {
      const nextMode = scene.sceneMode === "3d" ? "2d" : "3d"
      if (nextMode === "2d" && view.orbitFlightEnabled) view.stopOrbitFlight()
      scene.setSceneMode(nextMode)
      return
    }

    if (operationId === "rotate-browse") {
      scene.toggleRotateBrowse()
      return
    }

    if (operationId === "north-lock") {
      if (!scene.northLocked && view.orbitFlightEnabled) view.stopOrbitFlight()
      scene.setNorthLock(!scene.northLocked)
      return
    }

    if (operationId === "terrain") {
      closeDrawingPanels()
      scene.enableTerrain()
      return
    }

    if (operationId === "underground") {
      scene.toggleUnderground()
      return
    }

    scene.toggleCompass()
  }

  /** 响应右侧视角操作菜单。 */
  function activateViewOperation(operationId: ViewOperationId) {
    const compareDisabledReason = getViewOperationCompareReason(operationId)
    if (compareDisabledReason !== undefined) return

    if (operationId === "view-swipe-compare") {
      if (compare.mode === "swipe") {
        void compare.exitSwipeCompare()
        return
      }

      view.closeRegularPanels()
      if (view.orbitFlightEnabled) view.stopOrbitFlight()
      closeDrawingPanels()
      measurement.closePanel()
      scene.closeTerrainPanel()
      layers.closeLayerTree()
      void compare.startSwipeCompare()
      return
    }

    if (operationId === "view-split-compare") {
      if (compare.mode === "split") {
        void compare.exitSplitCompare()
        return
      }

      view.closeRegularPanels()
      if (view.orbitFlightEnabled) view.stopOrbitFlight()
      closeDrawingPanels()
      measurement.closePanel()
      scene.closeTerrainPanel()
      layers.closeLayerTree()
      void compare.startSplitCompare()
      return
    }

    if (operationId === "view-orbit-flight" && scene.sceneMode === "2d") return

    if (
      operationId === "view-position" ||
      operationId === "view-camera" ||
      operationId === "view-favorites" ||
      operationId === "view-flight"
    ) {
      if (view.orbitFlightEnabled) view.stopOrbitFlight()
      view.openPanel(operationId)
      return
    }

    if (operationId === "view-fullscreen") {
      view.toggleFullscreen()
      return
    }

    if (operationId === "view-center") {
      view.toggleViewCenter()
      return
    }

    if (operationId === "view-orbit-flight") {
      const nextOpen = !view.orbitFlightOpen
      view.closeRegularPanels()

      if (nextOpen) {
        if (scene.northLocked) scene.setNorthLock(false)
        if (scene.rotateEnabled) scene.toggleRotateBrowse()
        view.startOrbitFlight(localStore.orbitPreferences.durationSeconds)
        return
      }

      view.stopOrbitFlight()
      return
    }

    view.captureScreenshot()
  }

  /** 打开二维绘制面板，并关闭互斥的测量与地形面板。 */
  function openDrawingPanel() {
    if (compare.compareUnavailableReason("drawing") !== undefined) return
    if (drawing2d.open) return

    measurement.closePanel()
    scene.closeTerrainPanel()
    drawing2d.openPanel()
  }

  /** 打开三维绘制面板，并关闭互斥的测量与地形面板。 */
  function openDrawing3DPanel() {
    if (compare.compareUnavailableReason("drawing") !== undefined) return
    if (drawing3d.open) return

    measurement.closePanel()
    scene.closeTerrainPanel()
    drawing3d.openPanel()
  }

  /** 打开测量面板，并退出二维 / 三维绘制。 */
  function activateMeasurement(operationId: MeasurementMode) {
    if (compare.compareUnavailableReason("measurement") !== undefined) return
    closeDrawingPanels()
    measurement.activate(operationId)
  }

  /** 读取视角操作在当前比对模式下的禁用原因。 */
  function getViewOperationCompareReason(operationId: ViewOperationId) {
    if (operationId === "view-swipe-compare") return compare.compareUnavailableReason("swipe")
    if (operationId === "view-split-compare") return compare.compareUnavailableReason("split")
    if (operationId === "view-screenshot") return compare.compareUnavailableReason("screenshot")
    if (operationId === "view-orbit-flight") return compare.compareUnavailableReason("roaming")
    if (
      operationId === "view-position" ||
      operationId === "view-camera" ||
      operationId === "view-favorites" ||
      operationId === "view-flight"
    ) {
      return compare.compareUnavailableReason("flight")
    }

    return undefined
  }

  /** 将相机复位到广西全域。 */
  function returnToGuangxi() {
    mapController.returnToGuangxi()
  }

  /**
   * 全局 ESC 快捷键优先级：
   * 比对模式 → 三维绘制模式 → 三维选中态 → 二维绘制模式 → 二维选中态。
   */
  function handleDrawingEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    const escapePriority = resolveWorkspaceEscapePriority(compare.mode, event.target)
    if (escapePriority === "editable") return

    if (
      handleCompareEscape(
        event,
        compare.mode,
        () => void compare.exitSwipeCompare(),
        () => void compare.exitSplitCompare(),
      )
    ) {
      return
    }

    if (drawing3d.state.mode !== null) {
      event.preventDefault()
      drawing3d.closePanel()
      return
    }

    if (drawing3d.state.selectedFeatureId !== null) {
      event.preventDefault()
      drawing3d.selectFeature(null)
      return
    }

    if (drawing2d.state.mode !== null) {
      event.preventDefault()
      drawing2d.closePanel()
      return
    }

    if (drawing2d.state.selectedFeatureId !== null) {
      event.preventDefault()
      drawing2d.selectFeature(null)
    }
  }

  onScopeDispose(
    mapController.onMountStateChange((ready) => {
      engineReady.value = ready
      if (!ready) return

      drawing2d.restore()
      drawing3d.restore()
      layers.consumePendingFlyToResource()
    }),
  )

  onScopeDispose(
    mapController.onFlightPlaybackStateChange((state) => {
      if (state.status !== "idle" && mapController.getOrbitFlightState().status !== "idle") {
        view.stopOrbitFlight()
      }
    }),
  )

  if (typeof document !== "undefined") {
    document.addEventListener("keydown", handleDrawingEscape)
    onScopeDispose(() => {
      document.removeEventListener("keydown", handleDrawingEscape)
    })
  }

  return reactive({
    ready: engineReady,
    scene,
    view,
    measurement,
    drawing2d,
    drawing3d,
    layers,
    compare,
    readout,
    activateMapOperation,
    activateViewOperation,
    openDrawingPanel,
    openDrawing3DPanel,
    activateMeasurement,
    returnToGuangxi,
    handleDrawingEscape,
  })
}

export type DashboardControls = ReturnType<typeof useDashboardWorkspace>
