import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import {
  CesiumLayerOperationController,
  addFallbackTiandituLayers,
  applyModelOpacity,
  createModelPlacementMatrix,
  createTiandituImageryLayers,
  createTilesetOpacityStyle,
  createWmsImageryProvider,
  createWmtsImageryProvider,
  normalizeTiandituSubdomains,
  normalizeSwipeCompareOptions,
  createXyzImageryProvider,
} from "../src/map/engines/cesium/layerOperations.js"
import type { SceneModelLayerDescriptor } from "../src/map/types.js"

const bounds = { west: 109, south: 23, east: 110, north: 24 }

test("createXyzImageryProvider 应用坐标系和资源范围", () => {
  const provider = createXyzImageryProvider({
    id: "layer-xyz",
    protocol: "xyz",
    urlTemplate: "https://example.com/{z}/{x}/{y}.png",
    tilingScheme: "geographic",
    bounds,
    visible: true,
    renderOrder: 10,
    opacity: 1,
  })

  assert.ok(provider instanceof Cesium.UrlTemplateImageryProvider)
  assert.ok(provider.tilingScheme instanceof Cesium.GeographicTilingScheme)
  assert.equal(provider.rectangle.west, Cesium.Math.toRadians(bounds.west))
  assert.equal(provider.rectangle.east, Cesium.Math.toRadians(bounds.east))
})

test("Tianditu imagery falls back to default subdomains when empty", () => {
  assert.deepEqual(normalizeTiandituSubdomains([]), ["0", "1", "2", "3", "4", "5", "6", "7"])
  assert.deepEqual(normalizeTiandituSubdomains(["a"]), ["a"])
})

test("createTiandituImageryLayers 创建影像与注记兜底底图", () => {
  const layers = createTiandituImageryLayers({
    id: "fallback-tianditu",
    protocol: "tianditu",
    mapType: "imagery",
    token: "test-token",
    visible: true,
    renderOrder: 0,
    opacity: 1,
  })

  assert.equal(layers.length, 2)
  assert.ok(layers[0]?.layer instanceof Cesium.ImageryLayer)
  assert.ok(layers[1]?.layer instanceof Cesium.ImageryLayer)
  assert.equal(layers[0]?.renderOrder, 0)
  assert.equal(layers[1]?.renderOrder, 100_000)
  const baseProvider = layers[0]?.layer.imageryProvider
  const annotationProvider = layers[1]?.layer.imageryProvider
  assert.ok(baseProvider instanceof Cesium.UrlTemplateImageryProvider)
  assert.ok(annotationProvider instanceof Cesium.UrlTemplateImageryProvider)
  assert.match(baseProvider.url, /LAYER=img/)
  assert.match(annotationProvider.url, /LAYER=cia/)
})

test("addFallbackTiandituLayers 仅在配置 Key 时注入启动底图", () => {
  const layers: Cesium.ImageryLayer[] = []
  const viewer = {
    imageryLayers: {
      add: (layer: Cesium.ImageryLayer) => layers.push(layer),
    },
  } as unknown as Cesium.Viewer

  addFallbackTiandituLayers(viewer)
  assert.equal(layers.length, 0)

  addFallbackTiandituLayers(viewer, "test-token")
  assert.equal(layers.length, 2)
})

test("normalizeSwipeCompareOptions 钳制分割线位置", () => {
  const options = normalizeSwipeCompareOptions({
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    splitPosition: 1.4,
    showDivider: true,
  })

  assert.deepEqual(options, {
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    splitPosition: 1,
    showDivider: true,
  })
})

test("setSwipeCompare 对托管影像层应用左右方向", async () => {
  const controller = new CesiumLayerOperationController()
  const { viewer, layers } = createSwipeImageryViewer()

  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-left"))
  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-right"))
  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-other"))
  controller.setSwipeCompare(viewer, {
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    splitPosition: 0.38,
    showDivider: true,
  })

  assert.equal(layers[0]?.splitDirection, Cesium.SplitDirection.LEFT)
  assert.equal(layers[1]?.splitDirection, Cesium.SplitDirection.RIGHT)
  assert.equal(layers[2]?.splitDirection, Cesium.SplitDirection.NONE)
  assert.equal(viewer.scene.splitPosition, 0.38)

  controller.setSwipeCompare(viewer, {
    enabled: false,
    splitPosition: 0.38,
    showDivider: false,
  })

  assert.deepEqual(
    layers.map((layer) => layer.splitDirection),
    [Cesium.SplitDirection.NONE, Cesium.SplitDirection.NONE, Cesium.SplitDirection.NONE],
  )
})

