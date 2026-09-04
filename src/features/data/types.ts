export const DATA_SOURCE_TYPES = ["terrain"] as const

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number]

export interface TerrainServiceParams {
  requestVertexNormals?: boolean
  requestWaterMask?: boolean
}

export interface DataSourceConfig {
  id: string
  name: string
  type: DataSourceType
  url: string
  params?: TerrainServiceParams
}
