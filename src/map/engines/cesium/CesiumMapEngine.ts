import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics"
import type {
  CameraFlightOptions,
  CameraState,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  ImagerySource,
  MapClickListener,
  MapCoordinate,
  MapBounds,
  MapDrawFeature,
  MapDrawGeometryType,
  MapEngine,
  MapDrawState,
  MeasurementMode,
  MeasurementState,
  SceneMode,
  TerrainSource,
} from "../../types"
import { createViewer } from "./createViewer"
import { installCesiumDiagnostics } from "./diagnostics"
import {
  getCameraHeading,
  captureScreenshot,
  captureScreenshotThumbnail,
  flyToCameraState,
  flyToCoordinate,
  flyToBounds,
  getCameraState,
  onCameraHeadingChange,
  onCameraStateChange,
  resetCameraNorth,
  setCameraHeading,
  setCameraState,
  setInitialCamera,
} from "./cameraOperations"
import { getPointerReadout, getViewReadout } from "./pointerReadout"
import {
  clearFlightRoutePreview,
  destroyFlight,
  getFlightPlaybackState,
  onFlightPlaybackStateChange,
  pauseFlight,
  pickFlightCoordinate,
  resumeFlight,
  seekFlight,
  setFlightRoutePreview,
  startFlight,
  stopFlight,
  updateFlightPlayback,
} from "./flightOperations"
import {
  configureScene,
  setNorthLock,
  setRotateBrowse,
  setSceneMode,
  setTerrainExaggeration,
  setTerrainExaggerationScale,
  setUndergroundMode,
} from "./sceneOperations"
import { addProvinceBoundaries } from "./provinceBoundaries"
import {
  applyCesiumCustomUrlSource,
  applyCesiumImagerySource,
  getCurrentCesiumImagerySourceId,
} from "./baseImagery"
import { listCesiumImagerySources } from "./imagerySources"
import { applyCesiumTerrainProvider, createCesiumTerrainProvider } from "./terrainSources"
import { CesiumDrawingController } from "./drawingOperations"
import { CesiumMeasurementController } from "./measurementOperations"

export class CesiumMapEngine implements MapEngine {
  private viewer?: Cesium.Viewer
  private pointerHandler?: Cesium.ScreenSpaceEventHandler
  private readonly drawingController = new CesiumDrawingController()
  private disposePointerReadout?: () => void
  private coordinateReadout?: CoordinateReadout
  private lastPointerPosition?: { x: number; y: number }
  private coordinateReadoutRefreshedAt = 0
  private terrainSourceGeneration = 0
  private measurementController?: CesiumMeasurementController
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()
  private readonly mapClickListeners = new Set<MapClickListener>()
  private readonly measurementStateListeners = new Set<(state: MeasurementState) => void>()

  async mount(container: HTMLElement) {
    if (this.viewer) return

    logMapDiagnostic("cesium-engine:mount:start", {
      container: [container.clientWidth, container.clientHeight],
    })

    const viewer = await createViewer(container)
    this.viewer = viewer

    installCesiumDiagnostics(viewer)
    configureScene(viewer)
    setInitialCamera(viewer)
    void addProvinceBoundaries(viewer)

    this.measurementController = new CesiumMeasurementController(viewer, (state) => {
      for (const listener of this.measurementStateListeners) {
        listener(state)
      }
    })
    this.pointerHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    this.pointerHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      if (this.drawingController.getDrawingState().mode !== null) return

      const coordinate = pickFlightCoordinate(viewer, position)
      if (!coordinate) return

      for (const listener of this.mapClickListeners) {
        listener(coordinate)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    this.drawingController.mount(viewer)
    this.pointerHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
      this.lastPointerPosition = { x: endPosition.x, y: endPosition.y }
      this.setCoordinateReadout(getPointerReadout(viewer, endPosition))
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    const removeSceneListener = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now()

      // 读数跟随地形与相机状态变化；鼠标移动仍立即刷新，这里是兜底的节流同步。
      if (now - this.coordinateReadoutRefreshedAt < 100) return

      this.coordinateReadoutRefreshedAt = now
      this.refreshCoordinateReadout(viewer)
    })
    const handlePointerLeave = () => {
      this.lastPointerPosition = undefined
      this.coordinateReadoutRefreshedAt = performance.now()
      this.setCoordinateReadout(getViewReadout(viewer))
    }
    viewer.canvas.addEventListener("pointerleave", handlePointerLeave)
    this.disposePointerReadout = () => {
      removeSceneListener()
      viewer.canvas.removeEventListener("pointerleave", handlePointerLeave)
    }

    this.refreshCoordinateReadout(viewer)

