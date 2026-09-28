export const CATALOG_DATA_MODEL_VERSION = "1.0" as const

export type DataSourceProtocol =
  | "tianditu"
  | "terrain-quantized-mesh"
  | "xyz"
  | "wms"
  | "wmts"
  | "wfs"
  | "geojson"
  | "3d-tiles"
  | "gltf"

export type ResourceKind =
  | "imagery"
  | "terrain"
  | "vector"
  | "tileset"
  | "model"
  | "annotation"
  | "analysis"

export type CatalogStatus = "enabled" | "disabled"

export type ExtentSource =
  | "dataset"
  | "standard"
  | "vendor"
  | "box-transform"
  | "bounding-sphere"
  | "manual"
  | "default-business"

export type ExtentQuality = "exact" | "derived" | "conservative" | "manual"

export interface GeoExtent {
  readonly west: number
  readonly south: number
  readonly east: number
  readonly north: number
  readonly minimumHeight?: number
  readonly maximumHeight?: number
}

export interface ServiceFeatureFilter {
  readonly field: string
  readonly value: string | number | boolean
}

export interface VerificationIssue {
  readonly level: "info" | "warning" | "error"
  readonly code: string
  readonly message: string
  readonly path?: string
}

export interface VerificationState {
  readonly status: "unverified" | "verified" | "failed" | "stale"
  readonly checkedAt?: string
  readonly fingerprint?: string
  readonly profile?: string
  readonly message?: string
  readonly issues: readonly VerificationIssue[]
}

export interface TiandituConnection {
  readonly mapType: "imagery" | "vector"
  readonly tokenEnvVariable: string
  readonly subdomains?: readonly string[]
  readonly minimumLevel?: number
  readonly maximumLevel?: number
  readonly authToken?: string
}

export interface TerrainConnection {
  readonly rootUrl: string
  readonly requestVertexNormals?: boolean
  readonly requestWaterMask?: boolean
  readonly authToken?: string
}

export interface XyzConnection {
  readonly rootUrl: string
  readonly urlTemplate?: string
  readonly subdomains?: readonly string[]
  readonly minimumLevel?: number
  readonly maximumLevel?: number
  readonly tilingScheme?: "web-mercator" | "geographic"
  readonly authToken?: string
}

export interface WmsConnection {
  readonly baseUrl: string
  readonly version?: "1.1.1" | "1.3.0"
  readonly authToken?: string
}

export interface WmtsConnection {
  readonly baseUrl: string
  readonly version?: "1.0.0"
  readonly authToken?: string
}

export interface WfsConnection {
  readonly baseUrl: string
  readonly version?: "1.1.0" | "2.0.0"
  readonly authToken?: string
}

export interface GeoJsonConnection {
  readonly url: string
  readonly authToken?: string
}

export interface ThreeDTilesConnection {
  /** 3D Tiles 服务根目录；入口文件固定为 tileset.json。 */
  readonly rootUrl: string
  readonly maximumScreenSpaceError?: number
  readonly authToken?: string
}

export interface GltfConnection {
  readonly url: string
  readonly authToken?: string
}

interface ServiceSourceBase {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly sortOrder: number
  readonly enabled: boolean
  readonly verification: VerificationState
  readonly createdAt?: string
  readonly updatedAt?: string
}

export type ServiceSourceDefinition =
  | (ServiceSourceBase & { readonly protocol: "tianditu"; readonly connection: TiandituConnection })
  | (ServiceSourceBase & {
      readonly protocol: "terrain-quantized-mesh"
      readonly connection: TerrainConnection
    })
  | (ServiceSourceBase & { readonly protocol: "xyz"; readonly connection: XyzConnection })
  | (ServiceSourceBase & { readonly protocol: "wms"; readonly connection: WmsConnection })
  | (ServiceSourceBase & { readonly protocol: "wmts"; readonly connection: WmtsConnection })
  | (ServiceSourceBase & { readonly protocol: "wfs"; readonly connection: WfsConnection })
  | (ServiceSourceBase & { readonly protocol: "geojson"; readonly connection: GeoJsonConnection })
  | (ServiceSourceBase & {
      readonly protocol: "3d-tiles"
      readonly connection: ThreeDTilesConnection
    })
  | (ServiceSourceBase & { readonly protocol: "gltf"; readonly connection: GltfConnection })

export type ResourceBinding =
  | { readonly protocol: "tianditu" }
  | { readonly protocol: "terrain-quantized-mesh" }
  | { readonly protocol: "xyz" }
  | { readonly protocol: "geojson" }
  | { readonly protocol: "3d-tiles" }
  | { readonly protocol: "gltf" }
  | {
      readonly protocol: "wms"
      readonly layer: string
      readonly styleName?: string
      readonly format?: "image/png" | "image/jpeg"
      readonly crs?: string
    }
  | {
      readonly protocol: "wmts"
      readonly layer: string
      readonly tileMatrixSet: string
      readonly style?: string
      readonly format?: "image/png" | "image/jpeg"
    }
  | {
      readonly protocol: "wfs"
      readonly typeName: string
      readonly outputFormat?: "application/json" | "geojson"
      readonly srsName?: string
      readonly maxFeatures?: number
      readonly featureFilter?: ServiceFeatureFilter
    }

