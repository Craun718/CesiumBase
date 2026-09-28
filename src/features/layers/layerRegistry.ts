import type { MapController } from "../../map"
import type {
  SceneImageryLayerDescriptor,
  SceneModelLayerDescriptor,
  SceneTilesetLayerDescriptor,
  SceneVectorLayerDescriptor,
} from "../../map/types"
import { filterFeatureCollection, loadWfsFeatureCollection } from "./wfsFeatureCache.js"
import type {
  ServiceSourceDefinition,
  LayerDefinition,
  LayerDefinitionUpdatePatch,
  LayerOrigin,
  LayerRegistry,
  LayerSchemeBundle,
  LayerSnapshot,
  RegisterLayerInput,
  ResourceDefinition,
} from "./types"

type ImageryLayerDefinition = Extract<LayerDefinition, { type: "imagery" }>
type ModelLayerDefinition = Extract<LayerDefinition, { type: "model" }>
type TilesetLayerDefinition = Extract<LayerDefinition, { type: "tileset" }>
type VectorLayerDefinition = Extract<LayerDefinition, { type: "vector" }>

interface RegistryEntry {
  definition: LayerDefinition
  resource: ResourceDefinition
  source?: ServiceSourceDefinition
  origin: LayerOrigin
  materialized: boolean
  snapshot: LayerSnapshot
}

/** 管理正式方案图层与临时图层的运行时注册、显隐、重试和定位。 */
export class CesiumLayerRegistry implements LayerRegistry {
  private readonly mapController: MapController
  private readonly entries = new Map<string, RegistryEntry>()
  private readonly listeners = new Set<(snapshots: readonly LayerSnapshot[]) => void>()
  private activeSchemeId?: string
  private activeBundle?: LayerSchemeBundle
  private mapReady = false
  private pendingBundle?: LayerSchemeBundle
  private readonly disposeMountState: () => void
  private readonly disposeImageryError: () => void

  constructor(mapController: MapController) {
    this.mapController = mapController
    this.disposeMountState = mapController.onMountStateChange((ready) => {
      this.mapReady = ready

      if (!ready) {
        this.resetMaterialization()
        return
      }

      const bundle = this.pendingBundle
      this.pendingBundle = undefined
      if (bundle) void this.applyBundle(bundle)
    })
    this.disposeImageryError = mapController.onImageryLayerError((error) => {
      this.markImageryLayerError(error.id, error.message)
    })
  }

  async applyScheme(bundle: LayerSchemeBundle): Promise<readonly LayerSnapshot[]> {
    this.activeBundle = bundle
    this.activeSchemeId = bundle.scheme.id

    if (!this.mapReady) {
      this.pendingBundle = bundle
      this.clearSchemeLayers()
      return this.getLayerSnapshots()
    }

    this.clearSchemeLayers()
    this.pendingBundle = undefined
    await this.applyBundle(bundle)
    return this.getLayerSnapshots()
  }

  async clearScheme(): Promise<readonly LayerSnapshot[]> {
    this.activeBundle = undefined
    this.activeSchemeId = undefined
    this.pendingBundle = undefined
    this.clearSchemeLayers()
    return this.getLayerSnapshots()
  }

  async registerLayer(input: RegisterLayerInput): Promise<LayerSnapshot> {
    const entry = this.createEntry(input, input.origin ?? "scheme")
    this.entries.set(entry.definition.id, entry)
    this.notify()

    await this.loadEntry(entry)
    return entry.snapshot
  }

  async removeLayer(layerId: string): Promise<void> {
    const entry = this.entries.get(layerId)
    if (!entry) return

    await this.destroyEntry(entry)
    this.entries.delete(layerId)
    this.notify()
  }

