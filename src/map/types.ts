export type SceneMode = "2d" | "3d"

export type MapEngineId = "cesium" | "deck-gl"

export type MapBounds = {
  west: number
  south: number
  east: number
  north: number
}

/** 引擎无关的相机状态；height 为相机海拔高度，单位米。 */
export interface CameraState {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
  readonly heading: number
  readonly pitch: number
}

/** 用于视角定位的地面坐标。 */
export interface MapCoordinate {
  readonly longitude: number
  readonly latitude: number
}

/** 状态栏坐标读数；pointer 表示鼠标命中地球，view 表示显示视图中心。 */
export interface CoordinateReadout {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
  readonly source: "pointer" | "view"
}

/**
 * 引擎无关的图源描述。
 *
 * 引擎负责将 `id` 实例化为真实图层（如 Cesium 的 `ImageryLayer`）。
 * UI 层只读取 `id` / `label` / `description` 用于展示与选择。
 *
 * 新增图源：在对应引擎工作区内部追加，引擎实现 `listBaseImagerySources()` 即可。
 */
export interface ImagerySource {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export interface MapEngine {
  mount(container: HTMLElement): void | Promise<void>
  unmount(): void

  flyToBounds(bounds: MapBounds): void
  /** 保持当前相机高度、朝向和俯仰，飞行到指定经纬度。 */
  flyToCoordinate(coordinate: MapCoordinate): void
  setSceneMode(mode: SceneMode): void
  setRotateBrowse(enabled: boolean): void
  setNorthLock(enabled: boolean): void
  setTerrainExaggeration(enabled: boolean, scale: number): void
  setTerrainExaggerationScale(scale: number): void
  getCameraHeading(): number
  setCameraHeading(heading: number): void
  resetCameraNorth(): void
  onCameraHeadingChange(listener: (heading: number) => void): () => void
  /** 读取当前相机参数；引擎未挂载时返回安全默认值。 */
  getCameraState(): CameraState
  /** 局部更新相机参数；未提供的字段保持当前值。 */
  setCameraState(state: Partial<Omit<CameraState, "longitude" | "latitude">>): void
  /** 监听相机参数变化，返回取消监听函数。 */
  onCameraStateChange(listener: (state: CameraState) => void): () => void
  /** 读取状态栏坐标读数；地图尚未就绪时返回 undefined。 */
  getCoordinateReadout(): CoordinateReadout | undefined
  /** 监听坐标读数变化；鼠标离开地图或未命中地球时回落到视图中心。 */
  onCoordinateReadoutChange(listener: (readout: CoordinateReadout) => void): () => void
  /** 在地图容器与浏览器全屏状态间切换；返回是否实际执行了切换。 */
  toggleSceneFullscreen(): Promise<boolean>
  /** 返回当前渲染画面 PNG 数据 URL；不支持或捕获失败时返回 undefined。 */
  captureScreenshot(): string | undefined

  /**
   * 当前引擎支持的图源列表（用于 UI 渲染下拉/列表）。
   * 引擎可返回空数组（如 deck.gl 占位阶段）。
   */
  listBaseImagerySources(): ImagerySource[]
  /** 当前激活图源 id；未挂载或不支持时返回 undefined。 */
  getBaseImagerySourceId(): string | undefined
  /**
   * 切换激活图源。返回是否实际发生替换（false 表示 id 无效或与当前一致）。
   * 调用方应自行处理"未替换"的反馈（如 toast）。
   */
  setBaseImagerySource(id: string): boolean
  /**
   * 通过自定义瓦片 URL 切换激活图源（如 XYZ / WMTS 瓦片服务）。
   * 返回是否实际发生替换（false 表示 URL 为空、格式无效或与当前自定义图源一致）。
   */
  setCustomBaseImagerySource(url: string): boolean
}

export type MapEngineFactory = () => MapEngine

export type MapEngineLoader = () => Promise<MapEngineFactory>
