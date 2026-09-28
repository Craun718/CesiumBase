import assert from "node:assert/strict"
import test from "node:test"
import {
  buildResourceDisableNotice,
  buildResourceUsage,
  buildSourceUsage,
  buildSourceDisableNotice,
  formatUsageSchemeLine,
} from "../src/features/catalog/usage.js"
import type {
  CatalogSnapshot,
  ServiceResourceDefinition,
} from "../src/features/catalog/model/types.js"

const sharedResource: ServiceResourceDefinition = {
  id: "resource-shared",
  name: "影像资源",
  sortOrder: 10,
  enabled: true,
  origin: "service",
  sourceId: "source-a",
  bindingKey: "shared",
  binding: { protocol: "xyz" },
  kind: "imagery",
  extent: { west: 104, south: 21, east: 112, north: 27 },
  verification: { status: "verified", issues: [] },
}

const unusedResource: ServiceResourceDefinition = {
  ...sharedResource,
  id: "resource-unused",
  name: "备用资源",
  sortOrder: 20,
  bindingKey: "unused",
}

const catalog: CatalogSnapshot = {
  modelVersion: "1.0",
  sources: [
    {
      id: "source-a",
      name: "服务 A",
      sortOrder: 10,
      enabled: true,
      protocol: "xyz",
      connection: { rootUrl: "/tiles/" },
      verification: { status: "verified", issues: [] },
    },
  ],
  resourceCategories: [],
  resources: [sharedResource, unusedResource],
  layerSchemes: [
    {
      id: "scheme-current",
      name: "当前方案",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers: [
        {
          id: "layer-shared-1",
          name: "影像一",
          resourceId: sharedResource.id,
          visible: true,
          sortOrder: 20,
          renderOrder: 10,
          type: "imagery",
          style: { opacity: 1 },
        },
        {
          id: "layer-shared-2",
          name: "影像二",
          resourceId: sharedResource.id,
          visible: false,
          sortOrder: 10,
          renderOrder: 20,
          type: "imagery",
          style: { opacity: 1 },
        },
      ],
    },
    {
      id: "scheme-disabled",
      name: "停用方案",
      sortOrder: 20,
      status: "disabled",
      defaultActive: false,
      groups: [],
      layers: [
        {
          id: "layer-shared-3",
          name: "备用影像",
          resourceId: sharedResource.id,
          visible: true,
          sortOrder: 10,
          renderOrder: 10,
          type: "imagery",
          style: { opacity: 1 },
        },
      ],
    },
  ],
}

test("资源引用统计按方案聚合图层并标记状态", () => {
  const usage = buildResourceUsage(catalog, sharedResource.id, "scheme-current")

  assert.equal(usage?.targetId, sharedResource.id)
  assert.equal(usage?.resourceCount, 1)
  assert.equal(usage?.schemeCount, 2)
  assert.equal(usage?.layerCount, 3)
  assert.deepEqual(
    usage?.schemes.map((scheme) => ({
      id: scheme.id,
      status: scheme.status,
      defaultActive: scheme.defaultActive,
      active: scheme.active,
    })),
    [
      {
        id: "scheme-current",
        status: "enabled",
        defaultActive: true,
        active: true,
      },
      {
        id: "scheme-disabled",
        status: "disabled",
        defaultActive: false,
        active: false,
      },
    ],
  )
  assert.deepEqual(
    usage?.schemes[0]?.resources[0]?.layers.map((layer) => layer.name),
    ["影像二", "影像一"],
  )
})

test("未被引用的资源返回空影响范围", () => {
  const usage = buildResourceUsage(catalog, unusedResource.id)

  assert.equal(usage?.schemeCount, 0)
  assert.equal(usage?.layerCount, 0)
  assert.deepEqual(usage?.schemes, [])
})

test("服务影响统计包含未引用资源和已引用方案的级联图层", () => {
  const usage = buildSourceUsage(catalog, "source-a", "scheme-current")

  assert.equal(usage?.targetId, "source-a")
  assert.equal(usage?.resourceCount, 2)
  assert.equal(usage?.schemeCount, 2)
  assert.equal(usage?.layerCount, 3)
  assert.deepEqual(
    usage?.schemes[0]?.resources.map((resource) => resource.id),
    ["resource-shared"],
  )
})

test("引用行文案可区分是否展示资源名称", () => {
  const usage = buildResourceUsage(catalog, sharedResource.id)
  const scheme = usage?.schemes[0]

  assert.equal(formatUsageSchemeLine(scheme, false), "当前方案（启用、默认）：影像二、影像一")
  assert.equal(
    formatUsageSchemeLine(scheme, true),
    "当前方案（启用、默认）：影像资源 / 影像二、影像一",
  )
})

test("资源停用提示说明软停用和恢复语义", () => {
  const usage = buildResourceUsage(catalog, sharedResource.id)

  const notice = buildResourceDisableNotice(usage)

  assert.equal(
    notice.message,
    "停用后不会删除方案图层；3 个图层将在下次加载时不可用，重新启用资源后原引用自动恢复。",
  )
  assert.deepEqual(notice.details, [
    "影响范围：2 个方案、3 个图层",
    "当前方案（启用、默认）：影像二、影像一",
    "停用方案（停用）：备用影像",
  ])
})

test("服务停用提示覆盖资源与方案图层级联影响", () => {
  const usage = buildSourceUsage(catalog, "source-a")

  const notice = buildSourceDisableNotice(usage)

  assert.equal(
    notice.message,
    "停用后不会删除资源和方案图层；2 个资源、3 个方案图层将在下次加载时不可用，重新启用服务后原配置自动恢复。",
  )
  assert.deepEqual(notice.details, [
    "关联资源：2 个；影响范围：2 个方案、3 个图层",
    "当前方案（启用、默认）：影像资源 / 影像二、影像一",
    "停用方案（停用）：影像资源 / 备用影像",
  ])
})
