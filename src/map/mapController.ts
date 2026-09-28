import { loadMapEngine } from "./engineProvider.ts"
import { DEFAULT_FLIGHT_PITCH, DEFAULT_FLIGHT_SPEED } from "./flightRoute.ts"
import type {
  CameraState,
  CameraFlightOptions,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  MapBounds,
  MapClickListener,
  MapCoordinate,
  MeasurementMode,
  MeasurementState,
  MapEngine,
  MapEngineLoader,
  MapDrawFeature,
  MapDrawGeometryType,
  MapDrawStartOptions,
  MapDrawState,
  MapDraw3DFeature,
  MapDraw3DGeometryType,
  MapDraw3DStartOptions,
  MapDraw3DState,
  OrbitFlightSettings,
  OrbitFlightState,
  SceneImageryLayerDescriptor,
  SceneImageryLayerPatch,
  SceneLayerError,
  SceneModelLayerDescriptor,
  SceneModelLayerPatch,
  SceneTilesetLayerDescriptor,
  SceneTilesetLayerPatch,
  SceneVectorLayerDescriptor,
  SceneVectorLayerPatch,
  SceneMode,
  SceneModeTransitionOptions,
  SwipeCompareOptions,
  TerrainSource,
  ViewportState,
  MapEngineCreationOptions,
} from "./types"

const guangxiBounds: MapBounds = {
  west: 105,
  south: 21,
  east: 112.0569,
  north: 26.5,
}

const defaultFlightPlaybackState: FlightPlaybackState = {
  status: "idle",
  progress: 0,
  speed: DEFAULT_FLIGHT_SPEED,
  pitch: DEFAULT_FLIGHT_PITCH,
  loop: false,
  followRoute: true,
  totalDistance: 0,
}

const DEFAULT_ORBIT_DURATION_SECONDS = 20

function createIdleOrbitFlightState(): OrbitFlightState {
  return {
    status: "idle",
    active: false,
    durationSeconds: DEFAULT_ORBIT_DURATION_SECONDS,
    progress: 0,
  }
}

const emptyDrawingState: MapDrawState = {
  mode: null,
  activeCoordinates: [],
  features: [],
  selectedFeatureId: null,
  editingActive: false,
}

const emptyDrawing3DState: MapDraw3DState = {
  mode: null,
  activeCoordinates: [],
  features: [],
  selectedFeatureId: null,
}

export class MapController {
  private engine?: MapEngine

  private readonly createEngine: MapEngineLoader

  private mountGeneration = 0
  private disposeEngineCoordinateReadout?: () => void
  private disposeEngineMapClick?: () => void
  private disposeEngineFlightState?: () => void
  private disposeEngineOrbitState?: () => void
  private disposeEngineDrawingState?: () => void
  private disposeEngineDrawing3DState?: () => void
  private disposeEngineMeasurementState?: () => void
  private disposeEngineImageryLayerError?: () => void
  private disposeEngineViewportState?: () => void
  private measurementState: MeasurementState = createIdleMeasurementState()
  private requestedMeasurementMode: MeasurementMode | null = null
  private preservedViewportState?: ViewportState

  private readonly mountStateListeners = new Set<(ready: boolean) => void>()
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()
  private readonly mapClickListeners = new Set<MapClickListener>()
  private readonly flightPlaybackStateListeners = new Set<(state: FlightPlaybackState) => void>()
  private readonly orbitFlightStateListeners = new Set<(state: OrbitFlightState) => void>()
  private readonly drawingStateListeners = new Set<(state: MapDrawState) => void>()
  private readonly drawing3DStateListeners = new Set<(state: MapDraw3DState) => void>()
  private readonly measurementStateListeners = new Set<(state: MeasurementState) => void>()
  private readonly imageryLayerErrorListeners = new Set<(error: SceneLayerError) => void>()
  private readonly viewportStateListeners = new Set<(state: ViewportState) => void>()

  constructor(createEngine = loadMapEngine) {
    this.createEngine = createEngine
  }

