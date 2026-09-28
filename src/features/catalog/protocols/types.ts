import type {
  DataSourceProtocol,
  ExtentQuality,
  ExtentSource,
  GeoExtent,
  MetadataFingerprint,
  ResourceBinding,
  ResourceKind,
  VerificationIssue,
} from "../model/types"

export interface MetadataFileStatus {
  readonly path: string
  readonly role: "standard" | "supplement" | "vendor" | "override"
  readonly status: "read" | "missing" | "invalid" | "skipped"
  readonly fingerprint?: MetadataFingerprint
}

export interface TileMetadata {
  readonly template: string
  readonly format: string
  readonly tileSize?: number
  readonly convention?: "xyz" | "tms"
  readonly matrixSet?: string
}

export interface DiscoveryItem {
  readonly key: string
  readonly parentKey?: string
  readonly name: string
  readonly kind: ResourceKind
  readonly selectable: boolean
  readonly binding?: ResourceBinding
  readonly extent?: GeoExtent
  readonly extentSource?: ExtentSource
  readonly extentQuality?: ExtentQuality
  readonly levelRange?: { readonly min: number; readonly max: number }
  readonly tile?: TileMetadata
  readonly profile?: string
  readonly diagnostics?: Readonly<Record<string, unknown>>
}

export interface DiscoveryResult {
  readonly sourceId: string
  readonly protocol: DataSourceProtocol
  readonly profile?: string
  readonly status: "complete" | "partial" | "failed"
  readonly metadataFiles: readonly MetadataFileStatus[]
  readonly items: readonly DiscoveryItem[]
  readonly issues: readonly VerificationIssue[]
}