export interface ResourceCategoryDefinition {
  readonly id: string
  readonly name: string
  readonly parentId?: string
  readonly description?: string
  readonly sortOrder: number
  readonly status?: CatalogStatus
}

interface ResourceDefinitionBase {
  readonly id: string
  readonly name: string
  readonly categoryId?: string
  readonly sortOrder: number
  readonly enabled: boolean
  readonly remark?: string
  readonly tags?: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface ServiceResourceDefinition extends ResourceDefinitionBase {
  readonly origin: "service"
  readonly sourceId: string
  readonly bindingKey: string
  readonly binding: ResourceBinding
  readonly kind: ResourceKind
  readonly extent?: GeoExtent
  readonly extentSource?: ExtentSource
  readonly extentQuality?: ExtentQuality
  readonly verification: VerificationState
}

export interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection"
  readonly features: readonly {
    readonly type: "Feature"
    readonly id?: string | number
    readonly geometry: unknown
    readonly properties?: Record<string, unknown> | null
  }[]
}

export interface InlineGeoJsonResourceDefinition extends ResourceDefinitionBase {
  readonly origin: "inline-geojson"
  readonly kind: "vector" | "annotation" | "analysis"
  readonly data: GeoJsonFeatureCollection
  readonly extent?: GeoExtent
}

export type ResourceDefinition = ServiceResourceDefinition | InlineGeoJsonResourceDefinition

export interface ImageryLayerStyle {
  readonly opacity: number
}

export type TerrainLayerStyle = Record<string, never>

export interface VectorLayerStyle {
  readonly fillColor?: string
  readonly fillOpacity?: number
  readonly strokeColor?: string
  readonly strokeOpacity?: number
  readonly strokeWidth?: number
  readonly labelField?: string
  readonly labelColor?: string
  readonly labelSize?: number
  readonly extrusionHeightField?: string
  readonly iconUrl?: string
  readonly outlineAsPolyline?: boolean
  readonly zIndex?: number
}

export interface TilesetLayerStyle {
  readonly opacity: number
}

export interface ModelLayerStyle {
  readonly opacity: number
}

interface LayerDefinitionBase {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly resourceId: string
  readonly visible: boolean
  readonly sortOrder: number
  readonly renderOrder: number
  readonly groupId?: string
}

export type LayerDefinition =
  | (LayerDefinitionBase & { readonly type: "imagery"; readonly style: ImageryLayerStyle })
  | (LayerDefinitionBase & { readonly type: "terrain"; readonly style: TerrainLayerStyle })
  | (LayerDefinitionBase & { readonly type: "vector"; readonly style: VectorLayerStyle })
  | (LayerDefinitionBase & { readonly type: "tileset"; readonly style: TilesetLayerStyle })
  | (LayerDefinitionBase & { readonly type: "model"; readonly style: ModelLayerStyle })
  | (LayerDefinitionBase & { readonly type: "annotation"; readonly style: VectorLayerStyle })
  | (LayerDefinitionBase & { readonly type: "analysis"; readonly style: VectorLayerStyle })

export interface LayerGroupDefinition {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly parentId?: string
  readonly sortOrder: number
  readonly defaultExpanded: boolean
  readonly status?: CatalogStatus
}

export interface LayerSchemeDefinition {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly sortOrder: number
  readonly status: "enabled" | "disabled"
  readonly defaultActive: boolean
  readonly groups: readonly LayerGroupDefinition[]
  readonly layers: readonly LayerDefinition[]
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface CatalogSnapshot {
  readonly modelVersion: typeof CATALOG_DATA_MODEL_VERSION
  readonly sources: readonly ServiceSourceDefinition[]
  readonly resourceCategories: readonly ResourceCategoryDefinition[]
  readonly resources: readonly ResourceDefinition[]
  readonly layerSchemes: readonly LayerSchemeDefinition[]
}

export interface DatasetMetadataFile {
  readonly schemaVersion: 1
  readonly name?: string
  readonly kind?: ResourceKind
  readonly entry?: string
  readonly crs?: string
  readonly extent?: GeoExtent & { readonly quality?: ExtentQuality }
  readonly levelRange?: { readonly min: number; readonly max: number }
  readonly profileHint?: string
  readonly sourceFiles?: readonly string[]
  readonly fingerprint?: string
  readonly params?: Readonly<Record<string, unknown>>
}

export interface MetadataFingerprint {
  readonly etag?: string
  readonly lastModified?: string
  readonly contentHash?: string
  readonly normalizedConfigHash?: string
}