    logMapDiagnostic("cesium-engine:mount:complete")
  }

  unmount() {
    this.terrainSourceGeneration += 1
    if (this.viewer && !this.viewer.isDestroyed()) {
      destroyFlight(this.viewer)
    }
    this.measurementController?.dispose()
    this.measurementController = undefined
    this.disposePointerReadout?.()
    this.disposePointerReadout = undefined
    this.pointerHandler?.destroy()
    this.pointerHandler = undefined
    this.drawingController.unmount()

    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy()
    }

    this.viewer = undefined
    this.lastPointerPosition = undefined
    this.coordinateReadout = undefined
    this.coordinateReadoutListeners.clear()
    this.measurementStateListeners.clear()
  }

  flyToBounds(bounds: MapBounds) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToBounds(viewer, bounds)
    }
  }

  flyToCoordinate(coordinate: MapCoordinate) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToCoordinate(viewer, coordinate)
    }
  }

  setSceneMode(mode: SceneMode) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      if (mode === "2d") stopFlight(viewer)
      setSceneMode(viewer, mode)
    }
  }

  setRotateBrowse(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setRotateBrowse(viewer, enabled)
    }
  }

  setNorthLock(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setNorthLock(viewer, enabled)
    }
  }

  setTerrainExaggeration(enabled: boolean, scale: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      stopFlight(viewer)
      setTerrainExaggeration(viewer, enabled, scale)
    }
  }

  setTerrainExaggerationScale(scale: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      stopFlight(viewer)
      setTerrainExaggerationScale(viewer, scale)
    }
  }

  setUndergroundMode(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setUndergroundMode(viewer, enabled)
    }
  }

  getCameraHeading() {
    const viewer = this.getActiveViewer()

    return viewer ? getCameraHeading(viewer) : 0
  }

  setCameraHeading(heading: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setCameraHeading(viewer, heading)
    }
  }

  resetCameraNorth() {
    const viewer = this.getActiveViewer()

    if (viewer) {
      resetCameraNorth(viewer)
    }
  }

  onCameraHeadingChange(listener: (heading: number) => void) {
    const viewer = this.getActiveViewer()

    return viewer ? onCameraHeadingChange(viewer, listener) : () => {}
  }

  getCameraState(): CameraState {
    const viewer = this.getActiveViewer()

    return viewer
      ? getCameraState(viewer)
      : { longitude: 108.25, latitude: 23.7, height: 700_000, heading: 0, pitch: -90 }
  }

  setCameraState(state: Partial<Omit<CameraState, "longitude" | "latitude">>) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setCameraState(viewer, state)
    }
  }

  flyToCameraState(state: CameraState, options?: CameraFlightOptions) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToCameraState(viewer, state, options)
      return
    }

    options?.onCancel?.()
  }

  onCameraStateChange(listener: (state: CameraState) => void) {
    const viewer = this.getActiveViewer()

    return viewer ? onCameraStateChange(viewer, listener) : () => {}
  }

  /** 监听地图点击命中的地面坐标，返回取消监听函数。 */
  onMapClick(listener: MapClickListener) {
    this.mapClickListeners.add(listener)
    return () => {
      this.mapClickListeners.delete(listener)
    }
  }

  /** 设置当前航线的 Cesium 实体预览。 */
  setFlightRoutePreview(route: FlightRoute) {
    const viewer = this.getActiveViewer()
    if (viewer) setFlightRoutePreview(viewer, route)
  }

  /** 清理航线 Cesium 实体预览。 */
  clearFlightRoutePreview() {
    const viewer = this.getActiveViewer()
    if (viewer) clearFlightRoutePreview(viewer)
  }

  /** 采样地形并启动飞行漫游。 */
  async startFlight(route: FlightRoute) {
    const viewer = this.getActiveViewer()
    return viewer ? startFlight(viewer, route) : false
  }

  /** 暂停飞行漫游。 */
  pauseFlight() {
    const viewer = this.getActiveViewer()
    if (viewer) pauseFlight(viewer)
  }

  /** 继续暂停或已结束的飞行漫游。 */
  resumeFlight() {
    const viewer = this.getActiveViewer()
    if (viewer) resumeFlight(viewer)
  }

  /** 停止飞行漫游并清空播放状态。 */
  stopFlight() {
    const viewer = this.getActiveViewer()
    if (viewer) stopFlight(viewer)
  }

  /** 按归一化进度定位飞行漫游。 */
  seekFlight(progress: number) {
    const viewer = this.getActiveViewer()
    if (viewer) seekFlight(viewer, progress)
  }

  /** 更新飞行漫游播放期参数。 */
  updateFlightPlayback(settings: FlightPlaybackSettings) {
    const viewer = this.getActiveViewer()
    if (viewer) updateFlightPlayback(viewer, settings)
  }

  /** 读取当前飞行漫游状态。 */
  getFlightPlaybackState(): FlightPlaybackState {
    const viewer = this.getActiveViewer()
    return viewer
      ? getFlightPlaybackState(viewer)
      : {
          status: "idle",
          progress: 0,
          speed: 60,
          pitch: -20,
          loop: false,
          totalDistance: 0,
        }
  }

  /** 监听飞行漫游状态变化，返回取消监听函数。 */
  onFlightPlaybackStateChange(listener: (state: FlightPlaybackState) => void) {
    const viewer = this.getActiveViewer()
    return viewer ? onFlightPlaybackStateChange(viewer, listener) : () => {}
  }

  getCoordinateReadout(): CoordinateReadout | undefined {
    return this.coordinateReadout
  }

  onCoordinateReadoutChange(listener: (readout: CoordinateReadout) => void) {
    this.coordinateReadoutListeners.add(listener)

    if (this.coordinateReadout) {
      listener(this.coordinateReadout)
    }

    return () => {
      this.coordinateReadoutListeners.delete(listener)
    }
  }

  async toggleSceneFullscreen() {
    const container = this.getActiveViewer()?.container

    if (!container) return false

    if (document.fullscreenElement === container) {
      await document.exitFullscreen()
      return true
    }

    await container.requestFullscreen()
    return true
  }

  captureScreenshot() {
    const viewer = this.getActiveViewer()

    return viewer ? captureScreenshot(viewer) : undefined
  }

  captureScreenshotThumbnail() {
    const viewer = this.getActiveViewer()

    return viewer ? captureScreenshotThumbnail(viewer) : undefined
  }

  /** 开始指定类型的绘制。 */
  startDrawing(type: MapDrawGeometryType) {
    return this.drawingController.startDrawing(type)
  }

  /** 完成当前绘制草图。 */
  finishDrawing() {
    return this.drawingController.finishDrawing()
  }

  /** 取消当前绘制草图。 */
  cancelDrawing() {
    return this.drawingController.cancelDrawing()
  }

  /** 取消当前草图并退出绘制模式。 */
  stopDrawing() {
    return this.drawingController.stopDrawing()
  }

  /** 重命名绘制成果。 */
  renameDrawing(id: string, name: string) {
    return this.drawingController.renameDrawing(id, name)
  }

  /** 删除指定绘制成果。 */
  removeDrawing(id: string) {
    return this.drawingController.removeDrawing(id)
  }

  /** 清空全部绘制内容。 */
  clearDrawings() {
    this.drawingController.clearDrawings()
  }

  /** 恢复持久化的绘制成果。 */
  restoreDrawings(features: readonly MapDrawFeature[]) {
    return this.drawingController.restoreDrawings(features)
  }

  /** 读取当前绘制状态。 */
  getDrawingState(): MapDrawState {
    return this.drawingController.getDrawingState()
  }

  /** 监听绘制状态变化。 */
  onDrawingStateChange(listener: (state: MapDrawState) => void) {
    return this.drawingController.onDrawingStateChange(listener)
  }

  listBaseImagerySources(): ImagerySource[] {
    return listCesiumImagerySources()
  }

  getBaseImagerySourceId(): string | undefined {
    const viewer = this.getActiveViewer()

    return viewer ? getCurrentCesiumImagerySourceId(viewer) : undefined
  }

  setBaseImagerySource(id: string): boolean {
    const viewer = this.getActiveViewer()

    return viewer ? applyCesiumImagerySource(viewer, id) : false
  }

  setCustomBaseImagerySource(url: string): boolean {
    const viewer = this.getActiveViewer()

    return viewer ? applyCesiumCustomUrlSource(viewer, url) : false
  }

  async setTerrainSource(source?: TerrainSource) {
    const viewer = this.getActiveViewer()
    if (!viewer) return false

    stopFlight(viewer)
    const generation = ++this.terrainSourceGeneration
    const provider = await createCesiumTerrainProvider(source)

    if (generation !== this.terrainSourceGeneration || !this.getActiveViewer()) return false

    applyCesiumTerrainProvider(viewer, provider)
    return true
  }

  setMeasurementMode(mode: MeasurementMode | null) {
    this.measurementController?.setMode(mode)
  }

  undoMeasurementPoint() {
    this.measurementController?.undoPoint()
  }

  clearMeasurement() {
    this.measurementController?.clear()
  }

  getMeasurementState(): MeasurementState {
    return this.measurementController?.getState() ?? createIdleMeasurementState()
  }

  onMeasurementStateChange(listener: (state: MeasurementState) => void) {
    this.measurementStateListeners.add(listener)

    return () => {
      this.measurementStateListeners.delete(listener)
    }
  }

  private getActiveViewer() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      return this.viewer
    }

    return undefined
  }

  private setCoordinateReadout(readout: CoordinateReadout) {
    const previous = this.coordinateReadout
    if (
      previous &&
      previous.longitude === readout.longitude &&
      previous.latitude === readout.latitude &&
      previous.height === readout.height &&
      previous.source === readout.source
    ) {
      return
    }

    this.coordinateReadout = readout

    for (const listener of this.coordinateReadoutListeners) {
      listener(readout)
    }
  }

  private refreshCoordinateReadout(viewer: Cesium.Viewer) {
    if (!this.lastPointerPosition) {
      this.setCoordinateReadout(getViewReadout(viewer))
      return
    }

    const pointerPosition = new Cesium.Cartesian2(
      this.lastPointerPosition.x,
      this.lastPointerPosition.y,
    )
    this.setCoordinateReadout(getPointerReadout(viewer, pointerPosition))
  }
}

/** 创建未开始测量的默认状态。 */
function createIdleMeasurementState(): MeasurementState {
  return {
    mode: null,
    points: [],
    previewPoint: undefined,
    completed: false,
    resultValue: undefined,
    error: undefined,
  }
}

export function createCesiumMapEngine(): MapEngine {
  return new CesiumMapEngine()
}
