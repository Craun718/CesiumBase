import * as Cesium from "cesium"
import type {
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
} from "../../../types"
import { bearingDegrees, geodesicDistance, toCartesian } from "./geometry.js"
import type { DragState } from "./types.js"
import { ACCENT, DEEP_BACK, FOREGROUND } from "../../../themeColors.js"

/** 控制器暴露给草稿实体的只读状态视图。 */
export interface DrawingEntityRendererHost {
  getMode(): MapDrawGeometryType | null
  getDragState(): DragState | undefined
  getPreviewCoordinates(): readonly MapDrawCoordinate[]
  getPreviewCartesians(): Cesium.Cartesian3[]
  createDraftId(): string
}

/** Cesium 绘制成果与草稿实体适配层。 */
export class DrawingEntityRenderer {
  private readonly host: DrawingEntityRendererHost
  private dataSource?: Cesium.CustomDataSource
  private readonly entities = new Map<string, Cesium.Entity>()
  private draftEntity?: Cesium.Entity
  private draftVertexEntities: Cesium.Entity[] = []

  constructor(host: DrawingEntityRendererHost) {
    this.host = host
  }

  /** 创建并挂载绘制数据源。 */
  mount(viewer: Cesium.Viewer, visible: boolean): Cesium.CustomDataSource {
    if (this.dataSource) return this.dataSource

    const dataSource = new Cesium.CustomDataSource("map-drawing")
    dataSource.show = visible
    void viewer.dataSources.add(dataSource)
    this.dataSource = dataSource

    return dataSource
  }

  /** 移除数据源并清空全部实体引用。 */
  unmount(viewer: Cesium.Viewer | undefined) {
    if (viewer && this.dataSource && !viewer.isDestroyed()) {
      void viewer.dataSources.remove(this.dataSource, true)
    }

    this.dataSource = undefined
    this.entities.clear()
    this.resetDraft()
  }

  /** 读取当前绘制数据源。 */
  getDataSource(): Cesium.CustomDataSource | undefined {
    return this.dataSource
  }

  /** 判断成果实体是否存在。 */
  hasEntity(id: string) {
    return this.entities.has(id)
  }

  /** 将绘制成果转换为 Cesium 实体；按 geometry.type 分派。 */
  createFeatureEntity(feature: MapDrawFeature) {
    if (!this.dataSource) throw new Error("绘制数据源尚未初始化")

    const entity = this.dataSource.entities.add(this.buildFeatureEntityOptions(feature))
    this.entities.set(feature.id, entity)
    return entity
  }

  /** 读取成果实体。 */
  getFeatureEntity(id: string) {
    return this.entities.get(id)
  }

  /** 删除成果实体。 */
  removeFeatureEntity(id: string) {
    const entity = this.entities.get(id)
    if (!entity || !this.dataSource) return false

    this.dataSource.entities.remove(entity)
    this.entities.delete(id)
    return true
  }

  /** 移除全部成果实体。 */
  clearFeatureEntities() {
    if (!this.dataSource) return

    for (const entity of this.entities.values()) {
      this.dataSource.entities.remove(entity)
    }
    this.entities.clear()
  }

  /** 用 entity id + geometry 重建实体；保留原有 label 文本。 */
  replaceFeatureGeometry(featureId: string, geometry: MapDrawGeometry) {
    if (!this.dataSource) return

    const entity = this.entities.get(featureId)
    if (!entity) return

    const labelText = entity.label?.text?.getValue(Cesium.JulianDate.now())
    const next = this.buildEntityOptions(featureId, geometry, labelText)
    this.dataSource.entities.remove(entity)
    this.entities.set(featureId, this.dataSource.entities.add(next))
  }

  /** 更新成果标注文本。 */
  renameFeature(id: string, name: string) {
    const label = this.entities.get(id)?.label
    if (label) {
      label.text = new Cesium.ConstantProperty(name)
    }
  }

  /** 同步已完成成果的数据源显隐。 */
  setVisible(visible: boolean) {
    if (this.dataSource) {
      this.dataSource.show = visible
    }
  }

