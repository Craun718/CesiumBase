import type { MapBounds } from "../../map/types.js"
import type { GeoJsonFeatureCollection } from "@/features/layers/types.js"

type RegionFeature = GeoJsonFeatureCollection["features"][number]

export interface RegionTreeNode {
  readonly code: string
  readonly name: string
  readonly level: number
  readonly parentCode?: string
  readonly feature: RegionFeature
  children: RegionTreeNode[]
}

export interface RegionTreeDisplayRow {
  readonly node: RegionTreeNode
  readonly depth: number
}

/** 将政区 GeoJSON FeatureCollection 转换为 code/parent_code 层级树。 */
export function buildRegionTree(collection: GeoJsonFeatureCollection): RegionTreeNode[] {
  const nodes = new Map<string, RegionTreeNode>()

  for (const feature of collection.features) {
    const properties = feature.properties
    const code = readRequiredString(properties?.code, "code")
    const name = readRequiredString(properties?.name, "name")
    const level = properties?.level
    if (typeof level !== "number" || !Number.isInteger(level)) {
      throw new Error("政区数据缺少有效的 level 字段")
    }
    if (nodes.has(code)) {
      throw new Error(`政区代码重复：${code}`)
    }

    const parentCode = readOptionalString(properties?.parent_code)
    nodes.set(code, {
      code,
      name,
      level,
      ...(parentCode ? { parentCode } : {}),
      feature,
      children: [],
    })
  }

  const roots: RegionTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentCode ? nodes.get(node.parentCode) : undefined
    if (parent && parent !== node) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortRegionNodes(roots)
  return roots
}

/** 按深度优先展开政区树，供名称搜索和 code 查找使用。 */
export function flattenRegionTree(regions: readonly RegionTreeNode[]): RegionTreeNode[] {
  return regions.flatMap((region) => [region, ...flattenRegionTree(region.children)])
}

/** 按名称搜索政区，保留命中节点的祖先与完整子孙树。 */
export function filterRegionTree(
  regions: readonly RegionTreeNode[],
  keyword: string,
): RegionTreeNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return [...regions]

  return regions.flatMap((region) => {
    const children = filterRegionTree(region.children, normalizedKeyword)
    const matched = region.name.toLowerCase().includes(normalizedKeyword)
    if (!matched && children.length === 0) return []

    return [{ ...region, children: matched ? region.children : children }]
  })
}

/** 将可见政区树摊平为带缩进层级的显示行。 */
export function flattenRegionTreeForDisplay(
  regions: readonly RegionTreeNode[],
  expandedCodes: ReadonlySet<string>,
  keyword: string,
): RegionTreeDisplayRow[] {
  return flattenDisplayRows(regions, 0, expandedCodes, keyword.trim().length > 0)
}

/** 默认展开自治区与市级节点，县级保持收起。 */
export function createDefaultExpandedRegionCodes(regions: readonly RegionTreeNode[]): string[] {
  return flattenRegionTree(regions)
    .filter((region) => region.level <= 2)
    .map((region) => region.code)
}

/** 从 GeoJSON 几何坐标中计算 WGS84 范围。 */
export function calculateRegionBounds(feature: RegionFeature | undefined): MapBounds | undefined {
  if (!feature) return undefined

  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY

  const coordinates = (feature.geometry as { coordinates?: unknown }).coordinates
  forEachPosition(coordinates, (position) => {
    const [longitude, latitude] = position
    if (typeof longitude !== "number" || typeof latitude !== "number") return

    west = Math.min(west, longitude)
    south = Math.min(south, latitude)
    east = Math.max(east, longitude)
    north = Math.max(north, latitude)
  })

  if (!Number.isFinite(west) || !Number.isFinite(south)) return undefined

  return { west, south, east, north }
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`政区数据缺少有效的 ${field} 字段`)
  }

  return value.trim()
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined

  return value.trim()
}

function sortRegionNodes(regions: RegionTreeNode[]) {
  regions.sort((left, right) => left.level - right.level || left.code.localeCompare(right.code))
  regions.forEach((region) => sortRegionNodes(region.children))
}

/** 递归生成显示行；搜索态强制展开所有保留分支。 */
function flattenDisplayRows(
  regions: readonly RegionTreeNode[],
  depth: number,
  expandedCodes: ReadonlySet<string>,
  forceExpanded: boolean,
): RegionTreeDisplayRow[] {
  return regions.flatMap((region) => {
    const row = { node: region, depth }
    if (!forceExpanded && !expandedCodes.has(region.code)) return [row]

    return [row, ...flattenDisplayRows(region.children, depth + 1, expandedCodes, forceExpanded)]
  })
}

function forEachPosition(value: unknown, callback: (position: unknown[]) => void) {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && value.every((item) => typeof item === "number")) {
    callback(value)
    return
  }

  value.forEach((item) => forEachPosition(item, callback))
}
