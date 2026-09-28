import type {
  CatalogSnapshot,
  LayerDefinition,
  LayerSchemeDefinition,
  ResourceDefinition,
} from "./model/types"

export interface CatalogUsageLayer {
  readonly id: string
  readonly name: string
  readonly sortOrder: number
}

export interface CatalogUsageResource {
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly layers: readonly CatalogUsageLayer[]
}

export interface CatalogUsageScheme {
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly status: LayerSchemeDefinition["status"]
  readonly defaultActive: boolean
  readonly active: boolean
  readonly resources: readonly CatalogUsageResource[]
}

export interface CatalogUsageSummary {
  readonly targetId: string
  readonly resourceCount: number
  readonly schemeCount: number
  readonly layerCount: number
  readonly schemes: readonly CatalogUsageScheme[]
}

export interface CatalogDisableNotice {
  readonly message: string
  readonly details: readonly string[]
}

/** 按排序值和名称比较目录项，保证影响范围列表稳定。 */
function compareCatalogItems(
  left: { readonly sortOrder: number; readonly name: string },
  right: { readonly sortOrder: number; readonly name: string },
) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
}

/** 将方案图层转换为紧凑的使用情况节点。 */
function toUsageLayer(layer: LayerDefinition): CatalogUsageLayer {
  return { id: layer.id, name: layer.name, sortOrder: layer.sortOrder }
}

/** 聚合一个方案内目标资源的引用图层。 */
function buildSchemeUsage(
  scheme: LayerSchemeDefinition,
  matchedResourceIds: ReadonlySet<string>,
  resourceById: ReadonlyMap<string, ResourceDefinition>,
  activeSchemeId: string | undefined,
): CatalogUsageScheme {
  const layersByResourceId = new Map<string, CatalogUsageLayer[]>()
  for (const layer of scheme.layers) {
    if (!matchedResourceIds.has(layer.resourceId)) continue
    const current = layersByResourceId.get(layer.resourceId) ?? []
    layersByResourceId.set(
      layer.resourceId,
      [...current, toUsageLayer(layer)].sort(compareCatalogItems),
    )
  }
  const resources = [...layersByResourceId.entries()].flatMap(([id, layers]) => {
    const resource = resourceById.get(id)
    if (!resource) return []
    return [{ id, name: resource.name, sortOrder: resource.sortOrder, layers }]
  })

  return {
    id: scheme.id,
    name: scheme.name,
    sortOrder: scheme.sortOrder,
    status: scheme.status,
    defaultActive: scheme.defaultActive,
    active: scheme.id === activeSchemeId,
    resources: [...resources].sort(compareCatalogItems),
  }
}

/** 构建资源在图层方案中的引用情况。 */
export function buildResourceUsage(
  catalog: CatalogSnapshot,
  resourceId: string,
  activeSchemeId?: string,
): CatalogUsageSummary | undefined {
  const resource = catalog.resources.find((item) => item.id === resourceId)
  if (!resource) return undefined
  const resourceById = new Map(catalog.resources.map((item) => [item.id, item]))

  const schemes = catalog.layerSchemes
    .filter((scheme) => scheme.layers.some((layer) => layer.resourceId === resourceId))
    .map((scheme) => buildSchemeUsage(scheme, new Set([resourceId]), resourceById, activeSchemeId))
    .sort(compareCatalogItems)

  return {
    targetId: resourceId,
    resourceCount: 1,
    schemeCount: schemes.length,
    layerCount: schemes.reduce((total, scheme) => total + schemeLayerCount(scheme), 0),
    schemes,
  }
}

/** 构建服务接入及其资源在图层方案中的级联引用情况。 */
export function buildSourceUsage(
  catalog: CatalogSnapshot,
  sourceId: string,
  activeSchemeId?: string,
): CatalogUsageSummary | undefined {
  const source = catalog.sources.find((item) => item.id === sourceId)
  if (!source) return undefined
  const resources = catalog.resources.filter(
    (resource) => resource.origin === "service" && resource.sourceId === sourceId,
  )
  const resourceIds = new Set(resources.map((resource) => resource.id))
  const resourceById = new Map(catalog.resources.map((item) => [item.id, item]))
  const schemes = catalog.layerSchemes
    .filter((scheme) => scheme.layers.some((layer) => resourceIds.has(layer.resourceId)))
    .map((scheme) => buildSchemeUsage(scheme, resourceIds, resourceById, activeSchemeId))
    .sort(compareCatalogItems)

  return {
    targetId: sourceId,
    resourceCount: resources.length,
    schemeCount: schemes.length,
    layerCount: schemes.reduce((total, scheme) => total + schemeLayerCount(scheme), 0),
    schemes,
  }
}

/** 生成资源软停用确认提示。 */
export function buildResourceDisableNotice(
  usage: CatalogUsageSummary | undefined,
): CatalogDisableNotice {
  if (!usage || usage.layerCount === 0) {
    return { message: "停用后该资源不能被新增图层使用，重新启用后可恢复。", details: [] }
  }

  return {
    message: `停用后不会删除方案图层；${usage.layerCount} 个图层将在下次加载时不可用，重新启用资源后原引用自动恢复。`,
    details: [
      `影响范围：${usage.schemeCount} 个方案、${usage.layerCount} 个图层`,
      ...usage.schemes.map((scheme) => formatUsageSchemeLine(scheme, false)),
    ],
  }
}

/** 生成服务软停用确认提示。 */
export function buildSourceDisableNotice(
  usage: CatalogUsageSummary | undefined,
): CatalogDisableNotice {
  if (!usage || (usage.resourceCount === 0 && usage.layerCount === 0)) {
    return { message: "停用后该服务不能用于发现或登记新资源，重新启用后可恢复。", details: [] }
  }

  return {
    message: `停用后不会删除资源和方案图层；${usage.resourceCount} 个资源、${usage.layerCount} 个方案图层将在下次加载时不可用，重新启用服务后原配置自动恢复。`,
    details: [
      `关联资源：${usage.resourceCount} 个；影响范围：${usage.schemeCount} 个方案、${usage.layerCount} 个图层`,
      ...usage.schemes.map((scheme) => formatUsageSchemeLine(scheme, true)),
    ],
  }
}

/** 统计一个方案使用情况中的图层数。 */
function schemeLayerCount(scheme: CatalogUsageScheme) {
  return scheme.resources.reduce((total, resource) => total + resource.layers.length, 0)
}

/** 格式化方案引用行，可按服务场景包含资源名称。 */
export function formatUsageSchemeLine(
  scheme: CatalogUsageScheme | undefined,
  includeResourceNames: boolean,
) {
  if (!scheme) return ""
  const state = [scheme.status === "enabled" ? "启用" : "停用"]
  if (scheme.defaultActive) state.push("默认")
  if (scheme.active) state.push("当前")
  const content = scheme.resources
    .map((resource) =>
      includeResourceNames
        ? `${resource.name} / ${resource.layers.map((layer) => layer.name).join("、")}`
        : resource.layers.map((layer) => layer.name).join("、"),
    )
    .join("；")
  return `${scheme.name}（${state.join("、")}）：${content}`
}
