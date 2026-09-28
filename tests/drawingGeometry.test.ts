import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import type { MapDrawCoordinate, MapDrawGeometry } from "../src/map/types.js"
import {
  computeCircle,
  computeEllipse,
  computeResizedCircle,
  computeResizedEllipse,
  computeResizedRectangle,
  destinationPoint,
  moveVertex,
  parseVertexIndex,
  screenDistance,
  translateGeometry,
} from "../src/map/engines/cesium/drawing/geometry.js"

const origin: MapDrawCoordinate = { longitude: 108.3, latitude: 22.8, height: 12 }

test("drawing geometry 解析顶点序号并计算屏幕距离", () => {
  assert.equal(parseVertexIndex("vertex-12"), 12)
  assert.equal(parseVertexIndex("translate"), -1)
  assert.equal(screenDistance(new Cesium.Cartesian2(0, 0), new Cesium.Cartesian2(3, 4)), 5)
})

test("drawing geometry 按方位角与距离计算球面终点", () => {
  const north = destinationPoint(origin, 100_000, 0)
  const east = destinationPoint(origin, 100_000, 90)

  assert.equal(north.height, origin.height)
  assert.ok(Math.abs(north.latitude - origin.latitude) > 0.8)
  assert.ok(Math.abs(north.longitude - origin.longitude) < 0.01)
  assert.ok(Math.abs(east.longitude - origin.longitude) > 0.9)
  assert.ok(Math.abs(east.latitude - origin.latitude) < 0.01)
})

test("drawing geometry 整体平移全部几何类型", () => {
  const geometry: MapDrawGeometry = {
    type: "buffer",
    source: { type: "point", coordinate: origin },
    distanceMeters: 80,
    polygon: [origin, destinationPoint(origin, 80, 90)],
  }

  const moved = translateGeometry(geometry, 0.2, -0.1)

  assert.equal(moved.type, "buffer")
  if (moved.type !== "buffer") return
  assert.equal(moved.source.type, "point")
  if (moved.source.type !== "point") return
  assert.equal(moved.source.coordinate.longitude, origin.longitude + 0.2)
  assert.equal(moved.source.coordinate.latitude, origin.latitude - 0.1)
  assert.equal(moved.polygon[0]?.height, origin.height)
})

test("drawing geometry 顶点越界和不可编辑几何返回空", () => {
  const geometry: MapDrawGeometry = {
    type: "polyline",
    coordinates: [origin, destinationPoint(origin, 500, 90)],
  }

  assert.equal(moveVertex(geometry, 2, origin), null)
  assert.equal(moveVertex({ type: "point", coordinate: origin }, 0, origin), null)
})

test("drawing geometry 拖拽角点后矩形边界自动归一", () => {
  const geometry: MapDrawGeometry = {
    type: "rectangle",
    southwest: origin,
    northeast: { longitude: 109.3, latitude: 23.8, height: 12 },
  }

  const resized = computeResizedRectangle(geometry, "sw", {
    longitude: 107.8,
    latitude: 24.2,
    height: 99,
  })

  assert.deepEqual(resized, {
    type: "rectangle",
    southwest: { longitude: 107.8, latitude: 22.8, height: 12 },
    northeast: { longitude: 109.3, latitude: 24.2, height: 12 },
  })
})

test("drawing geometry 圆形与椭圆半径编辑有下限", () => {
  const circle: MapDrawGeometry = { type: "circle", center: origin, radiusMeters: 500 }
  const tiny = computeResizedCircle(circle, origin)
  if (tiny?.type !== "circle") throw new Error("应返回 circle 几何")
  assert.equal(tiny.radiusMeters, 1)

  const ellipse: MapDrawGeometry = {
    type: "ellipse",
    center: origin,
    semiMajorMeters: 800,
    semiMinorMeters: 300,
    rotationDegrees: 30,
  }
  const east = destinationPoint(origin, 1_000, 90)
  const resized = computeResizedEllipse(ellipse, "semiMajor", east)
  if (resized?.type !== "ellipse") throw new Error("应返回 ellipse 几何")
  assert.ok(Math.abs(resized.semiMajorMeters - 1_000) < 5)
  assert.ok(Math.abs(resized.rotationDegrees) < 0.01)
})

test("drawing geometry 根据拖拽起止点计算圆和椭圆", () => {
  const end = destinationPoint(origin, 2_000, 45)
  const circle = computeCircle(origin, end)
  const ellipse = computeEllipse(origin, end)

  if (circle.type !== "circle") throw new Error("应返回 circle 几何")
  assert.equal(circle.center, origin)
  assert.ok(Math.abs(circle.radiusMeters - 2_000) < 10)
  assert.equal(ellipse.type, "ellipse")
  if (ellipse.type !== "ellipse") return
  assert.ok(Math.abs(ellipse.semiMajorMeters - 2_000) < 10)
  assert.ok(Math.abs(ellipse.semiMinorMeters - 1_000) < 5)
  assert.ok(Math.abs(ellipse.rotationDegrees - 45) < 0.01)
})
