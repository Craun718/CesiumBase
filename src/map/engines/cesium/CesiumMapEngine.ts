import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics"
import type {
  CameraFlightOptions,
  CameraState,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  MapClickListener,
  MapCoordinate,
  MapBounds,
  MapDraw3DFeature,
  MapDraw3DGeometryType,
  MapDraw3DStartOptions,
  MapDraw3DState,
  MapDrawFeature,
  MapDrawGeometryType,
  MapDrawStartOptions,
  MapEngine,
  MapDrawState,
  MeasurementMode,
  MeasurementState,
  OrbitFlightSettings,
  OrbitFlightState,
  SceneImageryLayerDescriptor,
  SceneImageryLayerPatch,
  SceneLayerError,
  SceneModelLayerDescriptor,
  SceneModelLayerPatch,
  SceneVectorLayerDescriptor,
  SceneVectorLayerPatch,
  SceneTilesetLayerDescriptor,
  SceneTilesetLayerPatch,
  SceneMode,
  SceneModeTransitionOptions,
  SwipeCompareOptions,
  TerrainSource,
  ViewportState,
  MapEngineCreationOptions,
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
  getViewportState,
  getOrbitFlightState,
  onCameraHeadingChange,
  onCameraStateChange,
  onViewportStateChange,
  onOrbitFlightStateChange,
  pauseOrbitFlight,
  resetCameraNorth,
  resumeOrbitFlight,
  seekOrbitFlight,
  setCameraHeading,
  setCameraState,
  setViewportState,
  setInitialCamera,
  setOrbitFlight,
  setOrbitFlightSettings,
  stopOrbitFlight,
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
import { applyCesiumTerrainProvider, createCesiumTerrainProvider } from "./terrainSources"
import { CesiumDrawingController } from "./drawingOperations"
import { Cesium3DDrawingController } from "./drawing3DOperations"
import { CesiumMeasurementController } from "./measurementOperations"
import { CesiumLayerOperationController } from "./layerOperations"
import { MapEngineCompatibility } from "../../engineCompatibility"

export class CesiumMapEngine extends MapEngineCompatibility implements MapEngine {
  private viewer?: Cesium.Viewer
  private pointerHandler?: Cesium.ScreenSpaceEventHandler
  private readonly drawingController = new CesiumDrawingController()
  private readonly drawing3DController = new Cesium3DDrawingController()
  private readonly layerOperations = new CesiumLayerOperationController()
  private disposePointerReadout?: () => void
  private coordinateReadout?: CoordinateReadout
  private lastPointerPosition?: { x: number; y: number }
  private coordinateReadoutRefreshedAt = 0
  private terrainSourceGeneration = 0
  private measurementController?: CesiumMeasurementController
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()
  private readonly mapClickListeners = new Set<MapClickListener>()
  private readonly measurementStateListeners = new Set<(state: MeasurementState) => void>()
  private readonly creationOptions?: MapEngineCreationOptions

  constructor(creationOptions?: MapEngineCreationOptions) {
    super()
    this.creationOptions = creationOptions
  }

  async mount(container: HTMLElement) {
    if (this.viewer) return

    logMapDiagnostic("cesium-engine:mount:start", {
      container: [container.clientWidth, container.clientHeight],
    })

    const viewer = await createViewer(container, this.creationOptions)
    this.viewer = viewer
    this.layerOperations.dispose(viewer)

    installCesiumDiagnostics(viewer)
    configureScene(viewer, this.creationOptions?.renderingProfile)
    setInitialCamera(viewer)
    void this.loadOutsideRegionMask(viewer)

    const supportsInteractiveWorkloads = this.creationOptions?.renderingProfile !== "secondary"

    // 分屏 2D 辅助视口只保留浏览、图层与相机同步能力。
    if (supportsInteractiveWorkloads) {
      this.measurementController = new CesiumMeasurementController(viewer, (state) => {
        for (const listener of this.measurementStateListeners) {
          listener(state)
        }
      })
    }

    if (supportsInteractiveWorkloads) {
      this.drawingController.mount(viewer)
      this.drawing3DController.mount(viewer)
    }

    if (supportsInteractiveWorkloads) {
      this.pointerHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
      this.pointerHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
        if (this.drawingController.getDrawingState().mode !== null) return
        if (this.drawing3DController.getDrawingState().mode !== null) return

        const coordinate = pickFlightCoordinate(viewer, position)
        if (!coordinate) return

        for (const listener of this.mapClickListeners) {
          listener(coordinate)
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      this.pointerHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
        this.lastPointerPosition = { x: endPosition.x, y: endPosition.y }
        this.setCoordinateReadout(getPointerReadout(viewer, endPosition))
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    }

    if (supportsInteractiveWorkloads) {
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
    }

    if (supportsInteractiveWorkloads) {
      this.refreshCoordinateReadout(viewer)
    }

    void this.setTerrainSource()
    logMapDiagnostic("cesium-engine:mount:complete")
  }

  unmount() {
    this.terrainSourceGeneration += 1
    if (this.viewer && !this.viewer.isDestroyed()) {
      stopOrbitFlight(this.viewer)
      destroyFlight(this.viewer)
      this.layerOperations.dispose(this.viewer)
    }
    this.measurementController?.dispose()
    this.measurementController = undefined
    this.disposePointerReadout?.()
    this.disposePointerReadout = undefined
    this.pointerHandler?.destroy()
    this.pointerHandler = undefined
    this.drawingController.unmount()
    this.drawing3DController.unmount()

    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy()
    }

    this.viewer = undefined
    this.lastPointerPosition = undefined
    this.coordinateReadout = undefined
    this.coordinateReadoutListeners.clear()
    this.measurementStateListeners.clear()
  }

  flyToBounds(bounds: MapBounds): Promise<boolean> {
    const viewer = this.getActiveViewer()

    return viewer ? flyToBounds(viewer, bounds) : Promise.resolve(false)
  }

  flyToCoordinate(coordinate: MapCoordinate) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToCoordinate(viewer, coordinate)
    }
  }

  setSceneMode(mode: SceneMode, options?: SceneModeTransitionOptions) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      if (mode === "2d") stopFlight(viewer)
      setSceneMode(viewer, mode, options)
    }
  }

  setRotateBrowse(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setRotateBrowse(viewer, enabled)
    }
  }

  /** 开启或停止围绕当前视觉中心竖直轴的环绕飞行。 */
  setOrbitFlight(enabled: boolean, options?: { readonly durationSeconds?: number }) {
    const viewer = this.getActiveViewer()
    if (!viewer) return

    if (!enabled) {
      setOrbitFlight(viewer, false)
      return
    }

    stopFlight(viewer)
    setNorthLock(viewer, false)
    setOrbitFlight(viewer, true, options)
  }

  /** 实时更新运行中的环绕参数；引擎未启动时该调用为 no-op。 */
  setOrbitFlightSettings(settings: OrbitFlightSettings) {
    const viewer = this.getActiveViewer()
    if (!viewer) return

    setOrbitFlightSettings(viewer, settings)
  }

  /** 读取当前环绕飞行状态。 */
  getOrbitFlightState(): OrbitFlightState {
    const viewer = this.getActiveViewer()

    return viewer
      ? getOrbitFlightState(viewer)
      : { status: "idle", active: false, durationSeconds: 20, progress: 0 }
  }

  /** 暂停正在播放的环绕飞行；非 playing 状态为 no-op。 */
  pauseOrbitFlight() {
    const viewer = this.getActiveViewer()
    if (!viewer) return

    pauseOrbitFlight(viewer)
  }

  /** 恢复暂停的环绕飞行；非 paused 状态为 no-op。 */
  resumeOrbitFlight() {
    const viewer = this.getActiveViewer()
    if (!viewer) return

    resumeOrbitFlight(viewer)
  }

  /** 按 0~1 进度定位环绕角度；引擎未启动时为 no-op。 */
  seekOrbitFlight(progress: number) {
    const viewer = this.getActiveViewer()
    if (!viewer) return

    seekOrbitFlight(viewer, progress)
  }

  /** 监听环绕飞行状态变化；返回取消监听函数。 */
  onOrbitFlightStateChange(listener: (state: OrbitFlightState) => void) {
    const viewer = this.getActiveViewer()
    if (!viewer) return () => {}

    return onOrbitFlightStateChange(viewer, listener)
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

  async addImageryLayer(descriptor: SceneImageryLayerDescriptor) {
    const viewer = this.getActiveViewer()
    if (viewer) await this.layerOperations.addImageryLayer(viewer, descriptor)
  }

  updateImageryLayer(id: string, patch: SceneImageryLayerPatch) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.updateImageryLayer(viewer, id, patch)
  }

  removeImageryLayer(id: string) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.removeImageryLayer(viewer, id)
  }

  onImageryLayerError(listener: (error: SceneLayerError) => void) {
    return this.layerOperations.onImageryLayerError(listener)
  }

  /** 设置单视口卷帘比对。 */
  setSwipeCompare(options: SwipeCompareOptions) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.setSwipeCompare(viewer, options)
  }

  /** 读取分屏同步视口状态；未挂载时返回安全默认值。 */
  getViewportState(): ViewportState {
    const viewer = this.getActiveViewer()

    return viewer
      ? getViewportState(viewer)
      : { longitude: 108.25, latitude: 23.7, distanceMeters: 700_000, heading: 0 }
  }

  /** 以 top-down 视角应用分屏同步视口状态。 */
  setViewportState(state: ViewportState) {
    const viewer = this.getActiveViewer()
    if (viewer) setViewportState(viewer, state)
  }

  /** 监听分屏同步视口状态变化。 */
  onViewportStateChange(listener: (state: ViewportState) => void) {
    const viewer = this.getActiveViewer()
    return viewer ? onViewportStateChange(viewer, listener) : () => {}
  }

  async addVectorLayer(descriptor: SceneVectorLayerDescriptor) {
    const viewer = this.getActiveViewer()
    if (viewer) await this.layerOperations.addVectorLayer(viewer, descriptor)
  }

  updateVectorLayer(id: string, patch: SceneVectorLayerPatch) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.updateVectorLayer(viewer, id, patch)
  }

  removeVectorLayer(id: string) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.removeVectorLayer(viewer, id)
  }

  async addTilesetLayer(descriptor: SceneTilesetLayerDescriptor) {
    const viewer = this.getActiveViewer()
    if (viewer) await this.layerOperations.addTilesetLayer(viewer, descriptor)
  }

  updateTilesetLayer(id: string, patch: SceneTilesetLayerPatch) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.updateTilesetLayer(viewer, id, patch)
  }

  removeTilesetLayer(id: string) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.removeTilesetLayer(viewer, id)
  }

  async addModelLayer(descriptor: SceneModelLayerDescriptor) {
    const viewer = this.getActiveViewer()
    if (viewer) await this.layerOperations.addModelLayer(viewer, descriptor)
  }

  updateModelLayer(id: string, patch: SceneModelLayerPatch) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.updateModelLayer(viewer, id, patch)
  }

  removeModelLayer(id: string) {
    const viewer = this.getActiveViewer()
    if (viewer) this.layerOperations.removeModelLayer(viewer, id)
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
          followRoute: true,
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
  startDrawing(type: MapDrawGeometryType, options?: MapDrawStartOptions) {
    return this.drawingController.startDrawing(type, options)
  }

  /** 局部更新绘制参数（corridor width / buffer distance）。 */
  setDrawingOption(option: Partial<MapDrawStartOptions>) {
    this.drawingController.setDrawingOption(option)
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

  /** 对指定已有要素建立缓冲区；引擎未就绪或参数非法时返回 false。 */
  createBufferFromFeature(sourceFeatureId: string, distanceMeters: number) {
    return this.drawingController.createBufferFromFeature(sourceFeatureId, distanceMeters)
  }

  /** 设置已完成绘制成果的地图显隐。 */
  setDrawingFeaturesVisible(visible: boolean) {
    this.drawingController.setFeaturesVisible(visible)
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

  /** 拾取屏幕坐标命中的绘制成果 id。 */
  pickDrawingFeature(screenPosition: { readonly x: number; readonly y: number }) {
    return this.drawingController.pickDrawingFeature(screenPosition)
  }

  /** 选中或取消选中绘制成果。 */
  selectDrawingFeature(id: string | null) {
    return this.drawingController.selectDrawingFeature(id)
  }

  /** 进入编辑草图态。 */
  beginEditDraft(featureId: string, kind: "translate" | "resize", handleId?: string) {
    return this.drawingController.beginEditDraft(featureId, kind, handleId)
  }

  /** 鼠标移动时实时更新编辑草图几何。 */
  updateEditDraft(screenPosition: { readonly x: number; readonly y: number }) {
    this.drawingController.updateEditDraft(screenPosition)
  }

  /** 落定编辑。 */
  commitEditDraft() {
    return this.drawingController.commitEditDraft()
  }

  /** 回滚编辑。 */
  cancelEditDraft() {
    return this.drawingController.cancelEditDraft()
  }

  /** 开始指定类型的三维绘制；model3d 本期占位，返回 false。 */
  start3DDrawing(type: MapDraw3DGeometryType, options?: MapDraw3DStartOptions) {
    return this.drawing3DController.startDrawing(type, options)
  }

  /** 局部更新三维绘制参数；用于面板输入实时同步。 */
  set3DDrawingOption(option: Partial<MapDraw3DStartOptions>) {
    this.drawing3DController.setDrawingOption(option)
  }

  /** 完成当前三维草图。 */
  finish3DDrawing() {
    return this.drawing3DController.finishDrawing()
  }

  /** 取消当前三维草图并保留绘制模式。 */
  cancel3DDrawing() {
    return this.drawing3DController.cancelDrawing()
  }

  /** 取消当前三维草图并退出绘制模式。 */
  stop3DDrawing() {
    return this.drawing3DController.stopDrawing()
  }

  /** 重命名三维绘制成果。 */
  rename3DDrawing(id: string, name: string) {
    return this.drawing3DController.renameDrawing(id, name)
  }

  /** 删除指定三维绘制成果。 */
  remove3DDrawing(id: string) {
    return this.drawing3DController.removeDrawing(id)
  }

  /** 设置已完成三维绘制成果的地图显隐。 */
  set3DDrawingFeaturesVisible(visible: boolean) {
    this.drawing3DController.setFeaturesVisible(visible)
  }

  /** 取消三维草图并删除全部三维成果。 */
  clear3DDrawings() {
    this.drawing3DController.clearDrawings()
  }

  /** 恢复持久化的三维绘制成果。 */
  restore3DDrawings(features: readonly MapDraw3DFeature[]) {
    return this.drawing3DController.restoreDrawings(features)
  }

  /** 读取当前三维绘制状态。 */
  get3DDrawingState(): MapDraw3DState {
    return this.drawing3DController.getDrawingState()
  }

  /** 监听三维绘制状态变化。 */
  on3DDrawingStateChange(listener: (state: MapDraw3DState) => void) {
    return this.drawing3DController.onDrawingStateChange(listener)
  }

  /** 拾取屏幕坐标命中的三维绘制成果 id。 */
  pick3DDrawingFeature(screenPosition: { readonly x: number; readonly y: number }) {
    return this.drawing3DController.pickDrawingFeature(screenPosition)
  }

  /** 选中或取消选中三维绘制成果。 */
  select3DDrawingFeature(id: string | null) {
    return this.drawing3DController.selectDrawingFeature(id)
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

  resize() {
    this.getActiveViewer()?.resize()
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

  private async loadOutsideRegionMask(viewer: Cesium.Viewer) {
    await addProvinceBoundaries(viewer)
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

export function createCesiumMapEngine(options?: MapEngineCreationOptions): MapEngine {
  return new CesiumMapEngine(options)
}
