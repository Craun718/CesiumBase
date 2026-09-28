import assert from "node:assert/strict"
import { test } from "node:test"
import * as Cesium from "cesium"
import { configureScene, setSceneMode } from "../src/map/engines/cesium/sceneOperations.js"

test("configureScene 按渲染配置区分主视口与分屏辅助视口", () => {
  const primary = createViewerStub()
  const secondary = createViewerStub()

  configureScene(primary.viewer, "primary")
  configureScene(secondary.viewer, "secondary")

  assertSceneSettings(primary, {
    maximumScreenSpaceError: 2.5,
    tileCacheSize: 300,
    showGroundAtmosphere: true,
    showSkyAtmosphere: true,
    fogEnabled: true,
  })
  assertSceneSettings(secondary, {
    maximumScreenSpaceError: 4,
    tileCacheSize: 100,
    showGroundAtmosphere: false,
    showSkyAtmosphere: false,
    fogEnabled: false,
  })
})

test("立即切换 2D 时取消旧飞行且不启动新的过渡飞行", () => {
  const { viewer, camera } = createViewerStub()

  setSceneMode(viewer, "2d", { immediate: true })

  assert.equal(camera.cancelFlightCount, 1)
  assert.equal(camera.flyToCount, 0)
  assert.equal(viewer.scene.mode, Cesium.SceneMode.SCENE2D)
})

interface SceneSettings {
  readonly maximumScreenSpaceError: number
  readonly tileCacheSize: number
  readonly showGroundAtmosphere: boolean
  readonly showSkyAtmosphere: boolean
  readonly fogEnabled: boolean
}

function assertSceneSettings(target: ReturnType<typeof createViewerStub>, expected: SceneSettings) {
  assert.equal(target.globe.maximumScreenSpaceError, expected.maximumScreenSpaceError)
  assert.equal(target.globe.tileCacheSize, expected.tileCacheSize)
  assert.equal(target.globe.showGroundAtmosphere, expected.showGroundAtmosphere)
  assert.equal(target.skyAtmosphere.show, expected.showSkyAtmosphere)
  assert.equal(target.fog.enabled, expected.fogEnabled)
}

/** 创建覆盖场景配置所需的最小 Viewer 结构。 */
function createViewerStub() {
  const globe = {
    baseColor: undefined,
    showGroundAtmosphere: undefined,
    maximumScreenSpaceError: undefined,
    tileCacheSize: undefined,
  }
  const skyAtmosphere = { show: undefined }
  const fog = { enabled: undefined }
  const camera = {
    cancelFlightCount: 0,
    flyToCount: 0,
    cancelFlight() {
      this.cancelFlightCount += 1
    },
    flyTo() {
      this.flyToCount += 1
    },
  }
  const scene = {
    mode: "3d",
    preUpdate: {
      addEventListener: () => () => undefined,
    },
    backgroundColor: undefined,
    globe,
    skyAtmosphere,
    skyBox: { show: undefined },
    sun: { show: undefined },
    moon: { show: undefined },
    fog,
    screenSpaceCameraController: {
      zoomEventTypes: [],
      tiltEventTypes: [],
      minimumZoomDistance: undefined,
      maximumZoomDistance: undefined,
    },
  }
  const viewer = {
    scene,
    camera,
    canvas: { clientWidth: 800, clientHeight: 600 },
  } as unknown as Cesium.Viewer

  return { viewer, globe, skyAtmosphere, fog, camera }
}

test("setSceneMode 返回 3D 时使用 Cesium 模式迁移", () => {
  let morphTo3DDuration: number | undefined
  const viewer = {
    camera: {
      cancelFlight: () => {},
    },
    scene: {
      mode: Cesium.SceneMode.SCENE2D,
      morphTo3D: (duration: number) => {
        morphTo3DDuration = duration
      },
    },
  } as unknown as Cesium.Viewer

  setSceneMode(viewer, "3d")

  assert.equal(morphTo3DDuration, 0)
})
