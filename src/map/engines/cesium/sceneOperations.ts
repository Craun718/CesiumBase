import * as Cesium from "cesium"
import type { SceneMode } from "../../types"

export function configureScene(viewer: Cesium.Viewer) {
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030a18")
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#081b35")
  viewer.scene.globe.showGroundAtmosphere = true

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true
  }

  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false
  }

  if (viewer.scene.sun) {
    viewer.scene.sun.show = false
  }

  if (viewer.scene.moon) {
    viewer.scene.moon.show = false
  }

  viewer.scene.fog.enabled = true
}

export function setSceneMode(viewer: Cesium.Viewer, mode: SceneMode) {
  viewer.scene.mode = mode === "2d" ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D
}

export function setRotateBrowse(_viewer: Cesium.Viewer, _enabled: boolean) {}

export function setNorthLock(_viewer: Cesium.Viewer, _enabled: boolean) {}

export function setTerrainExaggeration(viewer: Cesium.Viewer, enabled: boolean, scale: number) {
  viewer.scene.verticalExaggeration = enabled ? Math.max(scale, 1) : 1
}

export function setTerrainExaggerationScale(viewer: Cesium.Viewer, scale: number) {
  viewer.scene.verticalExaggeration = Math.max(scale, 1)
}

export function setCompassVisible(_viewer: Cesium.Viewer, _visible: boolean) {}