  /** 挂载引擎；创建配置用于区分主视口与分屏辅助视口的渲染策略。 */
  async mount(container: HTMLElement, options?: MapEngineCreationOptions) {
    if (this.engine) return

    const generation = ++this.mountGeneration
    const createEngine = await this.createEngine()

    if (generation !== this.mountGeneration) return

    const engine = createEngine(options)
    await engine.mount(container)
    this.engine = engine
    if (this.requestedMeasurementMode !== null) {
      engine.setMeasurementMode(this.requestedMeasurementMode)
    }
    this.measurementState = engine.getMeasurementState()
    this.disposeEngineCoordinateReadout = engine.onCoordinateReadoutChange((readout) => {
      for (const listener of this.coordinateReadoutListeners) {
        listener(readout)
      }
    })
    this.disposeEngineMapClick = engine.onMapClick((coordinate) => {
      for (const listener of this.mapClickListeners) {
        listener(coordinate)
      }
    })
    this.disposeEngineFlightState = engine.onFlightPlaybackStateChange((state) => {
      for (const listener of this.flightPlaybackStateListeners) {
        listener(state)
      }
    })
    this.disposeEngineOrbitState = engine.onOrbitFlightStateChange?.((state) => {
      this.notifyOrbitFlightState(state)
    })
    this.disposeEngineDrawingState = engine.onDrawingStateChange((state) => {
      this.notifyDrawingState(state)
    })
    this.disposeEngineDrawing3DState = engine.on3DDrawingStateChange((state) => {
      this.notifyDrawing3DState(state)
    })
    this.disposeEngineMeasurementState = engine.onMeasurementStateChange((state) => {
      this.measurementState = state
      this.notifyMeasurementState(state)
    })
    this.disposeEngineImageryLayerError = engine.onImageryLayerError((error) => {
      for (const listener of this.imageryLayerErrorListeners) listener(error)
    })
    this.disposeEngineViewportState = engine.onViewportStateChange?.((state) => {
      for (const listener of this.viewportStateListeners) listener(state)
    })
    if (this.preservedViewportState && engine.setViewportState) {
      engine.setViewportState(this.preservedViewportState)
      this.preservedViewportState = undefined
    }
    this.notifyMountState(true)
  }

  unmount() {
    this.mountGeneration += 1
    this.disposeEngineCoordinateReadout?.()
    this.disposeEngineCoordinateReadout = undefined
    this.disposeEngineMapClick?.()
    this.disposeEngineMapClick = undefined
    this.disposeEngineFlightState?.()
    this.disposeEngineFlightState = undefined
    this.disposeEngineOrbitState?.()
    this.disposeEngineOrbitState = undefined
    this.disposeEngineDrawingState?.()
    this.disposeEngineDrawingState = undefined
    this.disposeEngineDrawing3DState?.()
    this.disposeEngineDrawing3DState = undefined
    this.disposeEngineMeasurementState?.()
    this.disposeEngineMeasurementState = undefined
    this.disposeEngineImageryLayerError?.()
    this.disposeEngineImageryLayerError = undefined
    this.disposeEngineViewportState?.()
    this.disposeEngineViewportState = undefined
    if (this.engine?.getViewportState) {
      this.preservedViewportState = this.engine.getViewportState()
    }
    this.engine?.unmount()
    this.engine = undefined
    this.measurementState = createIdleMeasurementState()
    this.notifyMeasurementState(this.measurementState)
    this.notifyMountState(false)
    this.notifyFlightPlaybackState(defaultFlightPlaybackState)
    this.notifyOrbitFlightState(createIdleOrbitFlightState())
    this.notifyDrawingState(emptyDrawingState)
    this.notifyDrawing3DState(emptyDrawing3DState)
  }

  /** 监听引擎挂载/卸载状态；注册时若已挂载会立即以 true 回调一次。 */
  onMountStateChange(listener: (ready: boolean) => void) {
    this.mountStateListeners.add(listener)

    if (this.engine) {
      listener(true)
    }

    return () => {
      this.mountStateListeners.delete(listener)
    }
  }

