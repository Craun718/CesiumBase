import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import {
  calculateViewportDistance,
  flyToBounds,
  getViewportState,
  normalizeViewportHeading,
} from "../src/map/engines/cesium/cameraOperations.js"

test("flyToBounds 在相机飞行完成时返回 true", async () => {
  let complete: (() => void) | undefined
  const viewer = {
    camera: {
      flyTo: (options: { complete?: () => void }) => {
        complete = options.complete
      },
    },
  } as unknown as Cesium.Viewer

  const result = flyToBounds(viewer, { west: 109, south: 23, east: 110, north: 24 })
  assert.ok(Promise.resolve(result) instanceof Promise)

  complete?.()
  await assert.equal(await result, true)
})

test("视口朝向和距离辅助函数处理边界值", () => {
  assert.equal(normalizeViewportHeading(-10), 350)
  assert.equal(normalizeViewportHeading(370), 10)
  assert.equal(normalizeViewportHeading(720), 0)
  assert.equal(calculateViewportDistance({ x: 0, y: 0, z: 3 }, { x: 3, y: 4, z: 3 }), 5)
  assert.equal(calculateViewportDistance({ x: Number.NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), 0)
})

test("分屏同步状态在相机围绕屏幕中心倾斜时保持稳定", () => {
  const topDown = getViewportState(createViewportStateViewer(0, 5_000))
  const tilted = getViewportState(createViewportStateViewer(4_000, 3_000))

  assert.ok(Math.abs(tilted.longitude - topDown.longitude) < 1e-9)
  assert.ok(Math.abs(tilted.latitude - topDown.latitude) < 1e-9)
  assert.ok(Math.abs(tilted.distanceMeters - topDown.distanceMeters) < 1e-6)
  assert.equal(tilted.heading, topDown.heading)
})

/** 构造围绕同一屏幕中心倾斜的相机，east/up 单位为米。 */
function createViewportStateViewer(eastOffset: number, upOffset: number) {
  const groundPosition = Cesium.Cartesian3.fromDegrees(109, 24, 0)
  const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(groundPosition)
  const east = Cesium.Matrix4.multiplyByPointAsVector(
    enuFrame,
    Cesium.Cartesian3.UNIT_X,
    new Cesium.Cartesian3(),
  )
  const up = Cesium.Matrix4.multiplyByPointAsVector(
    enuFrame,
    Cesium.Cartesian3.UNIT_Z,
    new Cesium.Cartesian3(),
  )
  const cameraPosition = Cesium.Cartesian3.add(
    groundPosition,
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(east, eastOffset, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(up, upOffset, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  )
  const viewer = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    camera: {
      positionWC: cameraPosition,
      positionCartographic: Cesium.Cartographic.fromCartesian(cameraPosition),
      heading: 0,
      getPickRay: () => ({}) as Cesium.Ray,
    },
    scene: {
      globe: {
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: () => groundPosition,
      },
    },
  } as unknown as Cesium.Viewer

  return viewer
}
