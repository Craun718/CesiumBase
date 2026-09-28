import assert from "node:assert/strict"
import test from "node:test"
import { createPinia, setActivePinia } from "pinia"
import { useCatalogStore } from "../src/features/catalog/store.js"
import type {
  CatalogSnapshot,
  ServiceResourceDefinition,
  ServiceSourceDefinition,
} from "../src/features/catalog/model/types.js"

const source: ServiceSourceDefinition = {
  id: "source-1",
  name: "服务一",
  sortOrder: 10,
  enabled: true,
  protocol: "xyz",
  connection: { rootUrl: "/tiles/" },
  verification: { status: "unverified", issues: [] },
}

const resource: ServiceResourceDefinition = {
  id: "resource-1",
  name: "影像一",
  sortOrder: 10,
  enabled: true,
  origin: "service",
  sourceId: source.id,
  bindingKey: "root",
  binding: { protocol: "xyz" },
  kind: "imagery",
  extent: { west: 100, south: 20, east: 110, north: 30 },
  verification: { status: "unverified", issues: [] },
}

const catalog: CatalogSnapshot = {
  modelVersion: "1.0",
  sources: [source],
  resourceCategories: [],
  resources: [resource],
  layerSchemes: [],
}

/** 创建用于 store 测试的 Pinia 实例。 */
function setupStore() {
  setActivePinia(createPinia())
  const store = useCatalogStore()
  store.applyCatalog(catalog)
  return store
}

test("服务被资源引用时禁止删除", () => {
  const store = setupStore()
  const result = store.removeSource(source.id)
  assert.equal(result.ok, false)
  assert.equal(store.catalog.sources.length, 1)
})