  returnToGuangxi() {
    void this.engine?.flyToBounds(guangxiBounds)
  }

  /** 飞行到指定边界。 */
  flyToBounds(bounds: MapBounds): Promise<boolean> {
    return this.engine?.flyToBounds(bounds) ?? Promise.resolve(false)
  }

  flyToCoordinate(coordinate: MapCoordinate) {
    this.engine?.flyToCoordinate(coordinate)
  }

  setSceneMode(mode: SceneMode, options?: SceneModeTransitionOptions) {
    this.engine?.setSceneMode(mode, options)
  }

  setRotateBrowse(enabled: boolean) {
    this.engine?.setRotateBrowse(enabled)
  }

  /** 开启或停止围绕当前视觉中心竖直轴的环绕飞行。 */
  setOrbitFlight(enabled: boolean, options?: { readonly durationSeconds?: number }) {
    this.engine?.setOrbitFlight(enabled, options)
  }

  /** 实时更新运行中的环绕参数；引擎未启动时该调用为 no-op。 */
  setOrbitFlightSettings(settings: OrbitFlightSettings) {
    this.engine?.setOrbitFlightSettings(settings)
  }

  /** 暂停正在播放的环绕飞行；非 playing 状态为 no-op。 */
  pauseOrbitFlight() {
    this.engine?.pauseOrbitFlight?.()
  }

  /** 恢复暂停的环绕飞行；非 paused 状态为 no-op。 */
  resumeOrbitFlight() {
    this.engine?.resumeOrbitFlight?.()
  }

  /** 按归一化进度定位环绕角度；引擎未启动时为 no-op。 */
  seekOrbitFlight(progress: number) {
    this.engine?.seekOrbitFlight?.(progress)
  }

  /** 读取当前环绕飞行状态；引擎未挂载时返回安全默认值。 */
  getOrbitFlightState(): OrbitFlightState {
    return this.engine?.getOrbitFlightState() ?? createIdleOrbitFlightState()
  }

  /** 监听环绕飞行状态变化；注册时立即回调当前状态。 */
  onOrbitFlightStateChange(listener: (state: OrbitFlightState) => void) {
    this.orbitFlightStateListeners.add(listener)
    listener(this.getOrbitFlightState())

    return () => {
      this.orbitFlightStateListeners.delete(listener)
    }
  }

  setNorthLock(enabled: boolean) {
    this.engine?.setNorthLock(enabled)
  }

  setTerrainExaggeration(enabled: boolean, scale: number) {
    this.engine?.setTerrainExaggeration(enabled, scale)
  }

  setTerrainExaggerationScale(scale: number) {
    this.engine?.setTerrainExaggerationScale(scale)
  }

  /** 添加或替换托管影像图层；引擎未挂载时静默忽略。 */
  async addImageryLayer(descriptor: SceneImageryLayerDescriptor) {
    await this.engine?.addImageryLayer(descriptor)
  }

  /** 局部更新托管影像图层。 */
  updateImageryLayer(id: string, patch: SceneImageryLayerPatch) {
    this.engine?.updateImageryLayer(id, patch)
  }

  /** 移除托管影像图层。 */
  removeImageryLayer(id: string) {
    this.engine?.removeImageryLayer(id)
  }

  /** 监听托管影像瓦片错误。 */
  onImageryLayerError(listener: (error: SceneLayerError) => void) {
    this.imageryLayerErrorListeners.add(listener)

    return () => {
      this.imageryLayerErrorListeners.delete(listener)
    }
  }

  /** 设置单视口卷帘比对；引擎未挂载时静默忽略。 */
  setSwipeCompare(options: SwipeCompareOptions) {
    this.engine?.setSwipeCompare(options)
  }

