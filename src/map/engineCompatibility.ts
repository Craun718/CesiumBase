import { DEFAULT_FLIGHT_PITCH, DEFAULT_FLIGHT_SPEED } from "./flightRoute"
import type {
  CameraFlightOptions,
  CameraState,
  CoordinateReadout,
  FlightPlaybackSettings,
  FlightPlaybackState,
  FlightRoute,
  ImagerySource,
  MapBounds,
  MapClickListener,
  MapCoordinate,
  MapDrawFeature,
  MapDrawGeometryType,
  MapDrawState,
  MapEngine,
  MeasurementMode,
  MeasurementState,
  SceneMode,
  TerrainSource,
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
  totalDistance: 0,
}

const emptyDrawingState: MapDrawState = {
  mode: null,
  activeCoordinates: [],
  features: [],
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

  flyToBounds(_bounds: MapBounds): void {}

  flyToCoordinate(_coordinate: MapCoordinate): void {}

  setSceneMode(_mode: SceneMode): void {}

  setRotateBrowse(_enabled: boolean): void {}

  setNorthLock(_enabled: boolean): void {}

  setTerrainExaggeration(_enabled: boolean, _scale: number): void {}

  setTerrainExaggerationScale(_scale: number): void {}

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

  startDrawing(_type: MapDrawGeometryType): boolean {
    return false
  }

  finishDrawing(): boolean {
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

  listBaseImagerySources(): ImagerySource[] {
    return []
  }

  getBaseImagerySourceId(): string | undefined {
    return undefined
  }

  setBaseImagerySource(_id: string): boolean {
    return false
  }

  setCustomBaseImagerySource(_url: string): boolean {
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
}
