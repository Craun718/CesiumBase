import type { DatasetMetadataFile, GeoExtent, VerificationIssue } from "../model/types"
import type { DiscoveryItem, DiscoveryResult, MetadataFileStatus } from "./types"

export interface GdalXyzDiscoveryInput {
  readonly sourceId: string
  readonly name?: string
  readonly stacta?: unknown
  readonly datasetMetadata?: DatasetMetadataFile
}

/** 判断对象是否为可索引的普通记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** 校验并读取范围值。 */
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

/** 读取 STAC bbox。 */
function readBbox(value: unknown): GeoExtent | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  return createExtent(value[0], value[1], value[2], value[3])
}

/** 将 dataset.json 范围规范化为 GeoExtent。 */
function readDatasetExtent(value: DatasetMetadataFile["extent"]): GeoExtent | undefined {
  return value ? createExtent(value.west, value.south, value.east, value.north) : undefined
}

/** 从 STAC Tile Matrix Set 中提取最小和最大级别。 */
function readLevelRange(tileMatrixSet: unknown): { min: number; max: number } | undefined {
  if (!isRecord(tileMatrixSet) || !Array.isArray(tileMatrixSet.tileMatrix)) return undefined
  const levels = tileMatrixSet.tileMatrix
    .map((matrix) => (isRecord(matrix) ? Number(matrix.identifier) : Number.NaN))
    .filter((level) => Number.isFinite(level))
  if (levels.length === 0) return undefined
  return { min: Math.min(...levels), max: Math.max(...levels) }
}

