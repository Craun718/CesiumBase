import * as Cesium from "cesium"
import type {
  SceneImageryLayerDescriptor,
  SceneImageryLayerPatch,
  SceneLayerError,
  SceneModelLayerDescriptor,
  SceneModelLayerPatch,
  SceneTilesetLayerDescriptor,
  SceneTilesetLayerPatch,
  SceneVectorLayerDescriptor,
  SceneVectorLayerPatch,
  SceneVectorLayerStyle,
  SwipeCompareOptions,
} from "../../types"
import { ACCENT, FOREGROUND } from "../../themeColors.js"

export interface ManagedImageryLayer {
  readonly layer: Cesium.ImageryLayer
  readonly renderOrder: number
}

interface ManagedImageryEntry {
  readonly layers: ManagedImageryLayer[]
  descriptor: SceneImageryLayerDescriptor
}

interface ManagedVectorEntry {
  readonly dataSource: Cesium.GeoJsonDataSource
  descriptor: SceneVectorLayerDescriptor
}

interface ManagedTilesetEntry {
  readonly tileset: Cesium.Cesium3DTileset
  descriptor: SceneTilesetLayerDescriptor
}

interface ManagedModelEntry {
  readonly model: Cesium.Model
  descriptor: SceneModelLayerDescriptor
}

interface ManagedPrimitiveItem {
  readonly primitive: Cesium.Cesium3DTileset | Cesium.Model
  readonly renderOrder: number
}

const ANNOTATION_RENDER_ORDER_OFFSET = 100_000
const vectorBoundaryEntityName = "__cesium_vector_boundary__"
const TIANDITU_DEFAULT_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const

/** ????????????????????? */
export function normalizeTiandituSubdomains(subdomains?: readonly string[]): string[] {
  return subdomains?.length ? [...subdomains] : [...TIANDITU_DEFAULT_SUBDOMAINS]
}

/** 管理 LayerRegistry 下发的影像与 GeoJSON 实例，隔离 Cesium 类型细节。 */
export class CesiumLayerOperationController {
  private readonly imageryEntries = new Map<string, ManagedImageryEntry>()
  private readonly vectorEntries = new Map<string, ManagedVectorEntry>()
  private readonly tilesetEntries = new Map<string, ManagedTilesetEntry>()
  private readonly modelEntries = new Map<string, ManagedModelEntry>()
  private readonly imageryErrorListeners = new Set<(error: SceneLayerError) => void>()
  private readonly imageryErrorDisposers = new Map<Cesium.ImageryLayer, () => void>()
  private legacyImageryCleared = false
  private swipeCompareOptions?: SwipeCompareOptions

  async addImageryLayer(viewer: Cesium.Viewer, descriptor: SceneImageryLayerDescriptor) {
    this.removeImageryLayer(viewer, descriptor.id)
    this.clearLegacyImagery(viewer)

    const layers =
      descriptor.protocol === "tianditu"
        ? createTiandituImageryLayers(descriptor)
        : this.createProtocolImageryLayers(descriptor).map((layer) => ({
            layer,
            renderOrder: descriptor.renderOrder,
          }))
    const managedLayers = layers

    // 按最终渲染顺序计算插入点，避免新增图层导致已有瓦片重挂载。
    const insertionOrder = [...this.imageryEntries.values()]
      .flatMap((entry) => entry.layers)
      .concat(managedLayers)
      .sort((left, right) => left.renderOrder - right.renderOrder)

    for (const [index, item] of insertionOrder.entries()) {
      if (!managedLayers.includes(item)) continue

      viewer.imageryLayers.add(item.layer, index)
      this.watchImageryError(viewer, descriptor.id, item.layer)
    }
    this.imageryEntries.set(descriptor.id, { layers: managedLayers, descriptor })
    if (this.swipeCompareOptions?.enabled) {
      this.applySwipeDirections(viewer, descriptor.id, managedLayers)
    }
  }