  async updateLayer(layerId: string, patch: LayerDefinitionUpdatePatch): Promise<LayerSnapshot> {
    const entry = this.entries.get(layerId)
    if (!entry) throw new Error("图层不存在或已移除")

    entry.definition = {
      ...entry.definition,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(patch.renderOrder === undefined ? {} : { renderOrder: patch.renderOrder }),
      ...(patch.groupId === undefined ? {} : { groupId: patch.groupId ?? undefined }),
      ...(patch.style === undefined ? {} : { style: patch.style }),
    } as LayerDefinition

    if (entry.materialized) {
      await this.updateMaterializedLayer(entry)
    } else if (entry.definition.visible && this.mapReady) {
      await this.loadEntry(entry)
    }

    this.notify()
    return entry.snapshot
  }

  async setLayerVisible(layerId: string, visible: boolean): Promise<LayerSnapshot> {
    const entry = this.entries.get(layerId)
    if (!entry) throw new Error("图层不存在或已移除")

    entry.definition = { ...entry.definition, visible }

    if (entry.definition.type === "terrain" && visible) {
      await this.hideOtherTerrainLayers(layerId)
    }

    if (entry.materialized) {
      await this.updateMaterializedLayer(entry)
    } else if (visible && this.mapReady) {
      await this.loadEntry(entry)
    }

    this.notify()
    return entry.snapshot
  }

  async retryLayer(layerId: string): Promise<LayerSnapshot | undefined> {
    const entry = this.entries.get(layerId)
    if (!entry) return undefined

    entry.snapshot = this.createSnapshot(entry, "loading")
    this.notify()

    if (!this.mapReady) {
      entry.snapshot = this.createErrorSnapshot(entry, "地图尚未挂载，暂不能加载图层")
      this.notify()
      return entry.snapshot
    }

    await this.loadEntry(entry)
    return entry.snapshot
  }

  async flyToLayer(layerId: string): Promise<boolean> {
    const entry = this.entries.get(layerId)
    return entry ? this.flyToResource(entry.resource.id) : false
  }

  async flyToResource(resourceId: string): Promise<boolean> {
    const entry = [...this.entries.values()].find((item) => item.resource.id === resourceId)
    const extent = entry?.resource.extent
    if (!extent) return false

    this.mapController.flyToBounds({
      west: extent.west,
      south: extent.south,
      east: extent.east,
      north: extent.north,
    })
    return true
  }

  getActiveSchemeId(): string | undefined {
    return this.activeSchemeId
  }

