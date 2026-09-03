import type * as Cesium from "cesium"
import type {
  CameraState,
  ImagerySource,
  MapCoordinate,
  MapEngine,
  MapBounds,
  SceneMode,
} from "../../types"
import { createViewer } from "./createViewer"
import {
  getCameraHeading,
  captureScreenshot,
  flyToCoordinate,
  flyToBounds,
  getCameraState,
  onCameraHeadingChange,
  onCameraStateChange,
  resetCameraNorth,
  setCameraHeading,
  setCameraState,
  setInitialCamera,
} from "./cameraOperations"
import {
  configureScene,
  setNorthLock,
  setRotateBrowse,
  setSceneMode,
  setTerrainExaggeration,
  setTerrainExaggerationScale,
} from "./sceneOperations"
import { addProvinceBoundaries } from "./provinceBoundaries"
import {
  applyCesiumCustomUrlSource,
  applyCesiumImagerySource,
  getCurrentCesiumImagerySourceId,
} from "./baseImagery"
import { listCesiumImagerySources } from "./imagerySources"

export class CesiumMapEngine implements MapEngine {
  private viewer?: Cesium.Viewer

  async mount(container: HTMLElement) {
    if (this.viewer) return

    const viewer = await createViewer(container)
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

  flyToCoordinate(coordinate: MapCoordinate) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToCoordinate(viewer, coordinate)
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

  getCameraHeading() {
    const viewer = this.getActiveViewer()

    return viewer ? getCameraHeading(viewer) : 0
  }

  setCameraHeading(heading: number) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setCameraHeading(viewer, heading)
    }
  }

  resetCameraNorth() {
    const viewer = this.getActiveViewer()

    if (viewer) {
      resetCameraNorth(viewer)
    }
  }

  onCameraHeadingChange(listener: (heading: number) => void) {
    const viewer = this.getActiveViewer()

    return viewer ? onCameraHeadingChange(viewer, listener) : () => {}
  }

  getCameraState(): CameraState {
    const viewer = this.getActiveViewer()

    return viewer
      ? getCameraState(viewer)
      : { longitude: 108.25, latitude: 23.7, height: 700_000, heading: 0, pitch: -90 }
  }

  setCameraState(state: Partial<Omit<CameraState, "longitude" | "latitude">>) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setCameraState(viewer, state)
    }
  }

  onCameraStateChange(listener: (state: CameraState) => void) {
    const viewer = this.getActiveViewer()

    return viewer ? onCameraStateChange(viewer, listener) : () => {}
  }

  async toggleSceneFullscreen() {
    const container = this.getActiveViewer()?.container

    if (!container) return false

    if (document.fullscreenElement === container) {
      await document.exitFullscreen()
      return true
    }

    await container.requestFullscreen()
    return true
  }

  captureScreenshot() {
    const viewer = this.getActiveViewer()

    return viewer ? captureScreenshot(viewer) : undefined
  }

  listBaseImagerySources(): ImagerySource[] {
    return listCesiumImagerySources()
  }

  getBaseImagerySourceId(): string | undefined {
    const viewer = this.getActiveViewer()

    return viewer ? getCurrentCesiumImagerySourceId(viewer) : undefined
  }

  setBaseImagerySource(id: string): boolean {
    const viewer = this.getActiveViewer()

    return viewer ? applyCesiumImagerySource(viewer, id) : false
  }

  setCustomBaseImagerySource(url: string): boolean {
    const viewer = this.getActiveViewer()

    return viewer ? applyCesiumCustomUrlSource(viewer, url) : false
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
