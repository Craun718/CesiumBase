import * as Cesium from "cesium"
import type {
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
  MapDrawStartOptions,
  MapDrawState,
} from "../../types"
import { computeBufferPolygon } from "./drawing/buffer.js"
import { geometryToBufferSource, sourcePositions } from "./drawing/bufferSource.js"
import {
  DEFAULT_DRAWING_OPTIONS,
  DRAG_THRESHOLD_PX,
  DRAG_TYPES,
  clickMinimumCoordinates,
  type DragState,
  type EditingDraft,
} from "./drawing/types.js"
import {
  computeCircle,
  computeEllipse,
  computeRectangle,
  disableCameraController,
  geodesicDistance,
  pickCoordinate,
  restoreCameraController,
  screenDistance,
  snapshotCameraController,
  toCartesian,
} from "./drawing/geometry.js"
import { computeEditedGeometry } from "./drawing/handles.js"
import { DrawingEntityRenderer } from "./drawing/entityRenderer.js"
import { DrawingHandleRenderer } from "./drawing/handleRenderer.js"
import { DrawingFeatureStore } from "./drawing/featureStore.js"
import { featureCenter } from "./drawing/validation.js"
import { isNearPole } from "./drawing/geometry.js"

/** 管理 Cesium 中的绘制交互与成果实体，支持点/折线/多边形/矩形/圆/椭圆/走廊带/缓冲区。 */
export class CesiumDrawingController {
  private viewer?: Cesium.Viewer
  private dataSource?: Cesium.CustomDataSource
  private eventHandler?: Cesium.ScreenSpaceEventHandler
  private mode: MapDrawGeometryType | null = null
  private draftCoordinates: MapDrawCoordinate[] = []
  private cursorCoordinate?: MapDrawCoordinate
  private dragState?: DragState
  private readonly featureStore = new DrawingFeatureStore()
  private readonly entityRenderer: DrawingEntityRenderer
  private readonly handleRenderer = new DrawingHandleRenderer()
  private readonly stateListeners = new Set<(state: MapDrawState) => void>()
  private drawingOptions: Required<MapDrawStartOptions> = { ...DEFAULT_DRAWING_OPTIONS }
  private featuresVisible = false
  private selectedFeatureId: string | null = null
  private editingDraft?: EditingDraft
  /**
   * LEFT_DOWN 拾取到 handle / feature 主体后暂存的目标，等待 MOUSE_MOVE 位移达到阈值才正式 beginEditDraft。
   * 防止"轻点 handle → editingDraft 立即被 commit → LEFT_CLICK 又取消选中"的死循环。
   */
  private pendingEditTarget?: {
    readonly featureId: string
    readonly kind: "translate" | "resize"
    readonly handleId: string
    readonly startScreen: Cesium.Cartesian2
  }

  constructor() {
    this.entityRenderer = new DrawingEntityRenderer({
      getMode: () => this.mode,
      getDragState: () => this.dragState,
      getPreviewCoordinates: () => this.getPreviewCoordinates(),
      getPreviewCartesians: () => this.getPreviewCartesians(),
      createDraftId: () => this.featureStore.createId("draft"),
    })
  }

  /** 将绘制控制器挂载到指定 viewer。 */
  mount(viewer: Cesium.Viewer) {
    if (this.viewer || viewer.isDestroyed()) return

    this.viewer = viewer
    this.dataSource = this.entityRenderer.mount(viewer, this.featuresVisible)
    this.handleRenderer.setDataSource(this.dataSource)
    this.eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)