  /** 监听托管影像瓦片错误，并转换为引擎无关错误事件。 */
  onImageryLayerError(listener: (error: SceneLayerError) => void) {
    this.imageryErrorListeners.add(listener)

    return () => {
      this.imageryErrorListeners.delete(listener)
    }
  }

  updateImageryLayer(viewer: Cesium.Viewer, id: string, patch: SceneImageryLayerPatch) {
    const entry = this.imageryEntries.get(id)
    if (!entry) return

    const shouldResort =
      patch.renderOrder !== undefined && patch.renderOrder !== entry.descriptor.renderOrder
    const descriptor = {
      ...entry.descriptor,
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
      ...(patch.renderOrder === undefined ? {} : { renderOrder: patch.renderOrder }),
    }

    for (const item of entry.layers) {
      item.layer.show = descriptor.visible
      item.layer.alpha = descriptor.opacity
    }

    entry.descriptor = descriptor
    this.imageryEntries.set(id, { ...entry, descriptor })
    if (shouldResort) this.sortImageryLayers(viewer)
  }

  removeImageryLayer(viewer: Cesium.Viewer, id: string) {
    const entry = this.imageryEntries.get(id)
    if (!entry) return

    for (const item of entry.layers) {
      viewer.imageryLayers.remove(item.layer, true)
      this.imageryErrorDisposers.get(item.layer)?.()
      this.imageryErrorDisposers.delete(item.layer)
    }
    this.imageryEntries.delete(id)
  }

  /** 设置卷帘方向和分割比例；关闭时恢复全部托管影像层。 */
  setSwipeCompare(viewer: Cesium.Viewer, options: SwipeCompareOptions) {
    const normalized = normalizeSwipeCompareOptions(options)
    const previous = this.swipeCompareOptions
    const onlySplitPositionChanged =
      previous !== undefined &&
      previous.enabled === normalized.enabled &&
      previous.leftLayerId === normalized.leftLayerId &&
      previous.rightLayerId === normalized.rightLayerId &&
      previous.baseLayerId === normalized.baseLayerId &&
      previous.showDivider === normalized.showDivider
    this.swipeCompareOptions = normalized
    viewer.scene.splitPosition = normalized.enabled ? normalized.splitPosition : 0.5
    if (onlySplitPositionChanged) return

    for (const [id, entry] of this.imageryEntries) {
      this.applySwipeDirections(viewer, id, entry.layers)
    }
  }

  async addVectorLayer(viewer: Cesium.Viewer, descriptor: SceneVectorLayerDescriptor) {
    this.removeVectorLayer(viewer, descriptor.id)

    if (descriptor.source === "url" && !descriptor.url) {
      throw new Error("GeoJSON 图层缺少服务地址")
    }
    if (descriptor.source === "inline" && descriptor.data === undefined) {
      throw new Error("GeoJSON 图层缺少内联数据")
    }

    const style = descriptor.style
    const dataSource = await Cesium.GeoJsonDataSource.load(
      descriptor.source === "url" ? descriptor.url : descriptor.data,
      {
        clampToGround: true,
        fill: getColor(style?.fillColor, ACCENT, style?.fillOpacity ?? 0.35),
        stroke: getColor(style?.strokeColor, ACCENT, style?.strokeOpacity ?? 1),
        strokeWidth: style?.strokeWidth ?? 2,
        markerColor: getColor(style?.strokeColor, ACCENT, style?.strokeOpacity ?? 1),
      },
    )
    dataSource.show = descriptor.visible
    viewer.dataSources.add(dataSource)
    if (style?.outlineAsPolyline) {
      appendVectorBoundaryPolylines(dataSource, style, descriptor.renderOrder)
    }
    applyVectorStyle(dataSource, style, descriptor.renderOrder)
    this.vectorEntries.set(descriptor.id, { dataSource, descriptor })
  }

