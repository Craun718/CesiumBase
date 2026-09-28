import type { GeoExtent, VerificationIssue } from "../model/types"
import type { DiscoveryItem, DiscoveryResult } from "./types"

export interface TiandituDiscoveryInput {
  readonly sourceId: string
  readonly name?: string
  readonly mapType: "imagery" | "vector"
  readonly defaultExtent: GeoExtent
  readonly envAvailable: boolean
  readonly tokenEnvVariable?: string
}

/** 发现天地图影像或矢量底图，不执行远程元数据请求。 */
export function discoverTianditu(input: TiandituDiscoveryInput): DiscoveryResult {
  const issues: VerificationIssue[] = []
  const tokenEnvVariable = input.tokenEnvVariable ?? "VITE_TIANDITU_KEY"

  if (!input.envAvailable) {
    issues.push({
      level: "error",
      code: "tianditu-key-missing",
      message: `未配置 ${tokenEnvVariable}`,
    })
  }

  const item: DiscoveryItem = {
    key: "root",
    name: input.name ?? (input.mapType === "imagery" ? "天地图影像底图" : "天地图矢量底图"),
    kind: "imagery",
    selectable: input.envAvailable,
    binding: { protocol: "tianditu" },
    extent: input.defaultExtent,
    extentSource: "default-business",
    extentQuality: "manual",
    diagnostics: {
      mapType: input.mapType,
      tokenEnvVariable,
    },
  }

  return {
    sourceId: input.sourceId,
    protocol: "tianditu",
    status: input.envAvailable ? "complete" : "failed",
    metadataFiles: [],
    items: [item],
    issues,
  }
}
