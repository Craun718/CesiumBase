import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { discoverQuantizedMesh } from "../src/features/catalog/protocols/terrain.js"
import { discoverThreeDTiles } from "../src/features/catalog/protocols/threeDTiles.js"
import { discoverGdalXyz } from "../src/features/catalog/protocols/xyz.js"

/** 断言数值在允许误差范围内。 */
function assertClose(actual: number | undefined, expected: number, tolerance = 0.0001) {
  assert.equal(typeof actual, "number")
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance, `${actual} != ${expected}`)
}

/** 读取本地真实 JSON 样本；不存在时返回 undefined。 */
function readLocalJson(path: string): unknown | undefined {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
}

const gridMasterPath = "D:/data/hsyh/tileset.json"
const osgblabPath = "D:/tileset(1).json"
const demLayerPath = "D:/gx/layer.json"
const demMetaPath = "D:/gx/meta.json"
const stactaPath = "D:/data/xhtlyx/stacta.json"

test("真实 GridMaster tileset 可以发现保守范围", { skip: !existsSync(gridMasterPath) }, () => {
  const result = discoverThreeDTiles({
    sourceId: "source-gridmaster",
    tileset: readLocalJson(gridMasterPath),
  })
  assert.equal(result.profile, "gridmaster-box-transform")
  assert.equal(result.items[0]?.kind, "tileset")
  assert.ok(result.items[0]?.extent)
  assert.equal(result.items[0]?.extentQuality, "derived")
  assertClose(result.items[0]?.extent?.west, 107.59895304957334)
  assertClose(result.items[0]?.extent?.south, 22.56157123187093)
  assertClose(result.items[0]?.extent?.east, 107.60318077646646)
  assertClose(result.items[0]?.extent?.north, 22.566626905061348)
})

test("真实 OSGBLab tileset 可以发现保守范围", { skip: !existsSync(osgblabPath) }, () => {
  const result = discoverThreeDTiles({
    sourceId: "source-osgblab",
    tileset: readLocalJson(osgblabPath),
  })
  assert.equal(result.profile, "osgblab-sphere-ecef")
  assert.equal(result.items[0]?.extentQuality, "conservative")
  assertClose(result.items[0]?.extent?.west, 109.26732055053301)
  assertClose(result.items[0]?.extent?.south, 23.74277456777402)
  assertClose(result.items[0]?.extent?.north, 23.75410284076333)
})

test(
  "真实 DEM layer.json 与 meta.json 可以交叉验证",
  { skip: !existsSync(demLayerPath) || !existsSync(demMetaPath) },
  () => {
    const result = discoverQuantizedMesh({
      sourceId: "source-dem",
      layerJson: readLocalJson(demLayerPath),
      metaJson: readLocalJson(demMetaPath),
    })
    assert.equal(result.status, "complete")
    assert.equal(result.items[0]?.extentSource, "standard")
    assert.equal(result.items[0]?.extentQuality, "exact")
    assertClose(result.items[0]?.extent?.west, 104.44642066955566)
    assertClose(result.items[0]?.extent?.south, 20.901918411254883)
    assertClose(result.items[0]?.extent?.east, 112.05737113952637)
    assertClose(result.items[0]?.extent?.north, 26.388731002807617)
  },
)

test("真实 stacta.json 可以解析 XYZ 元数据", { skip: !existsSync(stactaPath) }, () => {
  const result = discoverGdalXyz({
    sourceId: "source-xyz",
    stacta: readLocalJson(stactaPath),
  })
  assert.equal(result.profile, "gdal-raster-tile-stacta")
  assert.deepEqual(result.items[0]?.levelRange, { min: 1, max: 20 })
  assert.equal(result.items[0]?.tile?.template, "{z}/{x}/{y}.png")
  assert.equal(result.items[0]?.diagnostics?.crs, "EPSG:3857")
})
