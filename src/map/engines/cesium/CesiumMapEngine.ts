import * as Cesium from "cesium"
import type {
  CameraFlightOptions,
  CameraState,
  CoordinateReadout,
  ImagerySource,
  MapCoordinate,
  MapEngine,
  MapBounds,
  SceneMode,
  TerrainSource,
} from "../../types"
import { createViewer } from "./createViewer"
import {
  getCameraHeading,
  captureScreenshot,
  captureScreenshotThumbnail,
  flyToCameraState,
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
import { getPointerReadout, getViewReadout } from "./pointerReadout"
import {
  configureScene,
  setNorthLock,
  setRotateBrowse,
  setSceneMode,
  setTerrainExaggeration,
  setTerrainExaggerationScale,
  setUndergroundMode,
} from "./sceneOperations"
import { addProvinceBoundaries } from "./provinceBoundaries"
import {
  applyCesiumCustomUrlSource,
  applyCesiumImagerySource,
  getCurrentCesiumImagerySourceId,
} from "./baseImagery"
import { listCesiumImagerySources } from "./imagerySources"
import { applyCesiumTerrainProvider, createCesiumTerrainProvider } from "./terrainSources"

export class CesiumMapEngine implements MapEngine {
  private viewer?: Cesium.Viewer
  private pointerHandler?: Cesium.ScreenSpaceEventHandler
  private disposePointerReadout?: () => void
  private coordinateReadout?: CoordinateReadout
  private lastPointerPosition?: { x: number; y: number }
  private coordinateReadoutRefreshedAt = 0
  private terrainSourceGeneration = 0
  private readonly coordinateReadoutListeners = new Set<(readout: CoordinateReadout) => void>()

  async mount(container: HTMLElement) {
    if (this.viewer) return

    const viewer = await createViewer(container)
    this.viewer = viewer

    configureScene(viewer)
    setInitialCamera(viewer)
    void addProvinceBoundaries(viewer)

    this.pointerHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    this.pointerHandler.setInputAction(({ endPosition }: { endPosition: Cesium.Cartesian2 }) => {
      this.lastPointerPosition = { x: endPosition.x, y: endPosition.y }
      this.setCoordinateReadout(getPointerReadout(viewer, endPosition))
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    const removeSceneListener = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now()

      // 读数跟随地形与相机状态变化；鼠标移动仍立即刷新，这里是兜底的节流同步。
      if (now - this.coordinateReadoutRefreshedAt < 100) return

      this.coordinateReadoutRefreshedAt = now
      this.refreshCoordinateReadout(viewer)
    })
    const handlePointerLeave = () => {
      this.lastPointerPosition = undefined
      this.coordinateReadoutRefreshedAt = performance.now()
      this.setCoordinateReadout(getViewReadout(viewer))
    }
    viewer.canvas.addEventListener("pointerleave", handlePointerLeave)
    this.disposePointerReadout = () => {
      removeSceneListener()
      viewer.canvas.removeEventListener("pointerleave", handlePointerLeave)
    }

    this.refreshCoordinateReadout(viewer)
  }

  unmount() {
    this.terrainSourceGeneration += 1
    this.disposePointerReadout?.()
    this.disposePointerReadout = undefined
    this.pointerHandler?.destroy()
    this.pointerHandler = undefined

    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy()
    }

    this.viewer = undefined
    this.lastPointerPosition = undefined
    this.coordinateReadout = undefined
    this.coordinateReadoutListeners.clear()
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

  setUndergroundMode(enabled: boolean) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      setUndergroundMode(viewer, enabled)
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

  flyToCameraState(state: CameraState, options?: CameraFlightOptions) {
    const viewer = this.getActiveViewer()

    if (viewer) {
      flyToCameraState(viewer, state, options)
      return
    }

    options?.onCancel?.()
  }

  onCameraStateChange(listener: (state: CameraState) => void) {
    const viewer = this.getActiveViewer()

    return viewer ? onCameraStateChange(viewer, listener) : () => {}
  }

  getCoordinateReadout(): CoordinateReadout | undefined {
    return this.coordinateReadout
  }

  onCoordinateReadoutChange(listener: (readout: CoordinateReadout) => void) {
    this.coordinateReadoutListeners.add(listener)

    if (this.coordinateReadout) {
      listener(this.coordinateReadout)
    }

    return () => {
      this.coordinateReadoutListeners.delete(listener)
    }
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

  captureScreenshotThumbnail() {
    const viewer = this.getActiveViewer()

    return viewer ? captureScreenshotThumbnail(viewer) : undefined
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

  async setTerrainSource(source?: TerrainSource) {
    const viewer = this.getActiveViewer()
    if (!viewer) return false

    const generation = ++this.terrainSourceGeneration
    const provider = await createCesiumTerrainProvider(source)

    if (generation !== this.terrainSourceGeneration || !this.getActiveViewer()) return false

    applyCesiumTerrainProvider(viewer, provider)
    return true
  }

  private getActiveViewer() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      return this.viewer
    }

    return undefined
  }

  private setCoordinateReadout(readout: CoordinateReadout) {
    const previous = this.coordinateReadout
    if (
      previous &&
      previous.longitude === readout.longitude &&
      previous.latitude === readout.latitude &&
      previous.height === readout.height &&
      previous.source === readout.source
    ) {
      return
    }

    this.coordinateReadout = readout

    for (const listener of this.coordinateReadoutListeners) {
      listener(readout)
    }
  }

  private refreshCoordinateReadout(viewer: Cesium.Viewer) {
    if (!this.lastPointerPosition) {
      this.setCoordinateReadout(getViewReadout(viewer))
      return
    }

    const pointerPosition = new Cesium.Cartesian2(
      this.lastPointerPosition.x,
      this.lastPointerPosition.y,
    )
    this.setCoordinateReadout(getPointerReadout(viewer, pointerPosition))
  }
}

export function createCesiumMapEngine(): MapEngine {
  return new CesiumMapEngine()
}
