import { DEFAULT_FLIGHT_PITCH, DEFAULT_FLIGHT_SPEED } from "./flightRoute"
import type {
  CameraFlightOptions,
  CameraState,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  MapDraw3DFeature,
  MapDraw3DGeometryType,
  MapDraw3DStartOptions,
  MapDraw3DState,
  MapBounds,
  MapClickListener,
  MapCoordinate,
  MapDrawFeature,
  MapDrawGeometryType,
  MapDrawStartOptions,
  MapDrawState,
  MapEngine,
  MeasurementMode,
  MeasurementState,
  OrbitFlightSettings,
  OrbitFlightState,
  SceneModelLayerDescriptor,
  SceneModelLayerPatch,
  SceneImageryLayerDescriptor,
  SceneImageryLayerPatch,
  SceneLayerError,
  SceneModeTransitionOptions,
  SceneTilesetLayerDescriptor,
  SceneTilesetLayerPatch,
  SceneVectorLayerDescriptor,
  SceneVectorLayerPatch,
  SceneMode,
  SwipeCompareOptions,
  TerrainSource,
  ViewportState,
} from "./types"

const defaultCameraState: CameraState = {
  longitude: 108.25,
  latitude: 23.7,
  height: 700_000,
  heading: 0,
  pitch: -90,
}

const defaultFlightPlaybackState: FlightPlaybackState = {
  status: "idle",
  progress: 0,
  speed: DEFAULT_FLIGHT_SPEED,
  pitch: DEFAULT_FLIGHT_PITCH,
  loop: false,
  followRoute: true,
  totalDistance: 0,
}

const emptyDrawingState: MapDrawState = {
  mode: null,
  activeCoordinates: [],
  features: [],
  selectedFeatureId: null,
  editingActive: false,
}

const empty3DDrawingState: MapDraw3DState = {
  mode: null,
  activeCoordinates: [],
  features: [],
  selectedFeatureId: null,
}

const defaultOrbitFlightState: OrbitFlightState = {
  status: "idle",
  active: false,
  durationSeconds: 20,
  progress: 0,
}

const defaultViewportState: ViewportState = {
  longitude: 108.25,
  latitude: 23.7,
  distanceMeters: 700_000,
  heading: 0,
}

const idleMeasurementState: MeasurementState = {
  mode: null,
  points: [],
  previewPoint: undefined,
  completed: false,
  resultValue: undefined,
  error: undefined,
}

function noop(): void {}

function unsubscribe(): () => void {
  return noop
}

/**
 * 为尚未实现 main 分支引擎契约的精简引擎提供空实现。
 * 这里只保证共享 UI 与 MapController 可以继续编译和挂载。
 */
export class MapEngineCompatibility implements MapEngine {
  mount(_container: HTMLElement): void | Promise<void> {}

  unmount(): void {}

  async flyToBounds(_bounds: MapBounds): Promise<boolean> {
    return false
  }

  flyToCoordinate(_coordinate: MapCoordinate): void {}

  setSceneMode(_mode: SceneMode, _options?: SceneModeTransitionOptions): void {}

  setRotateBrowse(_enabled: boolean): void {}

  setOrbitFlight(_enabled: boolean, _options?: { readonly durationSeconds?: number }): void {}

  pauseOrbitFlight(): void {}

  resumeOrbitFlight(): void {}

  seekOrbitFlight(_progress: number): void {}

  setOrbitFlightSettings(_settings: OrbitFlightSettings): void {}

  getOrbitFlightState(): OrbitFlightState {
    return defaultOrbitFlightState
  }

  onOrbitFlightStateChange(_listener: (state: OrbitFlightState) => void): () => void {
    return unsubscribe()
  }

  setNorthLock(_enabled: boolean): void {}

  setTerrainExaggeration(_enabled: boolean, _scale: number): void {}

  setTerrainExaggerationScale(_scale: number): void {}

  async addImageryLayer(_descriptor: SceneImageryLayerDescriptor): Promise<void> {}

  updateImageryLayer(_id: string, _patch: SceneImageryLayerPatch): void {}

  removeImageryLayer(_id: string): void {}

  onImageryLayerError(_listener: (error: SceneLayerError) => void): () => void {
    return unsubscribe()
  }

  setSwipeCompare(_options: SwipeCompareOptions): void {}

  getViewportState(): ViewportState {
    return defaultViewportState
  }

  setViewportState(_state: ViewportState): void {}

  onViewportStateChange(_listener: (state: ViewportState) => void): () => void {
    return unsubscribe()
  }

  async addVectorLayer(_descriptor: SceneVectorLayerDescriptor): Promise<void> {}

  updateVectorLayer(_id: string, _patch: SceneVectorLayerPatch): void {}

  removeVectorLayer(_id: string): void {}

  async addTilesetLayer(_descriptor: SceneTilesetLayerDescriptor): Promise<void> {}

  updateTilesetLayer(_id: string, _patch: SceneTilesetLayerPatch): void {}

  removeTilesetLayer(_id: string): void {}

  async addModelLayer(_descriptor: SceneModelLayerDescriptor): Promise<void> {}

