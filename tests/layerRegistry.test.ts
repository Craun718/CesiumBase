import assert from "node:assert/strict"
import { test } from "node:test"
import { CesiumLayerRegistry } from "../src/features/layers/layerRegistry.js"
import { clearWfsFeatureCacheForTests } from "../src/features/layers/wfsFeatureCache.js"
import type { MapController } from "../src/map/mapController.js"
import type {
  LayerDefinition,
  LayerSchemeBundle,
  ResourceBinding,
  ResourceDefinition,
  ServiceSourceDefinition,
} from "../src/features/layers/types.js"

const extent = {
  west: 109,
  south: 23,
  east: 110,
  north: 24,
  minimumHeight: 12,
  maximumHeight: 48,
}
const bounds = {
  west: extent.west,
  south: extent.south,
  east: extent.east,
  north: extent.north,
}

test("LayerRegistry materializes v1 source connection and resource binding", async () => {
  const harness = createControllerHarness()
  const registry = new CesiumLayerRegistry(harness.controller)
  harness.setMapReady(true)

  const sources: ServiceSourceDefinition[] = [
    {
      id: "source-xyz",
      name: "XYZ",
      sortOrder: 1,
      enabled: true,
      protocol: "xyz",
      connection: {
        rootUrl: "http://127.0.0.1:9001/cun/",
        urlTemplate: "http://127.0.0.1:9001/cun/{z}/{x}/{y}.png",
        tilingScheme: "web-mercator",
        authToken: "xyz-token",
      },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-wms",
      name: "WMS",
      sortOrder: 2,
      enabled: true,
      protocol: "wms",
      connection: {
        baseUrl: "https://example.com/geoserver/wms",
        version: "1.3.0",
        authToken: "ogc-token",
      },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-wmts",
      name: "WMTS",
      sortOrder: 3,
      enabled: true,
      protocol: "wmts",
      connection: {
        baseUrl: "https://example.com/geoserver/gwc/service/wmts",
        version: "1.0.0",
      },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-wfs",
      name: "WFS",
      sortOrder: 4,
      enabled: true,
      protocol: "wfs",
      connection: {
        baseUrl: "https://example.com/geoserver/wfs",
        version: "2.0.0",
        authToken: "wfs-token",
      },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-tileset",
      name: "3D Tiles",
      sortOrder: 5,
      enabled: true,
      protocol: "3d-tiles",
      connection: {
        rootUrl: "http://storage.example:9000/scene/xinhegtanglucun/",
        maximumScreenSpaceError: 12,
      },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-model",
      name: "glTF",
      sortOrder: 6,
      enabled: true,
      protocol: "gltf",
      connection: { url: "https://example.com/model.glb" },
      verification: { status: "verified", issues: [] },
    },
  ]
  const resources: ResourceDefinition[] = [
    createResource("resource-1", "source-xyz", "imagery", { protocol: "xyz" }),
    createResource("resource-2", "source-wms", "imagery", {
      protocol: "wms",
      layer: "workspace:imagery",
      styleName: "remote-style",
      format: "image/png",
      crs: "EPSG:3857",
    }),
    createResource("resource-3", "source-wmts", "imagery", {
      protocol: "wmts",
      layer: "workspace:imagery",
      tileMatrixSet: "EPSG:900913",
      style: "remote-style",
      format: "image/jpeg",
    }),
    createResource("resource-4", "source-wfs", "vector", {
      protocol: "wfs",
      typeName: "workspace:features",
      outputFormat: "application/json",
      srsName: "EPSG:4326",
    }),
    createResource("resource-5", "source-tileset", "tileset", { protocol: "3d-tiles" }),
    createResource("resource-6", "source-model", "model", { protocol: "gltf" }),
  ]
  const layers = [
    createLayer("layer-xyz", "resource-1", "imagery", 10, { opacity: 0.9 }),
    createLayer("layer-wms", "resource-2", "imagery", 20, { opacity: 0.8 }),
    createLayer("layer-wmts", "resource-3", "imagery", 30, { opacity: 0.7 }),
    { ...createLayer("layer-wfs", "resource-4", "vector", 40, {}), visible: false },
    createLayer("layer-tileset", "resource-5", "tileset", 50, { opacity: 0.6 }),
    createLayer("layer-model", "resource-6", "model", 60, { opacity: 0.5 }),
  ]

  await registry.applyScheme(createBundle(sources, resources, layers))

  const imageryCalls = harness.filterCalls("add-imagery")
  assert.equal(imageryCalls.length, 3)
  assert.deepEqual(
    pick(imageryCalls[0].descriptor, [
      "protocol",
      "urlTemplate",
      "tilingScheme",
      "authToken",
      "bounds",
    ]),
    {
      protocol: "xyz",
      urlTemplate: "http://127.0.0.1:9001/cun/{z}/{x}/{y}.png",
      tilingScheme: "web-mercator",
      authToken: "xyz-token",
      bounds,
    },
  )
  assert.deepEqual(
    pick(imageryCalls[1].descriptor, [
      "protocol",
      "baseUrl",
      "layers",
      "style",
      "version",
      "format",
      "srs",
      "authToken",
      "bounds",
    ]),
    {
      protocol: "wms",
      baseUrl: "https://example.com/geoserver/wms",
      layers: "workspace:imagery",
      style: "remote-style",
      version: "1.3.0",
      format: "image/png",
      srs: "EPSG:3857",
      authToken: "ogc-token",
      bounds,
    },
  )
  assert.deepEqual(
    pick(imageryCalls[2].descriptor, [
      "protocol",
      "baseUrl",
      "layer",
      "style",
      "tileMatrixSet",
      "format",
      "bounds",
    ]),
    {
      protocol: "wmts",
      baseUrl: "https://example.com/geoserver/gwc/service/wmts",
      layer: "workspace:imagery",
      style: "remote-style",
      tileMatrixSet: "EPSG:900913",
      format: "image/jpeg",
      bounds,
    },
  )
  assert.deepEqual(
    pick(harness.findCall("add-tileset").descriptor, [
      "url",
      "maximumScreenSpaceError",
      "visible",
      "renderOrder",
      "opacity",
    ]),
    {
      url: "/scene/xinhegtanglucun/tileset.json",
      maximumScreenSpaceError: 12,
      visible: true,
      renderOrder: 50,
      opacity: 0.6,
    },
  )
  assert.deepEqual(
    pick(harness.findCall("add-model").descriptor, [
      "url",
      "bounds",
      "height",
      "visible",
      "renderOrder",
      "opacity",
    ]),
    {
      url: "https://example.com/model.glb",
      bounds,
      height: 12,
      visible: true,
      renderOrder: 60,
      opacity: 0.5,
    },
  )
})

