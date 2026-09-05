import * as Cesium from "cesium"
import type {
  MeasurementMode,
  MeasurementPoint,
  MeasurementPointSource,
  MeasurementState,
} from "../../types"

const AUTHALIC_RADIUS = 6_371_008.8
const PREVIEW_INTERVAL = 60

const LINE_COLOR = Cesium.Color.fromCssColorString("#48e5ff")
const POINT_COLOR = Cesium.Color.fromCssColorString("#e8f7ff")
const PREVIEW_COLOR = Cesium.Color.fromCssColorString("#f5b544")
const LABEL_BACKGROUND = Cesium.Color.fromCssColorString("#071428").withAlpha(0.88)

/** 封装 Cesium 地图中的交互测量、结果计算与测量图形渲染。 */
export class CesiumMeasurementController {
  private mode: MeasurementMode | null = null
  private points: MeasurementPoint[] = []
  private previewPoint: MeasurementPoint | undefined
  private completed = false
  private resultValue: number | undefined
  private error: string | undefined
  private entities: Cesium.Entity[] = []
  private completedEntities: Cesium.Entity[] = []
  private lastPreviewAt = 0

  private readonly viewer: Cesium.Viewer
  private readonly notify: (state: MeasurementState) => void
  private readonly pointerHandler: Cesium.ScreenSpaceEventHandler