/** 将 STAC 模板变量转换为前端 XYZ 模板。 */
function normalizeTileTemplate(value: string): string {
  return value
    .replace(/^\.\//, "")
    .replace("{TileMatrix}", "{z}")
    .replace("{TileCol}", "{x}")
    .replace("{TileRow}", "{y}")
}

/** 判断模板是否包含完整 XYZ 变量。 */
function isValidTileTemplate(value: string): boolean {
  return ["{z}", "{x}", "{y}"].every((token) => value.includes(token))
}

/** 按固定规则选择 Tile Matrix Set，避免依赖对象键顺序。 */
function selectMatrixSet(value: unknown): {
  name?: string
  matrixSet?: unknown
  multiple: boolean
} {
  if (!isRecord(value)) return { multiple: false }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  const selected = entries.find(([name]) => name === "GoogleMapsCompatible") ?? entries[0]
  return {
    name: selected?.[0],
    matrixSet: selected?.[1],
    multiple: entries.length > 1,
  }
}

/** 从 GDAL stacta.json 或 dataset.json 发现一个 XYZ 瓦片数据集。 */
export function discoverGdalXyz(input: GdalXyzDiscoveryInput): DiscoveryResult {
  const stacta = isRecord(input.stacta) ? input.stacta : undefined
  const datasetExtentWithQuality = input.datasetMetadata?.extent
  const datasetExtent = readDatasetExtent(datasetExtentWithQuality)
  const datasetTemplateValue = input.datasetMetadata?.params?.urlTemplate
  const datasetTemplate =
    typeof datasetTemplateValue === "string"
      ? normalizeTileTemplate(datasetTemplateValue)
      : undefined
  const issues: VerificationIssue[] = []
  const metadataFiles: MetadataFileStatus[] = [
    stacta
      ? { path: "stacta.json", role: "standard", status: "read" }
      : { path: "stacta.json", role: "standard", status: "missing" },
  ]
  if (input.datasetMetadata) {
    metadataFiles.push({ path: "dataset.json", role: "override", status: "read" })
  }
  if (input.datasetMetadata?.extent && !datasetExtent) {
    issues.push({
      level: "error",
      code: "invalid-dataset-extent",
      message: "dataset.json 范围缺少有限数值、顺序错误或超出 WGS84 合法范围",
    })
  }

  const properties = isRecord(stacta?.properties) ? stacta.properties : {}
  const matrixSetSelection = selectMatrixSet(properties["tiles:tile_matrix_sets"])
  const stactaExtent = readBbox(stacta?.bbox)
  const stactaLevelRange = readLevelRange(matrixSetSelection.matrixSet)
  const assetTemplates = isRecord(stacta?.asset_templates) ? stacta.asset_templates : {}
  const bands = isRecord(assetTemplates.bands) ? assetTemplates.bands : {}
  const rawTemplate = typeof bands.href === "string" ? bands.href : undefined
  const stactaTemplate = rawTemplate ? normalizeTileTemplate(rawTemplate) : undefined
  const extent = datasetExtent ?? stactaExtent
  const template = datasetTemplate ?? stactaTemplate
  const validTemplate = template ? isValidTileTemplate(template) : false
  const format = typeof bands.type === "string" ? bands.type : "image/png"
  const tileSize =
    isRecord(matrixSetSelection.matrixSet) && Array.isArray(matrixSetSelection.matrixSet.tileMatrix)
      ? (() => {
          const first = matrixSetSelection.matrixSet.tileMatrix.find((item) => isRecord(item))
          return isRecord(first) && typeof first.tileWidth === "number"
            ? first.tileWidth
            : undefined
        })()
      : undefined

  if (matrixSetSelection.multiple) {
    issues.push({
      level: "warning",
      code: "xyz-multiple-tile-matrix-sets",
      message: `stacta.json 包含多个 Tile Matrix Set，已选择 ${matrixSetSelection.name ?? "首个配置"}`,
    })
  }
  if (!extent) {
    issues.push({
      level: "error",
      code: "xyz-extent-missing",
      message: "stacta.json 和 dataset.json 均缺少有效范围",
    })
  }
  if (!template) {
    issues.push({
      level: "error",
      code: "xyz-template-missing",
      message: "stacta.json 和 dataset.json 均缺少瓦片资源模板",
    })
  } else if (!validTemplate) {
    issues.push({
      level: "error",
      code: "xyz-template-invalid",
      message: "XYZ 瓦片模板必须包含 {z}、{x} 和 {y} 变量",
    })
  }

  const item: DiscoveryItem = {
    key: "root",
    name: input.datasetMetadata?.name ?? input.name ?? "GDAL XYZ 影像",
    kind: "imagery",
    selectable: Boolean(
      extent && template && validTemplate && !issues.some((issue) => issue.level === "error"),
    ),
    binding: { protocol: "xyz" },
    extent,
    extentSource: datasetExtent ? "dataset" : stactaExtent ? "standard" : undefined,
    extentQuality: datasetExtent
      ? (datasetExtentWithQuality?.quality ?? "manual")
      : stactaExtent
        ? "exact"
        : undefined,
    levelRange: input.datasetMetadata?.levelRange ?? stactaLevelRange,
    tile:
      template && validTemplate
        ? {
            template,
            format,
            tileSize,
            convention: "xyz",
            matrixSet: matrixSetSelection.name,
          }
        : undefined,
    profile: stacta ? "gdal-raster-tile-stacta" : "dataset-json-fallback",
    diagnostics: {
      crs: properties["proj:code"],
      assetType: bands.type,
      datasetFingerprint: input.datasetMetadata?.fingerprint,
    },
  }

  const hasError = issues.some((issue) => issue.level === "error")
  if (!stacta && !datasetExtent && !datasetTemplate) {
    return {
      sourceId: input.sourceId,
      protocol: "xyz",
      status: "failed",
      metadataFiles,
      items: [],
      issues: [
        {
          level: "error",
          code: "xyz-stacta-missing",
          message: "XYZ 数据缺少 stacta.json，且 dataset.json 未提供完整兜底信息",
        },
        ...issues,
      ],
    }
  }

  return {
    sourceId: input.sourceId,
    protocol: "xyz",
    profile: item.profile,
    status: hasError
      ? stacta
        ? "partial"
        : "failed"
      : stacta && !datasetExtent && !datasetTemplate
        ? "complete"
        : "partial",
    metadataFiles,
    items: hasError && !stacta ? [] : [item],
    issues,
  }
}