  updateVectorLayer(viewer: Cesium.Viewer, id: string, patch: SceneVectorLayerPatch) {
    const entry = this.vectorEntries.get(id)
    if (!entry) return

    const descriptor = {
      ...entry.descriptor,
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.style === undefined ? {} : { style: patch.style }),
      ...(patch.renderOrder === undefined ? {} : { renderOrder: patch.renderOrder }),
    }

    entry.dataSource.show = descriptor.visible
    if (
      patch.style !== undefined &&
      Boolean(entry.descriptor.style?.outlineAsPolyline) !== Boolean(patch.style.outlineAsPolyline)
    ) {
      syncVectorBoundaryPolylines(entry.dataSource, descriptor.style, descriptor.renderOrder)
    }
    applyVectorStyle(entry.dataSource, descriptor.style, descriptor.renderOrder)
    entry.descriptor = descriptor
    this.vectorEntries.set(id, { ...entry, descriptor })
    if (patch.renderOrder !== undefined) this.sortVectorLayers(viewer)
  }

  removeVectorLayer(viewer: Cesium.Viewer, id: string) {
    const entry = this.vectorEntries.get(id)
    if (!entry) return

    viewer.dataSources.remove(entry.dataSource, true)
    this.vectorEntries.delete(id)
  }

  async addTilesetLayer(viewer: Cesium.Viewer, descriptor: SceneTilesetLayerDescriptor) {
    this.removeTilesetLayer(viewer, descriptor.id)

    const maximumScreenSpaceError = descriptor.maximumScreenSpaceError
    if (
      maximumScreenSpaceError !== undefined &&
      (!Number.isFinite(maximumScreenSpaceError) || maximumScreenSpaceError < 0)
    ) {
      throw new Error("3D Tiles 图层屏幕空间误差必须大于等于 0")
    }

    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      createAuthorizedResource(descriptor.url, "3D Tiles 图层", descriptor.authToken),
      {
        show: descriptor.visible,
        ...(maximumScreenSpaceError === undefined ? {} : { maximumScreenSpaceError }),
      },
    )
    tileset.style = createTilesetOpacityStyle(descriptor.opacity)
    viewer.scene.primitives.add(tileset)
    this.tilesetEntries.set(descriptor.id, { tileset, descriptor })
    this.sortPrimitiveLayers(viewer)
  }

  updateTilesetLayer(viewer: Cesium.Viewer, id: string, patch: SceneTilesetLayerPatch) {
    const entry = this.tilesetEntries.get(id)
    if (!entry) return

    const descriptor = {
      ...entry.descriptor,
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
      ...(patch.renderOrder === undefined ? {} : { renderOrder: patch.renderOrder }),
    }

    entry.tileset.show = descriptor.visible
    entry.tileset.style = createTilesetOpacityStyle(descriptor.opacity)
    entry.descriptor = descriptor
    if (patch.renderOrder !== undefined) this.sortPrimitiveLayers(viewer)
  }

  removeTilesetLayer(viewer: Cesium.Viewer, id: string) {
    const entry = this.tilesetEntries.get(id)
    if (!entry) return

    viewer.scene.primitives.remove(entry.tileset)
    this.tilesetEntries.delete(id)
  }

  async addModelLayer(viewer: Cesium.Viewer, descriptor: SceneModelLayerDescriptor) {
    this.removeModelLayer(viewer, descriptor.id)

    const model = await Cesium.Model.fromGltfAsync({
      url: createAuthorizedResource(descriptor.url, "glTF 模型", descriptor.authToken),
      show: descriptor.visible,
      modelMatrix: createModelPlacementMatrix(descriptor),
    })
    applyModelOpacity(model, descriptor.opacity)
    viewer.scene.primitives.add(model)
    this.modelEntries.set(descriptor.id, { model, descriptor })
    this.sortPrimitiveLayers(viewer)
  }

  updateModelLayer(viewer: Cesium.Viewer, id: string, patch: SceneModelLayerPatch) {
    const entry = this.modelEntries.get(id)
    if (!entry) return

    const descriptor = {
      ...entry.descriptor,
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
      ...(patch.renderOrder === undefined ? {} : { renderOrder: patch.renderOrder }),
    }

    entry.model.show = descriptor.visible
    applyModelOpacity(entry.model, descriptor.opacity)
    entry.descriptor = descriptor
    if (patch.renderOrder !== undefined) this.sortPrimitiveLayers(viewer)
  }

  removeModelLayer(viewer: Cesium.Viewer, id: string) {
    const entry = this.modelEntries.get(id)
    if (!entry) return

    viewer.scene.primitives.remove(entry.model)
    this.modelEntries.delete(id)
  }

  dispose(viewer: Cesium.Viewer) {
    for (const id of Array.from(this.imageryEntries.keys())) {
      this.removeImageryLayer(viewer, id)
    }
    for (const dispose of this.imageryErrorDisposers.values()) dispose()
    this.imageryErrorDisposers.clear()
    for (const id of Array.from(this.vectorEntries.keys())) {
      this.removeVectorLayer(viewer, id)
    }
    for (const id of Array.from(this.tilesetEntries.keys())) {
      this.removeTilesetLayer(viewer, id)
    }
    for (const id of Array.from(this.modelEntries.keys())) {
      this.removeModelLayer(viewer, id)
    }
    this.legacyImageryCleared = false
  }

  private clearLegacyImagery(viewer: Cesium.Viewer) {
    if (this.legacyImageryCleared) return

    while (viewer.imageryLayers.length > 0) {
      const layer = viewer.imageryLayers.get(0)
      viewer.imageryLayers.remove(layer, true)
    }
    this.legacyImageryCleared = true
  }

  /** 将当前卷帘方向应用到一组实际影像层。 */
  private applySwipeDirections(
    viewer: Cesium.Viewer,
    id: string,
    layers: readonly ManagedImageryLayer[],
  ) {
    const options = this.swipeCompareOptions
    if (!options?.enabled) {
      for (const item of layers) item.layer.splitDirection = Cesium.SplitDirection.NONE
      return
    }

    viewer.scene.splitPosition = options.splitPosition
    const direction =
      id === options.baseLayerId
        ? Cesium.SplitDirection.NONE
        : id === options.leftLayerId
          ? Cesium.SplitDirection.LEFT
          : id === options.rightLayerId
            ? Cesium.SplitDirection.RIGHT
            : Cesium.SplitDirection.NONE
    for (const item of layers) item.layer.splitDirection = direction
  }

  private createProtocolImageryLayers(descriptor: SceneImageryLayerDescriptor) {
    const provider =
      descriptor.protocol === "wms"
        ? createWmsImageryProvider(descriptor)
        : descriptor.protocol === "wmts"
          ? createWmtsImageryProvider(descriptor)
          : createXyzImageryProvider(descriptor)
    const layer = new Cesium.ImageryLayer(provider, {
      show: descriptor.visible,
      alpha: descriptor.opacity,
    })

    return [layer]
  }

  private sortPrimitiveLayers(viewer: Cesium.Viewer) {
    const items: ManagedPrimitiveItem[] = [
      ...[...this.tilesetEntries.values()].map((entry) => ({
        primitive: entry.tileset,
        renderOrder: entry.descriptor.renderOrder,
      })),
      ...[...this.modelEntries.values()].map((entry) => ({
        primitive: entry.model,
        renderOrder: entry.descriptor.renderOrder,
      })),
    ].sort((left, right) => left.renderOrder - right.renderOrder)

    for (const item of items) {
      viewer.scene.primitives.raiseToTop(item.primitive)
    }
  }

  private sortVectorLayers(viewer: Cesium.Viewer) {
    const entries = [...this.vectorEntries.values()].sort(
      (left, right) => left.descriptor.renderOrder - right.descriptor.renderOrder,
    )

    for (const entry of entries) {
      viewer.dataSources.remove(entry.dataSource, false)
    }
    for (const entry of entries) {
      viewer.dataSources.add(entry.dataSource)
    }
  }

  private sortImageryLayers(viewer: Cesium.Viewer) {
    const layers = [...this.imageryEntries.values()]
      .flatMap((entry) => entry.layers)
      .sort((left, right) => left.renderOrder - right.renderOrder)

    for (const item of layers) {
      viewer.imageryLayers.remove(item.layer, false)
    }
    for (const item of layers) {
      viewer.imageryLayers.add(item.layer)
    }
  }

  private watchImageryError(viewer: Cesium.Viewer, layerId: string, layer: Cesium.ImageryLayer) {
    if (this.imageryErrorDisposers.has(layer)) return

    const dispose = layer.errorEvent.addEventListener((error) => {
      if (!viewer.imageryLayers.contains(layer)) return

      const sceneError: SceneLayerError = {
        id: layerId,
        message: readImageryErrorMessage(error),
      }
      for (const listener of this.imageryErrorListeners) listener(sceneError)
    })
    this.imageryErrorDisposers.set(layer, dispose)
  }
}

