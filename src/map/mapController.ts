import { loadMapEngine } from "./engineProvider"
import type { ImagerySource, MapBounds, MapEngine, MapEngineLoader, SceneMode } from "./types"

const guangxiBounds: MapBounds = {
  west: 105,
  south: 21,
  east: 112.0569,
  north: 26.5,
}

export class MapController {
  private engine?: MapEngine

  private readonly createEngine: MapEngineLoader

  private mountGeneration = 0

  constructor(createEngine = loadMapEngine) {
    this.createEngine = createEngine
  }

  async mount(container: HTMLElement) {
    if (this.engine) return

    const generation = ++this.mountGeneration
    const createEngine = await this.createEngine()

    if (generation !== this.mountGeneration) return

    const engine = createEngine()
    await engine.mount(container)
    this.engine = engine
  }

  unmount() {
    this.mountGeneration += 1
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

  /** 当前引擎支持的图源列表（用于 UI 渲染）。 */
  listBaseImagerySources(): ImagerySource[] {
    return this.engine?.listBaseImagerySources?.() ?? []
  }

  /** 当前激活的图源 id；未挂载或不支持时返回 undefined。 */
  getBaseImagerySourceId(): string | undefined {
    return this.engine?.getBaseImagerySourceId?.()
  }

  /** 切换激活图源；返回是否实际发生替换。 */
  setBaseImagerySource(id: string): boolean {
    return this.engine?.setBaseImagerySource?.(id) ?? false
  }
}
