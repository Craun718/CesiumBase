import assert from "node:assert/strict"
import test from "node:test"
import { discoverSource } from "../src/features/catalog/discovery.js"
import type { ServiceSourceDefinition } from "../src/features/catalog/model/types.js"

/** 创建按路径返回 JSON 的 fetch 替身。 */
function createFetch(responses: Record<string, unknown>, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    if (!(url in responses)) return new Response("Not Found", { status: 404 })
    return new Response(JSON.stringify(responses[url]), { status: 200 })
  }) as typeof fetch
}

test("3D Tiles 服务发现读取 tileset.json", async () => {
  const seen: string[] = []
  const source: ServiceSourceDefinition = {
    id: "source-3d",
    name: "3D Tiles",
    sortOrder: 1,
    enabled: true,
    protocol: "3d-tiles",
    connection: { rootUrl: "/data/hsyh/" },
    verification: { status: "unverified", issues: [] },
  }
  const result = await discoverSource(
    source,
    createFetch(
      {
        "/data/hsyh/tileset.json": {
          asset: { version: "1.0" },
          root: {
            boundingVolume: {
              region: [0, 0, 1, 1, 0, 1],
            },
          },
        },
      },
      seen,
    ),
  )

  assert.equal(seen.includes("/data/hsyh/tileset.json"), true)
  assert.equal(result.protocol, "3d-tiles")
})

test("3D Tiles absolute root uses the same-origin proxy", async () => {
  const seen: string[] = []
  const source: ServiceSourceDefinition = {
    id: "source-3d-proxy",
    name: "3D Tiles Proxy",
    sortOrder: 1,
    enabled: true,
    protocol: "3d-tiles",
    connection: { rootUrl: "http://storage.example:9000/scene/xinhegtanglucun/" },
    verification: { status: "unverified", issues: [] },
  }
  const result = await discoverSource(
    source,
    createFetch(
      {
        "/scene/xinhegtanglucun/dataset.json": {
          schemaVersion: 1,
          entry: "tileset.json",
          extent: { west: 104, south: 21, east: 112, north: 27, quality: "manual" },
        },
        "/scene/xinhegtanglucun/tileset.json": {
          asset: { version: "1.0", generatetool: "OSGBLab" },
          root: { boundingVolume: { sphere: [6378137, 0, 0, 100] } },
        },
      },
      seen,
    ),
  )

  assert.equal(seen.includes("/scene/xinhegtanglucun/dataset.json"), true)
  assert.equal(seen.includes("/scene/xinhegtanglucun/tileset.json"), true)
  assert.equal(result.items[0]?.extent?.west, 104)
})

test("DEM 服务发现读取 layer.json 且 meta.json 可选", async () => {
  const seen: string[] = []
  const source: ServiceSourceDefinition = {
    id: "source-dem",
    name: "DEM",
    sortOrder: 1,
    enabled: true,
    protocol: "terrain-quantized-mesh",
    connection: { rootUrl: "/terrain/gx/" },
    verification: { status: "unverified", issues: [] },
  }
  const result = await discoverSource(
    source,
    createFetch(
      {
        "/terrain/gx/layer.json": {
          valid_bounds: [104, 21, 112, 27],
          minzoom: 0,
          maxzoom: 14,
        },
      },
      seen,
    ),
  )

  assert.equal(seen.includes("/terrain/gx/layer.json"), true)
  assert.equal(seen.includes("/terrain/gx/meta.json"), true)
  assert.equal(result.items[0]?.extent?.west, 104)
})

test("XYZ 服务发现读取 stacta.json", async () => {
  const seen: string[] = []
  const source: ServiceSourceDefinition = {
    id: "source-xyz",
    name: "XYZ",
    sortOrder: 1,
    enabled: true,
    protocol: "xyz",
    connection: { rootUrl: "/tiles/xhtlyx/" },
    verification: { status: "unverified", issues: [] },
  }
  const result = await discoverSource(
    source,
    createFetch(
      {
        "/tiles/xhtlyx/stacta.json": {
          bbox: [109, 23, 110, 24],
          properties: {
            "tiles:tile_matrix_sets": {
              GoogleMapsCompatible: { tileMatrix: [{ identifier: "1" }] },
            },
          },
          asset_templates: {
            bands: { href: "./{TileMatrix}/{TileCol}/{TileRow}.png", type: "image/png" },
          },
        },
      },
      seen,
    ),
  )

  assert.equal(seen.includes("/tiles/xhtlyx/stacta.json"), true)
  assert.equal(result.profile, "gdal-raster-tile-stacta")
})

test("可选 dataset.json 返回错误时不影响标准文件发现", async () => {
  const source: ServiceSourceDefinition = {
    id: "source-xyz",
    name: "XYZ",
    sortOrder: 1,
    enabled: true,
    protocol: "xyz",
    connection: { rootUrl: "/tiles/xhtlyx/" },
    verification: { status: "unverified", issues: [] },
  }
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/dataset.json")) return new Response("Forbidden", { status: 403 })
    return new Response(
      JSON.stringify({
        bbox: [109, 23, 110, 24],
        properties: {
          "tiles:tile_matrix_sets": {
            GoogleMapsCompatible: { tileMatrix: [{ identifier: "1" }] },
          },
        },
        asset_templates: {
          bands: { href: "./{TileMatrix}/{TileCol}/{TileRow}.png", type: "image/png" },
        },
      }),
      { status: 200 },
    )
  }) as typeof fetch

  const result = await discoverSource(source, fetchImpl)
  assert.equal(result.status, "partial")
  assert.equal(result.items.length, 1)
})
