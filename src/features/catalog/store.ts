import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { fetchCatalog, type CatalogLoadStatus } from "./api.js"
import { cloneCatalogValue } from "./model/clone.js"
import type {
  CatalogSnapshot,
  LayerDefinition,
  LayerGroupDefinition,
  LayerSchemeDefinition,
  ResourceCategoryDefinition,
  ResourceDefinition,
  ServiceResourceDefinition,
  ServiceSourceDefinition,
} from "./model/types"
import type { DiscoveryResult } from "./protocols/types"
import { validateResourceBinding } from "./model/rules.js"
import { buildLayerSchemeBundle, validateLayerScheme } from "./layerScheme.js"

export interface CatalogActionResult {
  readonly ok: boolean
  readonly error?: string
  readonly created?: number
  readonly updated?: number
}

export interface DiscoveryApplyOptions {
  readonly categoryId?: string
  readonly enabled?: boolean
}

const activeSchemeStorageKey = "webgis.active-layer-scheme"

/** 读取当前会话选择的图层方案。 */
function readSessionSchemeId() {
  try {
    return globalThis.sessionStorage?.getItem(activeSchemeStorageKey) ?? undefined
  } catch {
    return undefined
  }
}

/** 保存当前会话选择的图层方案。 */
function writeSessionSchemeId(schemeId: string | undefined) {
  try {
    if (schemeId) globalThis.sessionStorage?.setItem(activeSchemeStorageKey, schemeId)
    else globalThis.sessionStorage?.removeItem(activeSchemeStorageKey)
  } catch {
    // 浏览器禁用存储时仅保持内存状态。
  }
}

const emptyCatalog: CatalogSnapshot = {
  modelVersion: "1.0",
  sources: [],
  resourceCategories: [],
  resources: [],
  layerSchemes: [],
}

/** 校验资源范围是否合法。 */
function validateExtent(extent: ServiceResourceDefinition["extent"]): string[] {
  if (!extent) return []
  const values = [extent.west, extent.south, extent.east, extent.north]
  if (!values.every(Number.isFinite)) return ["资源范围必须全部为有限数字"]
  if (extent.west > extent.east || extent.south > extent.north)
    return ["资源范围的西/南边界不能大于东/北边界"]
  if (extent.west < -180 || extent.east > 180 || extent.south < -90 || extent.north > 90) {
    return ["资源范围超出 WGS84 合法范围"]
  }
  if (
    extent.minimumHeight !== undefined &&
    extent.maximumHeight !== undefined &&
    extent.minimumHeight > extent.maximumHeight
  ) {
    return ["资源最小高程不能大于最大高程"]
  }
  return []
}

/** 按 id 替换或追加目录项。 */
function replaceOrAppend<T extends { readonly id: string; readonly sortOrder: number }>(
  items: readonly T[],
  next: T,
): T[] {
  const index = items.findIndex((item) => item.id === next.id)
  if (index === -1) return [...items, next].sort((left, right) => left.sortOrder - right.sortOrder)
  return items.map((item) => (item.id === next.id ? next : item))
}