  /** 通过 Cesium 拾取成果主体实体。 */
  pickFeature(
    viewer: Cesium.Viewer,
    screenPosition: { readonly x: number; readonly y: number },
  ): string | null {
    const picked = viewer.scene.pick(new Cesium.Cartesian2(screenPosition.x, screenPosition.y))
    if (!picked) return null

    const id = (picked as { id?: unknown }).id
    if (!(id instanceof Cesium.Entity)) return null

    const properties = id.properties
    if (properties instanceof Cesium.PropertyBag) {
      const featureId = properties.featureId?.getValue(Cesium.JulianDate.now())
      if (typeof featureId === "string") return featureId
    }

    for (const [featureId, entity] of this.entities) {
      if (entity === id) return featureId
    }

    return null
  }

  /** 创建跟随鼠标或拖拽状态变化的草图实体。 */
  createDraftEntity() {
    if (!this.dataSource) return

    if (this.host.getDragState()) {
      this.createDragDraftEntity()
      return
    }

    if (!this.host.getMode() || this.draftEntity) return

    this.draftEntity = this.dataSource.entities.add({
      id: this.host.createDraftId(),
      position: new Cesium.CallbackPositionProperty(() => {
        const positions = this.host.getPreviewCoordinates()
        const coordinate = positions[positions.length - 1]
        return coordinate ? toCartesian(coordinate) : Cesium.Cartesian3.ZERO
      }, false),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString(ACCENT),
        outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
        outlineWidth: 2,
      },
      polyline:
        this.host.getMode() === "polyline" || this.host.getMode() === "corridor"
          ? {
              positions: new Cesium.CallbackProperty(() => this.host.getPreviewCartesians(), false),
              width: 3,
              material: Cesium.Color.fromCssColorString(ACCENT),
              clampToGround: true,
              show: new Cesium.CallbackProperty(
                () =>
                  this.host.getMode() !== "polygon" || this.host.getPreviewCoordinates().length < 3,
                false,
              ),
            }
          : undefined,
      polygon:
        this.host.getMode() === "polygon"
          ? {
              hierarchy: new Cesium.CallbackProperty(
                () => new Cesium.PolygonHierarchy(this.host.getPreviewCartesians()),
                false,
              ),
              material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(ACCENT),
              perPositionHeight: true,
            }
          : this.host.getMode() === "corridor"
            ? {
                hierarchy: new Cesium.CallbackProperty(
                  () => new Cesium.PolygonHierarchy(this.host.getPreviewCartesians()),
                  false,
                ),
                material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.18),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(ACCENT),
                perPositionHeight: false,
              }
            : undefined,
    })
  }

  /** 创建已确认草图节点实体，避免节点跟随鼠标预览点移动。 */
  createDraftVertexEntity(coordinate: MapDrawCoordinate) {
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

  /** 移除草稿实体和临时节点。 */
  discardDraft() {
    if (this.draftEntity && this.dataSource) {
      this.dataSource.entities.remove(this.draftEntity)
    }

    for (const entity of this.draftVertexEntities) {
      this.dataSource?.entities.remove(entity)
    }

    this.resetDraft()
  }

  private resetDraft() {
    this.draftEntity = undefined
    this.draftVertexEntities = []
  }

  /** 拖拽态下的草图实体：rectangle / circle / ellipse。 */
  private createDragDraftEntity() {
    const mode = this.host.getDragState()?.mode
    if (!this.dataSource || !mode) return

    const isCircle = mode === "circle"

    if (mode === "rectangle") {
      this.draftEntity = this.dataSource.entities.add({
        rectangle: {
          coordinates: new Cesium.CallbackProperty(() => {
            const dragState = this.host.getDragState()
            if (!dragState) return Cesium.Rectangle.fromDegrees(0, 0, 0, 0)

            const start = dragState.startCoordinate
            const end = dragState.currentCoordinate
            return Cesium.Rectangle.fromDegrees(
              Math.min(start.longitude, end.longitude),
              Math.min(start.latitude, end.latitude),
              Math.max(start.longitude, end.longitude),
              Math.max(start.latitude, end.latitude),
            )
          }, false),
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          height: 0,
        },
      })
      return
    }

    // circle / ellipse：使用 EllipseGraphics；circle 时 semiMajor === semiMinor === 拖拽距离。
    this.draftEntity = this.dataSource.entities.add({
      position: new Cesium.CallbackPositionProperty(() => {
        const dragState = this.host.getDragState()
        return dragState ? toCartesian(dragState.startCoordinate) : Cesium.Cartesian3.ZERO
      }, false),
      ellipse: {
        semiMajorAxis: new Cesium.CallbackProperty(() => {
          const dragState = this.host.getDragState()
          if (!dragState) return 1

          return Math.max(
            geodesicDistance(dragState.startCoordinate, dragState.currentCoordinate),
            1,
          )
        }, false),
        semiMinorAxis: new Cesium.CallbackProperty(() => {
          const dragState = this.host.getDragState()
          if (!dragState) return 1

          const distance = Math.max(
            geodesicDistance(dragState.startCoordinate, dragState.currentCoordinate),
            1,
          )
          return isCircle ? distance : distance / 2
        }, false),
        rotation: new Cesium.CallbackProperty(() => {
          if (isCircle) return 0
          const dragState = this.host.getDragState()
          if (!dragState) return 0

          // Cesium rotation 是东基准逆时针，bearingDegrees 是北基准顺时针，相差 90°。
          const bearingRad = Cesium.Math.toRadians(
            bearingDegrees(dragState.startCoordinate, dragState.currentCoordinate),
          )
          return Math.PI / 2 - bearingRad
        }, false),
        material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(ACCENT),
        height: 0,
      },
    })
  }

  /** 用 entity id + geometry 重建 entity options；保留 label。 */
  private buildEntityOptions(
    featureId: string,
    geometry: MapDrawGeometry,
    labelText: string | undefined,
  ): Cesium.Entity.ConstructorOptions {
    const feature: MapDrawFeature = {
      id: featureId,
      name: labelText ?? featureId,
      type: geometry.type,
      geometry,
      createdAt: new Date().toISOString(),
    }

    const options = this.buildFeatureEntityOptions(feature)
    options.id = featureId

    return options
  }

  /** 构造绘制成果实体的 options；不写入 dataSource，用于编辑时重建实体。 */
  private buildFeatureEntityOptions(feature: MapDrawFeature): Cesium.Entity.ConstructorOptions {
    const { geometry } = feature

    const entityOptions: Cesium.Entity.ConstructorOptions = {
      id: feature.id,
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

    switch (geometry.type) {
      case "point":
        entityOptions.position = toCartesian(geometry.coordinate)
        entityOptions.point = {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString(ACCENT),
          outlineColor: Cesium.Color.fromCssColorString(DEEP_BACK),
          outlineWidth: 2,
        }
        break
      case "polyline":
        entityOptions.polyline = {
          positions: geometry.coordinates.map(toCartesian),
          width: 3,
          material: Cesium.Color.fromCssColorString(ACCENT),
          clampToGround: true,
        }
        break
      case "polygon":
        entityOptions.polygon = {
          hierarchy: new Cesium.PolygonHierarchy(geometry.coordinates.map(toCartesian)),
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          perPositionHeight: true,
        }
        break
      case "rectangle":
        entityOptions.rectangle = {
          coordinates: Cesium.Rectangle.fromDegrees(
            geometry.southwest.longitude,
            geometry.southwest.latitude,
            geometry.northeast.longitude,
            geometry.northeast.latitude,
          ),
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          height: 0,
        }
        break
      case "circle":
        entityOptions.position = toCartesian(geometry.center)
        entityOptions.ellipse = {
          semiMajorAxis: geometry.radiusMeters,
          semiMinorAxis: geometry.radiusMeters,
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          height: 0,
        }
        break
      case "ellipse":
        entityOptions.position = toCartesian(geometry.center)
        entityOptions.ellipse = {
          semiMajorAxis: geometry.semiMajorMeters,
          semiMinorAxis: geometry.semiMinorMeters,
          rotation: Cesium.Math.toRadians(geometry.rotationDegrees),
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          height: 0,
        }
        break
      case "corridor":
        entityOptions.corridor = {
          positions: geometry.path.map(toCartesian),
          width: geometry.widthMeters,
          cornerType: Cesium.CornerType.ROUNDED,
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
        }
        break
      case "buffer": {
        // Cesium PolygonHierarchy 校验外环 ≥ 4 个点且首尾闭合；
        // computeBufferPolygon 已规整，但仍做一次防御性校验避免任何退化输入卡住 RIGHT_CLICK。
        if (geometry.polygon.length < 3) {
          throw new Error("缓冲区多边形顶点不足")
        }

        entityOptions.polygon = {
          hierarchy: new Cesium.PolygonHierarchy(geometry.polygon.map(toCartesian)),
          material: Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(ACCENT),
          perPositionHeight: false,
        }
        break
      }
    }

    return entityOptions
  }
}