  /** 读取分屏同步视口状态；未挂载时返回广西全域安全默认值。 */
  getViewportState(): ViewportState {
    return (
      this.engine?.getViewportState() ?? {
        longitude: 108.25,
        latitude: 23.7,
        distanceMeters: 700_000,
        heading: 0,
      }
    )
  }

  /** 以 top-down 视角应用分屏同步视口状态。 */
  setViewportState(state: ViewportState) {
    this.engine?.setViewportState(state)
  }

  /** 监听分屏同步视口状态变化。 */
  onViewportStateChange(listener: (state: ViewportState) => void) {
    this.viewportStateListeners.add(listener)

    return () => {
      this.viewportStateListeners.delete(listener)
    }
  }

  /** 添加或替换托管 GeoJSON 图层。 */
  async addVectorLayer(descriptor: SceneVectorLayerDescriptor) {
    await this.engine?.addVectorLayer(descriptor)
  }

  /** 局部更新托管 GeoJSON 图层。 */
  updateVectorLayer(id: string, patch: SceneVectorLayerPatch) {
    this.engine?.updateVectorLayer(id, patch)
  }

  /** 移除托管 GeoJSON 图层。 */
  removeVectorLayer(id: string) {
    this.engine?.removeVectorLayer(id)
  }

  /** 添加或替换托管 3D Tiles 图层；引擎未挂载时静默忽略。 */
  async addTilesetLayer(descriptor: SceneTilesetLayerDescriptor) {
    await this.engine?.addTilesetLayer(descriptor)
  }

  /** 局部更新托管 3D Tiles 图层。 */
  updateTilesetLayer(id: string, patch: SceneTilesetLayerPatch) {
    this.engine?.updateTilesetLayer(id, patch)
  }

  /** 移除托管 3D Tiles 图层。 */
  removeTilesetLayer(id: string) {
    this.engine?.removeTilesetLayer(id)
  }

  /** 添加或替换托管 glTF 模型图层；引擎未挂载时静默忽略。 */
  async addModelLayer(descriptor: SceneModelLayerDescriptor) {
    await this.engine?.addModelLayer(descriptor)
  }

  /** 局部更新托管 glTF 模型图层。 */
  updateModelLayer(id: string, patch: SceneModelLayerPatch) {
    this.engine?.updateModelLayer(id, patch)
  }

  /** 移除托管 glTF 模型图层。 */
  removeModelLayer(id: string) {
    this.engine?.removeModelLayer(id)
  }

  setUndergroundMode(enabled: boolean) {
    this.engine?.setUndergroundMode(enabled)
  }

  getCameraHeading() {
    return this.engine?.getCameraHeading() ?? 0
  }

  setCameraHeading(heading: number) {
    this.engine?.setCameraHeading(heading)
  }

  resetCameraNorth() {
    this.engine?.resetCameraNorth()
  }

  onCameraHeadingChange(listener: (heading: number) => void) {
    return this.engine?.onCameraHeadingChange(listener) ?? (() => {})
  }

  getCameraState(): CameraState {
    return (
      this.engine?.getCameraState() ?? {
        longitude: 108.25,
        latitude: 23.7,
        height: 700_000,
        heading: 0,
        pitch: -90,
      }
    )
  }

  setCameraState(state: Partial<Omit<CameraState, "longitude" | "latitude">>) {
    this.engine?.setCameraState(state)
  }

  flyToCameraState(state: CameraState, options?: CameraFlightOptions) {
    if (this.engine) {
      this.engine.flyToCameraState(state, options)
      return
    }

    options?.onCancel?.()
  }

  onCameraStateChange(listener: (state: CameraState) => void) {
    return this.engine?.onCameraStateChange(listener) ?? (() => {})
  }

  /** 监听地图点击命中的地面坐标，返回取消监听函数。 */
  onMapClick(listener: MapClickListener) {
    this.mapClickListeners.add(listener)

    return () => {
      this.mapClickListeners.delete(listener)
    }
  }

  /** 设置当前航线的地图预览。 */
  setFlightRoutePreview(route: FlightRoute) {
    this.engine?.setFlightRoutePreview(route)
  }