test("setSwipeCompare 支持底图兜底且拖拽时只更新分割位置", async () => {
  const controller = new CesiumLayerOperationController()
  const { viewer, layers } = createSwipeImageryViewer()

  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-left"))
  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-right"))
  await controller.addImageryLayer(viewer, createSwipeImageryDescriptor("layer-base"))

  const directionWrites = layers.map((layer) => {
    let writes = 0
    let direction = layer.splitDirection
    Object.defineProperty(layer, "splitDirection", {
      configurable: true,
      get: () => direction,
      set: (next: typeof direction) => {
        writes += 1
        direction = next
      },
    })
    return () => writes
  })

  controller.setSwipeCompare(viewer, {
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    baseLayerId: "layer-base",
    splitPosition: 0.4,
    showDivider: true,
  })
  assert.deepEqual(
    layers.map((layer) => layer.splitDirection),
    [Cesium.SplitDirection.LEFT, Cesium.SplitDirection.RIGHT, Cesium.SplitDirection.NONE],
  )
  assert.deepEqual(
    directionWrites.map((read) => read()),
    [1, 1, 1],
  )

  controller.setSwipeCompare(viewer, {
    enabled: true,
    leftLayerId: "layer-left",
    rightLayerId: "layer-right",
    baseLayerId: "layer-base",
    splitPosition: 0.72,
    showDivider: true,
  })
  assert.equal(viewer.scene.splitPosition, 0.72)
  assert.deepEqual(
    directionWrites.map((read) => read()),
    [1, 1, 1],
  )
})

test("createWmsImageryProvider 创建 WMS Provider 并应用范围", () => {
  const provider = createWmsImageryProvider({
    id: "layer-wms",
    protocol: "wms",
    baseUrl: "https://example.com/geoserver/wms",
    layers: "test:imagery",
    version: "1.3.0",
    format: "image/png",
    bounds,
    visible: true,
    renderOrder: 10,
    opacity: 1,
  })

  assert.ok(provider instanceof Cesium.WebMapServiceImageryProvider)
  assert.equal(provider.layers, "test:imagery")
  assert.ok(provider.rectangle.west <= Cesium.Math.toRadians(bounds.west))
  assert.ok(provider.rectangle.east >= Cesium.Math.toRadians(bounds.east))
})

test("createWmtsImageryProvider 创建 KVP WMTS Provider", () => {
  const provider = createWmtsImageryProvider({
    id: "layer-wmts",
    protocol: "wmts",
    baseUrl: "https://example.com/geoserver/gwc/service/wmts",
    layer: "test:imagery",
    style: "default",
    tileMatrixSet: "EPSG:900913",
    format: "image/png",
    bounds,
    visible: true,
    renderOrder: 10,
    opacity: 1,
  })

  assert.ok(provider instanceof Cesium.WebMapTileServiceImageryProvider)
  assert.ok(provider.tilingScheme instanceof Cesium.WebMercatorTilingScheme)
  assert.match(provider.url, /service=WMTS/)
  assert.match(provider.url, /layer=test%3Aimagery/)
  assert.match(provider.url, /tilematrixset=EPSG%3A900913/)
})

test("createModelPlacementMatrix 使用资源中心和高程摆放模型", () => {
  const descriptor: SceneModelLayerDescriptor = {
    id: "layer-model",
    url: "https://example.com/model.glb",
    bounds,
    height: 25,
    visible: true,
    renderOrder: 10,
    opacity: 1,
  }
  const expected = Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(109.5, 23.5, 25),
  )

  assert.ok(Cesium.Matrix4.equals(createModelPlacementMatrix(descriptor), expected))
})

test("createTilesetOpacityStyle 使用白色 Alpha 表达透明度", () => {
  const style = createTilesetOpacityStyle(0.35)
  const color = style.color?.evaluateColor(
    undefined as unknown as Cesium.Cesium3DTileFeature,
    new Cesium.Color(),
  )

  assert.equal(color?.red, 1)
  assert.equal(color?.green, 1)
  assert.equal(color?.blue, 1)
  assert.equal(color?.alpha, 0.35)
})

test("applyModelOpacity 更新模型颜色混合", () => {
  const model = {
    color: Cesium.Color.RED.clone(),
    colorBlendMode: undefined,
  } as unknown as Cesium.Model

  applyModelOpacity(model, 0.4)

  assert.equal(model.color.red, 1)
  assert.equal(model.color.green, 1)
  assert.equal(model.color.blue, 1)
  assert.equal(model.color.alpha, 0.4)
  assert.equal(model.colorBlendMode, Cesium.ColorBlendMode.HIGHLIGHT)
})