test("LayerRegistry updates and removes 3D layers", async () => {
  const harness = createControllerHarness()
  const registry = new CesiumLayerRegistry(harness.controller)
  harness.setMapReady(true)
  const sources: ServiceSourceDefinition[] = [
    {
      id: "source-tileset",
      name: "3D Tiles",
      sortOrder: 1,
      enabled: true,
      protocol: "3d-tiles",
      connection: { rootUrl: "https://example.com/" },
      verification: { status: "verified", issues: [] },
    },
    {
      id: "source-model",
      name: "glTF",
      sortOrder: 2,
      enabled: true,
      protocol: "gltf",
      connection: { url: "https://example.com/model.glb" },
      verification: { status: "verified", issues: [] },
    },
  ]
  const resources = [
    createResource("resource-tileset", "source-tileset", "tileset", { protocol: "3d-tiles" }),
    createResource("resource-model", "source-model", "model", { protocol: "gltf" }),
  ]
  const layers = [
    createLayer("layer-tileset", "resource-tileset", "tileset", 10, { opacity: 1 }),
    createLayer("layer-model", "resource-model", "model", 20, { opacity: 1 }),
  ]

  await registry.applyScheme(createBundle(sources, resources, layers))
  await registry.updateLayer("layer-tileset", {
    visible: false,
    renderOrder: 30,
    style: { opacity: 0.4 },
  })
  await registry.updateLayer("layer-model", {
    visible: false,
    renderOrder: 40,
    style: { opacity: 0.3 },
  })
  await registry.removeLayer("layer-tileset")
  await registry.removeLayer("layer-model")

  assert.deepEqual(harness.findCall("update-tileset").patch, {
    visible: false,
    opacity: 0.4,
    renderOrder: 30,
  })
  assert.deepEqual(harness.findCall("update-model").patch, {
    visible: false,
    opacity: 0.3,
    renderOrder: 40,
  })
  assert.equal(harness.filterCalls("remove-tileset").length, 1)
  assert.equal(harness.filterCalls("remove-model").length, 1)
})

