import assert from "node:assert/strict"
import test from "node:test"
import { discoverQuantizedMesh } from "../src/features/catalog/protocols/terrain.js"

const layerJson = {
  format: "quantized-mesh-1.0",
  projection: "EPSG:4326",
  scheme: "tms",
  minzoom: 0,
  maxzoom: 14,
  tiles: ["{z}/{x}/{y}.terrain"],
  bounds: [-180, -90, 180, 90],
  valid_bounds: [104.44642066955566, 20.901918411254883, 112.05737113952637, 26.388731002807617],
  extensions: ["octvertexnormals"],
}

const metaJson = {
  bounds: {
    west: 104.44642066955566,
    south: 20.901918411254883,
    east: 112.05737113952637,
    north: 26.388731002807617,
  },
  latLonBounds: {
    west: 104.44642066955566,
    south: 20.901918411254883,
    east: 112.05737113952637,
    north: 26.388731002807617,
  },
  minzoom: 0,
  maxzoom: 14,
  proj: 4326,
  tiletrans: "tms",
  type: "terrain",
}

test("DEM 优先读取 valid_bounds 并与 meta.json 交叉验证", () => {
  const result = discoverQuantizedMesh({ sourceId: "source-dem", layerJson, metaJson })
  const item = result.items[0]

  assert.equal(result.status, "complete")
  assert.equal(item?.kind, "terrain")
  assert.deepEqual(item?.binding, { protocol: "terrain-quantized-mesh" })
  assert.equal(item?.extentSource, "standard")
  assert.equal(item?.extentQuality, "exact")
  assert.deepEqual(item?.levelRange, { min: 0, max: 14 })
  assert.equal(item?.extent?.west, 104.44642066955566)
  assert.equal(item?.extent?.east, 112.05737113952637)
  assert.equal(
    result.issues.some((issue) => issue.code === "terrain-extent-conflict"),
    false,
  )
})

test("DEM 标准范围与 meta.json 不一致时产生 warning", () => {
  const result = discoverQuantizedMesh({
    sourceId: "source-dem",
    layerJson,
    metaJson: { ...metaJson, latLonBounds: { west: 100, south: 20, east: 110, north: 27 } },
  })

  assert.equal(result.status, "partial")
  assert.equal(
    result.issues.some(
      (issue) => issue.level === "warning" && issue.code === "terrain-extent-conflict",
    ),
    true,
  )
})

test("DEM 无有效 valid_bounds 时使用 meta.json 范围", () => {
  const { valid_bounds: _validBounds, ...layerWithoutBounds } = layerJson
  const result = discoverQuantizedMesh({
    sourceId: "source-dem",
    layerJson: layerWithoutBounds,
    metaJson,
  })

  assert.equal(result.items[0]?.extentSource, "vendor")
  assert.equal(result.items[0]?.extent?.west, metaJson.latLonBounds.west)
})

test("DEM 最后回退到 layer.json.bounds", () => {
  const { valid_bounds: _validBounds, ...layerWithoutValidBounds } = layerJson
  const result = discoverQuantizedMesh({
    sourceId: "source-dem",
    layerJson: { ...layerWithoutValidBounds, bounds: [100, 20, 110, 27] },
  })

  assert.equal(result.status, "complete")
  assert.equal(result.items[0]?.extentSource, "standard")
  assert.equal(result.items[0]?.extent?.west, 100)
})

test("dataset.json 可覆盖 DEM 名称、层级和范围", () => {
  const result = discoverQuantizedMesh({
    sourceId: "source-dem",
    layerJson,
    datasetMetadata: {
      schemaVersion: 1,
      name: "广西地形",
      levelRange: { min: 3, max: 12 },
      extent: { west: 100, south: 20, east: 110, north: 27, quality: "conservative" },
      profileHint: "quantized-mesh-layer-json",
    },
  })

  assert.equal(result.items[0]?.name, "广西地形")
  assert.deepEqual(result.items[0]?.levelRange, { min: 3, max: 12 })
  assert.equal(result.items[0]?.extentQuality, "conservative")
})

test("DEM 无效 dataset 范围不会污染回退范围质量", () => {
  const result = discoverQuantizedMesh({
    sourceId: "source-dem",
    layerJson,
    datasetMetadata: {
      schemaVersion: 1,
      extent: { west: 10, south: 20, east: 0, north: 25, quality: "conservative" },
    },
  })

  assert.equal(result.items[0]?.extentSource, "standard")
  assert.equal(result.items[0]?.extentQuality, "exact")
  assert.equal(
    result.issues.some((issue) => issue.code === "invalid-dataset-extent"),
    true,
  )
})
