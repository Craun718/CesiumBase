import { ACCENT } from "../../map/themeColors.js"
import { deriveResourceKind } from "./model/rules.js"
import type {
  CatalogSnapshot,
  GeoExtent,
  LayerDefinition,
  LayerSchemeDefinition,
  ResourceDefinition,
  ServiceResourceDefinition,
  ServiceSourceDefinition,
} from "./model/types"

export interface LayerSchemeBundle {
  readonly scheme: LayerSchemeDefinition
  readonly resources: readonly ResourceDefinition[]
  readonly sources: readonly ServiceSourceDefinition[]
}

export interface LayerSchemeValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/** 构建某个方案实际引用的资源和服务闭包。 */
export function buildLayerSchemeBundle(
  catalog: Pick<CatalogSnapshot, "sources" | "resources" | "layerSchemes">,
  schemeId: string,
): LayerSchemeBundle | undefined {
  const scheme = catalog.layerSchemes.find((item) => item.id === schemeId)
  if (!scheme) return undefined

  const resourceIds = new Set(scheme.layers.map((layer) => layer.resourceId))
  const resources = catalog.resources.filter((resource) => resourceIds.has(resource.id))
  const sourceIds = new Set(
    resources
      .filter((resource): resource is ServiceResourceDefinition => resource.origin === "service")
      .map((resource) => resource.sourceId),
  )
  const sources = catalog.sources.filter((source) => sourceIds.has(source.id))
  return { scheme, resources, sources }
}

/** 根据资源和覆盖值创建类型安全的默认图层。 */
export function createLayerForResource(
  resource: ResourceDefinition,
  overrides: Partial<
    Pick<
      LayerDefinition,
      "id" | "name" | "description" | "visible" | "sortOrder" | "renderOrder" | "groupId"
    >
  > = {},
): LayerDefinition {
  const base = {
    id: overrides.id ?? `layer-${crypto.randomUUID()}`,
    name: overrides.name ?? resource.name,
    description: overrides.description,
    resourceId: resource.id,
    visible: overrides.visible ?? resource.kind !== "terrain",
    sortOrder: overrides.sortOrder ?? 100,
    renderOrder: overrides.renderOrder ?? (resource.kind === "terrain" ? 0 : 100),
    groupId: overrides.groupId,
  }
  switch (resource.kind) {
    case "imagery":
      return { ...base, type: "imagery", style: { opacity: 1 } }
    case "terrain":
      return { ...base, type: "terrain", style: {} }
    case "tileset":
      return { ...base, type: "tileset", style: { opacity: 1 } }
    case "model":
      return { ...base, type: "model", style: { opacity: 1 } }
    case "annotation":
      return { ...base, type: "annotation", style: {} }
    case "analysis":
      return { ...base, type: "analysis", style: {} }
    case "vector":
      return {
        ...base,
        type: "vector",
        style: {
          fillColor: ACCENT,
          fillOpacity: 0.2,
          strokeColor: ACCENT,
          strokeWidth: 2,
        },
      }
  }
}

/** 校验方案引用、启用状态、类型和地形单选规则。 */
export function validateLayerScheme(
  catalog: CatalogSnapshot,
  scheme: LayerSchemeDefinition,
): LayerSchemeValidation {
  const errors: string[] = []
  const groupIds = new Set(scheme.groups.map((group) => group.id))
  for (const layer of scheme.layers) {
    const resource = catalog.resources.find((item) => item.id === layer.resourceId)
    if (!resource) {
      errors.push(`图层 ${layer.name} 引用的资源不存在`)
      continue
    }
    if (!resource.enabled) errors.push(`图层 ${layer.name} 引用的资源已停用`)
    if (
      deriveResourceKind(
        resource.origin === "service" ? resource.binding : { protocol: "geojson" },
      ) !== layer.type
    ) {
      errors.push(`图层 ${layer.name} 类型与资源类型不匹配`)
    }
    if (resource.origin === "service") {
      const source = catalog.sources.find((item) => item.id === resource.sourceId)
      if (!source) errors.push(`图层 ${layer.name} 引用的服务不存在`)
      else {
        if (!source.enabled) errors.push(`图层 ${layer.name} 引用的服务已停用`)
        if (source.verification.status !== "verified")
          errors.push(`图层 ${layer.name} 引用的服务未通过验证`)
      }
      if (resource.verification.status === "failed") {
        errors.push(`图层 ${layer.name} 引用的资源验证失败`)
      }
    }
    if (layer.groupId && !groupIds.has(layer.groupId)) {
      errors.push(`图层 ${layer.name} 引用的分组不存在`)
    }
  }
  const visibleTerrain = scheme.layers.filter((layer) => layer.type === "terrain" && layer.visible)
  if (visibleTerrain.length > 1) errors.push("同一时间只允许一个默认显示的地形图层")
  return { valid: errors.length === 0, errors }
}

/** \u8ba1\u7b97 GeoJSON \u8d44\u6e90\u8303\u56f4\u3002 */
export function calculateGeoJsonExtent(
  resource: Extract<ResourceDefinition, { origin: "inline-geojson" }>,
): GeoExtent | undefined {
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY

  for (const feature of resource.data.features) {
    forEachCoordinate(feature.geometry, (coordinate) => {
      const [longitude, latitude] = coordinate
      if (typeof longitude !== "number" || typeof latitude !== "number") return
      west = Math.min(west, longitude)
      south = Math.min(south, latitude)
      east = Math.max(east, longitude)
      north = Math.max(north, latitude)
    })
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) return undefined
  return { west, south, east, north }
}

/** \u9012\u5f52\u904d\u5386 GeoJSON \u5750\u6807\u3002 */
function forEachCoordinate(geometry: unknown, callback: (coordinate: number[]) => void) {
  if (Array.isArray(geometry)) {
    if (geometry.length >= 2 && geometry.every((value) => typeof value === "number")) {
      callback(geometry as number[])
      return
    }
    geometry.forEach((item) => forEachCoordinate(item, callback))
  }
}