  getLayerSnapshots(): LayerSnapshot[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.snapshot }))
  }

  onLayerSnapshotsChange(listener: (snapshots: readonly LayerSnapshot[]) => void): () => void {
    this.listeners.add(listener)
    listener(this.getLayerSnapshots())

    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose() {
    for (const entry of Array.from(this.entries.values())) {
      void this.destroyEntry(entry)
    }
    this.entries.clear()
    this.listeners.clear()
    this.disposeMountState()
    this.disposeImageryError()
    this.notify()
  }

  private async applyBundle(bundle: LayerSchemeBundle) {
    for (const definition of bundle.scheme.layers) {
      const resource = bundle.resources.find((item) => item.id === definition.resourceId)
      if (!resource) {
        const entry = this.createMissingResourceEntry(definition)
        this.entries.set(definition.id, entry)
        continue
      }

      const source = this.getResourceSource(resource, bundle)
      const entry = this.createEntry({ definition, resource }, "scheme", source)
      this.entries.set(definition.id, entry)

      if (!definition.visible) {
        entry.snapshot = this.createSnapshot(entry, "loaded")
      }
    }

    this.notify()

    const visibleLayers = bundle.scheme.layers.filter((layer) => layer.visible)
    for (const definition of visibleLayers) {
      const entry = this.entries.get(definition.id)
      if (!entry || entry.snapshot.status === "loaded") continue

      await this.loadEntry(entry)
    }
  }

  private createEntry(
    input: RegisterLayerInput,
    origin: LayerOrigin,
    source?: ServiceSourceDefinition,
  ): RegistryEntry {
    return {
      definition: input.definition,
      resource: input.resource,
      source,
      origin,
      materialized: false,
      snapshot: {
        layerId: input.definition.id,
        status: "loading",
        origin,
        canFlyTo: Boolean(input.resource.extent),
      },
    }
  }

  private createMissingResourceEntry(definition: LayerDefinition): RegistryEntry {
    return {
      definition,
      resource: {
        id: `missing-${definition.resourceId}`,
        name: definition.resourceId,
        sortOrder: definition.sortOrder,
        origin: "inline-geojson",
        kind: "vector",
        enabled: true,
        data: { type: "FeatureCollection", features: [] },
      },
      origin: "scheme",
      materialized: false,
      snapshot: {
        layerId: definition.id,
        status: "error",
        origin: "scheme",
        errorMessage: "资源不存在或已删除",
        canFlyTo: false,
      },
    }
  }

  private async loadEntry(entry: RegistryEntry) {
    entry.snapshot = this.createSnapshot(entry, "loading")
    this.notify()

    if (!this.mapReady) {
      entry.snapshot = this.createErrorSnapshot(entry, "地图尚未挂载，暂不能加载图层")
      this.notify()
      return
    }

    try {
      const disabledMessage = this.getResourceDisabledMessage(entry)
      if (disabledMessage) {
        throw new Error(disabledMessage)
      }

      if (entry.definition.type === "terrain") {
        const applied = await this.mapController.setTerrainSource(this.createTerrainSource(entry))
        if (!applied) throw new Error("DEM 服务切换已失效")
      } else if (entry.definition.type === "imagery") {
        await this.mapController.addImageryLayer(this.createImageryDescriptor(entry))
      } else if (this.isVectorLayer(entry)) {
        await this.mapController.addVectorLayer(await this.createVectorDescriptor(entry))
      } else if (entry.definition.type === "tileset") {
        await this.mapController.addTilesetLayer(this.createTilesetDescriptor(entry))
      } else if (entry.definition.type === "model") {
        await this.mapController.addModelLayer(this.createModelDescriptor(entry))
      } else {
        throw new Error("图层类型与服务协议不匹配")
      }

      if (!this.isEntryCurrent(entry)) return
      entry.materialized = true
      entry.snapshot = this.createSnapshot(entry, "loaded")
    } catch (error) {
      if (!this.isEntryCurrent(entry)) return
      entry.materialized = false
      const message = readLayerLoadErrorMessage(error)
      this.logLoadFailure(entry, error, message)
      entry.snapshot = this.createErrorSnapshot(entry, message)
    }

    this.notify()
  }

  private async updateMaterializedLayer(entry: RegistryEntry) {
    if (entry.definition.type === "terrain") {
      await this.mapController.setTerrainSource(
        entry.definition.visible ? this.createTerrainSource(entry) : undefined,
      )
      return
    }

    if (entry.definition.type === "imagery") {
      const style = entry.definition.style as ImageryLayerDefinition["style"]
      this.mapController.updateImageryLayer(entry.definition.id, {
        visible: entry.definition.visible,
        opacity: style.opacity,
        renderOrder: entry.definition.renderOrder,
      })
      return
    }

    if (this.isVectorLayer(entry)) {
      const definition = entry.definition as VectorLayerDefinition
      this.mapController.updateVectorLayer(entry.definition.id, {
        visible: definition.visible,
        style: definition.style,
        renderOrder: entry.definition.renderOrder,
      })
      return
    }

    if (entry.definition.type === "tileset") {
      const style = entry.definition.style as TilesetLayerDefinition["style"]
      this.mapController.updateTilesetLayer(entry.definition.id, {
        visible: entry.definition.visible,
        opacity: style.opacity,
        renderOrder: entry.definition.renderOrder,
      })
      return
    }

    if (entry.definition.type === "model") {
      const style = entry.definition.style as ModelLayerDefinition["style"]
      this.mapController.updateModelLayer(entry.definition.id, {
        visible: entry.definition.visible,
        opacity: style.opacity,
        renderOrder: entry.definition.renderOrder,
      })
    }
  }

  private async destroyEntry(entry: RegistryEntry) {
    if (!entry.materialized) return

    if (entry.definition.type === "terrain") {
      await this.mapController.setTerrainSource(undefined)
    } else if (entry.definition.type === "imagery") {
      this.mapController.removeImageryLayer(entry.definition.id)
    } else if (this.isVectorLayer(entry)) {
      this.mapController.removeVectorLayer(entry.definition.id)
    } else if (entry.definition.type === "tileset") {
      this.mapController.removeTilesetLayer(entry.definition.id)
    } else if (entry.definition.type === "model") {
      this.mapController.removeModelLayer(entry.definition.id)
    }

    entry.materialized = false
  }

  private clearSchemeLayers() {
    for (const entry of Array.from(this.entries.values())) {
      if (entry.origin !== "scheme") continue

      void this.destroyEntry(entry)
      this.entries.delete(entry.definition.id)
    }
    void this.mapController.setTerrainSource(undefined)
    this.notify()
  }

  private async hideOtherTerrainLayers(visibleLayerId: string) {
    if (this.mapReady) {
      await this.mapController.setTerrainSource(undefined)
    }

    for (const entry of this.entries.values()) {
      if (entry.definition.id === visibleLayerId || entry.definition.type !== "terrain") continue

      entry.definition = { ...entry.definition, visible: false }
      entry.materialized = false
      entry.snapshot = this.createSnapshot(entry, "loaded")
    }
  }

  private resetMaterialization() {
    for (const entry of this.entries.values()) {
      entry.materialized = false
      if (entry.snapshot.status !== "error") {
        entry.snapshot = this.createSnapshot(entry, "loading")
      }
    }
    this.pendingBundle = this.activeBundle
    this.notify()
  }

  private getResourceDisabledMessage(entry: RegistryEntry) {
    if (!entry.resource.enabled) return "资源已停用"
    if (entry.source && !entry.source.enabled) return "上游服务已停用"
    return undefined
  }

  /** 瓦片运行时失败时保留已挂载实例，只更新快照供地图端提示。 */
  private markImageryLayerError(layerId: string, message: string) {
    const entry = this.entries.get(layerId)
    if (!entry || entry.definition.type !== "imagery") return

    entry.snapshot = this.createErrorSnapshot(entry, message)
    this.notify()
  }

  private getResourceSource(
    resource: ResourceDefinition,
    bundle: LayerSchemeBundle,
  ): ServiceSourceDefinition | undefined {
    if (resource.origin !== "service") return undefined

    return bundle.sources.find((source) => source.id === resource.sourceId)
  }

  private isVectorLayer(entry: RegistryEntry) {
    return (
      (entry.definition.type === "vector" &&
        (entry.source?.protocol === "geojson" || entry.source?.protocol === "wfs")) ||
      (entry.resource.origin === "inline-geojson" &&
        ["vector", "annotation", "analysis"].includes(entry.definition.type))
    )
  }

  private createTerrainSource(entry: RegistryEntry) {
    if (entry.source?.protocol !== "terrain-quantized-mesh") {
      throw new Error("\u5730\u5f62\u56fe\u5c42\u5fc5\u987b\u5f15\u7528 DEM \u670d\u52a1")
    }

    const { connection } = entry.source
    return {
      id: entry.definition.id,
      name: entry.definition.name,
      url: connection.rootUrl,
      authToken: connection.authToken,
      requestVertexNormals: connection.requestVertexNormals,
      requestWaterMask: connection.requestWaterMask,
    }
  }

  private createImageryDescriptor(entry: RegistryEntry): SceneImageryLayerDescriptor {
    const style = entry.definition.style as ImageryLayerDefinition["style"]
    const source = entry.source
    const binding = entry.resource.origin === "service" ? entry.resource.binding : undefined
    const bounds = createSceneBounds(entry)

    if (source?.protocol === "tianditu") {
      const { connection } = source
      const token = readEnvironmentToken(connection.tokenEnvVariable)
      return {
        id: entry.definition.id,
        protocol: "tianditu",
        mapType: connection.mapType,
        token,
        subdomains: connection.subdomains?.length ? [...connection.subdomains] : undefined,
        minimumLevel: connection.minimumLevel,
        maximumLevel: connection.maximumLevel,
        authToken: connection.authToken,
        bounds,
        visible: entry.definition.visible,
        renderOrder: entry.definition.renderOrder,
        opacity: style.opacity,
      }
    }

    if (source?.protocol === "xyz") {
      const { connection } = source
      return {
        id: entry.definition.id,
        protocol: "xyz",
        urlTemplate: connection.urlTemplate ?? connection.rootUrl,
        subdomains: connection.subdomains ? [...connection.subdomains] : undefined,
        tilingScheme: connection.tilingScheme,
        authToken: connection.authToken,
        minimumLevel: connection.minimumLevel,
        maximumLevel: connection.maximumLevel,
        bounds,
        visible: entry.definition.visible,
        renderOrder: entry.definition.renderOrder,
        opacity: style.opacity,
      }
    }

    if (source?.protocol === "wms") {
      const { connection } = source
      const baseUrl = connection.baseUrl?.trim()
      const layers = binding?.protocol === "wms" ? binding.layer.trim() : ""
      if (!baseUrl) throw new Error("WMS \u56fe\u5c42\u7f3a\u5c11\u670d\u52a1\u5730\u5740")
      if (!layers) throw new Error("WMS \u56fe\u5c42\u7f3a\u5c11\u56fe\u5c42\u53c2\u6570")

      return {
        id: entry.definition.id,
        protocol: "wms",
        baseUrl,
        layers,
        style: binding?.protocol === "wms" ? binding.styleName : undefined,
        version: connection.version,
        format: binding?.protocol === "wms" ? binding.format : undefined,
        srs: binding?.protocol === "wms" ? binding.crs : undefined,
        authToken: connection.authToken,
        bounds,
        visible: entry.definition.visible,
        renderOrder: entry.definition.renderOrder,
        opacity: style.opacity,
      }
    }

    if (source?.protocol === "wmts") {
      const { connection } = source
      const baseUrl = connection.baseUrl?.trim()
      const layer = binding?.protocol === "wmts" ? binding.layer.trim() : ""
      const tileMatrixSet = binding?.protocol === "wmts" ? binding.tileMatrixSet.trim() : ""
      if (!baseUrl) throw new Error("WMTS \u56fe\u5c42\u7f3a\u5c11\u670d\u52a1\u5730\u5740")
      if (!layer) throw new Error("WMTS \u56fe\u5c42\u7f3a\u5c11\u56fe\u5c42\u53c2\u6570")
      if (!tileMatrixSet) throw new Error("WMTS \u56fe\u5c42\u7f3a\u5c11 TileMatrixSet")

      return {
        id: entry.definition.id,
        protocol: "wmts",
        baseUrl,
        layer,
        style: binding?.protocol === "wmts" ? binding.style : undefined,
        tileMatrixSet,
        format: binding?.protocol === "wmts" ? binding.format : undefined,
        version: connection.version,
        authToken: connection.authToken,
        bounds,
        visible: entry.definition.visible,
        renderOrder: entry.definition.renderOrder,
        opacity: style.opacity,
      }
    }

    throw new Error(
      "\u5f71\u50cf\u56fe\u5c42\u5fc5\u987b\u5f15\u7528\u5929\u5730\u56fe\u3001XYZ\u3001WMS \u6216 WMTS \u670d\u52a1",
    )
  }

  private async createVectorDescriptor(entry: RegistryEntry): Promise<SceneVectorLayerDescriptor> {
    const source = entry.source
    const binding = entry.resource.origin === "service" ? entry.resource.binding : undefined

    if (entry.resource.origin === "inline-geojson") {
      return {
        id: entry.definition.id,
        source: "inline",
        data: entry.resource.data,
        visible: entry.definition.visible,
        style: entry.definition.style as VectorLayerDefinition["style"],
        renderOrder: entry.definition.renderOrder,
      }
    }

    if (source?.protocol === "wfs") {
      if (binding?.protocol !== "wfs")
        throw new Error("WFS \u56fe\u5c42\u7f3a\u5c11\u56fe\u5c42\u540d\u79f0")
      if (!source.connection.baseUrl?.trim())
        throw new Error("WFS \u56fe\u5c42\u7f3a\u5c11\u670d\u52a1\u5730\u5740")
      if (!binding.typeName.trim())
        throw new Error("WFS \u56fe\u5c42\u7f3a\u5c11\u56fe\u5c42\u540d\u79f0")

      const collection = await loadWfsFeatureCollection({ source, binding })

      return {
        id: entry.definition.id,
        source: "inline",
        data: filterFeatureCollection(collection, binding.featureFilter),
        visible: entry.definition.visible,
        style: entry.definition.style as VectorLayerDefinition["style"],
        renderOrder: entry.definition.renderOrder,
      }
    }

    if (source?.protocol === "geojson") {
      const url = source.connection.url?.trim()
      if (!url) throw new Error("GeoJSON \u56fe\u5c42\u7f3a\u5c11\u670d\u52a1\u5730\u5740")

      return {
        id: entry.definition.id,
        source: "url",
        url,
        authToken: source.connection.authToken,
        visible: entry.definition.visible,
        style: entry.definition.style as VectorLayerDefinition["style"],
        renderOrder: entry.definition.renderOrder,
      }
    }

    throw new Error(
      "\u77e2\u91cf\u56fe\u5c42\u5fc5\u987b\u5f15\u7528 GeoJSON \u6216 WFS \u670d\u52a1",
    )
  }

  private createTilesetDescriptor(entry: RegistryEntry): SceneTilesetLayerDescriptor {
    const source = entry.source
    if (source?.protocol !== "3d-tiles")
      throw new Error("3D Tiles \u56fe\u5c42\u5fc5\u987b\u5f15\u7528 3D Tiles \u670d\u52a1")
    const rootUrl = source.connection.rootUrl?.trim()
    if (!rootUrl) throw new Error("3D Tiles \u56fe\u5c42\u7f3a\u5c11\u670d\u52a1\u6839\u5730\u5740")
    const url = resolveTilesetEntryUrl(rootUrl)

    const style = entry.definition.style as TilesetLayerDefinition["style"]
    return {
      id: entry.definition.id,
      url,
      authToken: source.connection.authToken,
      maximumScreenSpaceError: source.connection.maximumScreenSpaceError,
      visible: entry.definition.visible,
      renderOrder: entry.definition.renderOrder,
      opacity: style.opacity,
    }
  }

  private createModelDescriptor(entry: RegistryEntry): SceneModelLayerDescriptor {
    const source = entry.source
    if (source?.protocol !== "gltf")
      throw new Error("glTF \u56fe\u5c42\u5fc5\u987b\u5f15\u7528 glTF \u670d\u52a1")
    const url = source.connection.url?.trim()
    if (!url) throw new Error("glTF \u56fe\u5c42\u7f3a\u5c11\u6a21\u578b\u5730\u5740")

    const extent = entry.resource.extent
    const style = entry.definition.style as ModelLayerDefinition["style"]
    return {
      id: entry.definition.id,
      url,
      authToken: source.connection.authToken,
      visible: entry.definition.visible,
      renderOrder: entry.definition.renderOrder,
      opacity: style.opacity,
      bounds: createSceneBounds(entry),
      height: extent?.minimumHeight ?? extent?.maximumHeight ?? 0,
    }
  }

  private createSnapshot(entry: RegistryEntry, status: LayerSnapshot["status"]): LayerSnapshot {
    return {
      layerId: entry.definition.id,
      status,
      origin: entry.origin,
      canFlyTo: Boolean(entry.resource.extent),
    }
  }

  private createErrorSnapshot(entry: RegistryEntry, message: string): LayerSnapshot {
    return {
      ...this.createSnapshot(entry, "error"),
      errorMessage: message,
    }
  }

  private isEntryCurrent(entry: RegistryEntry) {
    return this.entries.get(entry.definition.id) === entry
  }

  /** 把原始加载异常输出到控制台，便于获取堆栈和请求错误对象。 */
  private logLoadFailure(entry: RegistryEntry, error: unknown, message: string) {
    const loggedError = error instanceof Error ? error : new Error(message, { cause: error })
    if (error instanceof Error && error.message === "图层加载失败" && message !== error.message) {
      loggedError.message = message
    }
    console.error(`[layers] 图层加载失败：${entry.definition.name}`, loggedError)
  }

  private notify() {
    const snapshots = this.getLayerSnapshots()
    for (const listener of this.listeners) {
      listener(snapshots)
    }
  }
}