  constructor(viewer: Cesium.Viewer, notify: (state: MeasurementState) => void) {
    this.viewer = viewer
    this.notify = notify
    this.pointerHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    this.pointerHandler.setInputAction(
      (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => this.confirmPoint(event.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    )
    this.pointerHandler.setInputAction(
      () => this.completeMeasurement(),
      Cesium.ScreenSpaceEventType.RIGHT_CLICK,
    )
    this.pointerHandler.setInputAction(
      (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => this.updatePreview(event.endPosition),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    )
  }

  /** 切换测量模式；切换时清空上一组测量点。 */
  setMode(mode: MeasurementMode | null) {
    if (this.mode === mode) return

    this.mode = mode
    this.points = []
    this.previewPoint = undefined
    this.completed = false
    this.resultValue = undefined
    this.error = undefined
    this.removeCompletedEntities()
    this.render()
    this.emitState()
  }

  /** 撤销最后一个确认点，并同步重算结果。 */
  undoPoint() {
    if (this.points.length === 0) return

    this.points.pop()
    this.previewPoint = undefined
    this.completed = false
    this.error = undefined
    this.updateResult()
    this.render()
    this.emitState()
  }

  /** 清空当前测量点，但保持测量模式继续可用。 */
  clear() {
    this.points = []
    this.previewPoint = undefined
    this.completed = false
    this.resultValue = undefined
    this.error = undefined
    this.removeCompletedEntities()
    this.render()
    this.emitState()
  }

  /** 读取当前测量状态。 */
  getState(): MeasurementState {
    return {
      mode: this.mode,
      points: [...this.points],
      previewPoint: this.previewPoint,
      completed: this.completed,
      resultValue: this.resultValue,
      error: this.error,
    }
  }

  /** 停止事件监听并移除全部测量图形。 */
  dispose() {
    this.pointerHandler.destroy()
    this.mode = null
    this.points = []
    this.previewPoint = undefined
    this.completed = false
    this.resultValue = undefined
    this.error = undefined
    this.removeEntities()
  }

  /** 处理左键确认点，并按模式维护点集。 */
  private confirmPoint(position: Cesium.Cartesian2) {
    if (!this.mode) return

    const point = this.pickPoint(position)
    if (!point) {
      this.error = "未命中可测量表面，请重新点击"
      this.emitState()
      return
    }

    if (this.completed) {
      this.archiveCompletedEntities()
      this.points = []
      this.completed = false
    }

    if (this.mode === "point-height" || this.mode === "point-terrain-height") {
      this.points = [point]
    } else {
      this.points.push(point)
    }

    this.previewPoint = undefined
    this.error = undefined
    this.updateResult()
    this.render()
    this.emitState()
  }

  /** 右键完成当前长度或面积测量，并固定已确认点的结果。 */
  private completeMeasurement() {
    if (!this.mode || (this.mode !== "length" && this.mode !== "area")) return
    if (this.completed) return

    const requiredPoints = this.mode === "length" ? 2 : 3
    if (this.points.length < requiredPoints) {
      this.error = `至少选择 ${requiredPoints} 个点后右键完成`
      this.emitState()
      return
    }

    this.previewPoint = undefined
    this.completed = true
    this.error = undefined
    this.updateResult()
    this.render()
    this.emitState()
  }

  /** 处理鼠标悬停预览，为线段和面提供临时端点。 */
  private updatePreview(position: Cesium.Cartesian2) {
    if (!this.mode || this.mode === "point-height" || this.mode === "point-terrain-height") return
    if (this.completed) return

    const now = performance.now()
    if (now - this.lastPreviewAt < PREVIEW_INTERVAL) return
    this.lastPreviewAt = now

    const point = this.pickPoint(position)
    if (!point) return
    if (this.isSamePoint(this.previewPoint, point)) return

    this.previewPoint = point
    this.updateResult()
    this.emitState()
  }

  /** 根据当前模式选择场景拾取或地形拾取。 */
  private pickPoint(position: Cesium.Cartesian2): MeasurementPoint | undefined {
    if (this.mode === "point-terrain-height") {
      return this.createPointFromPosition(this.pickTerrainPosition(position), "terrain")
    }

    if (this.viewer.scene.pickPositionSupported) {
      const pickedPosition = this.viewer.scene.pickPosition(position)
      const point = this.createPointFromPosition(pickedPosition, "scene")
      if (point) return point
    }

    return this.createPointFromPosition(this.pickTerrainPosition(position), "terrain")
  }

  /** 通过相机射线读取地形表面坐标，不包含模型等场景对象。 */
  private pickTerrainPosition(position: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
    const ray = this.viewer.camera.getPickRay(position)
    if (!ray) return undefined

    return this.viewer.scene.globe.pick(ray, this.viewer.scene)
  }

  /** 将 Cesium 坐标转换为引擎无关的测量点。 */
  private createPointFromPosition(
    position: Cesium.Cartesian3 | undefined,
    source: MeasurementPointSource,
  ): MeasurementPoint | undefined {
    if (!position || !Cesium.defined(position)) return undefined

    const cartographic = Cesium.Cartographic.fromCartesian(position)
    const longitude = Cesium.Math.toDegrees(cartographic.longitude)
    const latitude = Cesium.Math.toDegrees(cartographic.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined

    return { longitude, latitude, height: cartographic.height, source }
  }

  /** 重算当前模式的测量结果。 */
  private updateResult() {
    if (this.mode === "length") {
      this.resultValue = calculateLength([...this.points, this.previewPoint])
      return
    }

    if (this.mode === "area") {
      this.resultValue = calculateArea([...this.points, this.previewPoint])
      return
    }

    this.resultValue = this.points[0]?.height
  }

  /** 根据确认点与预览点重建地图测量图形。 */
  private render() {
    this.viewer.entities.suspendEvents()
    try {
      this.removeCurrentEntities()

      for (const [index, point] of this.points.entries()) {
        this.entities.push(this.createPointEntity(point, false, index + 1))
      }

      if (this.mode === "length" || this.mode === "area") {
        this.entities.push(this.createPreviewPointEntity())
      }

      if (this.mode === "length") {
        this.entities.push(
          this.viewer.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => this.getDisplayCartesians(), false),
              show: new Cesium.CallbackProperty(() => this.getDisplayPoints().length > 1, false),
              width: 3,
              material: LINE_COLOR,
              clampToGround: true,
            },
          }),
        )
      }

      if (this.mode === "area") {
        this.entities.push(
          this.viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.CallbackProperty(
                () => new Cesium.PolygonHierarchy(this.getDisplayCartesians()),
                false,
              ),
              show: new Cesium.CallbackProperty(() => this.getDisplayPoints().length > 2, false),
              material: LINE_COLOR.withAlpha(0.2),
              perPositionHeight: true,
            },
          }),
        )
      }

      if (this.mode) {
        this.entities.push(
          this.viewer.entities.add({
            position: new Cesium.CallbackPositionProperty(() => {
              const labelPosition = this.getResultLabelPosition(this.getDisplayPoints())
              return labelPosition ? createCesiumPosition(labelPosition) : Cesium.Cartesian3.ZERO
            }, false),
            label: {
              text: new Cesium.CallbackProperty(() => this.formatResult(), false),
              show: new Cesium.CallbackProperty(() => {
                const displayPoints = this.getDisplayPoints()
                return (
                  displayPoints.length > 0 &&
                  this.resultValue !== undefined &&
                  this.getResultLabelPosition(displayPoints) !== undefined
                )
              }, false),
              font: "600 13px ui-monospace, monospace",
              fillColor: Cesium.Color.fromCssColorString("#e8f7ff"),
              showBackground: true,
              backgroundColor: LABEL_BACKGROUND,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        )
      }
    } finally {
      this.viewer.entities.resumeEvents()
    }
  }

  /** 移除当前测量创建的全部实体。 */
  private removeEntities() {
    this.removeCurrentEntities()
    this.removeCompletedEntities()
  }

  /** 仅移除正在绘制或刚完成的当前测量实体。 */
  private removeCurrentEntities() {
    if (!this.viewer.isDestroyed()) {
      for (const entity of this.entities) {
        this.viewer.entities.remove(entity)
      }
    }

    this.entities = []
  }

  /** 仅移除已完成并归档的测量实体。 */
  private removeCompletedEntities() {
    if (!this.viewer.isDestroyed()) {
      for (const entity of this.completedEntities) {
        this.viewer.entities.remove(entity)
      }
    }

    this.completedEntities = []
  }

  /** 创建测量节点实体。 */
  private createPointEntity(
    point: MeasurementPoint,
    preview: boolean,
    index: number,
  ): Cesium.Entity {
    const color = preview ? PREVIEW_COLOR : POINT_COLOR

    return this.viewer.entities.add({
      position: createCesiumPosition(point),
      point: {
        pixelSize: preview ? 7 : 9,
        color,
        outlineColor: Cesium.Color.fromCssColorString("#071428"),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(index),
        font: "600 11px ui-monospace, monospace",
        fillColor: color,
        showBackground: true,
        backgroundColor: LABEL_BACKGROUND,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  /** 创建跟随鼠标但不重建实体的预览点。 */
  private createPreviewPointEntity(): Cesium.Entity {
    return this.viewer.entities.add({
      position: new Cesium.CallbackPositionProperty(() => {
        return this.previewPoint ? createCesiumPosition(this.previewPoint) : Cesium.Cartesian3.ZERO
      }, false),
      point: {
        pixelSize: 7,
        color: PREVIEW_COLOR,
        outlineColor: Cesium.Color.fromCssColorString("#071428"),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: new Cesium.CallbackProperty(() => this.previewPoint !== undefined, false),
      },
      label: {
        text: String(this.points.length + 1),
        font: "600 11px ui-monospace, monospace",
        fillColor: PREVIEW_COLOR,
        showBackground: true,
        backgroundColor: LABEL_BACKGROUND,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: new Cesium.CallbackProperty(() => this.previewPoint !== undefined, false),
      },
    })
  }

  /** 获取包含鼠标预览点的当前展示点集。 */
  private getDisplayPoints(): MeasurementPoint[] {
    const displayPoints = [...this.points]
    if (this.previewPoint && (this.mode === "length" || this.mode === "area")) {
      displayPoints.push(this.previewPoint)
    }

    return displayPoints
  }

  /** 获取当前展示点集对应的 Cesium 坐标。 */
  private getDisplayCartesians() {
    return this.getDisplayPoints().map((point) => createCesiumPosition(point))
  }

  /** 获取结果标签的锚点。 */
  private getResultLabelPosition(points: MeasurementPoint[]): MeasurementPoint | undefined {
    if (points.length === 0) return undefined

    if (this.mode === "length") return points[points.length - 1]
    if (this.mode === "area") {
      return {
        longitude: points.reduce((total, point) => total + point.longitude, 0) / points.length,
        latitude: points.reduce((total, point) => total + point.latitude, 0) / points.length,
        height: points.reduce((total, point) => total + point.height, 0) / points.length,
        source: points[0].source,
      }
    }

    return points[0]
  }

  /** 格式化地图上的测量结果标签。 */
  private formatResult() {
    if (this.resultValue === undefined) return ""

    if (this.mode === "area") {
      return this.resultValue >= 1_000_000
        ? `${(this.resultValue / 1_000_000).toFixed(3)} km²`
        : `${this.resultValue.toFixed(1)} m²`
    }

    return this.resultValue >= 1000
      ? `${(this.resultValue / 1000).toFixed(3)} km`
      : `${this.resultValue.toFixed(1)} m`
  }

  /** 保留已完成测量图形，并为下一次左键测量重建当前点集。 */
  private archiveCompletedEntities() {
    if (!this.viewer.isDestroyed()) {
      this.viewer.entities.suspendEvents()
      try {
        this.removeCurrentEntities()
        this.completedEntities.push(...this.createCompletedEntities(this.points))
      } finally {
        this.viewer.entities.resumeEvents()
      }
    } else {
      this.entities = []
    }
  }

  /** 创建已完成测量的静态图形，避免归档实体继续读取下一次测量的点集。 */
  private createCompletedEntities(points: MeasurementPoint[]): Cesium.Entity[] {
    const entities: Cesium.Entity[] = []
    for (const [index, point] of points.entries()) {
      entities.push(this.createPointEntity(point, false, index + 1))
    }

    const positions = points.map((point) => createCesiumPosition(point))
    if (this.mode === "length" && positions.length > 1) {
      entities.push(
        this.viewer.entities.add({
          polyline: {
            positions,
            width: 3,
            material: LINE_COLOR,
            clampToGround: true,
          },
        }),
      )
    }

    if (this.mode === "area" && positions.length > 2) {
      entities.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: LINE_COLOR.withAlpha(0.2),
            perPositionHeight: true,
          },
        }),
      )
    }

    const labelPosition = this.getResultLabelPosition(points)
    if (labelPosition && this.resultValue !== undefined) {
      entities.push(
        this.viewer.entities.add({
          position: createCesiumPosition(labelPosition),
          label: {
            text: this.formatResult(),
            font: "600 13px ui-monospace, monospace",
            fillColor: Cesium.Color.fromCssColorString("#e8f7ff"),
            showBackground: true,
            backgroundColor: LABEL_BACKGROUND,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      )
    }

    return entities
  }

  /** 广播当前测量状态。 */
  private emitState() {
    this.notify(this.getState())
  }

  /** 判断两个测量点是否等效。 */
  private isSamePoint(left: MeasurementPoint | undefined, right: MeasurementPoint) {
    return (
      left !== undefined &&
      left.longitude === right.longitude &&
      left.latitude === right.latitude &&
      left.height === right.height &&
      left.source === right.source
    )
  }
}

/** 将引擎无关测量点转换回 Cesium 坐标。 */
function createCesiumPosition(point: MeasurementPoint) {
  return Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.height)
}

/** 计算逐段椭球测地线距离与高差合成的测量长度。 */
function calculateLength(points: Array<MeasurementPoint | undefined>) {
  if (points.length < 2) return undefined

  let total = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    if (!start || !end) continue

    const geodesic = new Cesium.EllipsoidGeodesic(
      Cesium.Cartographic.fromDegrees(start.longitude, start.latitude),
      Cesium.Cartographic.fromDegrees(end.longitude, end.latitude),
    )
    total += Math.hypot(geodesic.surfaceDistance, end.height - start.height)
  }

  return total
}

/** 使用等积近似公式计算地面多边形面积。 */
function calculateArea(points: Array<MeasurementPoint | undefined>) {
  if (points.length < 3) return undefined

  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!start || !end) continue

    const startLongitude = Cesium.Math.toRadians(start.longitude)
    const startLatitude = Cesium.Math.toRadians(start.latitude)
    const endLongitude = Cesium.Math.toRadians(end.longitude)
    const endLatitude = Cesium.Math.toRadians(end.latitude)

    total += (endLongitude - startLongitude) * (2 + Math.sin(startLatitude) + Math.sin(endLatitude))
  }

  return Math.abs((total * AUTHALIC_RADIUS ** 2) / 2)
}
