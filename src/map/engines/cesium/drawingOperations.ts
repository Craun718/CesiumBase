import * as Cesium from "cesium"
import type {
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometryType,
  MapDrawState,
} from "../../types"

const minimumCoordinateCounts: Record<MapDrawGeometryType, number> = {
  point: 1,
  polyline: 2,
  polygon: 3,
}

/** 管理 Cesium 中的点、折线和多边形绘制交互与成果实体。 */
export class CesiumDrawingController {
  private viewer?: Cesium.Viewer
  private dataSource?: Cesium.CustomDataSource
  private eventHandler?: Cesium.ScreenSpaceEventHandler
  private mode: MapDrawGeometryType | null = null
  private draftCoordinates: MapDrawCoordinate[] = []
  private cursorCoordinate?: MapDrawCoordinate
  private draftEntity?: Cesium.Entity
  private readonly entities = new Map<string, Cesium.Entity>()
  private readonly features = new Map<string, MapDrawFeature>()
  private readonly stateListeners = new Set<(state: MapDrawState) => void>()
  private idSeed = 0
  private nameSeed = 0
  private featuresVisible = false

  /** 将绘制控制器挂载到指定 viewer。 */
  mount(viewer: Cesium.Viewer) {
    if (this.viewer || viewer.isDestroyed()) return

    this.viewer = viewer
    this.dataSource = new Cesium.CustomDataSource("map-drawing")
    this.dataSource.show = this.featuresVisible
    void viewer.dataSources.add(this.dataSource)

    this.eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    this.eventHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      this.addCoordinate(position)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    this.eventHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
      this.updateCursor(endPosition)
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    this.eventHandler.setInputAction(() => {
      this.finishDrawing()
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
  }

  /** 销毁交互监听并清空绘制数据源。 */
  unmount() {
    this.eventHandler?.destroy()
    this.eventHandler = undefined

    if (this.viewer && this.dataSource && !this.viewer.isDestroyed()) {
      void this.viewer.dataSources.remove(this.dataSource, true)
    }

    this.viewer = undefined
    this.dataSource = undefined
    this.draftEntity = undefined
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
    this.entities.clear()
    this.features.clear()
    this.mode = null
  }

  /** 开始一种绘制模式，切换模式会先丢弃未完成草图。 */
  startDrawing(type: MapDrawGeometryType) {
    if (!this.viewer || !this.dataSource) return false

    if (this.mode === type) {
      this.cancelDrawing()
      return true
    }

    this.discardDraft()
    this.mode = type
    this.notifyState()
    return true
  }

  /** 完成当前草图并保留绘制模式，便于连续绘制。 */
  finishDrawing() {
    if (!this.viewer || !this.dataSource || !this.mode) return false
    if (this.draftCoordinates.length < minimumCoordinateCounts[this.mode]) return false

    const coordinates = [...this.draftCoordinates]
    const feature = this.createFeature(this.mode, coordinates)
    const entity = this.createFeatureEntity(feature)

    this.discardDraft()
    this.entities.set(feature.id, entity)
    this.features.set(feature.id, feature)
    this.notifyState()

    return true
  }

  /** 取消当前草图，已完成成果不受影响。 */
  cancelDrawing() {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.notifyState()
    return true
  }

  /** 取消当前草图并退出绘制模式。 */
  stopDrawing() {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.mode = null
    this.notifyState()
    return true
  }

  /** 更新成果名称并同步地图标注。 */
  renameDrawing(id: string, name: string) {
    const trimmedName = name.trim()
    const feature = this.features.get(id)
    if (!trimmedName || !feature) return false

    const nextFeature = { ...feature, name: trimmedName }
    const entity = this.entities.get(id)
    if (entity?.label) {
      entity.label.text = new Cesium.ConstantProperty(trimmedName)
    }

    this.features.set(id, nextFeature)
    this.notifyState()
    return true
  }

  /** 删除单个绘制成果。 */
  removeDrawing(id: string) {
    const entity = this.entities.get(id)
    if (!entity || !this.dataSource) return false

    this.dataSource.entities.remove(entity)
    this.entities.delete(id)
    this.features.delete(id)
    this.notifyState()
    return true
  }

  /** 同步已完成成果的数据源显隐。 */
  setFeaturesVisible(visible: boolean) {
    this.featuresVisible = visible

    if (this.dataSource) {
      this.dataSource.show = visible
    }
  }

  /** 删除全部成果并取消未完成草图。 */
  clearDrawings() {
    if (!this.viewer || !this.dataSource) return

    this.cancelDrawing()

    for (const entity of this.entities.values()) {
      this.dataSource.entities.remove(entity)
    }

    this.entities.clear()
    this.features.clear()
    this.notifyState()
  }

  /** 读取当前绘制状态快照。 */
  getDrawingState(): MapDrawState {
    return {
      mode: this.mode,
      activeCoordinates: [...this.draftCoordinates],
      features: [...this.features.values()],
    }
  }

  /** 监听绘制状态变化；注册时立即返回当前状态。 */
  onDrawingStateChange(listener: (state: MapDrawState) => void) {
    this.stateListeners.add(listener)
    listener(this.getDrawingState())

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /** 处理地图左键点击并确认一个绘制节点。 */
  private addCoordinate(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode) return

    const coordinate = this.pickCoordinate(position)
    if (!coordinate) return

    this.draftCoordinates.push(coordinate)
    if (this.mode === "point") {
      this.finishDrawing()
      return
    }

    this.createDraftEntity()
    this.notifyState()
  }

  /** 处理鼠标移动并更新草图预览点。 */
  private updateCursor(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode || this.draftCoordinates.length === 0) return

    this.cursorCoordinate = this.pickCoordinate(position)
  }

  /** 将屏幕坐标转换为地球表面的经纬度和高程。 */
  private pickCoordinate(position: Cesium.Cartesian2): MapDrawCoordinate | undefined {
    if (!this.viewer) return undefined

    const ray = this.viewer.camera.getPickRay(position)
    const cartesian = ray ? this.viewer.scene.globe.pick(ray, this.viewer.scene) : undefined
    if (!cartesian) return undefined

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)

    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
    }
  }

  /** 创建跟随鼠标和已确认节点的草图实体。 */
  private createDraftEntity() {
    if (!this.dataSource || this.draftEntity || !this.mode) return

    const id = this.createId("draft")
    this.draftEntity = this.dataSource.entities.add({
      id,
      position: new Cesium.CallbackPositionProperty(() => {
        const positions = this.getPreviewCoordinates()
        const coordinate = positions[positions.length - 1]
        return coordinate ? this.toCartesian(coordinate) : Cesium.Cartesian3.ZERO
      }, false),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString("#48e5ff"),
        outlineColor: Cesium.Color.fromCssColorString("#07142a"),
        outlineWidth: 2,
      },
      polyline:
        this.mode === "polyline"
          ? {
              positions: new Cesium.CallbackProperty(() => this.getPreviewCartesians(), false),
              width: 3,
              material: Cesium.Color.fromCssColorString("#48e5ff"),
              clampToGround: true,
            }
          : undefined,
      polygon:
        this.mode === "polygon"
          ? {
              hierarchy: new Cesium.CallbackProperty(
                () => new Cesium.PolygonHierarchy(this.getPreviewCartesians()),
                false,
              ),
              material: Cesium.Color.fromCssColorString("#48e5ff").withAlpha(0.22),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#48e5ff"),
              perPositionHeight: true,
            }
          : undefined,
    })
  }

  /** 将绘制成果转换为 Cesium 实体。 */
  private createFeatureEntity(feature: MapDrawFeature) {
    if (!this.dataSource) throw new Error("绘制数据源尚未初始化")

    const positions = feature.coordinates.map((coordinate) => this.toCartesian(coordinate))
    const firstPosition = positions[0] ?? Cesium.Cartesian3.ZERO

    return this.dataSource.entities.add({
      id: feature.id,
      position: firstPosition,
      point:
        feature.type === "point"
          ? {
              pixelSize: 9,
              color: Cesium.Color.fromCssColorString("#48e5ff"),
              outlineColor: Cesium.Color.fromCssColorString("#07142a"),
              outlineWidth: 2,
            }
          : undefined,
      polyline:
        feature.type === "polyline"
          ? {
              positions,
              width: 3,
              material: Cesium.Color.fromCssColorString("#48e5ff"),
              clampToGround: true,
            }
          : undefined,
      polygon:
        feature.type === "polygon"
          ? {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              material: Cesium.Color.fromCssColorString("#48e5ff").withAlpha(0.22),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#48e5ff"),
              perPositionHeight: true,
            }
          : undefined,
      label: {
        text: feature.name,
        font: "600 13px sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#eaf6ff"),
        outlineColor: Cesium.Color.fromCssColorString("#07142a"),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#07142a").withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      },
    })
  }

  /** 创建一条绘制成果记录。 */
  private createFeature(
    type: MapDrawGeometryType,
    coordinates: MapDrawCoordinate[],
  ): MapDrawFeature {
    this.nameSeed += 1
    const typeName = type === "point" ? "点" : type === "polyline" ? "折线" : "多边形"
    const serial = String(this.nameSeed).padStart(3, "0")

    return {
      id: this.createId(type),
      name: `绘制${typeName} ${serial}`,
      type,
      coordinates,
      createdAt: new Date().toISOString(),
    }
  }

  /** 生成稳定的绘制实体 id。 */
  private createId(prefix: string) {
    this.idSeed += 1
    return `map-draw-${prefix}-${this.idSeed}`
  }

  /** 获取包含鼠标预览点的草图坐标。 */
  private getPreviewCoordinates() {
    const coordinates = [...this.draftCoordinates]
    if (this.cursorCoordinate && this.mode !== "point") {
      coordinates.push(this.cursorCoordinate)
    }

    return coordinates
  }

  /** 获取草图对应的 Cesium 位置数组。 */
  private getPreviewCartesians() {
    return this.getPreviewCoordinates().map((coordinate) => this.toCartesian(coordinate))
  }

  /** 将引擎无关坐标转换为 Cesium 位置。 */
  private toCartesian(coordinate: MapDrawCoordinate) {
    return Cesium.Cartesian3.fromDegrees(
      coordinate.longitude,
      coordinate.latitude,
      coordinate.height,
    )
  }

  /** 移除当前草图实体和临时节点。 */
  private discardDraft() {
    if (this.draftEntity && this.dataSource) {
      this.dataSource.entities.remove(this.draftEntity)
    }

    this.draftEntity = undefined
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
  }

  /** 向监听方广播最新绘制状态。 */
  private notifyState() {
    const state = this.getDrawingState()
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}