/** 将资源范围转换为引擎无关的 WGS84 边界。 */
function createSceneBounds(entry: RegistryEntry) {
  const extent = entry.resource.extent
  return extent
    ? {
        west: extent.west,
        south: extent.south,
        east: extent.east,
        north: extent.north,
      }
    : undefined
}

/** 将 3D Tiles 服务根目录解析为 tileset.json 入口地址。 */
function resolveTilesetEntryUrl(rootUrl: string) {
  const raw = rootUrl.trim()
  if (!raw) return raw

  const parsed = new URL(raw, "http://localhost")
  const normalizedPath = parsed.pathname.replace(/\/+$/, "")
  const lastSlash = normalizedPath.lastIndexOf("/")
  const lastSegment = normalizedPath.slice(lastSlash + 1)
  const directory =
    lastSegment.toLowerCase().endsWith(".json") && lastSlash >= 0
      ? normalizedPath.slice(0, lastSlash + 1)
      : `${normalizedPath}/`

  const entryPath = `${directory.replace(/\/+$/, "")}/tileset.json`
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    return `${entryPath}${parsed.search}`
  }

  return `${entryPath.replace(/^\//, "")}${parsed.search}`
}

/** 读取前端过渡期的环境变量 Token；10 月后切换为后端代理。 */
function readEnvironmentToken(variableName: string) {
  const value = (import.meta.env as Record<string, string | undefined>)[variableName]
  return value?.trim() || undefined
}

