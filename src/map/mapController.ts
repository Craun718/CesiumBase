import { loadMapEngine } from "./engineProvider"
import type {
  CameraState,
  CameraFlightOptions,
  CoordinateReadout,
  ImagerySource,
  MapBounds,
  MapCoordinate,
  MapEngine,
  MapEngineLoader,
  MapDrawGeometryType,
  MapDrawState,
  SceneMode,
  TerrainSource,
} from "./types"

const guangxiBounds: MapBounds = {
  west: 105,
  south: 21,
  east: 112.0569,
  north: 26.5,
}

const emptyDrawingState: MapDrawState = {
  mode: null,
  activeCoordinates: [],
  features: [],
}

export class MapController {
  private engine?: MapEngine

  private readonly createEngine: MapEngineLoader

  private mountGeneration = 0
  private disposeEngineCoordinateReadout?: () => void
  private disposeEngineDrawingState?: () => void

  private readonly mountStateListeners = new Set<(ready: boolean) => void>()
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()
  private readonly drawingStateListeners = new Set<(state: MapDrawState) => void>()

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
    this.disposeEngineDrawingState = engine.onDrawingStateChange((state) => {
      this.notifyDrawingState(state)
    })
    this.notifyMountState(true)
  }

  unmount() {
    this.mountGeneration += 1
    this.disposeEngineCoordinateReadout?.()
    this.disposeEngineCoordinateReadout = undefined
    this.disposeEngineDrawingState?.()
    this.disposeEngineDrawingState = undefined
    this.engine?.unmount()
    this.engine = undefined
    this.notifyMountState(false)
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
  startDrawing(type: MapDrawGeometryType) {
    return this.engine?.startDrawing(type) ?? false
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

  /** 设置已完成绘制成果的地图显隐。 */
  setDrawingFeaturesVisible(visible: boolean) {
    this.engine?.setDrawingFeaturesVisible(visible)
  }

  /** 清空绘制成果并取消当前草图。 */
  clearDrawings() {
    this.engine?.clearDrawings()
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

  private notifyDrawingState(state: MapDrawState) {
    for (const listener of this.drawingStateListeners) {
      listener(state)
    }
  }

  private notifyMountState(ready: boolean) {
    for (const listener of this.mountStateListeners) {
      listener(ready)
    }
  }
}
