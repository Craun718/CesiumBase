import type { DatasetMetadataFile, GeoExtent, VerificationIssue } from "../model/types"
import type { DiscoveryItem, DiscoveryResult, MetadataFileStatus } from "./types"

export interface QuantizedMeshDiscoveryInput {
  readonly sourceId: string
  readonly name?: string
  readonly layerJson: unknown
  readonly metaJson?: unknown
  readonly datasetMetadata?: DatasetMetadataFile
}

/** 判断对象是否为可索引的普通记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** 校验并创建统一范围。 */
function createExtent(
  west: unknown,
  south: unknown,
  east: unknown,
  north: unknown,
): GeoExtent | undefined {
  if (
    ![west, south, east, north].every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return undefined
  }
  if ((west as number) > (east as number) || (south as number) > (north as number)) return undefined
  if ((west as number) < -180 || (east as number) > 180) return undefined
  if ((south as number) < -90 || (north as number) > 90) return undefined
  return {
    west: west as number,
    south: south as number,
    east: east as number,
    north: north as number,
  }
}

/** 将 [west, south, east, north] 转为统一范围。 */
function readArrayExtent(value: unknown): GeoExtent | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  return createExtent(value[0], value[1], value[2], value[3])
}

/** 将 vendor bounds 对象转为统一范围。 */
function readObjectExtent(value: unknown): GeoExtent | undefined {
  if (!isRecord(value)) return undefined
  const { west, south, east, north } = value
  return createExtent(west, south, east, north)
}

/** 按容差判断两个范围是否一致。 */
function extentsEqual(left: GeoExtent | undefined, right: GeoExtent | undefined): boolean {
  if (!left || !right) return false
  const tolerance = 1e-7
  return (
    Math.abs(left.west - right.west) <= tolerance &&
    Math.abs(left.south - right.south) <= tolerance &&
    Math.abs(left.east - right.east) <= tolerance &&
    Math.abs(left.north - right.north) <= tolerance
  )
}

/** 从 layer.json 和 meta.json 发现单个 quantized-mesh 资源。 */
export function discoverQuantizedMesh(input: QuantizedMeshDiscoveryInput): DiscoveryResult {
  const layer = isRecord(input.layerJson) ? input.layerJson : {}
  const meta = isRecord(input.metaJson) ? input.metaJson : undefined
  const issues: VerificationIssue[] = []
  const metadataFiles: MetadataFileStatus[] = [
    { path: "layer.json", role: "standard", status: input.layerJson ? "read" : "missing" },
  ]
  if (input.metaJson) {
    metadataFiles.push({ path: "meta.json", role: "vendor", status: "read" })
  }
  if (input.datasetMetadata) {
    metadataFiles.push({ path: "dataset.json", role: "override", status: "read" })
  }

  const standardExtent = readArrayExtent(layer.valid_bounds)
  const vendorExtent = readObjectExtent(meta?.latLonBounds) ?? readObjectExtent(meta?.bounds)
  const layerBoundsExtent = readArrayExtent(layer.bounds)
  const datasetExtentWithQuality = input.datasetMetadata?.extent
  const datasetExtentQuality = datasetExtentWithQuality?.quality
  const datasetExtent = datasetExtentWithQuality
    ? createExtent(
        datasetExtentWithQuality.west,
        datasetExtentWithQuality.south,
        datasetExtentWithQuality.east,
        datasetExtentWithQuality.north,
      )
    : undefined
  if (datasetExtentWithQuality && !datasetExtent) {
    issues.push({
      level: "error",
      code: "invalid-dataset-extent",
      message: "dataset.json 范围缺少有限数值、顺序错误或超出 WGS84 合法范围",
    })
  }
  const extent = datasetExtent ?? standardExtent ?? vendorExtent ?? layerBoundsExtent

  if (!extent) {
    issues.push({
      level: "error",
      code: "terrain-extent-missing",
      message: "DEM layer.json 和 meta.json 均未提供有效范围",
    })
  } else if (standardExtent && vendorExtent && !extentsEqual(standardExtent, vendorExtent)) {
    issues.push({
      level: "warning",
      code: "terrain-extent-conflict",
      message: "DEM valid_bounds 与 meta.json 范围不一致，已优先使用 valid_bounds",
    })
  }

  const datasetMin = input.datasetMetadata?.levelRange?.min
  const datasetMax = input.datasetMetadata?.levelRange?.max
  const min =
    typeof datasetMin === "number" && Number.isFinite(datasetMin)
      ? datasetMin
      : typeof layer.minzoom === "number" && Number.isFinite(layer.minzoom)
        ? layer.minzoom
        : undefined
  const max =
    typeof datasetMax === "number" && Number.isFinite(datasetMax)
      ? datasetMax
      : typeof layer.maxzoom === "number" && Number.isFinite(layer.maxzoom)
        ? layer.maxzoom
        : undefined
  if (min !== undefined && max !== undefined && min > max) {
    issues.push({
      level: "error",
      code: "terrain-level-range-invalid",
      message: "DEM 最小层级不能大于最大层级",
    })
  }
  const extentSource = datasetExtent
    ? "dataset"
    : standardExtent
      ? "standard"
      : vendorExtent
        ? "vendor"
        : layerBoundsExtent
          ? "standard"
          : undefined
  const item: DiscoveryItem = {
    key: "root",
    name: input.datasetMetadata?.name ?? input.name ?? "Quantized Mesh 地形",
    kind: "terrain",
    selectable: !issues.some((issue) => issue.level === "error"),
    binding: { protocol: "terrain-quantized-mesh" },
    extent,
    extentSource,
    extentQuality: datasetExtent
      ? (datasetExtentQuality ?? "manual")
      : standardExtent || vendorExtent || layerBoundsExtent
        ? "exact"
        : undefined,
    levelRange: min !== undefined && max !== undefined ? { min, max } : undefined,
    diagnostics: {
      format: layer.format,
      projection: layer.projection,
      scheme: layer.scheme,
      extensions: layer.extensions,
      tiles: layer.tiles,
      profileHint: input.datasetMetadata?.profileHint,
      datasetFingerprint: input.datasetMetadata?.fingerprint,
    },
  }

  return {
    sourceId: input.sourceId,
    protocol: "terrain-quantized-mesh",
    status: issues.some((issue) => issue.level === "error")
      ? "failed"
      : issues.some((issue) => issue.level === "warning")
        ? "partial"
        : "complete",
    metadataFiles,
    items: [item],
    issues,
  }
}
