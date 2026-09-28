import type {
  DatasetMetadataFile,
  GeoExtent,
  ServiceSourceDefinition,
  VerificationIssue,
} from "./model/types"
import { discoverByProtocol } from "./protocols/registry.js"
import { discoverTianditu } from "./protocols/tianditu.js"
import type { DiscoveryResult, MetadataFileStatus } from "./protocols/types"

const DEFAULT_BUSINESS_EXTENT: GeoExtent = {
  west: 104.44642066955566,
  south: 20.901918411254883,
  east: 112.05737113952637,
  north: 26.388731002807617,
}

interface OptionalJsonResult {
  readonly value?: unknown
  readonly issue?: VerificationIssue
  readonly file?: MetadataFileStatus
}

interface DiscoveryDiagnostics {
  readonly issues: readonly VerificationIssue[]
  readonly metadataFiles: readonly MetadataFileStatus[]
}

/** 拼接数据根地址和协议入口文件。 */
function joinUrl(rootUrl: string, fileName: string): string {
  return `${rootUrl.replace(/\/+$/, "")}/${fileName}`
}

/** 将绝对 3D Tiles 根地址映射为本地同源代理路径。 */
function resolveThreeDTilesRequestRoot(rootUrl: string) {
  const raw = rootUrl.trim()
  if (!/^https?:\/\//i.test(raw)) return raw

  const parsed = new URL(raw)
  const normalizedPath = parsed.pathname.replace(/\/+$/, "")
  const lastSlash = normalizedPath.lastIndexOf("/")
  const lastSegment = normalizedPath.slice(lastSlash + 1)
  const directory =
    lastSegment.toLowerCase().endsWith(".json") && lastSlash >= 0
      ? normalizedPath.slice(0, lastSlash + 1)
      : `${normalizedPath}/`
  return `${directory}${parsed.search}`
}

/** 带超时执行请求。 */
async function requestWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

/** 请求可选 JSON，并把失败转换为发现诊断。 */
async function fetchOptionalJson(
  url: string,
  fetchImpl: typeof fetch,
): Promise<OptionalJsonResult> {
  try {
    const response = await requestWithTimeout(fetchImpl, url)
    if (!response.ok) {
      return {
        file: {
          path: url,
          role: "supplement",
          status: response.status === 404 ? "missing" : "invalid",
        },
        issue:
          response.status === 404
            ? undefined
            : {
                level: "warning",
                code: "optional-metadata-failed",
                message: `${url} 返回 HTTP ${response.status}，已忽略`,
              },
      }
    }
    return { value: await response.json(), file: { path: url, role: "supplement", status: "read" } }
  } catch (error) {
    return {
      file: { path: url, role: "supplement", status: "invalid" },
      issue: {
        level: "warning",
        code: "optional-metadata-failed",
        message: `${url} 读取失败：${error instanceof Error ? error.message : "未知错误"}`,
      },
    }
  }
}

/** 请求必需 JSON。 */
async function fetchRequiredJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await requestWithTimeout(fetchImpl, url)
  if (!response.ok) throw new Error(`${url} 请求失败（HTTP ${response.status}）`)
  return response.json()
}

/** 读取 dataset.json 及其诊断。 */
async function readDatasetMetadataResult(
  rootUrl: string,
  fetchImpl: typeof fetch,
): Promise<OptionalJsonResult> {
  return fetchOptionalJson(joinUrl(rootUrl, "dataset.json"), fetchImpl)
}

