export type SceneMode = "2d" | "3d"

export interface SceneModeTransitionOptions {
  /** true 时跳过过渡动画，用于分屏辅助视口等需要立即写入相机状态的场景。 */
  readonly immediate?: boolean
}

export type MapEngineId = "cesium" | "deck-gl"

/** 地图渲染配置：primary 保留主视口清晰度，secondary 用于分屏辅助视口降载。 */
export type MapRenderingProfile = "primary" | "secondary"

/** 创建地图引擎时可传入的引擎无关配置。 */
export interface MapEngineCreationOptions {
  readonly renderingProfile?: MapRenderingProfile
}

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

/** 引擎无关的分屏视口状态；distanceMeters 为相机到屏幕中心地面点的距离。 */
export interface ViewportState {
  readonly longitude: number
  readonly latitude: number
  readonly distanceMeters: number
  readonly heading: number
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
  /** 视角跟随开关：true 时相机沿航线朝向自动调整并锁定鼠标 look/tilt。 */
  readonly followRoute: boolean
  readonly totalDistance: number
  readonly error?: string
}

export interface FlightPlaybackSettings {
  readonly speed?: number
  readonly loop?: boolean
  /** 切换视角跟随模式；为 undefined 时保持当前值。 */
  readonly followRoute?: boolean
}

/** 单次环绕飞行所用的设置；目前只有周期一项。 */
export interface OrbitFlightSettings {
  /** 一圈耗时，单位秒；引擎会自动钳制到合法区间。 */
  readonly durationSeconds?: number
}

/** 环绕飞行状态机；环绕为无终止循环，省略 preparing/completed。 */
export type OrbitFlightStatus = "idle" | "playing" | "paused"

/** 引擎对外暴露的环绕飞行运行时状态。 */
export interface OrbitFlightState {
  readonly status: OrbitFlightStatus
  /** 向后兼容字段：等价于 status !== "idle"。 */
  readonly active: boolean
  readonly durationSeconds: number
  /** 当前环绕角度归一化到 [0, 1)；idle 时为 0，暂停时冻结在暂停时刻。 */
  readonly progress: number
  /** 启动瞬间锁定的中心点；idle 时为 undefined，pause/resume/seek 均保持不变。 */
  readonly center?: {
    readonly longitude: number
    readonly latitude: number
    readonly height: number
  }
}

/** 支持的二维绘制几何类型。 */
export type MapDrawGeometryType =
  | "point"
  | "polyline"
  | "polygon"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "corridor"
  | "buffer"

/** 引擎无关的绘制坐标；height 为海拔高度，单位米。 */
export interface MapDrawCoordinate {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
}

/** 缓冲区源几何：可基于点、折线或多边形生成缓冲区多边形。 */
export type MapDrawBufferSource =
  | { readonly type: "point"; readonly coordinate: MapDrawCoordinate }
  | { readonly type: "polyline"; readonly coordinates: readonly MapDrawCoordinate[] }
  | { readonly type: "polygon"; readonly coordinates: readonly MapDrawCoordinate[] }

/** 引擎无关的绘制几何描述；type 与 MapDrawGeometryType 一一对应。 */
export type MapDrawGeometry =
  | { readonly type: "point"; readonly coordinate: MapDrawCoordinate }
  | { readonly type: "polyline"; readonly coordinates: readonly MapDrawCoordinate[] }
  | { readonly type: "polygon"; readonly coordinates: readonly MapDrawCoordinate[] }
  | {
      readonly type: "rectangle"
      readonly southwest: MapDrawCoordinate
      readonly northeast: MapDrawCoordinate
    }
  | {
      readonly type: "circle"
      readonly center: MapDrawCoordinate
      readonly radiusMeters: number
    }
  | {
      readonly type: "ellipse"
      readonly center: MapDrawCoordinate
      readonly semiMajorMeters: number
      readonly semiMinorMeters: number
      readonly rotationDegrees: number
    }
  | {
      readonly type: "corridor"
      readonly path: readonly MapDrawCoordinate[]
      readonly widthMeters: number
    }
  | {
      readonly type: "buffer"
      readonly source: MapDrawBufferSource
      readonly distanceMeters: number
      readonly polygon: readonly MapDrawCoordinate[]
    }

/** 启动绘制时可携带的可选参数；用于 corridor width 与 buffer distance。 */
export interface MapDrawStartOptions {
  readonly widthMeters?: number
  readonly distanceMeters?: number
}

/** 已完成的绘制成果。 */
export interface MapDrawFeature {
  readonly id: string
  readonly name: string
  readonly type: MapDrawGeometryType
  readonly geometry: MapDrawGeometry
  readonly createdAt: string
}