  /** 清理航线地图预览。 */
  clearFlightRoutePreview() {
    this.engine?.clearFlightRoutePreview()
  }

  /** 采样地形并启动飞行漫游。 */
  async startFlight(route: FlightRoute) {
    return (await this.engine?.startFlight(route)) ?? false
  }

  /** 暂停飞行漫游。 */
  pauseFlight() {
    this.engine?.pauseFlight()
  }

  /** 继续暂停或已结束的飞行漫游。 */
  resumeFlight() {
    this.engine?.resumeFlight()
  }

  /** 停止飞行漫游并清空播放状态。 */
  stopFlight() {
    this.engine?.stopFlight()
  }

  /** 按归一化进度定位飞行漫游。 */
  seekFlight(progress: number) {
    this.engine?.seekFlight(progress)
  }

  /** 更新飞行漫游播放期参数。 */
  updateFlightPlayback(settings: FlightPlaybackSettings) {
    this.engine?.updateFlightPlayback(settings)
  }

  /** 读取当前飞行漫游状态。 */
  getFlightPlaybackState(): FlightPlaybackState {
    return this.engine?.getFlightPlaybackState() ?? defaultFlightPlaybackState
  }

  /** 监听飞行漫游状态；注册时会立即回调当前状态。 */
  onFlightPlaybackStateChange(listener: (state: FlightPlaybackState) => void) {
    this.flightPlaybackStateListeners.add(listener)
    listener(this.getFlightPlaybackState())

    return () => {
      this.flightPlaybackStateListeners.delete(listener)
    }
  }

  getCoordinateReadout(): CoordinateReadout | undefined {
    return this.engine?.getCoordinateReadout()
  }

  onCoordinateReadoutChange(listener: (readout: CoordinateReadout) => void) {
    this.coordinateReadoutListeners.add(listener)

    if (this.engine) {
      const readout = this.engine.getCoordinateReadout()

      if (readout) {
        listener(readout)
      }
    }

    return () => {
      this.coordinateReadoutListeners.delete(listener)
    }
  }

  async toggleSceneFullscreen() {
    return (await this.engine?.toggleSceneFullscreen()) ?? false
  }

  captureScreenshot() {
    return this.engine?.captureScreenshot()
  }

  captureScreenshotThumbnail() {
    return this.engine?.captureScreenshotThumbnail()
  }

  /** 开始指定类型的绘制；引擎未挂载时返回 false。 */
  startDrawing(type: MapDrawGeometryType, options?: MapDrawStartOptions) {
    return this.engine?.startDrawing(type, options) ?? false
  }

  /** 局部更新绘制参数（corridor width / buffer distance）。 */
  setDrawingOption(option: Partial<MapDrawStartOptions>) {
    this.engine?.setDrawingOption(option)
  }

  /** 完成当前绘制草图。 */
  finishDrawing() {
    return this.engine?.finishDrawing() ?? false
  }

  /** 取消当前绘制草图。 */
  cancelDrawing() {
    return this.engine?.cancelDrawing() ?? false
  }

  /** 取消当前草图并退出绘制模式。 */
  stopDrawing() {
    return this.engine?.stopDrawing() ?? false
  }

  /** 重命名绘制成果。 */
  renameDrawing(id: string, name: string) {
    return this.engine?.renameDrawing(id, name) ?? false
  }

  /** 删除指定绘制成果。 */
  removeDrawing(id: string) {
    return this.engine?.removeDrawing(id) ?? false
  }

  /** 对指定已有要素建立缓冲区；引擎未挂载或参数非法时返回 false。 */
  createBufferFromFeature(sourceFeatureId: string, distanceMeters: number) {
    return this.engine?.createBufferFromFeature(sourceFeatureId, distanceMeters) ?? false
  }

  /** 设置已完成绘制成果的地图显隐。 */
  setDrawingFeaturesVisible(visible: boolean) {
    this.engine?.setDrawingFeaturesVisible(visible)
  }