/** 创建天地图底图及其注记层。 */
export function createTiandituImageryLayers(
  descriptor: SceneImageryLayerDescriptor,
): ManagedImageryLayer[] {
  const token = descriptor.token?.trim()
  if (!token) throw new Error("未配置天地图 Key，无法加载天地图图层")
  if (descriptor.mapType === undefined) throw new Error("天地图图层缺少地图类型")

  const subdomains = normalizeTiandituSubdomains(descriptor.subdomains)
  const maximumLevel = descriptor.maximumLevel ?? 18
  const isVector = descriptor.mapType === "vector"
  const baseLayer = isVector ? "vec_w" : "img"
  const annotationLayer = isVector ? "cva_w" : "cia"

  return [baseLayer, annotationLayer].map((layer, index) => {
    const url = isVector
      ? `https://t{s}.tianditu.gov.cn/DataServer?T=${layer}&x={x}&y={y}&l={z}&tk=${token}`
      : `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${token}`

    return {
      layer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url,
          subdomains,
          maximumLevel,
          ...(descriptor.minimumLevel === undefined
            ? {}
            : { minimumLevel: descriptor.minimumLevel }),
        }),
        {
          show: descriptor.visible,
          alpha: descriptor.opacity,
        },
      ),
      renderOrder: descriptor.renderOrder + (index === 1 ? ANNOTATION_RENDER_ORDER_OFFSET : 0),
    }
  })
}

