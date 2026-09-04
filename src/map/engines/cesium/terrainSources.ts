import * as Cesium from "cesium"
import type { TerrainSource } from "../../types"

export async function createCesiumTerrainProvider(source?: TerrainSource) {
  if (!source) {
    return new Cesium.EllipsoidTerrainProvider()
  }

  if (!/^https?:\/\//i.test(source.url)) {
    throw new Error("DEM 服务地址必须是 http:// 或 https:// 开头")
  }

  const options = {
    requestVertexNormals: source.requestVertexNormals ?? false,
    requestWaterMask: source.requestWaterMask ?? false,
  }

  if (source.authToken) {
    const resource = new Cesium.Resource({
      url: source.url,
      headers: { Authorization: `Bearer ${source.authToken}` },
    })
    return Cesium.CesiumTerrainProvider.fromUrl(resource, options)
  }

  return Cesium.CesiumTerrainProvider.fromUrl(source.url, options)
}

export function applyCesiumTerrainProvider(
  viewer: Cesium.Viewer,
  provider: Cesium.TerrainProvider,
) {
  viewer.scene.setTerrain(new Cesium.Terrain(Promise.resolve(provider)))
}
