import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import { createCesiumTerrainProvider } from "@/map/engines/cesium/terrainSources.js"

test("无自定义 DEM 且未启用官方兜底时使用椭球地形", async () => {
  const provider = await createCesiumTerrainProvider(undefined, {
    useWorldTerrainFallback: false,
  })

  assert.ok(provider instanceof Cesium.EllipsoidTerrainProvider)
})

test("无自定义 DEM 且启用官方兜底时使用 Cesium World Terrain", async () => {
  const worldTerrainProvider =
    new Cesium.EllipsoidTerrainProvider() as unknown as Cesium.CesiumTerrainProvider
  let receivedOptions: Parameters<typeof Cesium.createWorldTerrainAsync>[0]

  const provider = await createCesiumTerrainProvider(undefined, {
    useWorldTerrainFallback: true,
    createWorldTerrain: async (options) => {
      receivedOptions = options
      return worldTerrainProvider
    },
  })

  assert.equal(provider, worldTerrainProvider)
  assert.deepEqual(receivedOptions, {
    requestVertexNormals: true,
    requestWaterMask: true,
  })
})

test("官方世界地形创建失败时回退椭球地形", async () => {
  const provider = await createCesiumTerrainProvider(undefined, {
    useWorldTerrainFallback: true,
    createWorldTerrain: async () => {
      throw new Error("ion unavailable")
    },
  })

  assert.ok(provider instanceof Cesium.EllipsoidTerrainProvider)
})

test("非法自定义 DEM 地址继续抛出错误", async () => {
  await assert.rejects(
    createCesiumTerrainProvider({
      id: "terrain-invalid",
      name: "非法地形",
      url: "not-a-valid-url",
    }),
    /DEM服务地址必须是 HTTP\(S\) 或以 \/ 开头的同源路径/,
  )
})
