import type { AxiosInstance } from "axios"
import { appHttpClient, getJsonResponse } from "@/http/httpClient.js"
import type { GeoJsonFeatureCollection } from "@/features/layers/types.js"

type RegionFeature = GeoJsonFeatureCollection["features"][number]

export interface StaticRegionFeatureProperties {
  readonly code: string
  readonly name: string
  readonly level: number
  readonly parent_code?: string
}

export interface StaticRegionResource {
  readonly url: string
  readonly level: number
}

export const staticRegionResources: readonly StaticRegionResource[] = [
  { url: "/vector/广西壮族自治区_自治区.geojson", level: 1 },
  { url: "/vector/广西壮族自治区_市.geojson", level: 2 },
  { url: "/vector/广西壮族自治区_县.geojson", level: 3 },
]

const provinceRegionCode = "450000"

let regionCache: Promise<GeoJsonFeatureCollection> | undefined

/** 读取并合并 public/vector 下的广西三级政区数据。 */
export async function loadStaticRegionCollection(
  httpClient: AxiosInstance = appHttpClient,
): Promise<GeoJsonFeatureCollection> {
  if (httpClient === appHttpClient) {
    regionCache ??= fetchStaticRegionCollection(httpClient).catch((error: unknown) => {
      regionCache = undefined
      throw error
    })
    return regionCache
  }

  return fetchStaticRegionCollection(httpClient)
}

/** 清空测试用静态政区缓存。 */
export function clearStaticRegionCacheForTests() {
  regionCache = undefined
}

/** 并行读取三级静态政区文件并归一化为单个要素集合。 */
async function fetchStaticRegionCollection(
  httpClient: AxiosInstance,
): Promise<GeoJsonFeatureCollection> {
  const collections = await Promise.all(
    staticRegionResources.map(async ({ url, level }) => {
      const collection = await getJsonResponse<unknown>(httpClient, url, `${url} 不是合法 JSON`)
      assertFeatureCollection(collection, url)
      return { collection, level }
    }),
  )

  return {
    type: "FeatureCollection",
    features: collections.flatMap(({ collection, level }) =>
      collection.features.map((feature) => normalizeRegionFeature(feature, level)),
    ),
  }
}

/** 将本地 gb 字段归一化为政区树使用的 code、level 与 parent_code。 */
function normalizeRegionFeature(feature: RegionFeature, level: number): RegionFeature {
  const properties = feature.properties
  const name = readNonEmptyString(properties?.name)
  const gb = readNonEmptyString(properties?.gb)
  const code = toAdministrativeCode(gb)

  if (!name) throw new Error("静态政区数据缺少有效的 name 字段")
  if (!code) throw new Error(`静态政区数据包含无效的 gb 字段：${gb ?? "空值"}`)

  return {
    ...feature,
    id: code,
    properties: {
      code,
      name,
      level,
      ...(level > 1 ? { parent_code: getParentRegionCode(code, level) } : {}),
    },
  }
}

/** 将 156450100 形式的 gb 转为 450100 形式的行政区划代码。 */
function toAdministrativeCode(gb: string | undefined) {
  if (!gb || !/^156\d{6}$/.test(gb)) return undefined
  return gb.slice(3)
}

/** 按行政区划层级推导父级代码。 */
function getParentRegionCode(code: string, level: number) {
  if (level === 2) return provinceRegionCode
  if (level === 3) return `${code.slice(0, 4)}00`
  return undefined
}

/** 读取并去除字符串两端空白，空字符串返回 undefined。 */
function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** 判断值是否为可读取属性的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 校验静态政区响应是否为 GeoJSON FeatureCollection。 */
function assertFeatureCollection(
  value: unknown,
  url: string,
): asserts value is GeoJsonFeatureCollection {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new Error(`${url} 不是有效的 GeoJSON FeatureCollection`)
  }
}