test("矢量政区边界转换为贴地闭合 polyline 并关闭 polygon 轮廓", async () => {
  const dataSources: Cesium.GeoJsonDataSource[] = []
  const viewer = {
    dataSources: {
      add: (dataSource: Cesium.GeoJsonDataSource) => dataSources.push(dataSource),
      remove: () => undefined,
    },
  } as unknown as Cesium.Viewer
  const controller = new CesiumLayerOperationController()

  await controller.addVectorLayer(viewer, {
    id: "layer-region",
    source: "inline",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [109, 23],
                [110, 23],
                [110, 24],
                [109, 24],
                [109, 23],
              ],
              [
                [109.2, 23.2],
                [109.8, 23.2],
                [109.5, 23.8],
                [109.2, 23.2],
              ],
            ],
          },
        },
      ],
    },
    visible: true,
    renderOrder: 4,
    style: {
      fillOpacity: 0,
      strokeColor: "#eab308",
      strokeOpacity: 1,
      strokeWidth: 4,
      outlineAsPolyline: true,
      zIndex: 4,
    },
  } as Parameters<CesiumLayerOperationController["addVectorLayer"]>[1])

  const entities = [...(dataSources[0]?.entities.values ?? [])]
  const polylines = entities.flatMap((entity) => (entity.polyline ? [entity.polyline] : []))
  const polygon = entities[0]?.polygon
  const now = Cesium.JulianDate.now()

  assert.equal(polylines.length, 2)
  assert.equal(polygon?.outline?.getValue(now), false)
  const boundary = polylines[0]
  assert.ok(boundary)
  assert.deepEqual(
    polylines.map((polyline) => polyline.positions?.getValue(now).length),
    [5, 4],
  )
  assert.equal(polylines[0]?.clampToGround?.getValue(now), true)
  assert.equal(polylines[0]?.width?.getValue(now), 4)
  assert.equal(polylines[0]?.zIndex?.getValue(now), 4)
  const boundaryMaterial = boundary.material?.getValue(now) as { color: Cesium.Color } | undefined
  assert.ok(boundaryMaterial)
  assert.ok(
    Cesium.Color.equals(
      boundaryMaterial.color,
      Cesium.Color.fromCssColorString("#eab308").withAlpha(1),
    ),
  )
})

test("updateVectorLayer 切换边界渲染时重建 polyline", async () => {
  const dataSources: Cesium.GeoJsonDataSource[] = []
  const viewer = {
    dataSources: {
      add: (dataSource: Cesium.GeoJsonDataSource) => dataSources.push(dataSource),
      remove: () => undefined,
    },
  } as unknown as Cesium.Viewer
  const controller = new CesiumLayerOperationController()
  const baseStyle = {
    fillOpacity: 0,
    strokeColor: "#eab308",
    strokeOpacity: 1,
    strokeWidth: 4,
    zIndex: 4,
  }

  await controller.addVectorLayer(viewer, {
    id: "layer-region-update",
    source: "inline",
    data: createPolygonFeatureCollection(),
    visible: true,
    renderOrder: 4,
    style: { ...baseStyle, outlineAsPolyline: false },
  })

  assert.equal(getPolylineCount(dataSources[0]), 0)

  controller.updateVectorLayer(viewer, "layer-region-update", {
    style: { ...baseStyle, outlineAsPolyline: true },
  })

  assert.equal(getPolylineCount(dataSources[0]), 2)

  controller.updateVectorLayer(viewer, "layer-region-update", {
    style: { ...baseStyle, outlineAsPolyline: false },
  })

  assert.equal(getPolylineCount(dataSources[0]), 0)
  assert.equal(
    [...(dataSources[0]?.entities.values ?? [])][0]?.polygon?.outline?.getValue(
      Cesium.JulianDate.now(),
    ),
    true,
  )
})

/** 构造带洞政区面测试数据。 */
function createPolygonFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [109, 23],
              [110, 23],
              [110, 24],
              [109, 24],
              [109, 23],
            ],
            [
              [109.2, 23.2],
              [109.8, 23.2],
              [109.5, 23.8],
              [109.2, 23.2],
            ],
          ],
        },
      },
    ],
  }
}

/** 构造可观察影像层加入行为的 Cesium Viewer 桩。 */
function createSwipeImageryViewer() {
  const layers: Cesium.ImageryLayer[] = []
  const viewer = {
    imageryLayers: {
      add: (layer: Cesium.ImageryLayer) => layers.push(layer),
      remove: () => undefined,
      contains: (layer: Cesium.ImageryLayer) => layers.includes(layer),
    },
    scene: {
      splitPosition: 0.5,
    },
  } as unknown as Cesium.Viewer

  return { viewer, layers }
}

/** 创建卷帘测试用 XYZ 图层描述。 */
function createSwipeImageryDescriptor(id: string) {
  return {
    id,
    protocol: "xyz",
    urlTemplate: `https://example.com/${id}/{z}/{x}/{y}.png`,
    visible: true,
    renderOrder: 10,
    opacity: 1,
  } as const
}

/** 统计数据源中的 polyline 实体数量。 */
function getPolylineCount(dataSource: Cesium.GeoJsonDataSource | undefined) {
  return [...(dataSource?.entities.values ?? [])].filter((entity) => entity.polyline).length
}
