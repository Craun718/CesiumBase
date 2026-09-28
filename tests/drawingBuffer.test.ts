import assert from "node:assert/strict"
import { test } from "node:test"
import type { MapDrawCoordinate } from "../src/map/types.js"
import {
  geometryToBufferSource,
  sourcePositions,
} from "../src/map/engines/cesium/drawing/bufferSource.js"

test("drawing buffer 将矩形几何转换为闭合缓冲源", () => {
  const source = geometryToBufferSource({
    type: "rectangle",
    southwest: createCoord(108, 22, 8),
    northeast: createCoord(109, 23, 8),
  })

  if (source?.type !== "polygon") throw new Error("矩形应转换为 polygon 缓冲源")
  assert.equal(source.coordinates.length, 4)
  assert.deepEqual(sourcePositions(source), source.coordinates)
})

test("drawing buffer 点缓冲源返回单元素坐标序列", () => {
  const coordinate = createCoord(108, 22)
  const source = geometryToBufferSource({ type: "point", coordinate })

  if (source?.type !== "point") throw new Error("点应转换为 point 缓冲源")
  assert.deepEqual(sourcePositions(source), [coordinate])
})

/** 创建测试坐标。 */
function createCoord(longitude: number, latitude: number, height = 0): MapDrawCoordinate {
  return { longitude, latitude, height }
}
