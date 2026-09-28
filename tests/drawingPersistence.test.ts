import assert from "node:assert/strict"
import { test } from "node:test"
import {
  restoreDrawing3DFeatures,
  restoreDrawingFeatures,
  serializeDrawing3DFeatures,
  serializeDrawingFeatures,
} from "../src/map/drawingPersistence.js"
import type { MapDraw3DFeature, MapDrawFeature } from "../src/map/types.js"

test("二维绘制成果序列化会复制嵌套几何", () => {
  const feature = createDrawingFeature({
    type: "buffer",
    source: { type: "point", coordinate: createCoordinate() },
    distanceMeters: 500,
    polygon: [createCoordinate(), createCoordinate(109, 22), createCoordinate(108, 23)],
  })

  const [serialized] = serializeDrawingFeatures([feature])
  assert.ok(serialized)
  assert.notEqual(serialized.geometry, feature.geometry)

  const geometry = serialized.geometry as Extract<typeof serialized.geometry, { type: "buffer" }>
  assert.notEqual(
    geometry.source,
    feature.geometry.type === "buffer" ? feature.geometry.source : undefined,
  )
  assert.notEqual(
    geometry.polygon[0],
    feature.geometry.type === "buffer" ? feature.geometry.polygon[0] : undefined,
  )
  assert.deepEqual(serialized, feature)
})

test("二维绘制恢复支持旧 schema 并丢弃非法数据", () => {
  const restored = restoreDrawingFeatures([
    {
      id: "legacy-point",
      name: "旧点",
      type: "point",
      coordinates: [{ longitude: 108, latitude: 22, height: 0 }],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    { id: "invalid", type: "point" },
  ])

  assert.equal(restored.length, 1)
  assert.deepEqual(restored[0], {
    id: "legacy-point",
    name: "旧点",
    type: "point",
    geometry: { type: "point", coordinate: { longitude: 108, latitude: 22, height: 0 } },
    createdAt: "2026-01-01T00:00:00.000Z",
  })
})

test("三维绘制成果序列化会复制样式数组", () => {
  const feature = createDrawing3DFeature({
    form: "point",
    coordinate: { longitude: 108, latitude: 22, height: 20 },
  })

  const [serialized] = serializeDrawing3DFeatures([feature])
  assert.ok(serialized)
  assert.notEqual(serialized.style, feature.style)
  assert.notEqual(serialized.style.dimensions, feature.style.dimensions)
  assert.notEqual(serialized.style.shape, feature.style.shape)
  assert.notEqual(serialized.style.shape?.[0], feature.style.shape?.[0])
  assert.deepEqual(serialized, feature)
})

test("三维绘制恢复丢弃非法成果", () => {
  assert.deepEqual(
    restoreDrawing3DFeatures([
      {
        id: "invalid",
        name: "无效",
        type: "box",
        geometry: { form: "line", coordinates: [] },
        style: {},
        createdAt: "",
      },
    ]),
    [],
  )
})

/** 创建测试坐标。 */
function createCoordinate(longitude = 108, latitude = 22) {
  return { longitude, latitude, height: 0 }
}

/** 创建二维缓冲区测试成果。 */
function createDrawingFeature(geometry: MapDrawFeature["geometry"]): MapDrawFeature {
  return {
    id: "drawing-buffer",
    name: "缓冲区",
    type: geometry.type,
    geometry,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

/** 创建三维长方体测试成果。 */
function createDrawing3DFeature(geometry: MapDraw3DFeature["geometry"]): MapDraw3DFeature {
  return {
    id: "drawing-box",
    name: "长方体",
    type: "box",
    geometry,
    style: {
      color: "#00e5ff",
      dimensions: [80, 80, 80],
      shape: [
        { x: -40, y: -40 },
        { x: 40, y: -40 },
        { x: 40, y: 40 },
      ],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}
