import { calculateGeoJsonExtent } from "../catalog/layerScheme"
import type {
  GeoJsonFeatureCollection,
  InlineGeoJsonResourceDefinition,
} from "../catalog/model/types"

const GEO_JSON_MAX_BYTES = 20 * 1024 * 1024
const SHAPEFILE_ZIP_MAX_BYTES = 50 * 1024 * 1024

type GeoJsonFeature = GeoJsonFeatureCollection["features"][number]

/** 解析用户上传的 GeoJSON 或 ZIP Shapefile，并生成临时内联资源。 */
export async function parseUploadedLayerFile(file: File): Promise<InlineGeoJsonResourceDefinition> {
  const name = file.name.toLowerCase()
  const isZip = name.endsWith(".zip")
  const isGeoJson = name.endsWith(".json") || name.endsWith(".geojson")
  if (!isZip && !isGeoJson) throw new Error("仅支持 GeoJSON/JSON 或 ZIP Shapefile")

  const maxBytes = isZip ? SHAPEFILE_ZIP_MAX_BYTES : GEO_JSON_MAX_BYTES
  if (file.size > maxBytes) {
    throw new Error(`文件超过大小限制：最大 ${Math.floor(maxBytes / 1024 / 1024)}MB`)
  }

  const collection = isZip
    ? await parseShapefileZip(await file.arrayBuffer())
    : parseGeoJsonFile(await file.text())
  const resource: InlineGeoJsonResourceDefinition = {
    id: `resource-${crypto.randomUUID()}`,
    name: getDisplayName(file.name),
    origin: "inline-geojson",
    kind: "vector",
    sortOrder: 1000,
    enabled: true,
    remark: "用户上传的临时数据",
    data: collection,
  }
  const extent = calculateGeoJsonExtent(resource)
  if (!extent) throw new Error("无法从上传数据中计算有效范围")

  return { ...resource, extent }
}

/** 解析 ZIP Shapefile；shpjs 可能返回单个或多个 FeatureCollection。 */
async function parseShapefileZip(buffer: ArrayBuffer): Promise<GeoJsonFeatureCollection> {
  const { default: parseShapefile } = await import("shpjs")
  return normalizeGeoJson(await parseShapefile(buffer))
}

/** 解析文本 GeoJSON，并兼容单个 Feature 与要素数组。 */
function parseGeoJsonFile(text: string): GeoJsonFeatureCollection {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("JSON 解析失败，请确认文件内容完整")
  }

  return normalizeGeoJson(parsed)
}

/** 将不同输入形态统一为已校验的 FeatureCollection。 */
function normalizeGeoJson(input: unknown): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = []
  collectFeatures(input, features)

  if (features.length === 0) throw new Error("上传数据中没有有效要素")
  return {
    type: "FeatureCollection",
    features,
  }
}

/** 递归收集 FeatureCollection、Feature 或它们组成的数组。 */
function collectFeatures(input: unknown, output: GeoJsonFeature[]) {
  if (Array.isArray(input)) {
    for (const item of input) collectFeatures(item, output)
    return
  }

  if (!isRecord(input) || input.type !== "Feature") return
  if (!isValidGeometry(input.geometry)) throw new Error("存在没有有效几何坐标的要素")

  output.push({
    type: "Feature",
    ...(typeof input.id === "string" || typeof input.id === "number" ? { id: input.id } : {}),
    geometry: input.geometry,
    properties: isRecord(input.properties) ? input.properties : null,
  })
}

/** 校验未知 GeoJSON 几何中至少存在一个合法 WGS84 坐标。 */
function isValidGeometry(geometry: unknown): boolean {
  if (!isRecord(geometry) || typeof geometry.type !== "string") return false
  if (geometry.type === "GeometryCollection") {
    return (
      Array.isArray(geometry.geometries) &&
      geometry.geometries.some((item) => isValidGeometry(item))
    )
  }

  let hasCoordinate = false
  forEachPosition(geometry.coordinates, (position) => {
    if (
      position.length < 2 ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1]) ||
      position[0] < -180 ||
      position[0] > 180 ||
      position[1] < -90 ||
      position[1] > 90
    ) {
      throw new Error("存在超出 WGS84 经纬度范围的坐标")
    }

    hasCoordinate = true
  })
  return hasCoordinate
}

/** 递归遍历 GeoJSON coordinates 结构。 */
function forEachPosition(input: unknown, callback: (position: number[]) => void) {
  if (!Array.isArray(input)) return
  if (input.length >= 2 && input.every((value) => typeof value === "number")) {
    callback(input as number[])
    return
  }

  for (const item of input) forEachPosition(item, callback)
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 从文件名提取界面展示名称。 */
function getDisplayName(fileName: string) {
  return fileName.replace(/\.(geojson|json|zip)$/i, "").trim() || "临时图层"
}