test("LayerRegistry blocks layers whose upstream service is disabled", async () => {
  const harness = createControllerHarness()
  const registry = new CesiumLayerRegistry(harness.controller)
  harness.setMapReady(true)

  const sources: ServiceSourceDefinition[] = [
    {
      id: "source-disabled",
      name: "Disabled XYZ",
      sortOrder: 1,
      enabled: false,
      protocol: "xyz",
      connection: {
        rootUrl: "/tiles/",
        urlTemplate: "/tiles/{z}/{x}/{y}.png",
      },
      verification: { status: "verified", issues: [] },
    },
  ]
  const resources = [
    createResource("resource-disabled", "source-disabled", "imagery", { protocol: "xyz" }),
  ]
  const layers = [createLayer("layer-disabled", "resource-disabled", "imagery", 10, { opacity: 1 })]

  await registry.applyScheme(createBundle(sources, resources, layers))

  const snapshot = registry.getLayerSnapshots()[0]
  assert.equal(snapshot?.status, "error")
  assert.match(snapshot?.errorMessage ?? "", /上游服务已停用/)
  assert.equal(harness.filterCalls("add-imagery").length, 0)
})

test("LayerRegistry reports missing WMS binding", async () => {
  const harness = createControllerHarness()
  const registry = new CesiumLayerRegistry(harness.controller)
  harness.setMapReady(true)
  const sources: ServiceSourceDefinition[] = [
    {
      id: "source-wms",
      name: "WMS",
      sortOrder: 1,
      enabled: true,
      protocol: "wms",
      connection: { baseUrl: "https://example.com/geoserver/wms" },
      verification: { status: "verified", issues: [] },
    },
  ]
  const resources = [
    createResource("resource-wms", "source-wms", "imagery", { protocol: "wms", layer: "" }),
  ]
  const layers = [createLayer("layer-wms", "resource-wms", "imagery", 10, { opacity: 1 })]

  await registry.applyScheme(createBundle(sources, resources, layers))

  assert.equal(registry.getLayerSnapshots()[0]?.status, "error")
  assert.equal(harness.filterCalls("add-imagery").length, 0)
})

test("LayerRegistry reuses WFS requests and keeps the region mask independent", async () => {
  clearWfsFeatureCacheForTests()
  const harness = createControllerHarness()
  const registry = new CesiumLayerRegistry(harness.controller)
  harness.setMapReady(true)

  let requestCount = 0
  const originalFetch = global.fetch
  global.fetch = async () => {
    requestCount += 1
    return new Response(JSON.stringify(createWfsRegionCollection()), { status: 200 })
  }

  try {
    const source: ServiceSourceDefinition = {
      id: "source-region-wfs",
      name: "Region WFS",
      sortOrder: 1,
      enabled: true,
      protocol: "wfs",
      connection: {
        baseUrl: "http://localhost:9999/geoserver/guangxi/wfs",
        version: "2.0.0",
        authToken: "region-token",
      },
      verification: { status: "verified", issues: [] },
    }
    const resources = [1, 2, 3].map((level) =>
      createResource(
        `resource-region-${level}`,
        "source-region-wfs",
        "vector",
        {
          protocol: "wfs",
          typeName: "guangxi:region",
          outputFormat: "application/json",
          srsName: "EPSG:4326",
          maxFeatures: 10_000,
          featureFilter: { field: "level", value: level },
        },
        ["outside-region-mask"],
      ),
    )
    const layers = [1, 2, 3].map((level) =>
      createLayer(`layer-region-${level}`, `resource-region-${level}`, "vector", level * 10, {
        fillOpacity: 0,
        strokeColor: "#eab308",
        strokeWidth: level,
      }),
    )

    await registry.applyScheme(createBundle([source], resources, layers))

    const vectorCalls = harness.filterCalls("add-vector")
    assert.equal(requestCount, 1)
    assert.deepEqual(vectorCalls.map(getMaterializedFeatureIds), [
      ["province"],
      ["city"],
      ["county"],
    ])
    assert.deepEqual(
      harness.filterCalls("set-outside-region-mask").map((call) => call.patch),
      [],
    )

    await registry.setLayerVisible("layer-region-1", false)
    await registry.setLayerVisible("layer-region-2", false)
    await registry.setLayerVisible("layer-region-3", false)
    assert.deepEqual(harness.filterCalls("set-outside-region-mask"), [])
  } finally {
    global.fetch = originalFetch
    clearWfsFeatureCacheForTests()
  }
})

