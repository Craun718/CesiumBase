import { loadMapEngine } from "./engineProvider"
import { DEFAULT_FLIGHT_PITCH, DEFAULT_FLIGHT_SPEED } from "./flightRoute"
import type {
  CameraState,
  CameraFlightOptions,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  ImagerySource,
  MapBounds,
  MapClickListener,
  MapCoordinate,
  MapEngine,
  MapEngineLoader,
  SceneMode,
  TerrainSource,
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
  totalDistance: 0,
}

export class MapController {
  private engine?: MapEngine

  private readonly createEngine: MapEngineLoader

  private mountGeneration = 0
  private disposeEngineCoordinateReadout?: () => void
  private disposeEngineMapClick?: () => void
  private disposeEngineFlightState?: () => void

  private readonly mountStateListeners = new Set<(ready: boolean) => void>()
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()
  private readonly mapClickListeners = new Set<MapClickListener>()
  private readonly flightPlaybackStateListeners = new Set<(state: FlightPlaybackState) => void>()

  constructor(createEngine = loadMapEngine) {
    this.createEngine = createEngine
  }

  async mount(container: HTMLElement) {
    if (this.engine) return

    const generation = ++this.mountGeneration
    const createEngine = await this.createEngine()

    if (generation !== this.mountGeneration) return

    const engine = createEngine()
    await engine.mount(container)
    this.engine = engine
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
    this.engine?.unmount()
    this.engine = undefined
    this.notifyMountState(false)
    this.notifyFlightPlaybackState(defaultFlightPlaybackState)
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
    this.engine?.flyToBounds(guangxiBounds)
  }

  flyToCoordinate(coordinate: MapCoordinate) {
    this.engine?.flyToCoordinate(coordinate)
  }

  setSceneMode(mode: SceneMode) {
    this.engine?.setSceneMode(mode)
  }

  setRotateBrowse(enabled: boolean) {
    this.engine?.setRotateBrowse(enabled)
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

  /** 当前引擎支持的图源列表（用于 UI 渲染）。 */
  listBaseImagerySources(): ImagerySource[] {
    return this.engine?.listBaseImagerySources() ?? []
  }

  /** 当前激活的图源 id；未挂载或不支持时返回 undefined。 */
  getBaseImagerySourceId(): string | undefined {
    return this.engine?.getBaseImagerySourceId()
  }

  /** 切换激活图源；返回是否实际发生替换。 */
  setBaseImagerySource(id: string): boolean {
    return this.engine?.setBaseImagerySource(id) ?? false
  }

  /** 通过自定义瓦片 URL 切换激活图源；返回是否实际发生替换。 */
  setCustomBaseImagerySource(url: string): boolean {
    return this.engine?.setCustomBaseImagerySource(url) ?? false
  }

  async setTerrainSource(source?: TerrainSource) {
    return (await this.engine?.setTerrainSource(source)) ?? false
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
}