  /** 清空绘制成果并取消当前草图。 */
  clearDrawings() {
    this.engine?.clearDrawings()
  }

  /** 恢复持久化的绘制成果；引擎未挂载时返回 false。 */
  restoreDrawings(features: readonly MapDrawFeature[]) {
    return this.engine?.restoreDrawings(features) ?? false
  }

  /** 读取当前绘制状态。 */
  getDrawingState(): MapDrawState {
    return this.engine?.getDrawingState() ?? emptyDrawingState
  }

  /** 监听绘制状态变化；注册时若已有状态会立即回调一次。 */
  onDrawingStateChange(listener: (state: MapDrawState) => void) {
    this.drawingStateListeners.add(listener)

    if (this.engine) {
      listener(this.engine.getDrawingState())
    }

    return () => {
      this.drawingStateListeners.delete(listener)
    }
  }

  /** 拾取屏幕坐标命中的绘制成果 id；未命中返回 null。 */
  pickDrawingFeature(screenPosition: { readonly x: number; readonly y: number }) {
    return this.engine?.pickDrawingFeature(screenPosition) ?? null
  }

  /** 选中或取消选中绘制成果；切换时同步创建或销毁编辑把手。 */
  selectDrawingFeature(id: string | null) {
    return this.engine?.selectDrawingFeature(id) ?? false
  }

  /** 进入编辑草图态：整体平移或拖动把手缩放。 */
  beginEditDraft(featureId: string, kind: "translate" | "resize", handleId?: string) {
    return this.engine?.beginEditDraft(featureId, kind, handleId) ?? false
  }

  /** 鼠标移动时实时更新编辑草图几何。 */
  updateEditDraft(screenPosition: { readonly x: number; readonly y: number }) {
    this.engine?.updateEditDraft(screenPosition)
  }

  /** 落定编辑：把最终 geometry 写回 features 并触发持久化。 */
  commitEditDraft() {
    return this.engine?.commitEditDraft() ?? false
  }

  /** 回滚编辑：丢弃草图态，恢复到 begin 前的几何。 */
  cancelEditDraft() {
    return this.engine?.cancelEditDraft() ?? false
  }

  /** 开始指定类型的三维绘制；引擎未挂载时返回 false。 */
  start3DDrawing(type: MapDraw3DGeometryType, options?: MapDraw3DStartOptions) {
    return this.engine?.start3DDrawing(type, options) ?? false
  }

  /** 局部更新三维绘制参数；用于面板输入实时同步。 */
  set3DDrawingOption(option: Partial<MapDraw3DStartOptions>) {
    this.engine?.set3DDrawingOption(option)
  }

  /** 完成当前三维绘制草图。 */
  finish3DDrawing() {
    return this.engine?.finish3DDrawing() ?? false
  }

  /** 取消当前三维绘制草图。 */
  cancel3DDrawing() {
    return this.engine?.cancel3DDrawing() ?? false
  }

  /** 取消当前三维草图并退出绘制模式。 */
  stop3DDrawing() {
    return this.engine?.stop3DDrawing() ?? false
  }

  /** 重命名三维绘制成果。 */
  rename3DDrawing(id: string, name: string) {
    return this.engine?.rename3DDrawing(id, name) ?? false
  }

  /** 删除指定三维绘制成果。 */
  remove3DDrawing(id: string) {
    return this.engine?.remove3DDrawing(id) ?? false
  }

  /** 设置已完成三维绘制成果的地图显隐。 */
  set3DDrawingFeaturesVisible(visible: boolean) {
    this.engine?.set3DDrawingFeaturesVisible(visible)
  }

  /** 清空三维绘制成果并取消当前草图。 */
  clear3DDrawings() {
    this.engine?.clear3DDrawings()
  }

  /** 恢复持久化的三维绘制成果；引擎未挂载时返回 false。 */
  restore3DDrawings(features: readonly MapDraw3DFeature[]) {
    return this.engine?.restore3DDrawings(features) ?? false
  }

