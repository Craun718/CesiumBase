import assert from "node:assert/strict"
import test from "node:test"
import {
  buildLayerSchemeBundle,
  createLayerForResource,
  validateLayerScheme,
} from "../src/features/catalog/layerScheme.js"
import type {
  CatalogSnapshot,
  ServiceResourceDefinition,
} from "../src/features/catalog/model/types.js"

const resource: ServiceResourceDefinition = {
  id: "resource-dem",
  name: "广西地形",
  sortOrder: 10,
  enabled: true,
  origin: "service",
  sourceId: "source-dem",
  bindingKey: "root",
  binding: { protocol: "terrain-quantized-mesh" },
  kind: "terrain",
  extent: { west: 104, south: 21, east: 112, north: 27 },
  verification: { status: "verified", issues: [] },
}

const catalog: CatalogSnapshot = {
  modelVersion: "1.0",
  sources: [
    {
      id: "source-dem",
      name: "DEM",
      sortOrder: 10,
      enabled: true,
      protocol: "terrain-quantized-mesh",
      connection: { rootUrl: "/dem/" },
      verification: { status: "verified", issues: [] },
    },
  ],
  resourceCategories: [],
  resources: [resource],
  layerSchemes: [
    {
      id: "scheme-1",
      name: "默认方案",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [{ id: "group-1", name: "地形", sortOrder: 10, defaultExpanded: true }],
      layers: [
        {
          id: "layer-1",
          name: "广西地形",
          resourceId: resource.id,
          groupId: "group-1",
          visible: true,
          sortOrder: 10,
          renderOrder: 0,
          type: "terrain",
          style: {},
        },
      ],
    },
  ],
}

test("buildLayerSchemeBundle 只收集方案引用的资源和服务", () => {
  const bundle = buildLayerSchemeBundle(catalog, "scheme-1")
  assert.equal(bundle?.resources.length, 1)
  assert.equal(bundle?.sources.length, 1)
})

test("createLayerForResource 根据资源类型创建默认样式", () => {
  const layer = createLayerForResource(resource, { visible: false })
  assert.equal(layer.type, "terrain")
  assert.equal(layer.visible, false)
})

test("validateLayerScheme 校验引用和地形默认显隐", () => {
  const result = validateLayerScheme(catalog, catalog.layerSchemes[0]!)
  assert.equal(result.valid, true)
})