/** 绘制交互状态；activeCoordinates 只包含已确认节点，不包含鼠标预览点。 */
export interface MapDrawState {
  readonly mode: MapDrawGeometryType | null
  readonly activeCoordinates: readonly MapDrawCoordinate[]
  readonly features: readonly MapDrawFeature[]
  /** 当前选中的绘制成果 id；用于编辑把手可见性与列表项高亮。 */
  readonly selectedFeatureId: string | null
  /** 是否处于顶点或控制点拖拽中；用于 UI 禁用绘制工具按钮，不进 localStorage。 */
  readonly editingActive: boolean
}

/** 支持的三维绘制类型；model3d 本期仅占位，联调后启用。 */
export type MapDraw3DGeometryType =
  | "label"
  | "billboard"
  | "model3d"
  | "box"
  | "cylinder"
  | "sphere"
  | "wall"
  | "polylineVolume"
  | "waterSurface"
  | "videoSurface"

/** 三维绘制坐标；height 为海拔高度，单位米。 */
export interface MapDraw3DCoordinate {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
}

/** polylineVolume 截面顶点；相对路径中心线的局部坐标，单位米。 */
export interface MapDraw3DShapePoint {
  readonly x: number
  readonly y: number
}

/**
 * 三维绘制几何；form 对应入库形态：
 * 点类（label/billboard/model3d/box/cylinder/sphere）= point，
 * 线类（wall/polylineVolume/videoSurface）= line，面类（waterSurface）= polygon。
 */
export type MapDraw3DGeometry =
  | { readonly form: "point"; readonly coordinate: MapDraw3DCoordinate }
  | { readonly form: "line"; readonly coordinates: readonly MapDraw3DCoordinate[] }
  | { readonly form: "polygon"; readonly coordinates: readonly MapDraw3DCoordinate[] }

/** 三维绘制成果渲染参数；字段按类型取用，随成果整体持久化。 */
export interface MapDraw3DFeatureStyle {
  /** 主色（CSS 颜色）；缺省使用主题青色。 */
  readonly color?: string
  /** label 文本；缺省使用成果名称。 */
  readonly text?: string
  /** billboard 图标地址；缺省使用内置占位图标。 */
  readonly imageUrl?: string
  /** box 三轴尺寸（米）：[长, 宽, 高]。 */
  readonly dimensions?: readonly [number, number, number]
  /** cylinder 轴向长度（米）。 */
  readonly length?: number
  /** cylinder 上半径（米）。 */
  readonly topRadius?: number
  /** cylinder 下半径（米）。 */
  readonly bottomRadius?: number
  /** sphere 半径（米）。 */
  readonly radiusMeters?: number
  /** wall / videoSurface 拉伸高度（米），自各节点地面高度向上。 */
  readonly heightMeters?: number
  /** polylineVolume 截面顶点（局部米坐标）。 */
  readonly shape?: readonly MapDraw3DShapePoint[]
}

/** 启动三维绘制时可携带的参数；与成果渲染参数同构。 */
export type MapDraw3DStartOptions = MapDraw3DFeatureStyle

/** 已完成的三维绘制成果。 */
export interface MapDraw3DFeature {
  readonly id: string
  readonly name: string
  readonly type: MapDraw3DGeometryType
  readonly geometry: MapDraw3DGeometry
  readonly style: MapDraw3DFeatureStyle
  readonly createdAt: string
}

