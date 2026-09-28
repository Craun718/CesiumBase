import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildRegionTree,
  calculateRegionBounds,
  createDefaultExpandedRegionCodes,
  filterRegionTree,
  flattenRegionTree,
  flattenRegionTreeForDisplay,
  findRegionWfsSource,
} from "../src/features/regions/regionTree.js"
import type { GeoJsonFeatureCollection } from "../src/features/catalog/model/types.js"
import type {
  LayerSchemeBundle,
  ServiceResourceDefinition,
  ServiceSourceDefinition,
} from "../src/features/layers/types.js"

test("buildRegionTree 按 parent_code 建立三级政区树", () => {
  const collection = createRegionCollection()

  const tree = buildRegionTree(collection)

  assert.equal(tree.length, 1)
  assert.equal(tree[0]?.code, "450000000000")
  assert.equal(tree[0]?.name, "广西壮族自治区")
  assert.equal(tree[0]?.level, 1)
  assert.equal(tree[0]?.children.length, 1)
  assert.equal(tree[0]?.children[0]?.code, "450100000000")
  assert.equal(tree[0]?.children[0]?.children[0]?.code, "450102000000")
  assert.equal(tree[0]?.feature, collection.features[2])
})

test("flattenRegionTree 按深度优先返回可搜索列表", () => {
  const tree = buildRegionTree(createRegionCollection())

  assert.deepEqual(
    flattenRegionTree(tree).map((region) => region.code),
    ["450000000000", "450100000000", "450102000000"],
  )
})

test("createDefaultExpandedRegionCodes 默认展开自治区和市", () => {
  const tree = buildRegionTree(createRegionCollection())

  assert.deepEqual(createDefaultExpandedRegionCodes(tree), ["450000000000", "450100000000"])
})

test("calculateRegionBounds 计算多边形与洞的 WGS84 范围", () => {
  const collection = createRegionCollection()
  const tree = buildRegionTree(collection)

  assert.deepEqual(calculateRegionBounds(tree[0]?.feature), {
    west: 104,
    south: 21,
    east: 112,
    north: 26,
  })
})

test("filterRegionTree 搜索时保留命中节点、祖先与子孙", () => {
  const tree = buildRegionTree(createRegionCollection())

  const filtered = filterRegionTree(tree, "南宁市")

  assert.deepEqual(
    flattenRegionTree(filtered).map((region) => region.code),
    ["450000000000", "450100000000", "450102000000"],
  )
})

test("flattenRegionTreeForDisplay 按展开状态显示并在搜索时强制展开", () => {
  const tree = buildRegionTree(createRegionCollection())
  const expanded = new Set(["450000000000"])

  assert.deepEqual(
    flattenRegionTreeForDisplay(tree, expanded, "").map(({ node, depth }) => [node.code, depth]),
    [
      ["450000000000", 0],
      ["450100000000", 1],
    ],
  )
  assert.deepEqual(
    flattenRegionTreeForDisplay(tree, new Set(), "兴宁").map(({ node, depth }) => [
      node.code,
      depth,
    ]),
    [
      ["450000000000", 0],
      ["450100000000", 1],
      ["450102000000", 2],
    ],
  )
})

test("findRegionWfsSource returns v1 source and binding", () => {
  const source: ServiceSourceDefinition = {
    id: "source-guangxi-region-wfs",
    name: "Region WFS",
    sortOrder: 70,
    enabled: true,
    protocol: "wfs",
    connection: { baseUrl: "/geoserver/guangxi/wfs", version: "2.0.0" },
    verification: { status: "verified", issues: [] },
  }
  const resource: ServiceResourceDefinition = {
    id: "resource-region",
    name: "Region",
    sortOrder: 10,
    enabled: true,
    origin: "service",
    sourceId: source.id,
    bindingKey: "guangxi:region",
    binding: { protocol: "wfs", typeName: "guangxi:region" },
    kind: "vector",
    extent: { west: 104, south: 21, east: 112, north: 26 },
    verification: { status: "verified", issues: [] },
  }
  const bundle: LayerSchemeBundle = {
    scheme: {
      id: "scheme-default",
      name: "Default",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers: [
        {
          id: "layer-region",
          name: "Region",
          resourceId: resource.id,
          visible: true,
          sortOrder: 10,
          renderOrder: 10,
          type: "vector",
          style: {},
        },
      ],
    },
    sources: [source],
    resources: [resource],
  }

  const result = findRegionWfsSource(bundle)

  assert.equal(result?.source.id, "source-guangxi-region-wfs")
  assert.equal(result?.binding.typeName, "guangxi:region")
})
function createRegionCollection(): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "450102000000",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [108, 23],
              [109, 23],
              [109, 24],
              [108, 24],
              [108, 23],
            ],
          ],
        },
        properties: {
          code: "450102000000",
          name: "兴宁区",
          level: 3,
          parent_code: "450100000000",
        },
      },
      {
        type: "Feature",
        id: "450100000000",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [107, 22],
              [109, 22],
              [109, 24],
              [107, 24],
              [107, 22],
            ],
          ],
        },
        properties: {
          code: "450100000000",
          name: "南宁市",
          level: 2,
          parent_code: "450000000000",
        },
      },
      {
        type: "Feature",
        id: "450000000000",
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [104, 21],
                [112, 21],
                [112, 26],
                [104, 26],
                [104, 21],
              ],
              [
                [105, 22],
                [106, 22],
                [106, 23],
                [105, 23],
                [105, 22],
              ],
            ],
          ],
        },
        properties: {
          code: "450000000000",
          name: "广西壮族自治区",
          level: 1,
          parent_code: null,
        },
      },
    ],
  }
}