/** 目录方案不可用时向 Viewer 注入天地图启动底图。 */
export function addFallbackTiandituLayers(viewer: Cesium.Viewer, token?: string) {
  const normalizedToken = token?.trim()
  if (!normalizedToken) return

  for (const item of createTiandituImageryLayers({
    id: "fallback-tianditu",
    protocol: "tianditu",
    mapType: "imagery",
    token: normalizedToken,
    visible: true,
    renderOrder: 0,
    opacity: 1,
  })) {
    viewer.imageryLayers.add(item.layer)
  }
}

/** 创建 XYZ 瓦片 Provider，并应用坐标系与资源范围。 */
export function createXyzImageryProvider(descriptor: SceneImageryLayerDescriptor) {
  if (!descriptor.urlTemplate?.trim()) throw new Error("XYZ 图层缺少瓦片地址模板")

  return new Cesium.UrlTemplateImageryProvider({
    url: createAuthorizedResource(descriptor.urlTemplate.trim(), "XYZ 图层", descriptor.authToken),
    ...(descriptor.subdomains?.length ? { subdomains: descriptor.subdomains } : {}),
    tilingScheme: createTilingScheme(descriptor.tilingScheme ?? "web-mercator"),
    rectangle: createRectangle(descriptor.bounds),
    ...(descriptor.minimumLevel === undefined ? {} : { minimumLevel: descriptor.minimumLevel }),
    ...(descriptor.maximumLevel === undefined ? {} : { maximumLevel: descriptor.maximumLevel }),
  })
}