    // 一次性绑定所有屏幕空间输入；handler 内部按 mode / editingDraft / selectedFeatureId 分派，
    // 避免动态 setInputAction(undefined) 在某些版本不可靠导致旧回调残留。
    this.eventHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      if (!this.viewer) return
      if (this.mode && DRAG_TYPES.has(this.mode)) {
        this.beginDrag(position)
        return
      }
      if (!this.mode && this.selectedFeatureId && !this.editingDraft) {
        this.handleEditingLeftDown(position)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN)
    this.eventHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      if (!this.viewer) return
      if (this.mode && DRAG_TYPES.has(this.mode)) {
        this.endDrag(position)
        return
      }
      if (this.editingDraft) {
        this.commitEditDraft()
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP)
    this.eventHandler.setInputAction(({ position }: { position: Cesium.Cartesian2 }) => {
      if (!this.viewer) return
      if (this.mode && !DRAG_TYPES.has(this.mode)) {
        const hitFeatureId = this.pickDrawingFeature(position)
        if (hitFeatureId && this.featureStore.has(hitFeatureId)) {
          this.selectDrawingFeature(hitFeatureId)
          return
        }
        this.addCoordinate(position)
        return
      }
      if (!this.mode && this.selectedFeatureId && !this.editingDraft) {
        if (this.pendingEditTarget) {
          this.pendingEditTarget = undefined
          return
        }
        const featureId = this.pickDrawingFeature(position)
        if (!featureId) {
          this.selectDrawingFeature(null)
        }
        return
      }
      if (!this.mode && !this.selectedFeatureId && !this.editingDraft) {
        const featureId = this.pickDrawingFeature(position)
        if (featureId) {
          this.selectDrawingFeature(featureId)
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    this.eventHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
      this.updateCursor(endPosition)
      if (this.editingDraft) {
        this.updateEditDraft(endPosition)
        return
      }
      if (this.pendingEditTarget) {
        const distance = screenDistance(this.pendingEditTarget.startScreen, endPosition)
        if (distance >= DRAG_THRESHOLD_PX) {
          const target = this.pendingEditTarget
          this.pendingEditTarget = undefined
          if (target.kind === "resize") {
            this.beginEditDraft(target.featureId, "resize", target.handleId)
          } else {
            this.beginEditDraft(target.featureId, "translate")
          }
          if (this.editingDraft) {
            this.updateEditDraft(endPosition)
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    this.eventHandler.setInputAction(() => {
      this.handleRightClick()
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
  }

  /** 销毁交互监听并清空绘制数据源。 */
  unmount() {
    this.eventHandler?.destroy()
    this.eventHandler = undefined

    this.handleRenderer.dispose()
    this.entityRenderer.unmount(this.viewer)

    if (this.editingDraft && this.viewer) {
      restoreCameraController(this.viewer, this.editingDraft.cameraSnapshot)
    }

    this.viewer = undefined
    this.dataSource = undefined
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
    this.dragState = undefined
    this.editingDraft = undefined
    this.pendingEditTarget = undefined
    this.selectedFeatureId = null
    this.featureStore.clear()
    this.mode = null
  }

  /** 开始一种绘制模式；切换模式会先丢弃未完成草图与编辑态。 */
  startDrawing(type: MapDrawGeometryType, options?: MapDrawStartOptions) {
    if (!this.viewer || !this.dataSource) return false

    // 缓冲区已改为对已有要素的操作（createBufferFromFeature），不再通过 startDrawing 进入。
    if (type === "buffer") return false

    if (options) {
      this.drawingOptions = { ...this.drawingOptions, ...options }
    }

    if (this.mode === type) {
      this.cancelDrawing()
      return true
    }

    this.pendingEditTarget = undefined
    if (this.editingDraft) {
      this.cancelEditDraft()
    }
    if (this.selectedFeatureId) {
      this.disposeHandleEntities()
      this.selectedFeatureId = null
    }

    this.discardDraft()
    this.mode = type
    this.notifyState()
    return true
  }

  /** 局部更新绘制参数；面板可在不切换 mode 时同步 width / distance。 */
  setDrawingOption(option: Partial<MapDrawStartOptions>) {
    this.drawingOptions = { ...this.drawingOptions, ...option }
  }

  /** 完成当前草图并保留绘制模式，便于连续绘制。 */
  finishDrawing() {
    if (!this.viewer || !this.dataSource || !this.mode) return false

    // 拖拽流（rectangle/circle/ellipse）由 LEFT_UP 直接驱动 endDrag 落定，
    // 此处仅处理 click 流（point/polyline/polygon/corridor/buffer）。
    if (DRAG_TYPES.has(this.mode)) return false

    const minimum = clickMinimumCoordinates[this.mode]
    if (!minimum || this.draftCoordinates.length < minimum) return false

    let feature: MapDrawFeature
    let entity: Cesium.Entity
    try {
      const geometry = this.buildGeometryFromCoordinates(this.mode, [...this.draftCoordinates])
      feature = this.featureStore.create(this.mode, geometry)
      entity = this.entityRenderer.createFeatureEntity(feature)
    } catch (error) {
      // 创建失败时清理草图，避免后续右键一直看到残留 draft 而无法结束。
      console.error("[map] 绘制成果创建失败", error)
      this.discardDraft()
      this.notifyState()
      return false
    }

    this.discardDraft()
    this.featureStore.set(feature)
    this.notifyState()
    return entity instanceof Cesium.Entity
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
    if (!this.entityRenderer.hasEntity(id)) return false

    const nextFeature = this.featureStore.rename(id, name)
    if (!nextFeature) return false

    this.entityRenderer.renameFeature(id, nextFeature.name)
    this.notifyState()
    return true
  }

  /** 删除单个绘制成果。 */
  removeDrawing(id: string) {
    if (!this.entityRenderer.removeFeatureEntity(id)) return false

    if (this.selectedFeatureId === id) {
      this.disposeHandleEntities()
      this.pendingEditTarget = undefined
      this.selectedFeatureId = null
    }

    this.featureStore.delete(id)
    this.notifyState()
    return true
  }

  /** 同步已完成成果的数据源显隐。 */
  setFeaturesVisible(visible: boolean) {
    this.featuresVisible = visible
    this.entityRenderer.setVisible(visible)
  }

  /** 对指定已有要素建立缓冲区；返回是否成功生成新 buffer 成果。 */
  createBufferFromFeature(sourceFeatureId: string, distanceMeters: number): boolean {
    if (!this.viewer || !this.dataSource) return false
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 1_000_000) {
      return false
    }

    const sourceFeature = this.featureStore.get(sourceFeatureId)
    if (!sourceFeature) return false

    const source = geometryToBufferSource(sourceFeature.geometry)
    if (!source) return false

    const polygon = computeBufferPolygon(
      sourcePositions(source),
      distanceMeters,
      source.type === "polygon",
    )
    if (polygon.length < 3) return false

    const feature = this.featureStore.createBuffer(source, distanceMeters, polygon)

    try {
      this.entityRenderer.createFeatureEntity(feature)
      this.featureStore.set(feature)
      this.notifyState()
      return true
    } catch (error) {
      console.error("[map] 缓冲区成果创建失败", error)
      return false
    }
  }

  /** 删除全部成果并取消未完成草图。 */
  clearDrawings() {
    if (!this.viewer || !this.dataSource) return

    this.cancelDrawing()
    this.entityRenderer.clearFeatureEntities()
    this.disposeHandleEntities()
    this.pendingEditTarget = undefined
    this.selectedFeatureId = null
    this.featureStore.clear()
    this.notifyState()
  }

  /** 恢复持久化成果；无效或重复数据会被跳过。 */
  restoreDrawings(features: readonly MapDrawFeature[]) {
    if (!this.viewer || !this.dataSource) return false

    this.discardDraft()
    this.entityRenderer.clearFeatureEntities()
    this.disposeHandleEntities()
    this.pendingEditTarget = undefined
    this.selectedFeatureId = null

    for (const feature of this.featureStore.restore(features)) {
      this.entityRenderer.createFeatureEntity(feature)
    }

    this.notifyState()
    return true
  }

  /** 读取当前绘制状态快照。 */
  getDrawingState(): MapDrawState {
    return {
      mode: this.mode,
      activeCoordinates: [...this.draftCoordinates],
      features: this.featureStore.list(),
      selectedFeatureId: this.selectedFeatureId,
      editingActive: this.editingDraft !== undefined,
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

  /** 拾取屏幕坐标命中的绘制成果 id；命中 handle 也返回所属 feature id。 */
  pickDrawingFeature(screenPosition: { readonly x: number; readonly y: number }): string | null {
    if (!this.viewer) return null

    const cartesianPosition = new Cesium.Cartesian2(screenPosition.x, screenPosition.y)
    const handle = this.handleRenderer.pick(this.viewer, cartesianPosition)
    if (handle) return handle.featureId

    return this.entityRenderer.pickFeature(this.viewer, screenPosition)
  }

  /** 选中或取消选中绘制成果；切换时同步创建或销毁编辑把手。 */
  selectDrawingFeature(id: string | null): boolean {
    if (!this.viewer || !this.dataSource) return false

    if (this.editingDraft) {
      this.cancelEditDraft()
    }

    if (id === null || id === this.selectedFeatureId) {
      if (this.selectedFeatureId) {
        this.disposeHandleEntities()
        this.pendingEditTarget = undefined
        this.selectedFeatureId = null
        this.notifyState()
      }
      return true
    }

    if (!this.featureStore.has(id)) return false

    // 进入编辑前：互斥清理绘制 mode 与未完成草图（与 startDrawing 对称）；
    // 保证 mode 与 selectedFeatureId 同一时刻只有一个非 null，避免拖动 handle 时被绘制分支截胡。
    if (this.mode) {
      this.discardDraft()
      this.mode = null
    }
    this.pendingEditTarget = undefined

    this.disposeHandleEntities()
    this.selectedFeatureId = id
    this.createHandleEntities(id)
    this.notifyState()
    return true
  }

  /** 进入编辑草图态：kind=translate 时 handleId 固定为 'translate'。 */
  beginEditDraft(featureId: string, kind: "translate" | "resize", handleId?: string): boolean {
    if (!this.viewer || !this.featureStore.has(featureId)) return false

    const feature = this.featureStore.get(featureId)!
    const entity = this.entityRenderer.getFeatureEntity(featureId)
    const handleEntity = handleId ? this.handleRenderer.find(featureId, handleId) : entity
    if (!handleEntity) return false

    const position = this.handleRenderer.getScreenPosition(this.viewer, handleEntity)
    if (!position) return false

    if (this.editingDraft) {
      restoreCameraController(this.viewer, this.editingDraft.cameraSnapshot)
    }

    const cameraSnapshot = snapshotCameraController(this.viewer)
    disableCameraController(this.viewer)

    const startCoordinate = pickCoordinate(this.viewer, position) ?? {
      longitude: 0,
      latitude: 0,
      height: 0,
    }

    // 计算 handle 起始位置到中心的距离，供 distance / width 编辑追踪 delta
    let startDistanceHandleOffsetMeters = 0
    let startWidthHandleOffsetMeters = 0
    const effectiveHandleId = handleId ?? "translate"

    if (feature.geometry.type === "buffer" && effectiveHandleId === "distance") {
      const polygonCenter = feature.geometry.polygon[0]
      if (polygonCenter) {
        startDistanceHandleOffsetMeters = geodesicDistance(polygonCenter, startCoordinate)
      }
    }
    if (feature.geometry.type === "corridor" && effectiveHandleId.startsWith("width-")) {
      const midIndex = Math.floor(feature.geometry.path.length / 2)
      const pathCenter = feature.geometry.path[midIndex]
      if (pathCenter) {
        startWidthHandleOffsetMeters = geodesicDistance(pathCenter, startCoordinate)
      }
    }

    this.editingDraft = {
      featureId,
      kind,
      handleId: effectiveHandleId,
      startScreen: position.clone(),
      startCoordinate,
      startGeometry: feature.geometry,
      startDistanceHandleOffsetMeters,
      startWidthHandleOffsetMeters,
      cameraSnapshot,
    }
    this.notifyState()
    return true
  }

  /** 鼠标移动时实时更新编辑草图几何（仅内存与 entity，不持久化）。 */
  updateEditDraft(screenPosition: { readonly x: number; readonly y: number }): void {
    if (!this.viewer || !this.editingDraft) return

    const current = pickCoordinate(
      this.viewer,
      new Cesium.Cartesian2(screenPosition.x, screenPosition.y),
    )
    if (!current) return

    const nextGeometry = computeEditedGeometry(
      this.editingDraft,
      this.editingDraft.startGeometry,
      current,
      computeBufferPolygon,
    )
    if (!nextGeometry) return

    this.featureStore.setGeometry(this.editingDraft.featureId, nextGeometry)
    this.entityRenderer.replaceFeatureGeometry(this.editingDraft.featureId, nextGeometry)
  }

  /** 落定编辑：把最终 geometry 写回 features 并通知监听器，触发持久化。 */
  commitEditDraft(): boolean {
    if (!this.viewer || !this.editingDraft) return false

    const { cameraSnapshot, featureId } = this.editingDraft
    this.editingDraft = undefined
    restoreCameraController(this.viewer, cameraSnapshot)

    this.disposeHandleEntities()
    this.createHandleEntities(featureId)
    this.notifyState()
    return true
  }

  /** 回滚编辑：丢弃草图态，恢复到 begin 前的几何。 */
  cancelEditDraft(): boolean {
    if (!this.viewer || !this.editingDraft) return false

    const { cameraSnapshot, featureId, startGeometry } = this.editingDraft
    this.editingDraft = undefined
    restoreCameraController(this.viewer, cameraSnapshot)

    this.featureStore.setGeometry(featureId, startGeometry)
    this.entityRenderer.replaceFeatureGeometry(featureId, startGeometry)
    this.disposeHandleEntities()
    this.createHandleEntities(featureId)
    this.notifyState()
    return true
  }

  /** 处理编辑模式 LEFT_DOWN：先把手后主体，仅记录 pendingEditTarget。 */
  private handleEditingLeftDown(position: Cesium.Cartesian2) {
    if (!this.selectedFeatureId || this.editingDraft || !this.viewer) return

    const handleInfo = this.handleRenderer.pick(this.viewer, position)
    if (handleInfo && handleInfo.featureId === this.selectedFeatureId) {
      this.pendingEditTarget = {
        featureId: this.selectedFeatureId,
        kind: "resize",
        handleId: handleInfo.handleId,
        startScreen: position.clone(),
      }
      return
    }

    const featureId = this.pickDrawingFeature({ x: position.x, y: position.y })
    if (featureId === this.selectedFeatureId) {
      this.pendingEditTarget = {
        featureId: this.selectedFeatureId,
        kind: "translate",
        handleId: "translate",
        startScreen: position.clone(),
      }
    }
  }

  /** 销毁当前所有 handle entity。 */
  private disposeHandleEntities() {
    this.handleRenderer.dispose()
  }

  /** 为指定 feature 创建编辑把手。 */
  private createHandleEntities(featureId: string) {
    const feature = this.featureStore.get(featureId)
    if (feature) {
      this.handleRenderer.create(featureId, feature)
    }
  }

  /** 处理右键：拖拽模式下取消 drag，其他模式下完成草图。 */
  private handleRightClick() {
    if (this.dragState) {
      this.discardDraft()
      this.notifyState()
      return
    }

    this.finishDrawing()
  }

  /** 处理地图左键点击并确认一个绘制节点（click 流）。 */
  private addCoordinate(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode) return

    const coordinate = pickCoordinate(this.viewer, position)
    if (!coordinate) return

    this.draftCoordinates.push(coordinate)

    if (this.mode === "point") {
      this.finishDrawing()
      return
    }

    this.entityRenderer.createDraftEntity()
    this.entityRenderer.createDraftVertexEntity(coordinate)
    this.notifyState()
  }

  /** 处理鼠标移动并更新草图预览点。 */
  private updateCursor(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode) return

    if (this.dragState) {
      const coordinate = pickCoordinate(this.viewer, position)
      if (!coordinate) return

      this.dragState.currentCoordinate = coordinate
      return
    }

    if (this.draftCoordinates.length === 0) return

    this.cursorCoordinate = pickCoordinate(this.viewer, position)
  }

  /** 拖拽开始：记录起点与当前坐标，禁用相机控制以避免与绘制拖拽冲突。 */
  private beginDrag(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.mode || !DRAG_TYPES.has(this.mode)) return

    const coordinate = pickCoordinate(this.viewer, position)
    if (!coordinate) return

    this.discardDraft()

    const mode = this.mode as "rectangle" | "circle" | "ellipse"
    const cameraSnapshot = snapshotCameraController(this.viewer)
    disableCameraController(this.viewer)

    this.dragState = {
      mode,
      startScreen: position.clone(),
      startCoordinate: coordinate,
      currentCoordinate: coordinate,
      cameraSnapshot,
    }
    this.entityRenderer.createDraftEntity()
    this.notifyState()
  }

  /** 拖拽结束：阈值过滤后按模式落定为几何体；任意路径都会恢复相机控制。 */
  private endDrag(position: Cesium.Cartesian2) {
    if (!this.viewer || !this.dragState) return

    const { cameraSnapshot, startScreen, startCoordinate, currentCoordinate, mode } = this.dragState
    const distance = screenDistance(startScreen, position)
    const endCoordinate = pickCoordinate(this.viewer, position) ?? currentCoordinate

    // 无论是否落定，先清空 dragState 并恢复相机控制，
    // 防止后续模式切换 / 异常路径导致相机仍处于禁用态。
    this.dragState = undefined
    restoreCameraController(this.viewer, cameraSnapshot)

    if (distance < DRAG_THRESHOLD_PX) {
      this.discardDraft()
      this.notifyState()
      return
    }

    let geometry: MapDrawGeometry | null = null
    if (mode === "rectangle") {
      geometry = computeRectangle(startCoordinate, endCoordinate)
    } else if (mode === "circle") {
      geometry = computeCircle(startCoordinate, endCoordinate)
    } else if (mode === "ellipse") {
      geometry = computeEllipse(startCoordinate, endCoordinate)
    }

    if (!geometry || isNearPole(featureCenter(geometry))) {
      this.discardDraft()
      this.notifyState()
      return
    }

    const feature = this.featureStore.create(mode, geometry)
    this.entityRenderer.createFeatureEntity(feature)

    this.discardDraft()
    this.featureStore.set(feature)
    this.notifyState()
  }

  /** 由 click 流的坐标序列构造 geometry；corridor 在此应用 width。 */
  private buildGeometryFromCoordinates(
    type: MapDrawGeometryType,
    coordinates: readonly MapDrawCoordinate[],
  ): MapDrawGeometry {
    switch (type) {
      case "point":
        return { type: "point", coordinate: coordinates[0]! }
      case "polyline":
        return { type: "polyline", coordinates }
      case "polygon":
        return { type: "polygon", coordinates }
      case "corridor":
        return {
          type: "corridor",
          path: coordinates,
          widthMeters: Math.max(this.drawingOptions.widthMeters, 1),
        }
      default:
        throw new Error(`不支持的几何类型：${type}`)
    }
  }

  /** 获取包含鼠标预览点的草图坐标。 */
  private getPreviewCoordinates() {
    const coordinates = [...this.draftCoordinates]
    if (this.cursorCoordinate && this.mode && !DRAG_TYPES.has(this.mode)) {
      coordinates.push(this.cursorCoordinate)
    }

    return coordinates
  }

  /** 获取草图对应的 Cesium 位置数组。 */
  private getPreviewCartesians() {
    return this.getPreviewCoordinates().map(toCartesian)
  }

  /** 移除当前草图实体和临时节点；拖拽态被丢弃时同时恢复相机控制。 */
  private discardDraft() {
    if (this.dragState && this.viewer) {
      restoreCameraController(this.viewer, this.dragState.cameraSnapshot)
    }

    this.entityRenderer.discardDraft()
    this.draftCoordinates = []
    this.cursorCoordinate = undefined
    this.dragState = undefined
  }

  /** 向监听方广播最新绘制状态。 */
  private notifyState() {
    const state = this.getDrawingState()
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}
