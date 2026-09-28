import * as Cesium from "cesium"
import { pickCoordinate, toCartesian } from "./drawing/geometry.js"
import type {
  MapDraw3DCoordinate,
  MapDraw3DFeature,
  MapDraw3DFeatureStyle,
  MapDraw3DGeometry,
  MapDraw3DGeometryType,
  MapDraw3DShapePoint,
  MapDraw3DStartOptions,
  MapDraw3DState,
} from "../../types"
import { ACCENT, DEEP_BACK, FOREGROUND, WATER } from "../../themeColors.js"

/** 点类类型：单击即落定。 */
const POINT_TYPES = new Set<MapDraw3DGeometryType>([
  "label",
  "billboard",
  "box",
  "cylinder",
  "sphere",
])

/** 线类类型：多点连线，右键完成；视频面沿描点线竖起立面，同属线类。 */
const LINE_TYPES = new Set<MapDraw3DGeometryType>(["wall", "polylineVolume", "videoSurface"])

/** 面类类型：多点围面，右键完成。 */
const POLYGON_TYPES = new Set<MapDraw3DGeometryType>(["waterSurface"])

/** box 缺省三轴尺寸（米）：[长, 宽, 高]。 */
const DEFAULT_DIMENSIONS: readonly [number, number, number] = [80, 80, 80]

/** cylinder 缺省轴向长度（米）。 */
const DEFAULT_CYLINDER_LENGTH = 60

/** cylinder 缺省半径（米）。 */
const DEFAULT_CYLINDER_RADIUS = 15

/** sphere 缺省半径（米）。 */
const DEFAULT_SPHERE_RADIUS = 30

/** wall 缺省拉伸高度（米）。 */
const DEFAULT_WALL_HEIGHT = 25

/** polylineVolume 缺省截面：2m × 2m 矩形，中心对称。 */
const DEFAULT_VOLUME_SHAPE: readonly MapDraw3DShapePoint[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
]

