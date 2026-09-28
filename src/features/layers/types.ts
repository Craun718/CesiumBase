import type {
  LayerDefinition,
  LayerSchemeDefinition,
  ResourceDefinition,
  ResourceKind,
  ServiceSourceDefinition,
} from "../catalog/model/types.js"

export type {
  DataSourceProtocol,
  GeoExtent,
  GeoJsonFeatureCollection,
  InlineGeoJsonResourceDefinition,
  LayerDefinition,
  LayerGroupDefinition,
  LayerSchemeDefinition,
  ResourceBinding,
  ResourceDefinition,
  ResourceKind,
  ServiceFeatureFilter,
  ServiceResourceDefinition,
  ServiceSourceDefinition,
} from "../catalog/model/types.js"

export type LayerType = ResourceKind
export type LayerStyle = LayerDefinition["style"]
export type WfsServiceSource = Extract<ServiceSourceDefinition, { protocol: "wfs" }>

export interface LayerSchemeBundle {
  readonly scheme: LayerSchemeDefinition
  readonly resources: readonly ResourceDefinition[]
  readonly sources: readonly ServiceSourceDefinition[]
}

export interface TransientSceneState {
  readonly activeSchemeId?: string
  readonly visibilityOverrides: Readonly<Record<string, boolean>>
  readonly temporaryLayers: readonly LayerDefinition[]
}

export type LayerStatus = "loading" | "loaded" | "error"
export type LayerOrigin = "scheme" | "temporary"

export interface LayerSnapshot {
  readonly layerId: string
  readonly status: LayerStatus
  readonly origin: LayerOrigin
  readonly errorMessage?: string
  readonly canFlyTo: boolean
}

export interface RegisterLayerInput {
  readonly definition: LayerDefinition
  readonly resource: ResourceDefinition
  readonly origin?: LayerOrigin
}

export interface LayerDefinitionUpdatePatch {
  readonly name?: string
  readonly visible?: boolean
  readonly sortOrder?: number
  readonly renderOrder?: number
  readonly groupId?: string | null
  readonly style?: LayerStyle
}

export interface LayerRegistry {
  applyScheme(bundle: LayerSchemeBundle): Promise<readonly LayerSnapshot[]>
  clearScheme(): Promise<readonly LayerSnapshot[]>
  registerLayer(input: RegisterLayerInput): Promise<LayerSnapshot>
  removeLayer(layerId: string): Promise<void>
  updateLayer(layerId: string, patch: LayerDefinitionUpdatePatch): Promise<LayerSnapshot>
  setLayerVisible(layerId: string, visible: boolean): Promise<LayerSnapshot>
  retryLayer(layerId: string): Promise<LayerSnapshot | undefined>
  flyToLayer(layerId: string): Promise<boolean>
  flyToResource(resourceId: string): Promise<boolean>
  getActiveSchemeId(): string | undefined
  getLayerSnapshots(): LayerSnapshot[]
  onLayerSnapshotsChange(listener: (snapshots: readonly LayerSnapshot[]) => void): () => void
}

export interface ServiceTestResult {
  readonly status: "ok" | "failed"
  readonly message: string
  readonly checkedAt: string
  readonly latencyMs?: number
}
