export type SceneMode = "2d" | "3d"

export type MapEngineId = "cesium"

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

export interface CameraFlightOptions {
  /** 相机到达目标视角后回调；用户交互中断飞行时触发 onCancel。 */
  readonly onComplete?: () => void
  readonly onCancel?: () => void
}

/** 飞行漫游航点；height 为可选的绝对海拔高度，单位米。 */
export interface FlightWaypoint {
  readonly longitude: number
  readonly latitude: number
  readonly height?: number
}

/** 本地持久化的飞行漫游航线。 */
export interface FlightRoute {
  readonly id: string
  readonly name: string
  readonly waypoints: FlightWaypoint[]
  readonly defaultHeight: number
  readonly safetyClearance: number
  readonly speed: number
  readonly pitch: number
  readonly loop: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export type FlightPlaybackStatus = "idle" | "preparing" | "playing" | "paused" | "completed"

export interface FlightPlaybackState {
  readonly status: FlightPlaybackStatus
  readonly progress: number
  readonly speed: number
  readonly pitch: number
  readonly loop: boolean
  readonly totalDistance: number
  readonly error?: string
}

export interface FlightPlaybackSettings {
  readonly speed?: number
  readonly loop?: boolean
}

/** 本地持久化的收藏视角；screenshot 为空字符串表示截图生成失败。 */
export interface ViewFavorite {
  readonly id: string
  readonly name: string
  readonly camera: CameraState
  readonly screenshot: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** 用于视角定位的地面坐标。 */
export interface MapCoordinate {
  readonly longitude: number
  readonly latitude: number
}

export type MapClickListener = (coordinate: MapCoordinate) => void

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

/** 引擎无关的 DEM 地形服务描述。 */
export interface TerrainSource {
  readonly id: string
  readonly name: string
  readonly url: string
  /** 静态认证 Token；启用后通过 Authorization: Bearer 头发送 */
  readonly authToken?: string
  readonly requestVertexNormals?: boolean
  readonly requestWaterMask?: boolean
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
  /** 开启后相机可进入地表以下，并以半透明地表辅助观察地下内容。 */
  setUndergroundMode(enabled: boolean): void
  getCameraHeading(): number
  setCameraHeading(heading: number): void
  resetCameraNorth(): void
  onCameraHeadingChange(listener: (heading: number) => void): () => void
  /** 读取当前相机参数；引擎未挂载时返回安全默认值。 */
  getCameraState(): CameraState
  /** 局部更新相机参数；未提供的字段保持当前值。 */
  setCameraState(state: Partial<Omit<CameraState, "longitude" | "latitude">>): void
  /** 飞行到完整相机状态；目标参数非法时不移动相机。 */
  flyToCameraState(state: CameraState, options?: CameraFlightOptions): void
  /** 监听相机参数变化，返回取消监听函数。 */
  onCameraStateChange(listener: (state: CameraState) => void): () => void
  /** 监听地图左键点击命中的地面坐标，返回取消监听函数。 */
  onMapClick(listener: MapClickListener): () => void
  /** 预览飞行航线与航点；航线非法时清理旧预览。 */
  setFlightRoutePreview(route: FlightRoute): void
  /** 清理飞行航线预览。 */
  clearFlightRoutePreview(): void
  /** 采样地形并开始播放；准备失败时返回 false。 */
  startFlight(route: FlightRoute): Promise<boolean>
  pauseFlight(): void
  resumeFlight(): void
  stopFlight(): void
  /** 按 0~1 进度定位播放位置。 */
  seekFlight(progress: number): void
  /** 更新播放期参数；非法值会被忽略。 */
  updateFlightPlayback(settings: FlightPlaybackSettings): void
  getFlightPlaybackState(): FlightPlaybackState
  onFlightPlaybackStateChange(listener: (state: FlightPlaybackState) => void): () => void
  /** 读取状态栏坐标读数；地图尚未就绪时返回 undefined。 */
  getCoordinateReadout(): CoordinateReadout | undefined
  /** 监听坐标读数变化；鼠标离开地图或未命中地球时回落到视图中心。 */
  onCoordinateReadoutChange(listener: (readout: CoordinateReadout) => void): () => void
  /** 在地图容器与浏览器全屏状态间切换；返回是否实际执行了切换。 */
  toggleSceneFullscreen(): Promise<boolean>
  /** 返回当前渲染画面 PNG 数据 URL；不支持或捕获失败时返回 undefined。 */
  captureScreenshot(): string | undefined
  /** 返回收藏列表使用的压缩缩略图数据 URL；不支持或捕获失败时返回 undefined。 */
  captureScreenshotThumbnail(): string | undefined

  /**
   * 当前引擎支持的图源列表（用于 UI 渲染下拉/列表）。
   * 引擎可返回空数组。
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
  /**
   * 切换 DEM 地形服务；source 为空时恢复椭球地形。
   * 返回是否实际应用，false 表示引擎未就绪、已被新请求取代或不支持。
   */
  setTerrainSource(source?: TerrainSource): Promise<boolean>
}

export type MapEngineFactory = () => MapEngine

export type MapEngineLoader = () => Promise<MapEngineFactory>
