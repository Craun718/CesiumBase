import assert from "node:assert/strict"
import { test } from "node:test"
import type { MapDrawCoordinate, MapDrawGeometry } from "../src/map/types.js"
import {
  computeEditedGeometry,
  computeHandlePlacements,
} from "../src/map/engines/cesium/drawing/handles.js"
import type { EditingDraft } from "../src/map/engines/cesium/drawing/types.js"

test("drawing handles 按几何类型生成编辑把手", () => {
  const point = computeHandlePlacements({ type: "point", coordinate: createCoord(0, 0) })
  const rectangle = computeHandlePlacements({
    type: "rectangle",
    southwest: createCoord(108, 22),
    northeast: createCoord(109, 23),
  })

  assert.deepEqual(point, [{ handleId: "translate", position: createCoord(0, 0) }])
  assert.deepEqual(
    rectangle.map((placement) => placement.handleId),
    ["sw", "se", "ne", "nw", "translate"],
  )
})

test("drawing handles 平移几何时以起始坐标计算增量", () => {
  const start: MapDrawGeometry = {
    type: "polyline",
    coordinates: [createCoord(108, 22), createCoord(109, 22)],
  }
  const draft = createDraft("translate", "translate")

  const moved = computeEditedGeometry(draft, start, createCoord(108.3, 22.2), () => [])

  assert.deepEqual(moved, {
    type: "polyline",
    coordinates: [createCoord(108.3, 22.2), createCoord(109.3, 22.2)],
  })
})

test("drawing handles 将顶点拖拽分派到对应索引", () => {
  const start: MapDrawGeometry = {
    type: "polygon",
    coordinates: [createCoord(108, 22), createCoord(109, 22), createCoord(109, 23)],
  }

  const moved = computeEditedGeometry(
    createDraft("resize", "vertex-1"),
    start,
    createCoord(108.5, 22.5),
    () => [],
  )

  if (moved?.type !== "polygon") throw new Error("应返回 polygon 几何")
  assert.deepEqual(moved.coordinates[1], createCoord(108.5, 22.5))
})

test("drawing handles 用当前把手偏移重算缓冲区距离", () => {
  const start: MapDrawGeometry = {
    type: "buffer",
    source: { type: "point", coordinate: createCoord(108, 22) },
    distanceMeters: 100,
    polygon: [createCoord(108, 22), createCoord(108.001, 22), createCoord(108, 22.001)],
  }
  const draft = { ...createDraft("resize", "distance"), startDistanceHandleOffsetMeters: 40 }
  let receivedDistance = 0

  const next = computeEditedGeometry(
    draft,
    start,
    createCoord(108, 22.001),
    (_coords, distance) => {
      receivedDistance = distance
      return [createCoord(108, 22), createCoord(108.002, 22), createCoord(108, 22.002)]
    },
  )

  if (next?.type !== "buffer") throw new Error("应返回 buffer 几何")
  assert.ok(Math.abs(receivedDistance - 151) < 1)
  assert.equal(next.distanceMeters, receivedDistance)
})

/** 创建编辑分派所需的最小草稿状态。 */
function createDraft(kind: "translate" | "resize", handleId: string) {
  return {
    kind,
    handleId,
    startCoordinate: createCoord(108, 22),
    startDistanceHandleOffsetMeters: 0,
  } satisfies Pick<
    EditingDraft,
    "kind" | "handleId" | "startCoordinate" | "startDistanceHandleOffsetMeters"
  >
}

/** 创建测试坐标。 */
function createCoord(longitude: number, latitude: number): MapDrawCoordinate {
  return { longitude, latitude, height: 10 }
}