/** ?? XYZ ????? */
function resolveTileTemplate(rootUrl: string, template: string) {
  if (/^https?:\/\//i.test(template) || template.startsWith("/")) return template
  return `${rootUrl.replace(/\/+$/, "")}/${template.replace(/^\/+/, "")}`
}

export const useCatalogStore = defineStore("catalog", () => {
  const catalog = ref<CatalogSnapshot>(structuredClone(emptyCatalog))
  const loadStatus = ref<CatalogLoadStatus>("loading")
  const loadError = ref<string>()
  const selectedSourceId = ref<string>()
  const selectedCategoryId = ref<string>()
  const selectedResourceId = ref<string>()
  const selectedSchemeId = ref<string>()
  const activeSchemeId = ref<string>()
  const pendingFlyToResourceId = ref<string>()
  const temporaryResources = ref<ResourceDefinition[]>([])
  const temporaryLayers = ref<LayerDefinition[]>([])
  const visibilityOverrides = ref<Record<string, boolean>>({})
  const lastDiscovery = ref<DiscoveryResult>()
  let requestSequence = 0

  /** 应用目录快照，替换当前会话数据。 */
  function applyCatalog(next: CatalogSnapshot) {
    catalog.value = cloneCatalogValue(next)
    selectedSourceId.value = next.sources[0]?.id
    selectedCategoryId.value = next.resourceCategories[0]?.id
    selectedResourceId.value = next.resources[0]?.id
    selectedSchemeId.value = next.layerSchemes[0]?.id
    const sessionSchemeId = readSessionSchemeId()
    activeSchemeId.value =
      next.layerSchemes.find(
        (scheme) => scheme.id === sessionSchemeId && scheme.status === "enabled",
      )?.id ??
      next.layerSchemes.find((scheme) => scheme.defaultActive && scheme.status === "enabled")?.id ??
      next.layerSchemes.find((scheme) => scheme.status === "enabled")?.id
    writeSessionSchemeId(activeSchemeId.value)
    lastDiscovery.value = undefined
  }

  /** 从 v1.0 目录接口加载数据。 */
  async function loadCatalog() {
    const requestId = ++requestSequence
    loadStatus.value = "loading"
    loadError.value = undefined
    try {
      const next = await fetchCatalog()
      if (requestId !== requestSequence) return
      applyCatalog(next)
      loadStatus.value = "ready"
    } catch (error) {
      if (requestId !== requestSequence) return
      loadStatus.value = "error"
      loadError.value = error instanceof Error ? error.message : "目录服务请求失败"
    }
  }

  /** 保存或更新服务接入。 */
  function saveSource(source: ServiceSourceDefinition): CatalogActionResult {
    const existing = catalog.value.sources.find((item) => item.id === source.id)
    const referenced = catalog.value.resources.some(
      (resource) => resource.origin === "service" && resource.sourceId === source.id,
    )
    if (existing && existing.protocol !== source.protocol && referenced) {
      return { ok: false, error: "已被资源引用的服务接入不能修改协议" }
    }
    const connectionChanged = existing
      ? JSON.stringify(existing.connection) !== JSON.stringify(source.connection)
      : false
    const mustPreserveStale =
      existing?.verification.status === "stale" &&
      source.verification.status === "verified" &&
      source.verification.checkedAt === existing.verification.checkedAt &&
      source.verification.fingerprint === existing.verification.fingerprint
    const nextSource =
      existing && connectionChanged
        ? {
            ...source,
            verification: {
              ...source.verification,
              status: "stale" as const,
              message: "连接配置已变化，请重新测试",
            },
          }
        : existing && mustPreserveStale
          ? { ...source, verification: existing.verification }
          : source
    const nextResources =
      connectionChanged && existing
        ? catalog.value.resources.map((resource) =>
            resource.origin === "service" && resource.sourceId === source.id
              ? {
                  ...resource,
                  verification: {
                    ...resource.verification,
                    status: "stale" as const,
                    message: "上游服务配置已变化，请重新验证",
                  },
                }
              : resource,
          )
        : catalog.value.resources
    catalog.value = {
      ...catalog.value,
      sources: replaceOrAppend(catalog.value.sources, nextSource),
      resources: nextResources,
    }
    selectedSourceId.value = source.id
    return { ok: true }
  }

  /** 删除未被资源引用的服务接入。 */
  function removeSource(sourceId: string): CatalogActionResult {
    const referenced = catalog.value.resources.filter(
      (resource): resource is ServiceResourceDefinition =>
        resource.origin === "service" && resource.sourceId === sourceId,
    )
    if (referenced.length > 0) {
      return {
        ok: false,
        error: `服务接入仍被资源引用：${referenced.map((item) => item.name).join("、")}`,
      }
    }
    catalog.value = {
      ...catalog.value,
      sources: catalog.value.sources.filter((item) => item.id !== sourceId),
    }
    if (selectedSourceId.value === sourceId) selectedSourceId.value = catalog.value.sources[0]?.id
    return { ok: true }
  }

  /** 保存或更新资源。 */
  function saveResource(resource: ServiceResourceDefinition): CatalogActionResult {
    const source = catalog.value.sources.find((item) => item.id === resource.sourceId)
    if (!source) return { ok: false, error: "资源引用的服务接入不存在" }
    const bindingErrors = validateResourceBinding(source.protocol, resource.binding)
    if (bindingErrors.length > 0) return { ok: false, error: bindingErrors.join("；") }
    const extentErrors = validateExtent(resource.extent)
    if (extentErrors.length > 0) return { ok: false, error: extentErrors.join("；") }
    catalog.value = {
      ...catalog.value,
      resources: replaceOrAppend(catalog.value.resources, resource),
    }
    selectedResourceId.value = resource.id
    return { ok: true }
  }

  /** 删除未被图层引用的资源。 */
  function removeResource(resourceId: string): CatalogActionResult {
    const references = catalog.value.layerSchemes.flatMap((scheme) =>
      scheme.layers.filter((layer) => layer.resourceId === resourceId),
    )
    if (references.length > 0) {
      return { ok: false, error: `资源仍被 ${references.length} 个图层引用，请先删除相关图层` }
    }
    catalog.value = {
      ...catalog.value,
      resources: catalog.value.resources.filter((item) => item.id !== resourceId),
    }
    if (selectedResourceId.value === resourceId) {
      selectedResourceId.value = catalog.value.resources[0]?.id
    }
    return { ok: true }
  }

  /** 将发现结果按 sourceId + bindingKey 幂等写入资源目录。 */
  function applyDiscovery(
    result: DiscoveryResult,
    options: DiscoveryApplyOptions = {},
  ): CatalogActionResult {
    let created = 0
    let updated = 0
    const nextResources = [...catalog.value.resources]
    const discoveryFailed =
      result.status === "failed" || result.issues.some((issue) => issue.level === "error")

    for (const item of result.items) {
      if (!item.selectable || !item.binding) continue
      const existingIndex = nextResources.findIndex(
        (resource) =>
          resource.origin === "service" &&
          resource.sourceId === result.sourceId &&
          resource.bindingKey === item.key,
      )
      const existing =
        existingIndex >= 0
          ? (nextResources[existingIndex]! as ServiceResourceDefinition)
          : undefined
      const fingerprint = result.metadataFiles
        .map((file) => {
          const value = file.fingerprint?.contentHash ?? file.fingerprint?.etag
          return value ? `${file.path}:${value}` : undefined
        })
        .filter((value): value is string => Boolean(value))
        .join("|")
      const verification = {
        status: discoveryFailed ? ("failed" as const) : ("verified" as const),
        checkedAt: new Date().toISOString(),
        fingerprint,
        profile: result.profile,
        issues: result.issues,
      }
      const base: ServiceResourceDefinition = existing
        ? {
            ...existing,
            binding: item.binding,
            kind: item.kind,
            bindingKey: item.key,
            verification,
          }
        : {
            id: `resource-${crypto.randomUUID()}`,
            name: item.name,
            categoryId: options.categoryId,
            sortOrder: 100,
            enabled: options.enabled ?? true,
            origin: "service",
            sourceId: result.sourceId,
            bindingKey: item.key,
            binding: item.binding,
            kind: item.kind,
            extent: item.extent,
            extentSource: item.extentSource,
            extentQuality: item.extentQuality,
            verification,
          }
      if (existingIndex >= 0) {
        nextResources[existingIndex] = base
        updated++
      } else {
        nextResources.push(base)
        created++
      }
    }

    const discoveryIssues = result.issues
    const verifiedAt = new Date().toISOString()
    const nextSources = catalog.value.sources.map((source) => {
      if (source.id !== result.sourceId) return source

      let nextSource = source
      if (source.protocol === "xyz") {
        const tileItem = result.items.find((item) => item.tile)
        if (tileItem?.tile) {
          const crs = tileItem.diagnostics?.crs
          nextSource = {
            ...source,
            connection: {
              ...source.connection,
              urlTemplate: resolveTileTemplate(source.connection.rootUrl, tileItem.tile.template),
              minimumLevel: tileItem.levelRange?.min ?? source.connection.minimumLevel,
              maximumLevel: tileItem.levelRange?.max ?? source.connection.maximumLevel,
              tilingScheme:
                typeof crs === "string" && /4326|CRS84/i.test(crs) ? "geographic" : "web-mercator",
            },
          }
        }
      }

      return {
        ...nextSource,
        verification: {
          status: discoveryFailed ? ("failed" as const) : ("verified" as const),
          checkedAt: verifiedAt,
          profile: result.profile,
          issues: discoveryIssues,
        },
      }
    })

    catalog.value = { ...catalog.value, sources: nextSources, resources: nextResources }
    lastDiscovery.value = cloneCatalogValue(result)
    return { ok: true, created, updated }
  }

  /** 保存或更新资源分类。 */
  function saveResourceCategory(category: ResourceCategoryDefinition): CatalogActionResult {
    catalog.value = {
      ...catalog.value,
      resourceCategories: replaceOrAppend(catalog.value.resourceCategories, category),
    }
    return { ok: true }
  }

  /** 删除未被资源或子分类引用的分类。 */
  function removeResourceCategory(categoryId: string): CatalogActionResult {
    if (catalog.value.resourceCategories.some((item) => item.parentId === categoryId)) {
      return { ok: false, error: "该分类包含子分类，请先移动或删除子分类" }
    }
    if (catalog.value.resources.some((item) => item.categoryId === categoryId)) {
      return { ok: false, error: "该分类下仍有资源，请先移动或删除资源" }
    }
    catalog.value = {
      ...catalog.value,
      resourceCategories: catalog.value.resourceCategories.filter((item) => item.id !== categoryId),
    }
    if (selectedCategoryId.value === categoryId) {
      selectedCategoryId.value = catalog.value.resourceCategories[0]?.id
    }
    return { ok: true }
  }

  /** 替换图层方案，供阶段 3 迁移前测试引用保护。 */
  function replaceLayerSchemes(schemes: readonly LayerSchemeDefinition[]) {
    catalog.value = { ...catalog.value, layerSchemes: cloneCatalogValue(schemes) }
    selectedSchemeId.value = catalog.value.layerSchemes[0]?.id
    if (!catalog.value.layerSchemes.some((scheme) => scheme.id === activeSchemeId.value)) {
      activeSchemeId.value = catalog.value.layerSchemes.find(
        (scheme) => scheme.status === "enabled",
      )?.id
    }
  }

  /** 添加临时上传图层。 */
  function addTemporaryLayer(resource: ResourceDefinition, layer: LayerDefinition) {
    temporaryResources.value = [...temporaryResources.value, resource]
    temporaryLayers.value = [...temporaryLayers.value, layer]
  }

  /** 移除临时上传图层及其资源。 */
  function removeTemporaryLayer(layerId: string) {
    const layer = temporaryLayers.value.find((item) => item.id === layerId)
    temporaryLayers.value = temporaryLayers.value.filter((item) => item.id !== layerId)
    if (layer) {
      temporaryResources.value = temporaryResources.value.filter(
        (item) => item.id !== layer.resourceId,
      )
    }
    const next = { ...visibilityOverrides.value }
    delete next[layerId]
    visibilityOverrides.value = next
  }

  /** 设置地图端会话显隐；不修改方案默认值。 */
  function setLayerVisible(layerId: string, visible: boolean) {
    const next = { ...visibilityOverrides.value, [layerId]: visible }
    const active = activeBundle.value?.scheme.layers.find((item) => item.id === layerId)
    if (visible && active?.type === "terrain") {
      for (const layer of activeBundle.value?.scheme.layers ?? []) {
        if (layer.type === "terrain" && layer.id !== layerId) next[layer.id] = false
      }
    }
    visibilityOverrides.value = next
  }

  /** 请求地图端定位到指定资源；地图消费后应清空。 */
  function requestFlyToResource(resourceId: string) {
    pendingFlyToResourceId.value = resourceId
  }

  /** 保存或更新图层方案。 */
  function saveLayerScheme(scheme: LayerSchemeDefinition): CatalogActionResult {
    catalog.value = {
      ...catalog.value,
      layerSchemes: replaceOrAppend(catalog.value.layerSchemes, scheme),
    }
    selectedSchemeId.value = scheme.id
    return { ok: true }
  }

  /** 复制方案并重建分组和图层 ID。 */
  function copyLayerScheme(schemeId: string): CatalogActionResult {
    const source = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!source) return { ok: false, error: "方案不存在" }
    const groupIds = new Map(
      source.groups.map((group) => [group.id, `group-${crypto.randomUUID()}`]),
    )
    const next: LayerSchemeDefinition = {
      ...source,
      id: `scheme-${crypto.randomUUID()}`,
      name: `${source.name}副本`,
      status: "disabled",
      defaultActive: false,
      groups: source.groups.map((group) => ({
        ...group,
        id: groupIds.get(group.id) ?? group.id,
        parentId: group.parentId ? groupIds.get(group.parentId) : undefined,
      })),
      layers: source.layers.map((layer) => ({
        ...layer,
        id: `layer-${crypto.randomUUID()}`,
        groupId: layer.groupId ? groupIds.get(layer.groupId) : undefined,
      })),
    }
    return saveLayerScheme(next)
  }

  /** 删除图层方案。启用方案必须先停用。 */
  function removeLayerScheme(schemeId: string): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    if (scheme.status === "enabled") return { ok: false, error: "启用方案必须先停用" }
    catalog.value = {
      ...catalog.value,
      layerSchemes: catalog.value.layerSchemes.filter((item) => item.id !== schemeId),
    }
    if (selectedSchemeId.value === schemeId)
      selectedSchemeId.value = catalog.value.layerSchemes[0]?.id
    return { ok: true }
  }

  /** 启用或停用方案。 */
  function setSchemeEnabled(schemeId: string, enabled: boolean): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    if (enabled) {
      const validation = validateLayerScheme(catalog.value, scheme)
      if (!validation.valid) return { ok: false, error: validation.errors.join("；") }
    } else if (scheme.defaultActive) {
      const replacement = catalog.value.layerSchemes.find(
        (item) => item.id !== schemeId && item.status === "enabled" && item.defaultActive,
      )
      if (!replacement) return { ok: false, error: "停用默认方案前必须先设置另一个默认方案" }
    }
    const next = { ...scheme, status: enabled ? ("enabled" as const) : ("disabled" as const) }
    saveLayerScheme(next)
    if (!enabled && activeSchemeId.value === schemeId) {
      activeSchemeId.value = catalog.value.layerSchemes.find(
        (item) => item.id !== schemeId && item.status === "enabled" && item.defaultActive,
      )?.id
      writeSessionSchemeId(activeSchemeId.value)
      visibilityOverrides.value = {}
    }
    return { ok: true }
  }

  /** 设置唯一默认方案。 */
  function setDefaultScheme(schemeId: string): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    if (scheme.status !== "enabled") return { ok: false, error: "只有启用方案可以设为默认" }
    catalog.value = {
      ...catalog.value,
      layerSchemes: catalog.value.layerSchemes.map((item) => ({
        ...item,
        defaultActive: item.id === schemeId,
      })),
    }
    return { ok: true }
  }

  /** 更新当前地图方案。 */
  function activateScheme(schemeId: string): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme || scheme.status !== "enabled") return { ok: false, error: "只有启用方案可以应用" }
    activeSchemeId.value = schemeId
    writeSessionSchemeId(schemeId)
    visibilityOverrides.value = {}
    return { ok: true }
  }

  /** 保存或更新方案分组。 */
  function saveLayerGroup(schemeId: string, group: LayerGroupDefinition): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    return saveLayerScheme({
      ...scheme,
      groups: replaceOrAppend(scheme.groups, group),
    })
  }

  /** 删除未被图层和子分组引用的分组。 */
  function removeLayerGroup(schemeId: string, groupId: string): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    if (scheme.groups.some((group) => group.parentId === groupId)) {
      return { ok: false, error: "该分组包含子分组" }
    }
    if (scheme.layers.some((layer) => layer.groupId === groupId)) {
      return { ok: false, error: "该分组下仍有图层" }
    }
    return saveLayerScheme({
      ...scheme,
      groups: scheme.groups.filter((group) => group.id !== groupId),
    })
  }

  /** 保存或更新方案图层。 */
  function saveLayer(schemeId: string, layer: LayerDefinition): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    return saveLayerScheme({
      ...scheme,
      layers: replaceOrAppend(scheme.layers, layer),
    })
  }

  /** 删除方案图层。 */
  function removeLayer(schemeId: string, layerId: string): CatalogActionResult {
    const scheme = catalog.value.layerSchemes.find((item) => item.id === schemeId)
    if (!scheme) return { ok: false, error: "方案不存在" }
    return saveLayerScheme({
      ...scheme,
      layers: scheme.layers.filter((layer) => layer.id !== layerId),
    })
  }

  /** 保存最近一次发现结果，供资源批量确认使用。 */
  function setLastDiscovery(result: DiscoveryResult | undefined) {
    lastDiscovery.value = result ? cloneCatalogValue(result) : undefined
  }

  const sourceById = computed(
    () => new Map(catalog.value.sources.map((source) => [source.id, source])),
  )
  const resourceById = computed(
    () => new Map(catalog.value.resources.map((resource) => [resource.id, resource])),
  )
  const activeBundle = computed(() =>
    activeSchemeId.value ? buildLayerSchemeBundle(catalog.value, activeSchemeId.value) : undefined,
  )
  const activeScheme = computed(() =>
    catalog.value.layerSchemes.find((scheme) => scheme.id === activeSchemeId.value),
  )

  return {
    catalog,
    loadStatus,
    loadError,
    selectedSourceId,
    selectedCategoryId,
    selectedResourceId,
    selectedSchemeId,
    activeSchemeId,
    pendingFlyToResourceId,
    temporaryResources,
    temporaryLayers,
    visibilityOverrides,
    lastDiscovery,
    sourceById,
    resourceById,
    activeBundle,
    activeScheme,
    applyCatalog,
    loadCatalog,
    saveSource,
    removeSource,
    saveResource,
    removeResource,
    applyDiscovery,
    saveResourceCategory,
    removeResourceCategory,
    replaceLayerSchemes,
    requestFlyToResource,
    addTemporaryLayer,
    removeTemporaryLayer,
    setLayerVisible,
    setLastDiscovery,
    saveLayerScheme,
    copyLayerScheme,
    removeLayerScheme,
    setSchemeEnabled,
    setDefaultScheme,
    activateScheme,
    saveLayerGroup,
    removeLayerGroup,
    saveLayer,
    removeLayer,
  }
})