/** 从 Cesium 请求错误或普通异常中提取可展示的失败原因。 */
function readLayerLoadErrorMessage(error: unknown, depth = 0): string {
  if (depth > 4) return "图层加载失败"
  if (typeof error === "string" && error.trim()) return error

  if (error instanceof Error) {
    if (error.message.trim() && error.message !== "图层加载失败") return error.message
    const nested = readLayerLoadErrorMessage((error as { cause?: unknown }).cause, depth + 1)
    return nested || error.message || "图层加载失败"
  }

  if (typeof error !== "object" || error === null) return "图层加载失败"

  const candidate = error as {
    message?: unknown
    error?: unknown
    cause?: unknown
    statusCode?: unknown
    url?: unknown
    response?: unknown
    toString?: () => string
  }

  if (
    typeof candidate.message === "string" &&
    candidate.message.trim() &&
    candidate.message !== "图层加载失败"
  ) {
    return candidate.message
  }

  if (candidate.error !== undefined) {
    const nested = readLayerLoadErrorMessage(candidate.error, depth + 1)
    if (nested !== "图层加载失败") return nested
  }

  if (candidate.cause !== undefined) {
    const nested = readLayerLoadErrorMessage(candidate.cause, depth + 1)
    if (nested !== "图层加载失败") return nested
  }

  if (
    typeof candidate.toString === "function" &&
    candidate.toString !== Object.prototype.toString
  ) {
    const serialized = candidate.toString()
    if (serialized.trim()) return serialized
  }

  const details: string[] = []
  if (typeof candidate.statusCode === "number" && Number.isFinite(candidate.statusCode)) {
    details.push(`HTTP ${candidate.statusCode}`)
  }
  if (typeof candidate.url === "string" && candidate.url.trim()) {
    details.push(candidate.url)
  }
  if (
    typeof candidate.response === "string" &&
    candidate.response.trim() &&
    candidate.response.length <= 200
  ) {
    details.push(candidate.response)
  }

  if (details.length > 0) return `请求失败（${details.join("；")}）`

  return "图层加载失败"
}