/** 三维绘制交互状态；activeCoordinates 只包含已确认节点，不包含鼠标预览点。 */
export interface MapDraw3DState {
  readonly mode: MapDraw3DGeometryType | null
  readonly activeCoordinates: readonly MapDraw3DCoordinate[]
  readonly features: readonly MapDraw3DFeature[]
  /** 当前选中的三维成果 id；用于列表高亮与地图锚点标记。 */
  readonly selectedFeatureId: string | null
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

/** 引擎无关的影像图层描述。 */
export interface SceneImageryLayerDescriptor {
  readonly id: string
  readonly protocol: "tianditu" | "xyz" | "wms" | "wmts"
  /** 天地图地图风格；仅 protocol 为 tianditu 时有效。 */
  readonly mapType?: "imagery" | "vector"
  readonly token?: string
  readonly subdomains?: string[]
  readonly urlTemplate?: string
  readonly baseUrl?: string
  /** WMS layers 参数，多个图层使用英文逗号分隔。 */
  readonly layers?: string
  /** WMTS layer 参数。 */
  readonly layer?: string
  readonly style?: string
  readonly tileMatrixSet?: string
  readonly format?: "image/png" | "image/jpeg"
  readonly version?: string
  readonly srs?: string
  readonly minimumLevel?: number
  readonly maximumLevel?: number
  readonly tilingScheme?: "web-mercator" | "geographic"
  readonly bounds?: MapBounds
  readonly authToken?: string
  readonly visible: boolean
  /** 渲染叠放优先级：数值越大越靠近视点。 */
  readonly renderOrder: number
  readonly opacity: number
}

/** 引擎无关的矢量图层样式。 */
export interface SceneVectorLayerStyle {
  readonly fillColor?: string
  readonly fillOpacity?: number
  readonly strokeColor?: string
  readonly strokeOpacity?: number
  readonly strokeWidth?: number
  readonly labelField?: string
  readonly labelColor?: string
  readonly labelSize?: number
  readonly extrusionHeightField?: string
  readonly iconUrl?: string
  /** 将 polygon 外环与洞转为贴地 polyline，保证边界宽度在 WebGL 中生效。 */
  readonly outlineAsPolyline?: boolean
  /** 贴地矢量面的叠放层级。 */
  readonly zIndex?: number
}

/** 引擎无关的 GeoJSON 矢量图层描述。 */
export interface SceneVectorLayerDescriptor {
  readonly id: string
  readonly source: "url" | "inline"
  readonly url?: string
  readonly data?: unknown
  readonly authToken?: string
  readonly visible: boolean
  readonly style?: SceneVectorLayerStyle
  /** 渲染叠放优先级：数值越大越靠近视点。 */
  readonly renderOrder: number
}

export interface SceneImageryLayerPatch {
  readonly visible?: boolean
  readonly opacity?: number
  readonly renderOrder?: number
}

export interface SceneVectorLayerPatch {
  readonly visible?: boolean
  readonly style?: SceneVectorLayerStyle
  readonly renderOrder?: number
}

/** 引擎无关的 3D Tiles 图层描述。 */
export interface SceneTilesetLayerDescriptor {
  readonly id: string
  readonly url: string
  readonly authToken?: string
  readonly maximumScreenSpaceError?: number
  readonly visible: boolean
  /** 渲染叠放优先级：数值越大越靠近视点。 */
  readonly renderOrder: number
  readonly opacity: number
}

/** 引擎无关的 glTF 模型图层描述。 */
export interface SceneModelLayerDescriptor {
  readonly id: string
  readonly url: string
  readonly authToken?: string
  readonly visible: boolean
  /** 渲染叠放优先级：数值越大越靠近视点。 */
  readonly renderOrder: number
  readonly opacity: number
  /** 模型摆放位置由资源范围中心推导。 */
  readonly bounds?: MapBounds
  readonly height?: number
}

export interface SceneTilesetLayerPatch {
  readonly visible?: boolean
  readonly opacity?: number
  readonly renderOrder?: number
}

export interface SceneModelLayerPatch {
  readonly visible?: boolean
  readonly opacity?: number
  readonly renderOrder?: number
}

export interface SceneLayerError {
  /** 托管图层 id；与图层方案中的 layer id 一致。 */
  readonly id: string
  readonly message: string
}

/** 引擎无关的卷帘比对配置；splitPosition 为 0~1 的横向分割比例。 */
export interface SwipeCompareOptions {
  readonly enabled: boolean
  readonly leftLayerId?: string
  readonly rightLayerId?: string
  /** 共同底图图层 ID；该图层在卷帘两侧均显示，用于兜底局部影像范围外的区域。 */
  readonly baseLayerId?: string
  readonly splitPosition: number
  readonly showDivider: boolean
}

export type MeasurementMode = "length" | "area" | "point-height" | "point-terrain-height"

export type MeasurementPointSource = "scene" | "terrain"

/** 测量点坐标；height 为 WGS-84 椭球高，单位米。 */
export interface MeasurementPoint {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
  readonly source: MeasurementPointSource
}

/** 引擎测量状态；points 为已确认点，previewPoint 为鼠标悬停预览点。 */
export interface MeasurementState {
  readonly mode: MeasurementMode | null
  readonly points: readonly MeasurementPoint[]
  readonly previewPoint: MeasurementPoint | undefined
  readonly completed: boolean
  readonly resultValue: number | undefined
  readonly error: string | undefined
}

export interface MapEngine {
  mount(container: HTMLElement): void | Promise<void>
  unmount(): void

