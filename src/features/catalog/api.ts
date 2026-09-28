import { isAxiosError, type AxiosInstance } from "axios"
import type { CatalogSnapshot } from "./model/types"
import { deriveResourceKind } from "./model/rules.js"
import { appHttpClient, getJsonResponse } from "../../http/httpClient.js"

const DEFAULT_API_BASE_URL = "/api"

export type CatalogLoadStatus = "loading" | "ready" | "error"

/** 读取浏览器可用的 v1.0 目录 API 根地址。 */
function getApiBaseUrl() {
  const environment = (import.meta as { env?: Record<string, string | undefined> }).env
  const value = environment?.VITE_LAYER_CATALOG_API_BASE_URL?.trim()
  return value || DEFAULT_API_BASE_URL
}

/** 构建 v1.0 目录接口地址。 */
function buildCatalogUrl(apiBaseUrl: string) {
  const base = apiBaseUrl.replace(/\/+$/, "")
  if (!base.startsWith("/") && !/^https?:\/\//i.test(base)) {
    throw new Error("目录 API 地址必须是以 / 开头的同源路径或 http(s) 地址")
  }
  return `${base}/layer-catalog`
}

const protocols = new Set([
  "tianditu",
  "terrain-quantized-mesh",
  "xyz",
  "wms",
  "wmts",
  "wfs",
  "geojson",
  "3d-tiles",
  "gltf",
])

/** 判断值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** 校验验证状态的最小结构。 */
function isVerification(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.issues)) return false
  return ["unverified", "verified", "failed", "stale"].includes(String(value.status))
}

/** 校验协议连接是否具有最小必需字段。 */
function hasConnectionFields(protocol: unknown, connection: Record<string, unknown>): boolean {
  if (protocol === "tianditu") {
    return typeof connection.mapType === "string" && typeof connection.tokenEnvVariable === "string"
  }
  if (["terrain-quantized-mesh", "xyz", "3d-tiles"].includes(String(protocol))) {
    return typeof connection.rootUrl === "string"
  }
  if (["wms", "wmts", "wfs"].includes(String(protocol))) {
    return typeof connection.baseUrl === "string"
  }
  return typeof connection.url === "string"
}

/** 判断服务接入是否具备最小合法结构。 */
function isServiceSource(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Number.isFinite(value.sortOrder) &&
    typeof value.enabled === "boolean" &&
    protocols.has(value.protocol as string) &&
    isRecord(value.connection) &&
    hasConnectionFields(value.protocol, value.connection) &&
    isVerification(value.verification)
  )
}

/** 判断资源是否具备最小合法结构。 */
function isResource(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return false
  }
  if (value.origin === "inline-geojson") return isRecord(value.data)
  return (
    value.origin === "service" &&
    typeof value.sourceId === "string" &&
    typeof value.bindingKey === "string" &&
    isRecord(value.binding) &&
    protocols.has(value.binding.protocol as string) &&
    Number.isFinite(value.sortOrder) &&
    typeof value.enabled === "boolean" &&
    deriveResourceKind(value.binding as never) === value.kind &&
    isVerification(value.verification)
  )
}

/** 判断响应是否为 v1.0 目录快照。 */
function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  if (!isRecord(value) || value.modelVersion !== "1.0") return false
  if (
    !Array.isArray(value.sources) ||
    !Array.isArray(value.resourceCategories) ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.layerSchemes)
  ) {
    return false
  }
  if (!value.sources.every(isServiceSource) || !value.resources.every(isResource)) return false
  if (
    !value.resourceCategories.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.sortOrder),
    )
  ) {
    return false
  }
  if (
    !value.layerSchemes.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.sortOrder) &&
        Array.isArray(item.groups) &&
        Array.isArray(item.layers),
    )
  ) {
    return false
  }

  const ids = [
    ...value.sources.map((item) => item.id),
    ...value.resourceCategories.map((item) => item.id),
    ...value.resources.map((item) => item.id),
    ...value.layerSchemes.map((item) => item.id),
  ]
  if (new Set(ids).size !== ids.length) return false

  const sourceProtocols = new Map(value.sources.map((item) => [item.id, item.protocol]))
  const bindingKeys = new Set<string>()
  for (const resource of value.resources) {
    if (resource.origin !== "service") continue
    const binding = resource.binding as Record<string, unknown>
    if (sourceProtocols.get(resource.sourceId as string) !== binding.protocol) return false
    const bindingKey = `${resource.sourceId}:${resource.bindingKey}`
    if (bindingKeys.has(bindingKey)) return false
    bindingKeys.add(bindingKey)
  }
  return true
}

/** 从目录服务拉取并校验 v1.0 目录快照。 */
export async function fetchCatalog(
  httpClient: AxiosInstance = appHttpClient,
): Promise<CatalogSnapshot> {
  let payload: unknown
  try {
    payload = await getJsonResponse<unknown>(
      httpClient,
      buildCatalogUrl(getApiBaseUrl()),
      "目录服务响应不是合法 JSON",
    )
  } catch (error) {
    if (error instanceof SyntaxError) throw error
    if (isAxiosError(error) && error.response) {
      throw new Error(`目录服务响应异常（HTTP ${error.response.status}）`)
    }
    throw new Error("目录服务连接失败")
  }

  if (!isCatalogSnapshot(payload)) {
    throw new Error("目录数据校验失败：响应不是 v1.0 目录快照")
  }
  return structuredClone(payload)
}