test("发现结果按 sourceId + bindingKey 幂等更新并保留业务字段", () => {
  const store = setupStore()
  store.saveResource({
    ...resource,
    categoryId: "category-1",
    remark: "人工备注",
    tags: ["人工"],
    extent: { west: 100, south: 20, east: 110, north: 30 },
  })
  const result = store.applyDiscovery({
    sourceId: source.id,
    protocol: "xyz",
    status: "complete",
    metadataFiles: [],
    issues: [],
    items: [
      {
        key: "root",
        name: "更新后的影像",
        kind: "imagery",
        selectable: true,
        binding: { protocol: "xyz" },
        extent: { west: 101, south: 21, east: 111, north: 31 },
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(store.catalog.resources.length, 1)
  assert.equal(store.catalog.resources[0]?.name, "影像一")
  assert.equal(store.catalog.resources[0]?.categoryId, "category-1")
  assert.equal(store.catalog.resources[0]?.remark, "人工备注")
  assert.equal(store.catalog.resources[0]?.extent?.west, 100)
  assert.equal(
    typeof (store.catalog.resources[0] as ServiceResourceDefinition | undefined)?.verification
      .checkedAt,
    "string",
  )
})

test("未被资源引用的服务允许修改协议", () => {
  const store = setupStore()
  store.removeResource(resource.id)
  const result = store.saveSource({
    ...source,
    protocol: "wms",
    connection: { baseUrl: "http://example.com/wms" },
  })

  assert.equal(result.ok, true)
  assert.equal(store.catalog.sources[0]?.protocol, "wms")
})

test("服务连接修改后重复保存不会绕过 stale", () => {
  const store = setupStore()
  const nextConnection = { rootUrl: "http://example.com/xyz" }
  const first = store.saveSource({
    ...source,
    connection: nextConnection,
    verification: { status: "verified", checkedAt: "2026-01-01T00:00:00.000Z", issues: [] },
  })
  const second = store.saveSource({
    ...source,
    connection: nextConnection,
    verification: { status: "verified", checkedAt: "2026-01-01T00:00:00.000Z", issues: [] },
  })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(store.catalog.sources[0]?.verification.status, "stale")
})

test("重新验证后允许服务从 stale 恢复 verified", () => {
  const store = setupStore()
  const connection = { rootUrl: "http://example.com/xyz" }
  store.saveSource({
    ...source,
    connection,
    verification: { status: "verified", checkedAt: "2026-01-01T00:00:00.000Z", issues: [] },
  })
  const result = store.saveSource({
    ...source,
    connection,
    verification: {
      status: "verified",
      checkedAt: "2026-02-01T00:00:00.000Z",
      fingerprint: "new-fingerprint",
      issues: [],
    },
  })

  assert.equal(result.ok, true)
  assert.equal(store.catalog.sources[0]?.verification.status, "verified")
  assert.equal(store.catalog.sources[0]?.verification.fingerprint, "new-fingerprint")
})

test("批量发现支持统一分类和启用状态", () => {
  const store = setupStore()
  store.removeResource(resource.id)
  const result = store.applyDiscovery(
    {
      sourceId: source.id,
      protocol: "xyz",
      status: "complete",
      metadataFiles: [],
      issues: [],
      items: [
        {
          key: "root",
          name: "影像",
          kind: "imagery",
          selectable: true,
          binding: { protocol: "xyz" },
        },
      ],
    },
    { categoryId: "category-batch", enabled: false },
  )

  assert.equal(result.ok, true)
  assert.equal(store.catalog.resources[0]?.categoryId, "category-batch")
  assert.equal(store.catalog.resources[0]?.enabled, false)
})

test("资源被图层引用时禁止删除", () => {
  const store = setupStore()
  store.replaceLayerSchemes([
    {
      id: "scheme-1",
      name: "默认方案",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers: [
        {
          id: "layer-1",
          name: "图层一",
          resourceId: resource.id,
          visible: true,
          sortOrder: 10,
          renderOrder: 10,
          type: "imagery",
          style: { opacity: 1 },
        },
      ],
    },
  ])

  const result = store.removeResource(resource.id)
  assert.equal(result.ok, false)
  assert.equal(store.catalog.resources.length, 1)
})

test("资源范围非法时禁止保存", () => {
  const store = setupStore()
  const result = store.saveResource({
    ...resource,
    extent: { west: 110, south: 30, east: 100, north: 20 },
  })

  assert.equal(result.ok, false)
})

test("复制启用方案生成新的停用方案", () => {
  const store = setupStore()
  store.replaceLayerSchemes([
    {
      id: "scheme-1",
      name: "默认",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [{ id: "group-1", name: "基础", sortOrder: 10, defaultExpanded: true }],
      layers: [],
    },
  ])

  const result = store.copyLayerScheme("scheme-1")
  assert.equal(result.ok, true)
  assert.equal(store.catalog.layerSchemes.length, 2)
  assert.equal(store.catalog.layerSchemes[1]?.status, "disabled")
  assert.notEqual(store.catalog.layerSchemes[1]?.id, "scheme-1")
})

test("默认方案唯一且停用默认方案需要替代", () => {
  const store = setupStore()
  store.replaceLayerSchemes([
    {
      id: "scheme-1",
      name: "方案一",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers: [],
    },
    {
      id: "scheme-2",
      name: "方案二",
      sortOrder: 20,
      status: "enabled",
      defaultActive: false,
      groups: [],
      layers: [],
    },
  ])

  assert.equal(store.setDefaultScheme("scheme-2").ok, true)
  assert.equal(store.catalog.layerSchemes.filter((item) => item.defaultActive).length, 1)
  assert.equal(store.setSchemeEnabled("scheme-2", false).ok, false)
})

test("启用方案要求所有引用可加载", () => {
  const store = setupStore()
  store.replaceLayerSchemes([
    {
      id: "scheme-1",
      name: "失效方案",
      sortOrder: 10,
      status: "disabled",
      defaultActive: false,
      groups: [],
      layers: [
        {
          id: "layer-missing",
          name: "缺失资源图层",
          resourceId: "resource-missing",
          visible: true,
          sortOrder: 10,
          renderOrder: 10,
          type: "imagery",
          style: { opacity: 1 },
        },
      ],
    },
  ])

  const result = store.setSchemeEnabled("scheme-1", true)
  assert.equal(result.ok, false)
})

test("sessionStorage restores the current enabled scheme", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })

  try {
    storage.set("webgis.active-layer-scheme", "scheme-2")
    setActivePinia(createPinia())
    const store = useCatalogStore()
    store.applyCatalog({
      ...catalog,
      layerSchemes: [
        {
          id: "scheme-1",
          name: "one",
          sortOrder: 10,
          status: "enabled",
          defaultActive: true,
          groups: [],
          layers: [],
        },
        {
          id: "scheme-2",
          name: "two",
          sortOrder: 20,
          status: "enabled",
          defaultActive: false,
          groups: [],
          layers: [],
        },
      ],
    })

    assert.equal(store.activeSchemeId, "scheme-2")
    store.setLayerVisible("layer-1", false)
    assert.equal(store.activateScheme("scheme-1").ok, true)
    assert.deepEqual(store.visibilityOverrides, {})
    assert.equal(storage.get("webgis.active-layer-scheme"), "scheme-1")
  } finally {
    Reflect.deleteProperty(globalThis, "sessionStorage")
  }
})

test("discovery writes XYZ template back to source connection", () => {
  const store = setupStore()
  store.removeResource(resource.id)
  const result = store.applyDiscovery({
    sourceId: source.id,
    protocol: "xyz",
    status: "complete",
    metadataFiles: [],
    issues: [],
    items: [
      {
        key: "root",
        name: "XYZ imagery",
        kind: "imagery",
        selectable: true,
        binding: { protocol: "xyz" },
        extent: { west: 100, south: 20, east: 110, north: 30 },
        levelRange: { min: 1, max: 20 },
        tile: {
          template: "{z}/{x}/{y}.png",
          format: "image/png",
          convention: "xyz",
        },
        diagnostics: { crs: "EPSG:3857" },
      },
    ],
  })

  const updated = store.catalog.sources[0]
  assert.equal(result.ok, true)
  assert.equal(updated?.protocol, "xyz")
  if (updated?.protocol !== "xyz") return
  assert.equal(updated.connection.urlTemplate, "/tiles/{z}/{x}/{y}.png")
  assert.equal(updated.connection.minimumLevel, 1)
  assert.equal(updated.connection.maximumLevel, 20)
  assert.equal(updated.connection.tilingScheme, "web-mercator")
  assert.equal(updated.verification.status, "verified")
})
