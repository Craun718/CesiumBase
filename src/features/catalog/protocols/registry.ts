import type {
  DataSourceProtocol,
  DatasetMetadataFile,
  GeoExtent,
  ResourceKind,
} from "../model/types"
import protocolData from "./protocols.json" with { type: "json" }
import { attachMetadataFingerprints } from "./fingerprint.js"
import { discoverQuantizedMesh } from "./terrain.js"
import { discoverThreeDTiles } from "./threeDTiles.js"
import { discoverTianditu } from "./tianditu.js"
import type { DiscoveryResult } from "./types.js"
import { discoverGdalXyz } from "./xyz.js"

export interface ProtocolDefinition {
  readonly protocol: DataSourceProtocol
  readonly label: string
  readonly resourceKind: ResourceKind
  readonly entryCandidates: readonly string[]
  readonly profileIds: readonly string[]
  readonly implementsDiscovery: boolean
}

export type DiscoveryRequest =
  | {
      readonly protocol: "3d-tiles"
      readonly sourceId: string
      readonly name?: string
      readonly rootUrl?: string
      readonly tileset: unknown
      readonly datasetMetadata?: DatasetMetadataFile
    }
  | {
      readonly protocol: "terrain-quantized-mesh"
      readonly sourceId: string
      readonly name?: string
      readonly layerJson: unknown
      readonly metaJson?: unknown
      readonly datasetMetadata?: DatasetMetadataFile
    }
  | {
      readonly protocol: "tianditu"
      readonly sourceId: string
      readonly name?: string
      readonly mapType: "imagery" | "vector"
      readonly defaultExtent: GeoExtent
      readonly envAvailable: boolean
      readonly tokenEnvVariable?: string
    }
  | {
      readonly protocol: "xyz"
      readonly sourceId: string
      readonly name?: string
      readonly stacta?: unknown
      readonly datasetMetadata?: DatasetMetadataFile
    }

const supportedProtocols: readonly DataSourceProtocol[] = [
  "tianditu",
  "terrain-quantized-mesh",
  "xyz",
  "wms",
  "wmts",
  "wfs",
  "geojson",
  "3d-tiles",
  "gltf",
]

const supportedResourceKinds: readonly ResourceKind[] = [
  "imagery",
  "terrain",
  "vector",
  "tileset",
  "model",
  "annotation",
  "analysis",
]

/** 校验协议注册表 JSON 的结构和唯一性。 */
export function validateProtocolDefinitions(value: unknown): ProtocolDefinition[] {
  if (!Array.isArray(value)) throw new Error("协议配置必须是数组")

  const seen = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("协议配置项必须是对象")
    const record = item as Record<string, unknown>
    const protocol = record.protocol
    const resourceKind = record.resourceKind
    if (!supportedProtocols.includes(protocol as DataSourceProtocol)) {
      throw new Error(`协议配置包含不支持的 protocol：${String(protocol)}`)
    }
    if (seen.has(protocol as string)) {
      throw new Error(`协议配置存在重复 protocol：${protocol}`)
    }
    seen.add(protocol as string)
    if (!supportedResourceKinds.includes(resourceKind as ResourceKind)) {
      throw new Error(`协议配置 ${protocol} 的 resourceKind 无效`)
    }
    if (typeof record.label !== "string" || typeof record.implementsDiscovery !== "boolean") {
      throw new Error(`协议配置 ${protocol} 缺少 label 或 implementsDiscovery`)
    }
    if (!Array.isArray(record.entryCandidates) || !Array.isArray(record.profileIds)) {
      throw new Error(`协议配置 ${protocol} 的 entryCandidates 或 profileIds 无效`)
    }
    return item as ProtocolDefinition
  })
}

const protocolDefinitions = validateProtocolDefinitions(protocolData)

/** 根据协议标识读取协议描述。 */
export function getProtocolDefinition(
  protocol: DataSourceProtocol,
): ProtocolDefinition | undefined {
  return protocolDefinitions.find((definition) => definition.protocol === protocol)
}

/** 根据请求协议分派到对应的元数据适配器。 */
export async function discoverByProtocol(request: DiscoveryRequest): Promise<DiscoveryResult> {
  let result: DiscoveryResult
  let fingerprintTexts: Record<string, string | undefined> = {}

  switch (request.protocol) {
    case "3d-tiles":
      result = discoverThreeDTiles(request)
      fingerprintTexts = {
        "tileset.json": JSON.stringify(request.tileset),
        "dataset.json": request.datasetMetadata
          ? JSON.stringify(request.datasetMetadata)
          : undefined,
      }
      break
    case "terrain-quantized-mesh":
      result = discoverQuantizedMesh(request)
      fingerprintTexts = {
        "layer.json": JSON.stringify(request.layerJson),
        "meta.json": request.metaJson ? JSON.stringify(request.metaJson) : undefined,
        "dataset.json": request.datasetMetadata
          ? JSON.stringify(request.datasetMetadata)
          : undefined,
      }
      break
    case "tianditu":
      result = discoverTianditu(request)
      break
    case "xyz":
      result = discoverGdalXyz(request)
      fingerprintTexts = {
        "stacta.json": request.stacta ? JSON.stringify(request.stacta) : undefined,
        "dataset.json": request.datasetMetadata
          ? JSON.stringify(request.datasetMetadata)
          : undefined,
      }
      break
  }

  return attachMetadataFingerprints(result, fingerprintTexts)
}