/** billboard 缺省图标：定位占位图标（data URL，避免引入静态资源）。 */
const DEFAULT_BILLBOARD_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48"><path d="M18 2C9.7 2 3 8.7 3 17c0 11.3 15 29 15 29s15-17.7 15-29C33 8.7 26.3 2 18 2z" fill="${ACCENT}" stroke="${DEEP_BACK}" stroke-width="2"/><circle cx="18" cy="17" r="6" fill="${DEEP_BACK}"/></svg>`,
)}`

/** videoSurface 占位纹理；本期不接入真实视频流。 */
const VIDEO_PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${DEEP_BACK}"/><rect x="12" y="12" width="232" height="232" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-dasharray="18 10"/><path d="M104 88l64 40-64 40z" fill="${ACCENT}"/></svg>`,
)}`

/** 各类型完成草图所需的最少节点数；点类单击即完成。 */
function getMinimumCoordinates(type: MapDraw3DGeometryType): number {
  switch (type) {
    case "wall":
    case "polylineVolume":
    case "videoSurface":
      return 2
    case "waterSurface":
      return 3
    default:
      return 1
  }
}

/** 三维类型的入库几何形态；model3d 本期未开放，返回 undefined。 */
function getGeometryForm(type: MapDraw3DGeometryType): MapDraw3DGeometry["form"] | undefined {
  if (POINT_TYPES.has(type)) return "point"
  if (LINE_TYPES.has(type)) return "line"
  if (POLYGON_TYPES.has(type)) return "polygon"
  return undefined
}

/** 三维类型中文名（用于成果自动命名）。 */
function feature3DTypeName(type: MapDraw3DGeometryType) {
  switch (type) {
    case "label":
      return "标注"
    case "billboard":
      return "图标"
    case "model3d":
      return "三维模型"
    case "box":
      return "长方体"
    case "cylinder":
      return "圆柱"
    case "sphere":
      return "球体"
    case "wall":
      return "墙体"
    case "polylineVolume":
      return "管线"
    case "waterSurface":
      return "水面"
    case "videoSurface":
      return "视频面"
  }
}

/** 校验三维坐标各字段有限。 */
function isFiniteCoordinate3D(coordinate: MapDraw3DCoordinate) {
  return (
    Number.isFinite(coordinate.longitude) &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.height)
  )
}

/** 校验三维成果渲染参数中的数值字段；非法值阻断恢复。 */
function isValid3DStyle(style: MapDraw3DFeatureStyle) {
  const numericValues = [
    style.length,
    style.topRadius,
    style.bottomRadius,
    style.radiusMeters,
    style.heightMeters,
  ]
  for (const value of numericValues) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) return false
  }

  if (style.dimensions) {
    if (style.dimensions.length !== 3) return false
    for (const value of style.dimensions) {
      if (!Number.isFinite(value) || value <= 0) return false
    }
  }

  if (style.shape) {
    if (style.shape.length < 3) return false
    for (const point of style.shape) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
    }
  }

  return true
}

/** 校验持久化的三维成果，避免异常 localStorage 内容破坏地图初始化。 */
function isValid3DFeature(feature: MapDraw3DFeature) {
  if (
    !feature ||
    typeof feature.id !== "string" ||
    feature.id.length === 0 ||
    typeof feature.name !== "string" ||
    typeof feature.createdAt !== "string"
  ) {
    return false
  }

  const { geometry, type, style } = feature
  if (!geometry || !style) return false
  if (!isValid3DStyle(style)) return false

  const expectedForm = getGeometryForm(type)
  if (!expectedForm || geometry.form !== expectedForm) return false

  switch (geometry.form) {
    case "point":
      return isFiniteCoordinate3D(geometry.coordinate)
    case "line":
      return geometry.coordinates.length >= 2 && geometry.coordinates.every(isFiniteCoordinate3D)
    case "polygon":
      return geometry.coordinates.length >= 3 && geometry.coordinates.every(isFiniteCoordinate3D)
  }
}

/** 从点类几何中取出放置坐标；形态不匹配时抛错，由创建方统一捕获。 */
function requirePointCoordinate(geometry: MapDraw3DGeometry): MapDraw3DCoordinate {
  if (geometry.form !== "point") {
    throw new Error("三维绘制几何形态与类型不匹配：期望点类")
  }
  return geometry.coordinate
}

/** 从线类几何中取出节点序列；形态不匹配时抛错，由创建方统一捕获。 */
function requireLineCoordinates(geometry: MapDraw3DGeometry): readonly MapDraw3DCoordinate[] {
  if (geometry.form !== "line") {
    throw new Error("三维绘制几何形态与类型不匹配：期望线类")
  }
  return geometry.coordinates
}

/** 从面类几何中取出外环节点序列；形态不匹配时抛错，由创建方统一捕获。 */
function requirePolygonCoordinates(geometry: MapDraw3DGeometry): readonly MapDraw3DCoordinate[] {
  if (geometry.form !== "polygon") {
    throw new Error("三维绘制几何形态与类型不匹配：期望面类")
  }
  return geometry.coordinates
}

/** 计算成果锚点（标注与选中标记位置）：点类取放置点，线 / 面类取坐标算术平均。 */
function computeAnchor(geometry: MapDraw3DGeometry): MapDraw3DCoordinate {
  if (geometry.form === "point") return geometry.coordinate

  const coordinates = geometry.coordinates
  if (coordinates.length === 0) return { longitude: 0, latitude: 0, height: 0 }

  let sumLongitude = 0
  let sumLatitude = 0
  let sumHeight = 0
  for (const coordinate of coordinates) {
    sumLongitude += coordinate.longitude
    sumLatitude += coordinate.latitude
    sumHeight += coordinate.height
  }

  return {
    longitude: sumLongitude / coordinates.length,
    latitude: sumLatitude / coordinates.length,
    height: sumHeight / coordinates.length,
  }
}

/**
 * 基于 Cesium 内置 Water fabric 的实体材质属性；水面绘制成果专用。
 * Entity API 没有内置的水面 MaterialProperty。Cesium 的 MaterialProperty 是
 * 抽象接口基类（构造即抛 DeveloperError），不能 extends 继承，这里按官方
 * 自定义材质模式以鸭子类型实现接口成员：
 * getType 返回内置 Water 类型，getValue 提供颜色类 uniform，其余 uniform 走 fabric 默认值。
 */
class WaterSurfaceMaterialProperty {
  /** 颜色 uniforms 恒定；水面动画由 Water fabric 内部每帧驱动。 */
  readonly isConstant = false

  /** Cesium Property 契约事件；材质创建后定义不再变化。 */
  readonly definitionChanged = new Cesium.Event()

  private readonly baseColor: Cesium.Color

  constructor(color: Cesium.Color) {
    this.baseColor = color
  }

  /** 对应 Cesium 内置水面材质类型；法线贴图使用 fabric 默认资源。 */
  getType(_time: Cesium.JulianDate): string {
    return Cesium.Material.WaterType
  }

  /** 提供水面 fabric 的颜色与动态 uniform。 */
  getValue(_time: Cesium.JulianDate, result?: Record<string, unknown>) {
    const value = result ?? {}
    value.baseWaterColor = this.baseColor
    value.blendColor = this.baseColor
    value.animationSpeed = 0.02
    value.amplitude = 1
    value.specularIntensity = 0.6
    return value
  }

  equals(other?: Cesium.Property): boolean {
    return other === this
  }
}

/** 管理 Cesium 中的 3D 绘制交互与成果：Entity 为主，polylineVolume 走 Primitive。 */
export class Cesium3DDrawingController {
  private viewer?: Cesium.Viewer
  private dataSource?: Cesium.CustomDataSource
  private eventHandler?: Cesium.ScreenSpaceEventHandler
  private mode: MapDraw3DGeometryType | null = null
  private drawingOptions: MapDraw3DFeatureStyle = {}
  private draftCoordinates: MapDraw3DCoordinate[] = []
  private cursorCoordinate?: MapDraw3DCoordinate
  private draftEntity?: Cesium.Entity
  private draftVertexEntities: Cesium.Entity[] = []
  /** 成果主体实体：除 polylineVolume 外的全部类型。 */
  private readonly entities = new Map<string, Cesium.Entity>()
  /** polylineVolume 走 Primitive 渲染，独立索引便于拾取与显隐。 */
  private readonly primitives = new Map<string, Cesium.Primitive>()
  /** 成果名称标注实体；label 类型的内容即标注，不重复创建。 */
  private readonly labelEntities = new Map<string, Cesium.Entity>()
  private readonly features = new Map<string, MapDraw3DFeature>()
  private readonly stateListeners = new Set<(state: MapDraw3DState) => void>()
  private featuresVisible = false
  private selectedFeatureId: string | null = null
  /** 选中标记：单个点实体跟随选中成果锚点。 */
  private highlightEntity?: Cesium.Entity
  private idSeed = 0
  private nameSeed = 0

  /** 将三维绘制控制器挂载到指定 viewer。 */
  mount(viewer: Cesium.Viewer) {
    if (this.viewer || viewer.isDestroyed()) return

    this.viewer = viewer
    this.dataSource = new Cesium.CustomDataSource("map-drawing-3d")
    this.dataSource.show = this.featuresVisible
    void viewer.dataSources.add(this.dataSource)

    this.eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    this.eventHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      this.handleLeftClick(position)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    this.eventHandler.setInputAction(() => {
      // 右键完成草图；无模式或节点不足时为 no-op
      this.finishDrawing()
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
    this.eventHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
      this.updateCursor(endPosition)
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
  }

  /** 销毁交互监听并清空三维绘制数据源与图元。 */
  unmount() {
    this.eventHandler?.destroy()
    this.eventHandler = undefined

    if (this.viewer && !this.viewer.isDestroyed()) {
      for (const primitive of this.primitives.values()) {
        this.viewer.scene.primitives.remove(primitive)
      }
      if (this.dataSource) {
        void this.viewer.dataSources.remove(this.dataSource, true)
      }
    }

    this.viewer = undefined
    this.dataSource = undefined
    this.draftEntity = undefined
    this.draftVertexEntities = []
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
    this.highlightEntity = undefined
    this.entities.clear()
    this.primitives.clear()
    this.labelEntities.clear()
    this.features.clear()
    this.selectedFeatureId = null
    this.mode = null
  }

  /** 开始一种三维绘制模式；切换模式会先丢弃未完成草图与选中态。 */
  startDrawing(type: MapDraw3DGeometryType, options?: MapDraw3DStartOptions) {
    if (!this.viewer || !this.dataSource) return false

    // model3d 本期仅占位，待三维模型联调后启用
    if (type === "model3d") return false

    if (options) {
      this.drawingOptions = { ...this.drawingOptions, ...options }
    }

    if (this.mode === type) {
      this.discardDraft()
      this.notifyState()
      return true
    }

    if (this.selectedFeatureId) {
      this.selectedFeatureId = null
      this.refreshHighlightEntity()
    }

    this.discardDraft()
    this.mode = type
    this.notifyState()
    return true
  }

  /** 局部更新三维绘制参数；面板可在不切换模式时同步默认值。 */
  setDrawingOption(option: Partial<MapDraw3DStartOptions>) {
    this.drawingOptions = { ...this.drawingOptions, ...option }
  }

  /** 完成当前三维草图并保留绘制模式，便于连续绘制。 */
  finishDrawing() {
    if (!this.viewer || !this.dataSource || !this.mode) return false

    const minimum = getMinimumCoordinates(this.mode)
    if (this.draftCoordinates.length < minimum) return false

    const feature = this.createFeature(this.mode, [...this.draftCoordinates])

    try {
      this.createFeatureVisual(feature)
    } catch (error) {
      // 创建失败（如几何非法、Cesium 校验抛错）时清理草图，避免残留 draft 无法结束
      console.error("[map] 三维绘制成果创建失败", error)
      this.discardDraft()
      this.notifyState()
      return false
    }

    this.discardDraft()
    this.features.set(feature.id, feature)
    this.notifyState()
    return true
  }

  /** 取消当前三维草图，已完成成果不受影响。 */
  cancelDrawing() {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.notifyState()
    return true
  }

  /** 取消当前三维草图并退出绘制模式。 */
  stopDrawing() {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.mode = null
    this.notifyState()
    return true
  }

  /** 更新三维成果名称并同步地图标注。 */
  renameDrawing(id: string, name: string) {
    const trimmedName = name.trim()
    const feature = this.features.get(id)
    if (!trimmedName || !feature) return false

    const entity = this.entities.get(id)
    if (entity?.label) {
      entity.label.text = new Cesium.ConstantProperty(trimmedName)
    }
    const labelEntity = this.labelEntities.get(id)
    if (labelEntity?.label) {
      labelEntity.label.text = new Cesium.ConstantProperty(trimmedName)
    }

    this.features.set(id, { ...feature, name: trimmedName })
    this.notifyState()
    return true
  }

  /** 删除单个三维绘制成果。 */
  removeDrawing(id: string) {
    if (!this.dataSource || !this.features.has(id)) return false

    if (this.selectedFeatureId === id) {
      this.selectedFeatureId = null
      this.refreshHighlightEntity()
    }

    const entity = this.entities.get(id)
    if (entity) this.dataSource.entities.remove(entity)
    const labelEntity = this.labelEntities.get(id)
    if (labelEntity) this.dataSource.entities.remove(labelEntity)
    const primitive = this.primitives.get(id)
    if (primitive && this.viewer) this.viewer.scene.primitives.remove(primitive)

    this.entities.delete(id)
    this.labelEntities.delete(id)
    this.primitives.delete(id)
    this.features.delete(id)
    this.notifyState()
    return true
  }

  /** 同步已完成三维成果的数据源与图元显隐。 */
  setFeaturesVisible(visible: boolean) {
    this.featuresVisible = visible

    if (this.dataSource) {
      this.dataSource.show = visible
    }
    for (const primitive of this.primitives.values()) {
      primitive.show = visible
    }
  }

  /** 删除全部三维成果并取消未完成草图。 */
  clearDrawings() {
    if (!this.viewer || !this.dataSource) return

    this.discardDraft()
    this.clearFeatureVisuals()
    this.selectedFeatureId = null
    this.notifyState()
  }

  /** 恢复持久化成果；无效或重复数据会被跳过。 */
  restoreDrawings(features: readonly MapDraw3DFeature[]) {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.clearFeatureVisuals()
    this.selectedFeatureId = null

    const restoredIds = new Set<string>()
    for (const feature of features) {
      if (restoredIds.has(feature.id)) continue
      if (!isValid3DFeature(feature)) continue

      try {
        this.createFeatureVisual(feature)
      } catch (error) {
        console.warn("[map] 三维绘制成果恢复失败，已跳过", error)
        continue
      }

      restoredIds.add(feature.id)
      this.features.set(feature.id, feature)
      this.updateIdSeed(feature.id)
      this.updateNameSeed(feature.name)
    }

    this.notifyState()
    return true
  }

  /** 读取当前三维绘制状态快照。 */
  getDrawingState(): MapDraw3DState {
    return {
      mode: this.mode,
      activeCoordinates: [...this.draftCoordinates],
      features: [...this.features.values()],
      selectedFeatureId: this.selectedFeatureId,
    }
  }

  /** 监听三维绘制状态变化；注册时立即返回当前状态。 */
  onDrawingStateChange(listener: (state: MapDraw3DState) => void) {
    this.stateListeners.add(listener)
    listener(this.getDrawingState())

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /** 拾取屏幕坐标命中的三维绘制成果 id；主体、标注与图元实例均返回所属 featureId。 */
  pickDrawingFeature(screenPosition: { readonly x: number; readonly y: number }): string | null {
    if (!this.viewer) return null

    return this.pickFeature(new Cesium.Cartesian2(screenPosition.x, screenPosition.y))
  }

  /** 选中或取消选中三维绘制成果；本期仅做锚点高亮，不创建编辑把手。 */
  selectDrawingFeature(id: string | null): boolean {
    if (!this.viewer || !this.dataSource) return false

    if (id === null || id === this.selectedFeatureId) {
      if (this.selectedFeatureId) {
        this.selectedFeatureId = null
        this.refreshHighlightEntity()
        this.notifyState()
      }
      return true
    }

    if (!this.features.has(id)) return false

    // 进入选中前互斥清理绘制模式与未完成草图（与 2D 绘制对称）
    if (this.mode) {
      this.discardDraft()
      this.mode = null
    }

    this.selectedFeatureId = id
    this.refreshHighlightEntity()
    this.notifyState()
    return true
  }

  // ====== 私有：交互处理 ======

  /** 处理左键：绘制模式下确认节点，非绘制模式维护选中态。 */
  private handleLeftClick(position: Cesium.Cartesian2) {
    if (!this.viewer) return

    if (this.mode) {
      // 命中已有成果时切换为选中，与 2D 绘制保持一致的互斥语义
      const hitFeatureId = this.pickFeature(position)
      if (hitFeatureId && this.features.has(hitFeatureId)) {
        this.selectDrawingFeature(hitFeatureId)
        return
      }
      this.addCoordinate(position)
      return
    }

    if (this.selectedFeatureId) {
      // 选中态点击空白处（未命中任何成果）才取消选中
      const hitFeatureId = this.pickFeature(position)
      if (!hitFeatureId) {
        this.selectDrawingFeature(null)
      }
      return
    }

    const hitFeatureId = this.pickFeature(position)
    if (hitFeatureId && this.features.has(hitFeatureId)) {
      this.selectDrawingFeature(hitFeatureId)
    }
  }

  /** 处理地图左键点击并确认一个绘制节点（点类单击即完成）。 */
  private addCoordinate(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode) return

    const coordinate = pickCoordinate(this.viewer, position)
    if (!coordinate) return

    this.draftCoordinates.push(coordinate)

    if (POINT_TYPES.has(this.mode)) {
      this.finishDrawing()
      return
    }

    this.createDraftEntity()
    this.createDraftVertexEntity(coordinate)
    this.notifyState()
  }

  /** 处理鼠标移动并更新草图预览点。 */
  private updateCursor(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode) return
    if (this.draftCoordinates.length === 0) return

    this.cursorCoordinate = pickCoordinate(this.viewer, position)
  }

  // ====== 私有：实体构造 ======

  /** 由已确认节点构造三维绘制成果；geometry 形态按类型归入点 / 线 / 面。 */
  private createFeature(
    type: MapDraw3DGeometryType,
    coordinates: readonly MapDraw3DCoordinate[],
  ): MapDraw3DFeature {
    this.nameSeed += 1
    const serial = String(this.nameSeed).padStart(3, "0")

    let geometry: MapDraw3DGeometry
    if (POINT_TYPES.has(type)) {
      geometry = { form: "point", coordinate: coordinates[0]! }
    } else if (LINE_TYPES.has(type)) {
      geometry = { form: "line", coordinates }
    } else {
      geometry = { form: "polygon", coordinates }
    }

    return {
      id: this.createId(type),
      name: `绘制${feature3DTypeName(type)} ${serial}`,
      type,
      geometry,
      style: this.resolveFeatureStyle(type),
      createdAt: new Date().toISOString(),
    }
  }

  /** 按类型归并当前绘制参数与缺省值，生成成果 style。 */
  private resolveFeatureStyle(type: MapDraw3DGeometryType): MapDraw3DFeatureStyle {
    const options = this.drawingOptions

    switch (type) {
      case "label":
        return { text: options.text }
      case "billboard":
        return { imageUrl: options.imageUrl }
      case "box":
        return {
          color: options.color,
          dimensions: options.dimensions ?? DEFAULT_DIMENSIONS,
        }
      case "cylinder":
        return {
          color: options.color,
          length: options.length ?? DEFAULT_CYLINDER_LENGTH,
          topRadius: options.topRadius ?? DEFAULT_CYLINDER_RADIUS,
          bottomRadius: options.bottomRadius ?? DEFAULT_CYLINDER_RADIUS,
        }
      case "sphere":
        return {
          color: options.color,
          radiusMeters: options.radiusMeters ?? DEFAULT_SPHERE_RADIUS,
        }
      case "wall":
        return {
          color: options.color,
          heightMeters: options.heightMeters ?? DEFAULT_WALL_HEIGHT,
        }
      case "polylineVolume":
        return {
          color: options.color,
          shape: options.shape ?? DEFAULT_VOLUME_SHAPE,
        }
      case "videoSurface":
        return {
          color: options.color,
          heightMeters: options.heightMeters ?? DEFAULT_WALL_HEIGHT,
        }
      default:
        // 水面 / 三维模型：暂无必配参数
        return {}
    }
  }

  /** 为成果创建地图图形：Entity 为主，polylineVolume 走 Primitive；并附加名称标注。 */
  private createFeatureVisual(feature: MapDraw3DFeature) {
    if (!this.dataSource || !this.viewer) {
      throw new Error("三维绘制数据源尚未初始化")
    }

    if (feature.type === "polylineVolume") {
      const primitive = this.createVolumePrimitive(feature)
      this.viewer.scene.primitives.add(primitive)
      this.primitives.set(feature.id, primitive)
    } else {
      const entity = this.dataSource.entities.add(this.buildFeatureEntityOptions(feature))
      this.entities.set(feature.id, entity)
    }

    // label 类型的内容即标注，不再叠加名称标注
    if (feature.type !== "label") {
      const labelEntity = this.dataSource.entities.add(this.buildLabelEntityOptions(feature))
      this.labelEntities.set(feature.id, labelEntity)
    }
  }

  /** 构造三维成果主体实体的 options；不写入 dataSource，供创建与恢复复用。 */
  private buildFeatureEntityOptions(feature: MapDraw3DFeature): Cesium.Entity.ConstructorOptions {
    const { geometry, style } = feature
    const color = Cesium.Color.fromCssColorString(style.color ?? ACCENT)
    const fillColor = color.withAlpha(0.35)

    const options: Cesium.Entity.ConstructorOptions = {
      id: feature.id,
      properties: new Cesium.PropertyBag({
        featureId: new Cesium.ConstantProperty(feature.id),
      }),
    }

    switch (feature.type) {
      case "label": {
        options.position = toCartesian(requirePointCoordinate(geometry))
        options.label = {
          text: style.text ?? feature.name,
          font: "600 13px sans-serif",
          fillColor: Cesium.Color.fromCssColorString(FOREGROUND),
          outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString(DEEP_BACK).withAlpha(0.78),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        }
        break
      }
      case "billboard": {
        options.position = toCartesian(requirePointCoordinate(geometry))
        options.billboard = {
          image: style.imageUrl ?? DEFAULT_BILLBOARD_IMAGE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
        break
      }
      case "box": {
        const dimensions = style.dimensions ?? DEFAULT_DIMENSIONS
        options.position = toCartesian(
          this.resolveLiftedCoordinate(requirePointCoordinate(geometry), feature.type, style),
        )
        options.box = {
          dimensions: new Cesium.Cartesian3(dimensions[0], dimensions[1], dimensions[2]),
          material: fillColor,
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "cylinder": {
        const length = style.length ?? DEFAULT_CYLINDER_LENGTH
        options.position = toCartesian(
          this.resolveLiftedCoordinate(requirePointCoordinate(geometry), feature.type, style),
        )
        options.cylinder = {
          length,
          topRadius: style.topRadius ?? DEFAULT_CYLINDER_RADIUS,
          bottomRadius: style.bottomRadius ?? DEFAULT_CYLINDER_RADIUS,
          material: fillColor,
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "sphere": {
        const radius = style.radiusMeters ?? DEFAULT_SPHERE_RADIUS
        options.position = toCartesian(
          this.resolveLiftedCoordinate(requirePointCoordinate(geometry), feature.type, style),
        )
        options.ellipsoid = {
          radii: new Cesium.Cartesian3(radius, radius, radius),
          material: fillColor,
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "wall": {
        const coordinates = requireLineCoordinates(geometry)
        const heightMeters = style.heightMeters ?? DEFAULT_WALL_HEIGHT
        options.wall = {
          positions: coordinates.map(toCartesian),
          minimumHeights: coordinates.map((coordinate) => coordinate.height),
          maximumHeights: coordinates.map((coordinate) => coordinate.height + heightMeters),
          material: fillColor,
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "waterSurface": {
        const coordinates = requirePolygonCoordinates(geometry)
        options.polygon = {
          hierarchy: new Cesium.PolygonHierarchy(coordinates.map(toCartesian)),
          perPositionHeight: true,
          material: new WaterSurfaceMaterialProperty(
            Cesium.Color.fromCssColorString(style.color ?? WATER),
          ),
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "videoSurface": {
        // 视频面为竖立面（视频墙）：沿描点线自地面向上竖起，视频纹理贴在立面上
        const coordinates = requireLineCoordinates(geometry)
        const heightMeters = style.heightMeters ?? DEFAULT_WALL_HEIGHT
        options.wall = {
          positions: coordinates.map(toCartesian),
          minimumHeights: coordinates.map((coordinate) => coordinate.height),
          maximumHeights: coordinates.map((coordinate) => coordinate.height + heightMeters),
          material: new Cesium.ImageMaterialProperty({
            image: VIDEO_PLACEHOLDER_IMAGE,
            color: fillColor,
            transparent: true,
          }),
          outline: true,
          outlineColor: color,
        }
        break
      }
      case "polylineVolume":
      case "model3d":
        // 管线走 Primitive；model3d 本期不开放，不应到达
        throw new Error(`三维类型 ${feature.type} 不支持实体渲染`)
    }

    return options
  }

  /** 构造成果名称标注实体的 options；样式与 2D 绘制标注一致。 */
  private buildLabelEntityOptions(feature: MapDraw3DFeature): Cesium.Entity.ConstructorOptions {
    return {
      position: toCartesian(computeAnchor(feature.geometry)),
      properties: new Cesium.PropertyBag({
        featureId: new Cesium.ConstantProperty(feature.id),
      }),
      label: {
        text: feature.name,
        font: "600 13px sans-serif",
        fillColor: Cesium.Color.fromCssColorString(FOREGROUND),
        outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString(DEEP_BACK).withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      },
    }
  }

  /** 点类成果的放置抬升：让长方体 / 圆柱 / 球体立于地表而不是半埋。 */
  private resolveLiftedCoordinate(
    coordinate: MapDraw3DCoordinate,
    type: MapDraw3DGeometryType,
    style: MapDraw3DFeatureStyle,
  ): MapDraw3DCoordinate {
    switch (type) {
      case "box": {
        const height = style.dimensions?.[2] ?? DEFAULT_DIMENSIONS[2]
        return { ...coordinate, height: coordinate.height + height / 2 }
      }
      case "cylinder": {
        const length = style.length ?? DEFAULT_CYLINDER_LENGTH
        return { ...coordinate, height: coordinate.height + length / 2 }
      }
      case "sphere": {
        const radius = style.radiusMeters ?? DEFAULT_SPHERE_RADIUS
        return { ...coordinate, height: coordinate.height + radius }
      }
      default:
        return coordinate
    }
  }

  /** 创建管线图元：Primitive + GeometryInstance + PolylineVolumeGeometry，圆角闭合外形。 */
  private createVolumePrimitive(feature: MapDraw3DFeature): Cesium.Primitive {
    const coordinates = requireLineCoordinates(feature.geometry)
    const shape = (feature.style.shape ?? DEFAULT_VOLUME_SHAPE).map(
      (point) => new Cesium.Cartesian2(point.x, point.y),
    )
    const color = Cesium.Color.fromCssColorString(feature.style.color ?? ACCENT)

    return new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineVolumeGeometry({
          polylinePositions: coordinates.map(toCartesian),
          shapePositions: shape,
          cornerType: Cesium.CornerType.ROUNDED,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        // 实例 id 即 featureId；scene.pick 命中时可直接反查成果
        id: feature.id,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.55)),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        closed: true,
      }),
    })
  }

  /** 创建跟随鼠标变化的草图实体；线类预览折线，面类预览填充面。 */
  private createDraftEntity() {
    if (!this.dataSource || !this.mode || this.draftEntity) return

    const isPolygonMode = POLYGON_TYPES.has(this.mode)
    const isPolylineMode = LINE_TYPES.has(this.mode) || isPolygonMode

    this.draftEntity = this.dataSource.entities.add({
      position: new Cesium.CallbackPositionProperty(() => {
        const coordinates = this.getPreviewCoordinates()
        const coordinate = coordinates[coordinates.length - 1]
        return coordinate ? toCartesian(coordinate) : Cesium.Cartesian3.ZERO
      }, false),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString(ACCENT),
        outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
        outlineWidth: 2,
      },
      polyline: isPolylineMode
        ? {
            positions: new Cesium.CallbackProperty(
              () => this.getPreviewCoordinates().map(toCartesian),
              false,
            ),
            width: 3,
            material: Cesium.Color.fromCssColorString(ACCENT),
            clampToGround: true,
            show: new Cesium.CallbackProperty(
              () => !isPolygonMode || this.getPreviewCoordinates().length < 3,
              false,
            ),
          }
        : undefined,
      polygon: isPolygonMode
        ? {
            hierarchy: new Cesium.CallbackProperty(
              () => new Cesium.PolygonHierarchy(this.getPreviewCoordinates().map(toCartesian)),
              false,
            ),
            material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(ACCENT),
            perPositionHeight: true,
          }
        : undefined,
    })
  }

  /** 为已确认节点创建固定点实体，避免节点跟随鼠标预览点移动。 */
  private createDraftVertexEntity(coordinate: MapDraw3DCoordinate) {
    if (!this.dataSource) return

    this.draftVertexEntities.push(
      this.dataSource.entities.add({
        position: toCartesian(coordinate),
        point: {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString(ACCENT),
          outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
          outlineWidth: 2,
        },
      }),
    )
  }

  /** 移除当前草图实体和临时节点。 */
  private discardDraft() {
    if (this.draftEntity && this.dataSource) {
      this.dataSource.entities.remove(this.draftEntity)
    }

    for (const entity of this.draftVertexEntities) {
      this.dataSource?.entities.remove(entity)
    }

    this.draftEntity = undefined
    this.draftVertexEntities = []
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
  }

  /** 移除全部成果图形与标注，并清空索引；不负责通知状态。 */
  private clearFeatureVisuals() {
    if (this.viewer) {
      for (const primitive of this.primitives.values()) {
        this.viewer.scene.primitives.remove(primitive)
      }
    }
    if (this.dataSource) {
      for (const entity of this.entities.values()) {
        this.dataSource.entities.remove(entity)
      }
      for (const entity of this.labelEntities.values()) {
        this.dataSource.entities.remove(entity)
      }
      if (this.highlightEntity) {
        this.dataSource.entities.remove(this.highlightEntity)
        this.highlightEntity = undefined
      }
    }

    this.entities.clear()
    this.primitives.clear()
    this.labelEntities.clear()
  }

  /** 刷新选中标记：在选中成果锚点显示一个高亮点。 */
  private refreshHighlightEntity() {
    if (!this.dataSource) return

    if (this.highlightEntity) {
      this.dataSource.entities.remove(this.highlightEntity)
      this.highlightEntity = undefined
    }

    if (!this.selectedFeatureId) return

    const feature = this.features.get(this.selectedFeatureId)
    if (!feature) return

    this.highlightEntity = this.dataSource.entities.add({
      position: toCartesian(computeAnchor(feature.geometry)),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString(ACCENT),
        outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  /** 拾取屏幕坐标命中的成果 id；图元实例按实例 id，实体按 properties 反查。 */
  private pickFeature(position: Cesium.Cartesian2): string | null {
    if (!this.viewer) return null

    const picked = this.viewer.scene.pick(position)
    if (!picked) return null

    // polylineVolume：GeometryInstance id 即 featureId
    if (typeof picked.id === "string") {
      return this.features.has(picked.id) ? picked.id : null
    }

    const id = picked.id as unknown
    if (!(id instanceof Cesium.Entity)) return null

    // 全部成果实体（主体与标注）均携带 featureId 属性
    const properties = id.properties
    if (properties instanceof Cesium.PropertyBag) {
      const featureId = properties.featureId?.getValue(Cesium.JulianDate.now())
      if (typeof featureId === "string") return featureId
    }

    return null
  }

  /** 获取包含鼠标预览点的草图坐标。 */
  private getPreviewCoordinates() {
    const coordinates = [...this.draftCoordinates]
    if (this.cursorCoordinate && this.mode) {
      coordinates.push(this.cursorCoordinate)
    }

    return coordinates
  }

  /** 生成稳定的三维绘制实体 id。 */
  private createId(prefix: string) {
    this.idSeed += 1
    return `map-draw3d-${prefix}-${this.idSeed}`
  }

  /** 根据恢复成果同步实体 id 序号，避免新增成果与持久化 id 冲突。 */
  private updateIdSeed(id: string) {
    const match =
      /^map-draw3d-(?:label|billboard|model3d|box|cylinder|sphere|wall|polylineVolume|waterSurface|videoSurface)-(\d+)$/.exec(
        id,
      )
    if (!match) return

    const seed = Number.parseInt(match[1] ?? "", 10)
    if (Number.isFinite(seed) && seed > this.idSeed) {
      this.idSeed = seed
    }
  }

  /** 根据恢复成果同步名称序号，避免新增成果名称从 001 重复。 */
  private updateNameSeed(name: string) {
    const match = /^绘制(?:标注|图标|三维模型|长方体|圆柱|球体|墙体|管线|水面|视频面) (\d+)$/.exec(
      name,
    )
    if (!match) return

    const serial = Number.parseInt(match[1] ?? "", 10)
    if (Number.isFinite(serial) && serial > this.nameSeed) {
      this.nameSeed = serial
    }
  }

  /** 向监听方广播最新三维绘制状态。 */
  private notifyState() {
    const state = this.getDrawingState()
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}