  /** 飞行到指定边界；返回是否完整完成。 */
  flyToBounds(bounds: MapBounds): Promise<boolean>
  /** 保持当前相机高度、朝向和俯仰，飞行到指定经纬度。 */
  flyToCoordinate(coordinate: MapCoordinate): void
  setSceneMode(mode: SceneMode, options?: SceneModeTransitionOptions): void
  setRotateBrowse(enabled: boolean): void
  /** 开启或停止围绕当前视觉中心竖直轴的环绕飞行；启用时可指定初始周期。 */
  setOrbitFlight(enabled: boolean, options?: { readonly durationSeconds?: number }): void
  /** 暂停正在播放的环绕飞行；非 playing 状态为 no-op。 */
  pauseOrbitFlight(): void
  /** 恢复暂停的环绕飞行；非 paused 状态为 no-op。 */
  resumeOrbitFlight(): void
  /** 按 0~1 进度定位环绕角度，立即重定位相机位姿；引擎未启动时为 no-op。 */
  seekOrbitFlight(progress: number): void
  /** 实时更新运行中的环绕参数；引擎未启动时该调用为 no-op。 */
  setOrbitFlightSettings(settings: OrbitFlightSettings): void
  /** 读取环绕飞行状态；引擎未挂载时返回安全默认值。 */
  getOrbitFlightState(): OrbitFlightState
  /** 监听环绕飞行状态变化（含 status 与 progress），返回取消监听函数。 */
  onOrbitFlightStateChange(listener: (state: OrbitFlightState) => void): () => void
  setNorthLock(enabled: boolean): void
  setTerrainExaggeration(enabled: boolean, scale: number): void
  setTerrainExaggerationScale(scale: number): void
  /** 添加或替换托管影像图层；id 相同则先移除旧实例。 */
  addImageryLayer(descriptor: SceneImageryLayerDescriptor): Promise<void>
  /** 局部更新托管影像图层。 */
  updateImageryLayer(id: string, patch: SceneImageryLayerPatch): void
  /** 移除托管影像图层。 */
  removeImageryLayer(id: string): void
  /** 监听托管影像瓦片加载错误。 */
  onImageryLayerError(listener: (error: SceneLayerError) => void): () => void
  /** 设置单视口卷帘比对；关闭时恢复影像层方向。 */
  setSwipeCompare(options: SwipeCompareOptions): void
  /** 读取屏幕中心驱动的分屏同步视口状态。 */
  getViewportState(): ViewportState
  /** 以 top-down 视角应用分屏同步状态。 */
  setViewportState(state: ViewportState): void
  /** 监听分屏同步视口状态变化，返回取消监听函数。 */
  onViewportStateChange(listener: (state: ViewportState) => void): () => void
  /** 添加或替换托管 GeoJSON 图层。 */
  addVectorLayer(descriptor: SceneVectorLayerDescriptor): Promise<void>
  /** 局部更新托管 GeoJSON 图层。 */
  updateVectorLayer(id: string, patch: SceneVectorLayerPatch): void
  /** 移除托管 GeoJSON 图层。 */
  removeVectorLayer(id: string): void
  /** 添加或替换托管 3D Tiles 图层。 */
  addTilesetLayer(descriptor: SceneTilesetLayerDescriptor): Promise<void>
  /** 局部更新托管 3D Tiles 图层。 */
  updateTilesetLayer(id: string, patch: SceneTilesetLayerPatch): void
  /** 移除托管 3D Tiles 图层。 */
  removeTilesetLayer(id: string): void
  /** 添加或替换托管 glTF 模型图层。 */
  addModelLayer(descriptor: SceneModelLayerDescriptor): Promise<void>
  /** 局部更新托管 glTF 模型图层。 */
  updateModelLayer(id: string, patch: SceneModelLayerPatch): void
  /** 移除托管 glTF 模型图层。 */
  removeModelLayer(id: string): void
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

