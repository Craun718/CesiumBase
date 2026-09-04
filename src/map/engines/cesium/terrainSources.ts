import * as Cesium from "cesium"
import type { TerrainSource } from "../../types"

export async function createCesiumTerrainProvider(source?: TerrainSource) {
  if (!source) {
    return new Cesium.EllipsoidTerrainProvider()
  }

  if (!/^https?:\/\//i.test(source.url)) {
    throw new Error("DEM 服务地址必须是 http:// 或 https:// 开头")
  }

  return Cesium.CesiumTerrainProvider.fromUrl(source.url, {
    requestVertexNormals: source.requestVertexNormals ?? false,
    requestWaterMask: source.requestWaterMask ?? false,
  })
}

export function applyCesiumTerrainProvider(
  viewer: Cesium.Viewer,
  provider: Cesium.TerrainProvider,
) {
  viewer.scene.setTerrain(new Cesium.Terrain(Promise.resolve(provider)))
}