/** 归一化卷帘配置；非法分割比例回退到 0.5。 */
export function normalizeSwipeCompareOptions(options: SwipeCompareOptions): SwipeCompareOptions {
  const splitPosition = Number.isFinite(options.splitPosition)
    ? Math.min(1, Math.max(0, options.splitPosition))
    : 0.5

  return { ...options, splitPosition }
}

/** 创建通用 WMS影像 Provider。 */
export function createWmsImageryProvider(descriptor: SceneImageryLayerDescriptor) {
  if (!descriptor.baseUrl?.trim()) throw new Error("WMS 图层缺少服务地址")
  if (!descriptor.layers?.trim()) throw new Error("WMS 图层缺少图层参数")

  const version = descriptor.version ?? "1.1.1"
  const parameters: Record<string, string> = {
    version,
    format: descriptor.format ?? "image/png",
    styles: descriptor.style ?? "",
  }
  if (descriptor.srs?.trim()) {
    parameters[Number.parseFloat(version) >= 1.3 ? "crs" : "srs"] = descriptor.srs.trim()
  }

  return new Cesium.WebMapServiceImageryProvider({
    url: createAuthorizedResource(descriptor.baseUrl.trim(), "WMS 图层", descriptor.authToken),
    layers: descriptor.layers.trim(),
    parameters,
    tilingScheme: createTilingScheme(descriptor.tilingScheme ?? "geographic"),
    rectangle: createRectangle(descriptor.bounds),
    ...(descriptor.minimumLevel === undefined ? {} : { minimumLevel: descriptor.minimumLevel }),
    ...(descriptor.maximumLevel === undefined ? {} : { maximumLevel: descriptor.maximumLevel }),
  })
}

/** 创建通用 WMTS KVP 影像 Provider。 */
export function createWmtsImageryProvider(descriptor: SceneImageryLayerDescriptor) {
  if (!descriptor.baseUrl?.trim()) throw new Error("WMTS 图层缺少服务地址")
  if (!descriptor.layer?.trim()) throw new Error("WMTS 图层缺少图层参数")
  if (!descriptor.tileMatrixSet?.trim()) throw new Error("WMTS 图层缺少 TileMatrixSet")

  return new Cesium.WebMapTileServiceImageryProvider({
    url: createAuthorizedResource(descriptor.baseUrl.trim(), "WMTS 图层", descriptor.authToken),
    layer: descriptor.layer.trim(),
    style: descriptor.style?.trim() || "default",
    tileMatrixSetID: descriptor.tileMatrixSet.trim(),
    format: descriptor.format ?? "image/png",
    tilingScheme: createTilingScheme(descriptor.tilingScheme ?? "web-mercator"),
    rectangle: createRectangle(descriptor.bounds),
    ...(descriptor.minimumLevel === undefined ? {} : { minimumLevel: descriptor.minimumLevel }),
    ...(descriptor.maximumLevel === undefined ? {} : { maximumLevel: descriptor.maximumLevel }),
  })
}

/** 按资源中心和高程计算 glTF 摆放矩阵。 */
export function createModelPlacementMatrix(descriptor: SceneModelLayerDescriptor) {
  if (!descriptor.bounds) return Cesium.Matrix4.IDENTITY

  const longitude = (descriptor.bounds.west + descriptor.bounds.east) / 2
  const latitude = (descriptor.bounds.south + descriptor.bounds.north) / 2
  const height = Number.isFinite(descriptor.height) ? descriptor.height : 0
  return Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
  )
}

/** 创建 3D Tiles 白色 Alpha 透明度样式。 */
export function createTilesetOpacityStyle(opacity: number) {
  return new Cesium.Cesium3DTileStyle({
    color: `color("white", ${clamp(opacity, 0, 1)})`,
  })
}

/** 使用白色 Alpha 混合更新 glTF 模型透明度。 */
export function applyModelOpacity(model: Cesium.Model, opacity: number) {
  model.color = Cesium.Color.WHITE.withAlpha(clamp(opacity, 0, 1))
  model.colorBlendMode = Cesium.ColorBlendMode.HIGHLIGHT
}

