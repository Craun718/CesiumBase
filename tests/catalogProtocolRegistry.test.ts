import assert from "node:assert/strict"
import test from "node:test"
import {
  discoverByProtocol,
  getProtocolDefinition,
  validateProtocolDefinitions,
} from "../src/features/catalog/protocols/registry.js"

test("协议注册表包含首批已实现协议", () => {
  const threeDTiles = getProtocolDefinition("3d-tiles")
  const terrain = getProtocolDefinition("terrain-quantized-mesh")
  const xyz = getProtocolDefinition("xyz")
  const tianditu = getProtocolDefinition("tianditu")

  assert.equal(threeDTiles?.implementsDiscovery, true)
  assert.deepEqual(threeDTiles?.profileIds, [
    "gridmaster-box-transform",
    "osgblab-sphere-ecef",
    "three-d-tiles-region",
    "three-d-tiles-box",
    "three-d-tiles-box-transform",
    "three-d-tiles-sphere",
    "three-d-tiles-sphere-transform",
  ])
  assert.equal(terrain?.entryCandidates.includes("layer.json"), true)
  assert.equal(xyz?.entryCandidates.includes("stacta.json"), true)
  assert.equal(tianditu?.resourceKind, "imagery")
})

test("未实现真实发现的协议仍保留描述", () => {
  const wms = getProtocolDefinition("wms")

  assert.equal(wms?.resourceKind, "imagery")
  assert.equal(wms?.implementsDiscovery, false)
})

test("注册表按协议分派天地图发现", async () => {
  const result = await discoverByProtocol({
    protocol: "tianditu",
    sourceId: "source-tianditu",
    mapType: "imagery",
    defaultExtent: { west: 104, south: 21, east: 112, north: 27 },
    envAvailable: true,
  })

  assert.equal(result.protocol, "tianditu")
  assert.equal(result.items[0]?.kind, "imagery")
})

test("注册表为根级协议文件生成指纹", async () => {
  const result = await discoverByProtocol({
    protocol: "3d-tiles",
    sourceId: "source-grid",
    tileset: {
      asset: { version: "1.0", generatetool: "GridMaster" },
      root: {
        boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 6378137, 0, 0, 1],
      },
    },
  })

  assert.equal(typeof result.metadataFiles[0]?.fingerprint?.contentHash, "string")
})

test("协议配置在加载时拒绝重复协议", () => {
  assert.throws(
    () =>
      validateProtocolDefinitions([
        {
          protocol: "xyz",
          label: "XYZ",
          resourceKind: "imagery",
          entryCandidates: [],
          profileIds: [],
          implementsDiscovery: true,
        },
        {
          protocol: "xyz",
          label: "XYZ 2",
          resourceKind: "imagery",
          entryCandidates: [],
          profileIds: [],
          implementsDiscovery: true,
        },
      ]),
    /协议配置存在重复 protocol/,
  )
})
