import type {
  GeoJsonFeatureCollection,
  ResourceBinding,
  ServiceFeatureFilter,
  ServiceSourceDefinition,
} from "../catalog/model/types"

export interface WfsSourceBinding {
  readonly source: Extract<ServiceSourceDefinition, { protocol: "wfs" }>
  readonly binding: Extract<ResourceBinding, { protocol: "wfs" }>
}

const featureCollectionCache = new Map<string, Promise<GeoJsonFeatureCollection>>()

/**
 * 请求并缓存 WFS GeoJSON；相同 URL 与认证信息的并发调用只发起一次请求。
 */
export async function loadWfsFeatureCollection(
  request: WfsSourceBinding,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoJsonFeatureCollection> {
  const url = buildWfsGetFeatureUrl(request, request.binding.maxFeatures ?? 10_000)
  const authToken = request.source.connection.authToken
  const cacheKey = `${url}\n${authToken ?? ""}`
  const cached = featureCollectionCache.get(cacheKey)
  if (cached) return cached

  const pending = requestFeatureCollection(url, authToken, fetchImpl)
  featureCollectionCache.set(cacheKey, pending)

  try {
    return await pending
  } catch (error) {
    featureCollectionCache.delete(cacheKey)
    throw error
  }
}

/** \u751f\u6210 WFS GetFeature \u5730\u5740\u3002 */
export function buildWfsGetFeatureUrl(request: WfsSourceBinding, maxFeatures = 1) {
  const url = resolveServiceUrl(request.source.connection.baseUrl, "WFS")
  const version = request.source.connection.version ?? "2.0.0"
  url.searchParams.set("SERVICE", "WFS")
  url.searchParams.set("REQUEST", "GetFeature")
  url.searchParams.set("VERSION", version)
  url.searchParams.set(version === "2.0.0" ? "TYPENAMES" : "TYPENAME", request.binding.typeName)
  url.searchParams.set("OUTPUTFORMAT", request.binding.outputFormat ?? "application/json")
  if (request.binding.srsName) url.searchParams.set("SRSNAME", request.binding.srsName)
  url.searchParams.set("MAXFEATURES", String(Math.max(1, Math.trunc(maxFeatures))))
  return url.toString()
}

/** \u89e3\u6790\u670d\u52a1\u5730\u5740\u3002 */
function resolveServiceUrl(value: string, label: string) {
  try {
    return new URL(value, globalThis.location?.href)
  } catch {
    throw new Error(`${label} service address is invalid`)
  }
}

/** 按属性字段过滤 GeoJSON 要素集合；未提供过滤条件时返回浅拷贝集合。 */
export function filterFeatureCollection(
  collection: GeoJsonFeatureCollection,
  filter?: ServiceFeatureFilter,
): GeoJsonFeatureCollection {
  if (!filter) return { ...collection, features: [...collection.features] }

  return {
    ...collection,
    features: collection.features.filter((feature) => {
      const value = feature.properties?.[filter.field]
      return value === filter.value || String(value) === String(filter.value)
    }),
  }
}

/** 清空测试用缓存，避免不同用例共享同一 Promise。 */
export function clearWfsFeatureCacheForTests() {
  featureCollectionCache.clear()
}

/** 请求并校验 WFS GeoJSON 响应。 */
async function requestFeatureCollection(
  url: string,
  authToken: string | undefined,
  fetchImpl: typeof fetch,
): Promise<GeoJsonFeatureCollection> {
  const headers = new Headers()
  if (authToken?.trim()) headers.set("Authorization", `Bearer ${authToken}`)

  let response: Response
  try {
    response = await fetchImpl(url, { headers })
  } catch {
    throw new Error("WFS GetFeature 请求失败，请检查服务地址、网络或跨域配置")
  }

  if (!response.ok) throw new Error(`WFS GetFeature 返回 HTTP ${response.status}`)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error("WFS GetFeature 返回的不是有效 JSON")
  }

  if (!isFeatureCollection(data)) {
    throw new Error("WFS GetFeature 返回的不是 GeoJSON FeatureCollection")
  }

  return data
}

/** 校验 GeoJSON 顶层结构。 */
function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  )
}