/** 创建带静态 Token 的 Cesium Resource。 */
function createAuthorizedResource(url: string, label: string, authToken?: string) {
  const normalizedUrl = requireHttpUrl(url, label)
  const token = authToken?.trim()

  return token
    ? new Cesium.Resource({
        url: normalizedUrl,
        headers: { Authorization: `Bearer ${token}` },
      })
    : normalizedUrl
}

/** 校验服务地址为 HTTP 或 HTTPS。 */
function requireHttpUrl(url: string, label: string) {
  const normalizedUrl = url.trim()
  if (!/^(https?:\/\/|\/)/i.test(normalizedUrl)) {
    throw new Error(`${label}服务地址必须是 HTTP(S) 或以 / 开头的同源路径`)
  }
  return normalizedUrl
}

/** 创建影像坐标系。 */
function createTilingScheme(tilingScheme: "web-mercator" | "geographic") {
  return tilingScheme === "web-mercator"
    ? new Cesium.WebMercatorTilingScheme()
    : new Cesium.GeographicTilingScheme()
}

/** 将 WGS84 资源范围转换为 Cesium Rectangle。 */
function createRectangle(bounds: SceneImageryLayerDescriptor["bounds"]) {
  return bounds
    ? Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north)
    : undefined
}

/** 转换 Cesium 瓦片错误为可展示文本。 */
function readImageryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message

    const innerError = (error as { error?: unknown }).error
    if (innerError instanceof Error) return innerError.message
  }

  return "影像瓦片请求失败"
}

/** 将 polygon 外环与洞转换为贴地闭合 polyline。 */
export function appendVectorBoundaryPolylines(
  dataSource: Cesium.GeoJsonDataSource,
  style: SceneVectorLayerStyle,
  renderOrder = 0,
) {
  const stroke = getColor(style.strokeColor, ACCENT, style.strokeOpacity ?? 1)
  const width = style.strokeWidth ?? 2
  const zIndex = style.zIndex ?? renderOrder

  for (const entity of dataSource.entities.values) {
    if (!entity.polygon) continue

    const hierarchy = entity.polygon.hierarchy?.getValue(Cesium.JulianDate.now())
    if (!hierarchy) continue

    appendPolygonHierarchyPolylines(dataSource, hierarchy, stroke, width, zIndex)
  }
}

/** 递归处理 Cesium PolygonHierarchy，包含外环、洞与嵌套洞。 */
function appendPolygonHierarchyPolylines(
  dataSource: Cesium.GeoJsonDataSource,
  hierarchy: Cesium.PolygonHierarchy,
  stroke: Cesium.Color,
  width: number,
  zIndex: number,
) {
  addBoundaryPolyline(dataSource, hierarchy.positions, stroke, width, zIndex)
  for (const hole of hierarchy.holes ?? []) {
    appendPolygonHierarchyPolylines(dataSource, hole, stroke, width, zIndex)
  }
}

/** 为实体追加一条闭合贴地边界线。 */
function addBoundaryPolyline(
  dataSource: Cesium.GeoJsonDataSource,
  positions: readonly Cesium.Cartesian3[],
  stroke: Cesium.Color,
  width: number,
  zIndex: number,
) {
  if (positions.length < 3) return

  const closedPositions = Cesium.Cartesian3.equals(positions[0], positions[positions.length - 1])
    ? [...positions]
    : [...positions, positions[0]]

  dataSource.entities.add({
    name: vectorBoundaryEntityName,
    polyline: {
      positions: closedPositions,
      material: new Cesium.ColorMaterialProperty(stroke),
      width,
      arcType: Cesium.ArcType.GEODESIC,
      clampToGround: true,
      classificationType: Cesium.ClassificationType.BOTH,
      zIndex,
    },
  })
}