  updateModelLayer(_id: string, _patch: SceneModelLayerPatch): void {}

  removeModelLayer(_id: string): void {}

  setUndergroundMode(_enabled: boolean): void {}

  getCameraHeading(): number {
    return 0
  }

  setCameraHeading(_heading: number): void {}

  resetCameraNorth(): void {}

  onCameraHeadingChange(_listener: (heading: number) => void): () => void {
    return unsubscribe()
  }

  getCameraState(): CameraState {
    return defaultCameraState
  }

  setCameraState(_state: Partial<Omit<CameraState, "longitude" | "latitude">>): void {}

  flyToCameraState(_state: CameraState, options?: CameraFlightOptions): void {
    options?.onCancel?.()
  }

  onCameraStateChange(_listener: (state: CameraState) => void): () => void {
    return unsubscribe()
  }

  onMapClick(_listener: MapClickListener): () => void {
    return unsubscribe()
  }

  setFlightRoutePreview(_route: FlightRoute): void {}

  clearFlightRoutePreview(): void {}

  async startFlight(_route: FlightRoute): Promise<boolean> {
    return false
  }

  pauseFlight(): void {}

  resumeFlight(): void {}

  stopFlight(): void {}

  seekFlight(_progress: number): void {}

  updateFlightPlayback(_settings: FlightPlaybackSettings): void {}

  getFlightPlaybackState(): FlightPlaybackState {
    return defaultFlightPlaybackState
  }

  onFlightPlaybackStateChange(_listener: (state: FlightPlaybackState) => void): () => void {
    return unsubscribe()
  }

  getCoordinateReadout(): CoordinateReadout | undefined {
    return undefined
  }

  onCoordinateReadoutChange(_listener: (readout: CoordinateReadout) => void): () => void {
    return unsubscribe()
  }

  async toggleSceneFullscreen(): Promise<boolean> {
    return false
  }

  captureScreenshot(): string | undefined {
    return undefined
  }

  captureScreenshotThumbnail(): string | undefined {
    return undefined
  }

  startDrawing(_type: MapDrawGeometryType, _options?: MapDrawStartOptions): boolean {
    return false
  }

  setDrawingOption(_option: Partial<MapDrawStartOptions>): void {}

  finishDrawing(): boolean {
    return false
  }

  createBufferFromFeature(_sourceFeatureId: string, _distanceMeters: number): boolean {
    return false
  }

  cancelDrawing(): boolean {
    return false
  }

  stopDrawing(): boolean {
    return false
  }

  renameDrawing(_id: string, _name: string): boolean {
    return false
  }

  removeDrawing(_id: string): boolean {
    return false
  }

  setDrawingFeaturesVisible(_visible: boolean): void {}

  clearDrawings(): void {}

  restoreDrawings(_features: readonly MapDrawFeature[]): boolean {
    return false
  }

  getDrawingState(): MapDrawState {
    return emptyDrawingState
  }

  onDrawingStateChange(_listener: (state: MapDrawState) => void): () => void {
    return unsubscribe()
  }

  pickDrawingFeature(_screenPosition: { readonly x: number; readonly y: number }): string | null {
    return null
  }

  selectDrawingFeature(_id: string | null): boolean {
    return false
  }

  beginEditDraft(_featureId: string, _kind: "translate" | "resize", _handleId?: string): boolean {
    return false
  }

  updateEditDraft(_screenPosition: { readonly x: number; readonly y: number }): void {}

  commitEditDraft(): boolean {
    return false
  }

  cancelEditDraft(): boolean {
    return false
  }

  start3DDrawing(_type: MapDraw3DGeometryType, _options?: MapDraw3DStartOptions): boolean {
    return false
  }

  set3DDrawingOption(_option: Partial<MapDraw3DStartOptions>): void {}

  finish3DDrawing(): boolean {
    return false
  }

  cancel3DDrawing(): boolean {
    return false
  }

  stop3DDrawing(): boolean {
    return false
  }

  rename3DDrawing(_id: string, _name: string): boolean {
    return false
  }

  remove3DDrawing(_id: string): boolean {
    return false
  }

  set3DDrawingFeaturesVisible(_visible: boolean): void {}

  clear3DDrawings(): void {}

  restore3DDrawings(_features: readonly MapDraw3DFeature[]): boolean {
    return false
  }

  get3DDrawingState(): MapDraw3DState {
    return empty3DDrawingState
  }

  on3DDrawingStateChange(_listener: (state: MapDraw3DState) => void): () => void {
    return unsubscribe()
  }

  pick3DDrawingFeature(_screenPosition: { readonly x: number; readonly y: number }): string | null {
    return null
  }

  select3DDrawingFeature(_id: string | null): boolean {
    return false
  }

  async setTerrainSource(_source?: TerrainSource): Promise<boolean> {
    return false
  }

  setMeasurementMode(_mode: MeasurementMode | null): void {}

  undoMeasurementPoint(): void {}

  clearMeasurement(): void {}

  getMeasurementState(): MeasurementState {
    return idleMeasurementState
  }

  onMeasurementStateChange(_listener: (state: MeasurementState) => void): () => void {
    return unsubscribe()
  }

  resize(): void {}
}