  /** 开始指定类型的绘制；切换类型会丢弃当前未完成草图。 */
  startDrawing(type: MapDrawGeometryType, options?: MapDrawStartOptions): boolean
  /** 局部更新绘制参数（corridor width / buffer distance），用于面板实时同步。 */
  setDrawingOption(option: Partial<MapDrawStartOptions>): void
  /** 完成当前草图；节点数不足时返回 false。 */
  finishDrawing(): boolean
  /** 取消当前草图并保留绘制模式。 */
  cancelDrawing(): boolean
  /** 取消当前草图并退出绘制模式。 */
  stopDrawing(): boolean
  /** 重命名绘制成果；名称为空或 id 无效时返回 false。 */
  renameDrawing(id: string, name: string): boolean
  /** 删除指定绘制成果。 */
  removeDrawing(id: string): boolean
  /** 对指定已有要素建立缓冲区；生成新的 buffer 成果并加入列表。源要素必须存在且几何可缓冲。 */
  createBufferFromFeature(sourceFeatureId: string, distanceMeters: number): boolean
  /** 设置已完成绘制成果的地图显隐。 */
  setDrawingFeaturesVisible(visible: boolean): void
  /** 取消草图并删除全部绘制成果。 */
  clearDrawings(): void
  /** 恢复持久化的绘制成果，并替换引擎中的现有成果。 */
  restoreDrawings(features: readonly MapDrawFeature[]): boolean
  /** 读取当前绘制状态；引擎未挂载时返回空状态。 */
  getDrawingState(): MapDrawState
  /** 监听绘制状态变化，返回取消监听函数。 */
  onDrawingStateChange(listener: (state: MapDrawState) => void): () => void
  /** 拾取屏幕坐标命中的绘制成果 id；未命中返回 null。 */
  pickDrawingFeature(screenPosition: { readonly x: number; readonly y: number }): string | null
  /** 选中或取消选中绘制成果；切换时同步创建或销毁编辑把手。 */
  selectDrawingFeature(id: string | null): boolean
  /** 进入编辑草图态：整体平移或拖动把手缩放；handleId 在 resize 时必填。 */
  beginEditDraft(featureId: string, kind: "translate" | "resize", handleId?: string): boolean
  /** 鼠标移动时实时更新编辑草图几何（仅 entity 与内部 draft，不持久化）。 */
  updateEditDraft(screenPosition: { readonly x: number; readonly y: number }): void
  /** 落定编辑：把最终 geometry 写回 features 并通知监听器，触发持久化。 */
  commitEditDraft(): boolean
  /** 回滚编辑：丢弃草图态，恢复到 begin 前的几何。 */
  cancelEditDraft(): boolean

  /** 开始指定类型的三维绘制；切换类型会丢弃当前未完成草图，model3d 本期不可用。 */
  start3DDrawing(type: MapDraw3DGeometryType, options?: MapDraw3DStartOptions): boolean
  /** 局部更新三维绘制参数；用于面板输入实时同步。 */
  set3DDrawingOption(option: Partial<MapDraw3DStartOptions>): void
  /** 完成当前三维草图；节点数不足时返回 false。 */
  finish3DDrawing(): boolean
  /** 取消当前三维草图并保留绘制模式。 */
  cancel3DDrawing(): boolean
  /** 取消当前三维草图并退出绘制模式。 */
  stop3DDrawing(): boolean
  /** 重命名三维绘制成果；名称为空或 id 无效时返回 false。 */
  rename3DDrawing(id: string, name: string): boolean
  /** 删除指定三维绘制成果。 */
  remove3DDrawing(id: string): boolean
  /** 设置已完成三维绘制成果的地图显隐。 */
  set3DDrawingFeaturesVisible(visible: boolean): void
  /** 取消三维草图并删除全部三维成果。 */
  clear3DDrawings(): void
  /** 恢复持久化的三维绘制成果，并替换引擎中的现有成果。 */
  restore3DDrawings(features: readonly MapDraw3DFeature[]): boolean
  /** 读取当前三维绘制状态；引擎未挂载时返回空状态。 */
  get3DDrawingState(): MapDraw3DState
  /** 监听三维绘制状态变化，返回取消监听函数。 */
  on3DDrawingStateChange(listener: (state: MapDraw3DState) => void): () => void
  /** 拾取屏幕坐标命中的三维绘制成果 id；未命中返回 null。 */
  pick3DDrawingFeature(screenPosition: { readonly x: number; readonly y: number }): string | null
  /** 选中或取消选中三维绘制成果；本期仅做高亮，不创建编辑把手。 */
  select3DDrawingFeature(id: string | null): boolean

  /**
   * 切换 DEM 地形服务；source 为空时恢复官方世界地形，未配置时回退椭球地形。
   * 返回是否实际应用，false 表示引擎未就绪、已被新请求取代或不支持。
   */
  setTerrainSource(source?: TerrainSource): Promise<boolean>
  /** 引擎容器尺寸变化后主动校正画布。 */
  resize(): void
  /** 切换测量模式；null 停止测量并清除图形。 */
  setMeasurementMode(mode: MeasurementMode | null): void
  /** 撤销当前测量的最后一个确认点。 */
  undoMeasurementPoint(): void
  /** 清空当前测量点并保留测量模式。 */
  clearMeasurement(): void
  /** 读取当前测量状态。 */
  getMeasurementState(): MeasurementState
  /** 监听测量状态变化，返回取消监听函数。 */
  onMeasurementStateChange(listener: (state: MeasurementState) => void): () => void
}

export type MapEngineFactory = (options?: MapEngineCreationOptions) => MapEngine

export type MapEngineLoader = () => Promise<MapEngineFactory>