/** 按最新样式重建 polygon 边界线，避免运行时切换后残留或缺失。 */
function syncVectorBoundaryPolylines(
  dataSource: Cesium.GeoJsonDataSource,
  style: SceneVectorLayerStyle | undefined,
  renderOrder: number,
) {
  const boundaryEntities = [...dataSource.entities.values].filter(
    (entity) => entity.name === vectorBoundaryEntityName,
  )
  for (const entity of boundaryEntities) {
    dataSource.entities.remove(entity)
  }

  if (style?.outlineAsPolyline) {
    appendVectorBoundaryPolylines(dataSource, style, renderOrder)
  }
}

/** 将引擎无关样式写入 Cesium GeoJSON 实体。 */
function applyVectorStyle(
  dataSource: Cesium.GeoJsonDataSource,
  style?: SceneVectorLayerStyle,
  renderOrder = 0,
) {
  for (const entity of dataSource.entities.values) {
    const fill = getColor(style?.fillColor, ACCENT, style?.fillOpacity ?? 0.35)
    const stroke = getColor(style?.strokeColor, ACCENT, style?.strokeOpacity ?? 1)

    if (entity.polygon) {
      entity.polygon.material = new Cesium.ColorMaterialProperty(fill)
      entity.polygon.outlineColor = new Cesium.ConstantProperty(stroke)
      entity.polygon.outlineWidth = new Cesium.ConstantProperty(style?.strokeWidth ?? 2)
      entity.polygon.outline = new Cesium.ConstantProperty(!style?.outlineAsPolyline)
      if (style?.zIndex !== undefined)
        entity.polygon.zIndex = new Cesium.ConstantProperty(style.zIndex)

      const extrusionHeight = readNumericProperty(entity, style?.extrusionHeightField)
      if (extrusionHeight !== undefined) {
        entity.polygon.extrudedHeight = new Cesium.ConstantProperty(extrusionHeight)
      }
    }

    if (entity.polyline) {
      entity.polyline.material = new Cesium.ColorMaterialProperty(stroke)
      entity.polyline.width = new Cesium.ConstantProperty(style?.strokeWidth ?? 2)
      entity.polyline.arcType = new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC)
      entity.polyline.clampToGround = new Cesium.ConstantProperty(true)
      entity.polyline.classificationType = new Cesium.ConstantProperty(
        Cesium.ClassificationType.BOTH,
      )
      entity.polyline.zIndex = new Cesium.ConstantProperty(style?.zIndex ?? renderOrder)
    }

    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(stroke)
      entity.point.pixelSize = new Cesium.ConstantProperty(9)
    }

    if (style?.iconUrl) {
      entity.billboard = new Cesium.BillboardGraphics({
        image: style.iconUrl,
      })
    }

    const labelText = readDisplayProperty(entity, style?.labelField)
    if (labelText !== undefined) {
      entity.label = new Cesium.LabelGraphics({
        text: String(labelText),
        fillColor: getColor(style?.labelColor, FOREGROUND, 1),
        font: `normal ${style?.labelSize ?? 12}px sans-serif`,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
    }
  }
}

/** 读取数值型 GeoJSON 属性，用于拉伸等映射。 */
function readNumericProperty(entity: Cesium.Entity, fieldName?: string) {
  const value = readDisplayProperty(entity, fieldName)
  if (value === undefined || value === null || value === "") return undefined

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

/** 读取用于展示的 GeoJSON 属性值。 */
function readDisplayProperty(entity: Cesium.Entity, fieldName?: string) {
  if (!fieldName || !entity.properties?.hasProperty(fieldName)) return undefined

  const property = entity.properties?.getProperty(fieldName)
  if (property && typeof property === "object" && "getValue" in property) {
    return (property as Cesium.Property).getValue(Cesium.JulianDate.now())
  }

  return property
}

/** 解析 CSS 颜色并应用透明度。 */
function getColor(cssColor: string | undefined, fallback: string, opacity = 1) {
  const color = Cesium.Color.fromCssColorString(cssColor ?? fallback)
  return color.withAlpha(clamp(opacity, 0, 1))
}

/** 限制数值范围。 */
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
