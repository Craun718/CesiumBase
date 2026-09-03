export type SceneMode = "2d" | "3d"

export type MapEngineId = "cesium" | "deck-gl"

export type MapBounds = {
  west: number
  south: number
  east: number
  north: number
}

/**
 * 引擎无关的图源描述。
 *
 * 引擎负责将 `id` 实例化为真实图层（如 Cesium 的 `ImageryLayer`）。
 * UI 层只读取 `id` / `label` / `description` 用于展示与选择。
 *
 * 新增图源：在对应引擎工作区内部追加，引擎可选实现底图能力。
 */
export interface ImagerySource {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export interface MapEngine {
  mount(container: HTMLElement): void | Promise<void>
  unmount(): void

  flyToBounds(bounds: MapBounds): void
  setSceneMode(mode: SceneMode): void
  setRotateBrowse(enabled: boolean): void
  setNorthLock(enabled: boolean): void
  setTerrainExaggeration(enabled: boolean, scale: number): void
  setTerrainExaggerationScale(scale: number): void
  getCameraHeading(): number
  setCameraHeading(heading: number): void
  resetCameraNorth(): void
  onCameraHeadingChange(listener: (heading: number) => void): () => void

  /**
   * 当前引擎支持的图源列表（用于 UI 渲染下拉/列表）。
   * 引擎可返回空数组（如 deck.gl 占位阶段）。
   */
  listBaseImagerySources?(): ImagerySource[]
  /** 当前激活图源 id；未挂载或不支持时返回 undefined。 */
  getBaseImagerySourceId?(): string | undefined
  /**
   * 切换激活图源。返回是否实际发生替换（false 表示 id 无效或与当前一致）。
   * 调用方应自行处理"未替换"的反馈（如 toast）。
   */
  setBaseImagerySource?(id: string): boolean
}

export type MapEngineFactory = () => MapEngine

export type MapEngineLoader = () => Promise<MapEngineFactory>
