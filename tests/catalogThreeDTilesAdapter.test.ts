import assert from "node:assert/strict"
import test from "node:test"
import { Cartesian3, Cartographic, Math as CesiumMath } from "cesium"
import {
  detectThreeDTilesProfile,
  discoverThreeDTiles,
} from "../src/features/catalog/protocols/threeDTiles.js"

const gridMasterTileset = {
  asset: { generatetool: "GridMaster@www.daspatial.com", gltfUpAxis: "Z", version: "1.0" },
  geometricError: 1892.8069769148967,
  root: {
    boundingVolume: {
      box: [
        63.12334688572821, -52.535225784014585, 168.50070413062883, 217.40551610641057, 0, 0, 0,
        279.9281473701334, 0, 0, 0, 132.98046454550598,
      ],
    },
    children: [{ id: "not-read" }],
    geometricError: 378.56139538297936,
    refine: "REPLACE",
    transform: [
      -0.9531882762996132, -0.30237742958920083, 0, 0, 0.11602960374542672, -0.3657616183327076,
      0.9234476539627561, 0, -0.279229727965436, 0.8802194775336811, 0.3837244198519062, 0,
      -1781843.8667624537, 5616929.432536584, 2432261.828532106, 1,
    ],
  },
}

const osgblabTileset = {
  asset: { generatetool: "OSGBLab(www.osgblab.com)", gltfUpAxis: "Y", version: "1.0" },
  extensionsUsed: ["KHR_materials_unlit"],
  geometricError: 627.33644,
  root: {
    boundingVolume: { sphere: [-1928084.24327, 5513926.53292, 2552842.75366, 627.33644] },
    children: [{ content: { uri: "Tile_1/Tile_1.json" } }],
    geometricError: 627.33644,
  },
}

/** 断言数值在允许误差范围内。 */
function assertClose(actual: number | undefined, expected: number, tolerance = 0.0001) {
  assert.equal(typeof actual, "number")
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance, `${actual} != ${expected}`)
}

test("识别 GridMaster box + transform Profile", () => {
  assert.equal(detectThreeDTilesProfile(gridMasterTileset), "gridmaster-box-transform")
})

test("识别 OSGBLab sphere Profile", () => {
  assert.equal(detectThreeDTilesProfile(osgblabTileset), "osgblab-sphere-ecef")
})

test("GridMaster 根 box 应用 transform 后计算 WGS84 范围", () => {
  const result = discoverThreeDTiles({ sourceId: "source-grid", tileset: gridMasterTileset })
  const item = result.items[0]

  assert.equal(result.status, "complete")
  assert.equal(item?.profile, "gridmaster-box-transform")
  assert.equal(item?.kind, "tileset")
  assert.equal(item?.extentQuality, "derived")
  assertClose(item?.extent?.west, 107.59895304957334)
  assertClose(item?.extent?.south, 22.56157123187093)
  assertClose(item?.extent?.east, 107.60318077646646)
  assertClose(item?.extent?.north, 22.566626905061348)
  assertClose(item?.extent?.minimumHeight, 35.52617939681211, 0.0001)
  assertClose(item?.extent?.maximumHeight, 301.496044571875, 0.0001)
})

test("OSGBLab ECEF sphere 计算保守范围且不读取子节点", () => {
  const result = discoverThreeDTiles({ sourceId: "source-osgblab", tileset: osgblabTileset })
  const item = result.items[0]

  assert.equal(result.status, "complete")
  assert.equal(item?.profile, "osgblab-sphere-ecef")
  assert.equal(item?.extentQuality, "conservative")
  assertClose(item?.extent?.west, 109.26732055053301, 0.0001)
  assertClose(item?.extent?.south, 23.74277456777402, 0.0001)
  assertClose(item?.extent?.east, 109.27962728808127, 0.0001)
  assertClose(item?.extent?.north, 23.75410284076333, 0.0001)
})

