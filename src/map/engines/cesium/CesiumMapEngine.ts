import type * as Cesium from "cesium"
import type { ImagerySource, MapEngine, MapBounds, SceneMode } from "../../types"
import { createViewer } from "./createViewer"
import { flyToBounds, setInitialCamera } from "./cameraOperations"
import {
  configureScene,
  setNorthLock,
  setRotateBrowse,
  setSceneMode,
  setTerrainExaggeration,
  setTerrainExaggerationScale,
} from "./sceneOperations"
import {
  getCameraHeading,
  onCameraHeadingChange,
  resetCameraNorth,
  setCameraHeading,
} from "./cameraOperations"
import { addProvinceBoundaries } from "./provinceBoundaries"

export class CesiumMapEngine implements MapEngine {
  private viewer?: Cesium.Viewer

  private static readonly baseImagerySources: ImagerySource[] = [
    {
      id: "osm",
      label: "OpenStreetMap",
      description: "全球开源瓦片底图",
    },
  ]

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

  listBaseImagerySources() {
    return CesiumMapEngine.baseImagerySources
  }

  getBaseImagerySourceId() {
    return this.getActiveViewer() ? "osm" : undefined
  }

  setBaseImagerySource(_id: string) {
    // 当前只注册一个图源，重复选择不需要重建图层。
    return false
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
