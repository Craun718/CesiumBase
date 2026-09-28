import assert from "node:assert/strict"
import { test } from "node:test"
import type { MapDrawFeature, MapDrawGeometry } from "../src/map/types.js"
import { DrawingFeatureStore } from "../src/map/engines/cesium/drawing/featureStore.js"

test("drawing feature store 创建连续 id 与中文名称", () => {
  const store = new DrawingFeatureStore()
  const geometry: MapDrawGeometry = { type: "point", coordinate: createCoord() }
  const first = store.create("point", geometry)
  const second = store.create("point", geometry)

  assert.equal(first.name, "绘制点 001")
  assert.equal(second.name, "绘制点 002")
  assert.equal(first.id, "map-draw-point-1")
  assert.equal(second.id, "map-draw-point-2")
})

test("drawing feature store 更新几何并校验重命名", () => {
  const store = new DrawingFeatureStore()
  const feature = store.create("polyline", {
    type: "polyline",
    coordinates: [createCoord(), createCoord(109, 23)],
  })
  store.set(feature)

  store.setGeometry(feature.id, {
    type: "polyline",
    coordinates: [createCoord(), createCoord(108.5, 22.5)],
  })
  const renamed = store.rename(feature.id, "  自定义折线  ")

  const updated = store.get(feature.id)
  assert.ok(updated)
  assert.equal(updated.geometry.type, "polyline")
  if (updated.geometry.type !== "polyline") return
  assert.equal(updated.geometry.coordinates.length, 2)
  assert.equal(updated.geometry.coordinates[1]?.longitude, 108.5)
  assert.equal(renamed?.name, "自定义折线")
  assert.equal(store.rename(feature.id, "   "), undefined)
})

test("drawing feature store 恢复时跳过无效与重复成果并同步序号", () => {
  const store = new DrawingFeatureStore()
  const valid = createFeature("map-draw-circle-7", "绘制圆 007", {
    type: "circle",
    center: createCoord(),
    radiusMeters: 500,
  })
  const invalid = createFeature("map-draw-buffer-8", "绘制缓冲区 008", {
    type: "buffer",
    source: { type: "point", coordinate: createCoord() },
    distanceMeters: 0,
    polygon: [createCoord(), createCoord(109, 22), createCoord(108, 23)],
  })

  const restored = store.restore([valid, invalid, valid])

  assert.deepEqual(restored, [valid])
  assert.deepEqual(store.list(), [valid])
  const created = store.create("circle", valid.geometry)
  assert.equal(created.id, "map-draw-circle-8")
  assert.equal(created.name, "绘制圆 008")
})

/** 创建测试坐标。 */
function createCoord(longitude = 108, latitude = 22) {
  return { longitude, latitude, height: 0 }
}

/** 创建持久化绘制成果。 */
function createFeature(id: string, name: string, geometry: MapDrawGeometry): MapDrawFeature {
  return {
    id,
    name,
    type: geometry.type,
    geometry,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}