  /** 读取当前三维绘制状态。 */
  get3DDrawingState(): MapDraw3DState {
    return this.engine?.get3DDrawingState() ?? emptyDrawing3DState
  }

  /** 监听三维绘制状态变化；注册时若已有状态会立即回调一次。 */
  on3DDrawingStateChange(listener: (state: MapDraw3DState) => void) {
    this.drawing3DStateListeners.add(listener)

    if (this.engine) {
      listener(this.engine.get3DDrawingState())
    }

    return () => {
      this.drawing3DStateListeners.delete(listener)
    }
  }

  /** 拾取屏幕坐标命中的三维绘制成果 id；未命中返回 null。 */
  pick3DDrawingFeature(screenPosition: { readonly x: number; readonly y: number }) {
    return this.engine?.pick3DDrawingFeature(screenPosition) ?? null
  }

  /** 选中或取消选中三维绘制成果；本期仅做高亮。 */
  select3DDrawingFeature(id: string | null) {
    return this.engine?.select3DDrawingFeature(id) ?? false
  }

  async setTerrainSource(source?: TerrainSource) {
    return (await this.engine?.setTerrainSource(source)) ?? false
  }

  /** 引擎容器尺寸变化后主动校正画布。 */
  resize() {
    this.engine?.resize()
  }

  /** 通知绘制状态监听器。 */
  private notifyDrawingState(state: MapDrawState) {
    for (const listener of this.drawingStateListeners) {
      listener(state)
    }
  }

  /** 通知三维绘制状态监听器。 */
  private notifyDrawing3DState(state: MapDraw3DState) {
    for (const listener of this.drawing3DStateListeners) {
      listener(state)
    }
  }

  /** 切换地图测量模式；地图未挂载时不产生副作用。 */
  setMeasurementMode(mode: MeasurementState["mode"]) {
    this.requestedMeasurementMode = mode

    if (!this.engine) {
      this.measurementState = createIdleMeasurementState(mode)
      this.notifyMeasurementState(this.measurementState)
      return
    }

    this.engine.setMeasurementMode(mode)
  }

  /** 撤销当前测量的最后一个确认点。 */
  undoMeasurementPoint() {
    this.engine?.undoMeasurementPoint()
  }

  /** 清空当前测量点并保留测量模式。 */
  clearMeasurement() {
    this.engine?.clearMeasurement()
  }

  /** 读取当前测量状态；地图未挂载时返回空状态。 */
  getMeasurementState(): MeasurementState {
    return this.measurementState
  }

  /** 监听测量状态变化，返回取消监听函数。 */
  onMeasurementStateChange(listener: (state: MeasurementState) => void) {
    this.measurementStateListeners.add(listener)

    if (this.measurementState.mode !== null) {
      listener(this.measurementState)
    }

    return () => {
      this.measurementStateListeners.delete(listener)
    }
  }

  /** 通知地图挂载状态监听器。 */
  private notifyMountState(ready: boolean) {
    for (const listener of this.mountStateListeners) {
      listener(ready)
    }
  }

  /** 通知飞行漫游状态监听器。 */
  private notifyFlightPlaybackState(state: FlightPlaybackState) {
    for (const listener of this.flightPlaybackStateListeners) {
      listener(state)
    }
  }

  /** 通知环绕飞行状态监听器。 */
  private notifyOrbitFlightState(state: OrbitFlightState) {
    for (const listener of this.orbitFlightStateListeners) {
      listener(state)
    }
  }

  /** 向界面层广播当前测量状态。 */
  private notifyMeasurementState(state: MeasurementState) {
    for (const listener of this.measurementStateListeners) {
      listener(state)
    }
  }
}

/** 创建未开始测量的默认状态。 */
function createIdleMeasurementState(mode: MeasurementMode | null = null): MeasurementState {
  return {
    mode,
    points: [],
    previewPoint: undefined,
    completed: false,
    resultValue: undefined,
    error: undefined,
  }
}
