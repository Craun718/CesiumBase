import assert from "node:assert/strict"
import test from "node:test"
import { discoverGdalXyz } from "../src/features/catalog/protocols/xyz.js"

const stacta = {
  stac_version: "1.1.0",
  id: "xhtlyx",
  bbox: [109.26879015114652, 23.7446946, 109.2782597, 23.762736035343078],
  properties: {
    "tiles:tile_matrix_sets": {
      GoogleMapsCompatible: {
        tileMatrix: [
          { identifier: "1", tileWidth: 256, tileHeight: 256 },
          { identifier: "2", tileWidth: 256, tileHeight: 256 },
          { identifier: "16", tileWidth: 256, tileHeight: 256 },
        ],
      },
    },
    "proj:code": "EPSG:3857",
  },
  asset_templates: {
    bands: {
      href: "./{TileMatrix}/{TileCol}/{TileRow}.png",
      type: "image/png",
    },
  },
}

test("GDAL stacta.json 发现 XYZ 影像资源", () => {
  const result = discoverGdalXyz({ sourceId: "source-xyz", stacta })
  const item = result.items[0]

  assert.equal(result.status, "complete")
  assert.equal(result.profile, "gdal-raster-tile-stacta")
  assert.equal(item?.kind, "imagery")
  assert.deepEqual(item?.binding, { protocol: "xyz" })
  assert.equal(item?.extent?.west, 109.26879015114652)
  assert.equal(item?.extent?.north, 23.762736035343078)
  assert.deepEqual(item?.levelRange, { min: 1, max: 16 })
  assert.equal(item?.tile?.template, "{z}/{x}/{y}.png")
  assert.equal(item?.tile?.format, "image/png")
  assert.equal(item?.tile?.matrixSet, "GoogleMapsCompatible")
  assert.equal(item?.diagnostics?.crs, "EPSG:3857")
})

test("缺少 stacta.json 时返回错误且不扫描瓦片目录", () => {
  const result = discoverGdalXyz({ sourceId: "source-xyz" })

  assert.equal(result.status, "failed")
  assert.deepEqual(result.items, [])
  assert.equal(
    result.issues.some((issue) => issue.level === "error" && issue.code === "xyz-stacta-missing"),
    true,
  )
})

test("stacta.json 缺失时允许 dataset.json 提供兜底范围", () => {
  const result = discoverGdalXyz({
    sourceId: "source-xyz",
    datasetMetadata: {
      schemaVersion: 1,
      name: "遥感影像",
      extent: { west: 109, south: 23, east: 110, north: 24, quality: "manual" },
      params: { urlTemplate: "{z}/{x}/{y}.png" },
    },
  })

  assert.equal(result.status, "partial")
  assert.equal(result.items[0]?.extent?.west, 109)
  assert.equal(result.items[0]?.name, "遥感影像")
})

test("stacta.json 部分缺失时 dataset.json 可以补齐范围和模板", () => {
  const result = discoverGdalXyz({
    sourceId: "source-xyz",
    stacta: {},
    datasetMetadata: {
      schemaVersion: 1,
      extent: { west: 109, south: 23, east: 110, north: 24, quality: "manual" },
      params: { urlTemplate: "{z}/{x}/{y}.png" },
    },
  })

  assert.equal(result.items[0]?.selectable, true)
  assert.equal(result.items[0]?.tile?.template, "{z}/{x}/{y}.png")
  assert.equal("quality" in (result.items[0]?.extent ?? {}), false)
  assert.equal(result.items[0]?.extentQuality, "manual")
})

test("XYZ 模板缺少变量时不可选择", () => {
  const result = discoverGdalXyz({
    sourceId: "source-xyz",
    stacta: {
      bbox: [109, 23, 110, 24],
      properties: {
        "tiles:tile_matrix_sets": { GoogleMapsCompatible: { tileMatrix: [{ identifier: "1" }] } },
      },
      asset_templates: { bands: { href: "tile.png", type: "image/png" } },
    },
  })

  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.code === "xyz-template-invalid"),
    true,
  )
})

test("XYZ 无效 dataset 范围不会被静默忽略", () => {
  const result = discoverGdalXyz({
    sourceId: "source-xyz",
    stacta: {
      bbox: [109, 23, 110, 24],
      properties: {
        "tiles:tile_matrix_sets": { GoogleMapsCompatible: { tileMatrix: [{ identifier: "1" }] } },
      },
      asset_templates: {
        bands: { href: "./{TileMatrix}/{TileCol}/{TileRow}.png", type: "image/png" },
      },
    },
    datasetMetadata: {
      schemaVersion: 1,
      extent: { west: 50, south: 60, east: 40, north: 70, quality: "manual" },
    },
  })

  assert.equal(
    result.issues.some((issue) => issue.code === "invalid-dataset-extent"),
    true,
  )
  assert.equal(result.items[0]?.extentSource, "standard")
})
