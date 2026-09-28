import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics.js"
import type { TerrainSource } from "../../types"

export interface CreateCesiumTerrainProviderOptions {
  /** 无自定义 DEM 时是否尝试创建 Cesium World Terrain。 */
  readonly useWorldTerrainFallback?: boolean
  /** 测试注入入口；默认使用 Cesium 官方世界地形创建器。 */
  readonly createWorldTerrain?: typeof Cesium.createWorldTerrainAsync
}

/**
 * 创建 Cesium 地形提供器；未传入数据源时优先恢复官方世界地形，失败则回退椭球地形。
 */
export async function createCesiumTerrainProvider(
  source?: TerrainSource,
  options: CreateCesiumTerrainProviderOptions = {},
): Promise<Cesium.TerrainProvider> {
  if (!source) {
    const useWorldTerrainFallback = options.useWorldTerrainFallback ?? hasCesiumIonAccessToken()
    if (!useWorldTerrainFallback) return new Cesium.EllipsoidTerrainProvider()

    try {
      const createWorldTerrain = options.createWorldTerrain ?? Cesium.createWorldTerrainAsync
      return await createWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask: true,
      })
    } catch (error) {
      logMapDiagnostic("cesium:world-terrain-fallback:error", String(error))
      return new Cesium.EllipsoidTerrainProvider()
    }
  }

  const url = requireHttpUrl(source.url, "DEM")
  const resource = source.authToken?.trim()
    ? new Cesium.Resource({
        url,
        headers: { Authorization: `Bearer ${source.authToken.trim()}` },
      })
    : url

  return Cesium.CesiumTerrainProvider.fromUrl(resource, {
    requestVertexNormals: source.requestVertexNormals,
    requestWaterMask: source.requestWaterMask,
  })
}

/**
 * 将地形提供器应用到指定场景。
 */
export function applyCesiumTerrainProvider(
  viewer: Cesium.Viewer,
  provider: Cesium.TerrainProvider,
) {
  viewer.scene.terrainProvider = provider
}

/** 判断是否配置了可用于访问 Cesium World Terrain 的 ion Token。 */
function hasCesiumIonAccessToken() {
  const environment = (
    import.meta as ImportMeta & {
      readonly env?: Record<string, string | undefined>
    }
  ).env

  return Boolean(environment?.VITE_CESIUM_ION_ACCESS_TOKEN?.trim())
}

/** 校验地形服务地址为 HTTP(S) 或以 / 开头的同源路径。 */
function requireHttpUrl(url: string, label: string) {
  const normalizedUrl = url.trim()
  if (!/^(https?:\/\/|\/)/i.test(normalizedUrl)) {
    throw new Error(`${label}服务地址必须是 HTTP(S) 或以 / 开头的同源路径`)
  }
  return normalizedUrl
}