test("ECEF sphere 范围必须覆盖球面上的任意点", () => {
  const center = Cartesian3.fromRadians(0, CesiumMath.toRadians(89), 0)
  const radius = 2_000_000
  const result = discoverThreeDTiles({
    sourceId: "source-large-sphere",
    tileset: {
      asset: { version: "1.0", generatetool: "OSGBLab" },
      root: {
        boundingVolume: { sphere: [center.x, center.y, center.z, radius] },
        geometricError: 1,
      },
    },
  })
  const extent = result.items[0]?.extent
  assert.ok(extent)
  assert.equal(extent?.north, 90)

  const sampleCount = 512
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let index = 0; index < sampleCount; index++) {
    const z = 1 - (2 * (index + 0.5)) / sampleCount
    const ring = Math.sqrt(1 - z * z)
    const theta = goldenAngle * index
    const point = new Cartesian3(
      center.x + radius * ring * Math.cos(theta),
      center.y + radius * ring * Math.sin(theta),
      center.z + radius * z,
    )
    const cartographic = Cartographic.fromCartesian(point)
    assert.ok(cartographic)
    const longitude = CesiumMath.toDegrees(cartographic.longitude)
    const latitude = CesiumMath.toDegrees(cartographic.latitude)
    assert.ok(longitude >= extent!.west - 0.0001)
    assert.ok(longitude <= extent!.east + 0.0001)
    assert.ok(latitude >= extent!.south - 0.0001)
    assert.ok(latitude <= extent!.north + 0.0001)
  }
})

test("短 transform 不会抛出且返回失败结果", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-short-transform",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: { sphere: [6378137, 0, 0, 100] },
        transform: [1, 0, 0, 0],
      },
    },
  })

  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.code === "invalid-3d-tiles-transform"),
    true,
  )
})

test("低纬度大半径 sphere 使用保守纬度包络", () => {
  const center = Cartesian3.fromRadians(CesiumMath.toRadians(123), CesiumMath.toRadians(30), 0)
  const result = discoverThreeDTiles({
    sourceId: "source-large-low-latitude",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: { sphere: [center.x, center.y, center.z, 6_000_000] },
      },
    },
  })

  assertClose(result.items[0]?.extent?.south, -40.66111681035555, 0.0001)
  assert.equal(result.items[0]?.extent?.north, 90)
})

test("dataset.json 无效范围不会产生可选结果", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-invalid-dataset",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: {
          region: [0, 0, CesiumMath.toRadians(1), CesiumMath.toRadians(1), 0, 1],
        },
      },
    },
    datasetMetadata: {
      schemaVersion: 1,
      extent: { west: 10, south: 20, east: 0, north: 25 },
    },
  })

  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.code === "invalid-dataset-extent"),
    true,
  )
})

test("单侧非法 dataset 高度不会进入结果", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-invalid-height",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: {
          region: [0, 0, CesiumMath.toRadians(1), CesiumMath.toRadians(1), 0, 1],
        },
      },
    },
    datasetMetadata: {
      schemaVersion: 1,
      extent: {
        west: 0,
        south: 0,
        east: 1,
        north: 1,
        minimumHeight: Number.POSITIVE_INFINITY,
      },
    },
  })

  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.code === "invalid-dataset-extent"),
    true,
  )
})

test("极大有限 transform 不会抛出", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-overflow-transform",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: { sphere: [1, 0, 0, 1] },
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1e308, 0, 0, 1],
      },
    },
  })

  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.level === "error"),
    true,
  )
})

test("非法 sphere 数值不会抛出且不可选择", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-invalid-sphere",
    tileset: {
      asset: { version: "1.0" },
      root: { boundingVolume: { sphere: [0, 0, 0, Number.POSITIVE_INFINITY] } },
    },
  })

  assert.equal(result.status, "partial")
  assert.equal(result.items[0]?.selectable, false)
  assert.equal(
    result.issues.some((issue) => issue.level === "error"),
    true,
  )
})

test("通用 region 根包围体可以解析", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-region",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: {
          region: [
            CesiumMath.toRadians(104),
            CesiumMath.toRadians(21),
            CesiumMath.toRadians(112),
            CesiumMath.toRadians(27),
            0,
            1000,
          ],
        },
      },
    },
  })

  assert.equal(result.status, "complete")
  assert.equal(result.profile, "three-d-tiles-region")
  assert.equal(result.items[0]?.extent?.west, 104)
  assert.equal(result.items[0]?.extent?.maximumHeight, 1000)
})

test("dataset.json profileHint 冲突时回退结构识别", () => {
  const result = discoverThreeDTiles({
    sourceId: "source-hint",
    tileset: {
      asset: { version: "1.0" },
      root: {
        boundingVolume: { region: [0, 0, CesiumMath.toRadians(1), CesiumMath.toRadians(1), 0, 1] },
      },
    },
    datasetMetadata: { schemaVersion: 1, profileHint: "three-d-tiles-box" },
  })

  assert.equal(result.profile, "three-d-tiles-region")
  assert.equal(
    result.metadataFiles.some((file) => file.path === "dataset.json"),
    true,
  )
})