/** 读取可选 dataset.json。 */
export async function readDatasetMetadata(
  rootUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatasetMetadataFile | undefined> {
  const result = await readDatasetMetadataResult(rootUrl, fetchImpl)
  return result.value && typeof result.value === "object"
    ? (result.value as DatasetMetadataFile)
    : undefined
}

/** 合并协议发现结果和可选文件诊断。 */
function mergeDiagnostics(
  result: DiscoveryResult,
  diagnostics: DiscoveryDiagnostics,
): DiscoveryResult {
  const metadataFiles = [...result.metadataFiles]
  for (const file of diagnostics.metadataFiles) {
    const index = metadataFiles.findIndex((item) => item.path === file.path)
    if (index >= 0) metadataFiles[index] = { ...metadataFiles[index], ...file }
    else metadataFiles.push(file)
  }
  const issues = [...result.issues]
  for (const issue of diagnostics.issues) {
    if (!issues.some((item) => item.code === issue.code && item.message === issue.message)) {
      issues.push(issue)
    }
  }
  return {
    ...result,
    status:
      result.status === "failed"
        ? "failed"
        : issues.some((issue) => issue.level === "warning")
          ? "partial"
          : result.status,
    metadataFiles,
    issues,
  }
}

/** 根据服务接入协议读取根级元数据并执行发现。 */
export async function discoverSource(
  source: ServiceSourceDefinition,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryResult> {
  try {
    switch (source.protocol) {
      case "3d-tiles": {
        const rootUrl = source.connection.rootUrl
        const requestRootUrl = resolveThreeDTilesRequestRoot(rootUrl)
        const dataset = await readDatasetMetadataResult(requestRootUrl, fetchImpl)
        const tileset = await fetchRequiredJson(
          joinUrl(
            requestRootUrl,
            (dataset.value as DatasetMetadataFile | undefined)?.entry ?? "tileset.json",
          ),
          fetchImpl,
        )
        const result = await discoverByProtocol({
          protocol: "3d-tiles",
          sourceId: source.id,
          name: source.name,
          rootUrl,
          tileset,
          datasetMetadata: dataset.value as DatasetMetadataFile | undefined,
        })
        return mergeDiagnostics(result, {
          issues: dataset.issue ? [dataset.issue] : [],
          metadataFiles: dataset.file ? [dataset.file] : [],
        })
      }
      case "terrain-quantized-mesh": {
        const rootUrl = source.connection.rootUrl
        const dataset = await readDatasetMetadataResult(rootUrl, fetchImpl)
        const layerJson = await fetchRequiredJson(
          joinUrl(
            rootUrl,
            (dataset.value as DatasetMetadataFile | undefined)?.entry ?? "layer.json",
          ),
          fetchImpl,
        )
        const meta = await fetchOptionalJson(joinUrl(rootUrl, "meta.json"), fetchImpl)
        const result = await discoverByProtocol({
          protocol: "terrain-quantized-mesh",
          sourceId: source.id,
          name: source.name,
          layerJson,
          metaJson: meta.value,
          datasetMetadata: dataset.value as DatasetMetadataFile | undefined,
        })
        return mergeDiagnostics(result, {
          issues: [dataset.issue, meta.issue].filter((issue): issue is VerificationIssue =>
            Boolean(issue),
          ),
          metadataFiles: [dataset.file, meta.file].filter((file): file is MetadataFileStatus =>
            Boolean(file),
          ),
        })
      }
      case "xyz": {
        const rootUrl = source.connection.rootUrl
        const dataset = await readDatasetMetadataResult(rootUrl, fetchImpl)
        const stacta = await fetchOptionalJson(
          joinUrl(
            rootUrl,
            (dataset.value as DatasetMetadataFile | undefined)?.entry ?? "stacta.json",
          ),
          fetchImpl,
        )
        const result = await discoverByProtocol({
          protocol: "xyz",
          sourceId: source.id,
          name: source.name,
          stacta: stacta.value,
          datasetMetadata: dataset.value as DatasetMetadataFile | undefined,
        })
        return mergeDiagnostics(result, {
          issues: [dataset.issue, stacta.issue].filter((issue): issue is VerificationIssue =>
            Boolean(issue),
          ),
          metadataFiles: [dataset.file, stacta.file].filter((file): file is MetadataFileStatus =>
            Boolean(file),
          ),
        })
      }
      case "tianditu": {
        const environment = (import.meta as { env?: Record<string, string | undefined> }).env
        const envAvailable = Boolean(
          environment?.[source.connection.tokenEnvVariable]?.trim() ||
          source.connection.authToken?.trim(),
        )
        return discoverTianditu({
          sourceId: source.id,
          name: source.name,
          mapType: source.connection.mapType,
          defaultExtent: DEFAULT_BUSINESS_EXTENT,
          envAvailable,
          tokenEnvVariable: source.connection.tokenEnvVariable,
        })
      }
      default:
        return {
          sourceId: source.id,
          protocol: source.protocol,
          status: "failed",
          metadataFiles: [],
          items: [],
          issues: [
            {
              level: "error",
              code: "protocol-discovery-not-implemented",
              message: `${source.protocol} 协议的真实发现将在后续阶段实现`,
            },
          ],
        }
    }
  } catch (error) {
    return {
      sourceId: source.id,
      protocol: source.protocol,
      status: "failed",
      metadataFiles: [],
      items: [],
      issues: [
        {
          level: "error",
          code: "discovery-failed",
          message: error instanceof Error ? error.message : "服务发现失败",
        },
      ],
    }
  }
}
