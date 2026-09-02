import type { MapBounds, MapEngine, MapEngineFactory, SceneMode } from "./types"

const guangxiBounds: MapBounds = {
  west: 105,
  south: 21,
  east: 112.0569,
  north: 26.5,
}

export class MapController {
  private engine?: MapEngine

  private readonly createEngine: MapEngineFactory

  constructor(createEngine: MapEngineFactory) {
    this.createEngine = createEngine
  }

  mount(container: HTMLElement) {
    if (this.engine) return

    const engine = this.createEngine()
    engine.mount(container)
    this.engine = engine
  }

  unmount() {
    this.engine?.unmount()
    this.engine = undefined
  }

  returnToGuangxi() {
    this.engine?.flyToBounds(guangxiBounds)
  }

  setSceneMode(mode: SceneMode) {
    this.engine?.setSceneMode(mode)
  }

  setRotateBrowse(enabled: boolean) {
    this.engine?.setRotateBrowse(enabled)
  }

  setNorthLock(enabled: boolean) {
    this.engine?.setNorthLock(enabled)
  }

  setTerrainExaggeration(enabled: boolean, scale: number) {
    this.engine?.setTerrainExaggeration(enabled, scale)
  }

  setTerrainExaggerationScale(scale: number) {
    this.engine?.setTerrainExaggerationScale(scale)
  }

  getCameraHeading() {
    return this.engine?.getCameraHeading() ?? 0
  }

  setCameraHeading(heading: number) {
    this.engine?.setCameraHeading(heading)
  }

  resetCameraNorth() {
    this.engine?.resetCameraNorth()
  }

  onCameraHeadingChange(listener: (heading: number) => void) {
    return this.engine?.onCameraHeadingChange(listener) ?? (() => {})
  }
}
