import type * as Cesium from "cesium"
import type { MapEngine, MapBounds, SceneMode } from "../../types"
import { createViewer } from "./createViewer"
import { flyToBounds, setInitialCamera } from "./cameraOperations"
import {
  configureScene,
  setCompassVisible,
  setNorthLock,
  setRotateBrowse,
  setSceneMode,
  setTerrainExaggeration,
  setTerrainExaggerationScale,
} from "./sceneOperations"
import { addProvinceBoundaries } from "./provinceBoundaries"

export class CesiumMapEngine implements MapEngine {
  private viewer?: Cesium.Viewer

  mount(container: HTMLElement) {
    if (this.viewer) return

    const viewer = createViewer(container)
    this.viewer = viewer

    configureScene(viewer)
    setInitialCamera(viewer)
    void addProvinceBoundaries(viewer)
  }

  unmount() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy()
    }

    this.viewer = undefined
  }

  flyToBounds(bounds: MapBounds) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToBounds(viewer, bounds)
    }
  }

  setSceneMode(mode: SceneMode) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setSceneMode(viewer, mode)
    }
  }

  setRotateBrowse(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setRotateBrowse(viewer, enabled)
    }
  }

  setNorthLock(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setNorthLock(viewer, enabled)
    }
  }

  setTerrainExaggeration(enabled: boolean, scale: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setTerrainExaggeration(viewer, enabled, scale)
    }
  }

  setTerrainExaggerationScale(scale: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setTerrainExaggerationScale(viewer, scale)
    }
  }

  setCompassVisible(visible: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setCompassVisible(viewer, visible)
    }
  }

  private getActiveViewer() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      return this.viewer
    }

    return undefined
  }
}

export function createCesiumMapEngine(): MapEngine {
  return new CesiumMapEngine()
}
