export type SceneMode = "2d" | "3d"

export type MapBounds = {
  west: number
  south: number
  east: number
  north: number
}

export interface MapEngine {
  mount(container: HTMLElement): void
  unmount(): void

  flyToBounds(bounds: MapBounds): void
  setSceneMode(mode: SceneMode): void
  setRotateBrowse(enabled: boolean): void
  setNorthLock(enabled: boolean): void
  setTerrainExaggeration(enabled: boolean, scale: number): void
  setTerrainExaggerationScale(scale: number): void
  setCompassVisible(visible: boolean): void
}

export type MapEngineFactory = () => MapEngine
