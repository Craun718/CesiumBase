import * as Cesium from "cesium"
import type { TerrainSource } from "../../types"

/** 将 DEM 服务描述转换为 Cesium terrain provider；支持远程地址和 Vite 同源路径。 */
export async function createCesiumTerrainProvider(source?: TerrainSource) {
  if (!source) {
    return new Cesium.EllipsoidTerrainProvider()
  }

  if (!/^(https?:\/\/|\/)/i.test(source.url)) {
    throw new Error("DEM 服务地址必须是 http(s) 远程地址或以 / 开头的同源路径")
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

/** 为 Viewer 设置地形 provider。 */
export function applyCesiumTerrainProvider(
  viewer: Cesium.Viewer,
  provider: Cesium.TerrainProvider,
) {
  viewer.scene.setTerrain(new Cesium.Terrain(Promise.resolve(provider)))
}