/** ????????? */
function createControllerHarness() {
  const calls: Array<{ method: string; descriptor?: unknown; patch?: unknown; id?: string }> = []
  let mountListener: ((ready: boolean) => void) | undefined

  const controller = {
    onMountStateChange(listener: (ready: boolean) => void) {
      mountListener = listener
      return () => undefined
    },
    onImageryLayerError: () => () => undefined,
    setTerrainSource: async () => true,
    addImageryLayer: async (descriptor: unknown) => {
      calls.push({ method: "add-imagery", descriptor })
    },
    updateImageryLayer: (id: string, patch: unknown) =>
      calls.push({ method: "update-imagery", id, patch }),
    removeImageryLayer: (id: string) => calls.push({ method: "remove-imagery", id }),
    addVectorLayer: async (descriptor: unknown) => calls.push({ method: "add-vector", descriptor }),
    updateVectorLayer: (id: string, patch: unknown) =>
      calls.push({ method: "update-vector", id, patch }),
    removeVectorLayer: (id: string) => calls.push({ method: "remove-vector", id }),
    addTilesetLayer: async (descriptor: unknown) =>
      calls.push({ method: "add-tileset", descriptor }),
    updateTilesetLayer: (id: string, patch: unknown) =>
      calls.push({ method: "update-tileset", id, patch }),
    removeTilesetLayer: (id: string) => calls.push({ method: "remove-tileset", id }),
    addModelLayer: async (descriptor: unknown) => calls.push({ method: "add-model", descriptor }),
    updateModelLayer: (id: string, patch: unknown) =>
      calls.push({ method: "update-model", id, patch }),
    removeModelLayer: (id: string) => calls.push({ method: "remove-model", id }),
    setOutsideRegionMaskVisible: (visible: boolean) =>
      calls.push({ method: "set-outside-region-mask", patch: visible }),
  } as unknown as MapController

  return {
    controller,
    calls,
    setMapReady(ready: boolean) {
      mountListener?.(ready)
    },
    filterCalls(method: string) {
      return calls.filter((call) => call.method === method)
    },
    findCall(method: string) {
      const call = calls.find((item) => item.method === method)
      assert.ok(call, `missing call ${method}`)
      return call as { descriptor?: Record<string, unknown>; patch?: unknown; id?: string }
    },
  }
}

/** ?? WFS ????????? */
function createWfsRegionCollection() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "province",
        geometry: { type: "MultiPolygon", coordinates: [] },
        properties: { code: "450000000000", name: "Guangxi", level: 1 },
      },
      {
        type: "Feature",
        id: "city",
        geometry: { type: "MultiPolygon", coordinates: [] },
        properties: { code: "450100000000", name: "Nanning", level: 2 },
      },
      {
        type: "Feature",
        id: "county",
        geometry: { type: "MultiPolygon", coordinates: [] },
        properties: { code: "450102000000", name: "Xingning", level: 3 },
      },
    ],
  }
}

/** ?????? WFS ?? id? */
function getMaterializedFeatureIds(call: { descriptor?: unknown }) {
  const descriptor = call.descriptor as { data: { features: Array<{ id?: string }> } }
  return descriptor.data.features.map((feature) => feature.id)
}

/** ??????? */
function createResource(
  id: string,
  sourceId: string,
  kind: ResourceDefinition["kind"],
  binding: ResourceBinding,
  tags?: readonly string[],
): ResourceDefinition {
  return {
    id,
    name: id,
    sortOrder: 1,
    enabled: true,
    origin: "service",
    kind,
    sourceId,
    bindingKey: "root",
    binding,
    extent,
    tags,
    verification: { status: "verified", issues: [] },
  } as ResourceDefinition
}

/** ??????? */
function createLayer(
  id: string,
  resourceId: string,
  type: LayerDefinition["type"],
  renderOrder: number,
  style: Record<string, unknown>,
): LayerDefinition {
  return {
    id,
    name: id,
    resourceId,
    visible: true,
    sortOrder: renderOrder,
    renderOrder,
    type,
    style,
  } as LayerDefinition
}

/** ????????? */
function createBundle(
  sources: ServiceSourceDefinition[],
  resources: ResourceDefinition[],
  layers: LayerDefinition[],
): LayerSchemeBundle {
  return {
    scheme: {
      id: "scheme-test",
      name: "scheme",
      sortOrder: 1,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers,
    },
    resources,
    sources,
  }
}

/** ??????? */
function pick(value: unknown, keys: string[]) {
  assert.ok(typeof value === "object" && value !== null)
  return Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]))
}
