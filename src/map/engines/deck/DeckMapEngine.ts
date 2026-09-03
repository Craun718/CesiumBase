import { Deck, MapView, type MapViewState } from "@deck.gl/core"
import type { ImagerySource, MapBounds, MapEngine, SceneMode } from "../../types"
import { createDeckLayers, getDeckTooltip, WebMercatorViewport } from "./layers"
import { CesiumStyleTerrainController } from "./terrainController"

const defaultViewState: MapViewState = {
  longitude: 108.25,
  latitude: 23.7,
  zoom: 6,
  minZoom: 2.5,
  maxZoom: 14,
  pitch: 45,
  bearing: -24,
  maxPitch: 70,
}

function normalizeHeading(heading: number) {
  const degrees = ((heading % 360) + 360) % 360
  return degrees === 360 ? 0 : degrees
}

export class DeckMapEngine implements MapEngine {
  private deck?: Deck<MapView>
  private container?: HTMLElement
  private attribution?: HTMLElement
  private viewState: MapViewState = { ...defaultViewState }
  private terrainEnabled = false
  private terrainScale = 1
  private readonly headingListeners = new Set<(heading: number) => void>()

  mount(container: HTMLElement) {
    if (this.deck) return

    this.container = container
    container.addEventListener("contextmenu", this.preventContextMenu)
    this.attribution = this.createAttribution()
    container.appendChild(this.attribution)

    this.deck = new Deck<MapView>({
      parent: container as HTMLDivElement,
      views: new MapView({
        controller: {
          type: CesiumStyleTerrainController,
          dragRotate: true,
          touchRotate: true,
          keyboard: true,
          inertia: true,
        },
      }),
      initialViewState: this.viewState,
      getTooltip: getDeckTooltip,
      layers: createDeckLayers(this.getTerrainSettings()),
      onViewStateChange: ({ viewState }) => {
        this.viewState = { ...this.viewState, ...viewState }
        this.notifyHeadingChange()
      },
    })
  }

  unmount() {
    this.container?.removeEventListener("contextmenu", this.preventContextMenu)
    this.attribution?.remove()
    this.deck?.finalize()
    this.container = undefined
    this.attribution = undefined
    this.deck = undefined
    this.headingListeners.clear()
  }

  flyToBounds(bounds: MapBounds) {
    if (!this.container) return

    const viewport = new WebMercatorViewport({
      width: this.container.clientWidth || 1,
      height: this.container.clientHeight || 1,
    })
    const target = viewport.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: 40 },
    )

    this.setViewState({
      longitude: target.longitude,
      latitude: target.latitude,
      zoom: target.zoom,
    })
  }

  setSceneMode(mode: SceneMode) {
    this.setViewState({ pitch: mode === "2d" ? 0 : 45 })
  }

  setRotateBrowse(_enabled: boolean) {}

  setNorthLock(_enabled: boolean) {}

  setTerrainExaggeration(enabled: boolean, scale: number) {
    this.terrainEnabled = enabled
    this.terrainScale = scale
    this.updateLayers()
  }

  setTerrainExaggerationScale(scale: number) {
    this.terrainScale = scale
    this.updateLayers()
  }

  getCameraHeading() {
    return normalizeHeading(this.viewState.bearing ?? 0)
  }

  setCameraHeading(heading: number) {
    if (!Number.isFinite(heading)) return

    this.setViewState({ bearing: normalizeHeading(heading) })
  }

  resetCameraNorth() {
    this.setViewState({ bearing: 0 })
  }

  onCameraHeadingChange(listener: (heading: number) => void) {
    this.headingListeners.add(listener)

    return () => {
      this.headingListeners.delete(listener)
    }
  }

  listBaseImagerySources(): ImagerySource[] {
    // deck.gl 占位阶段：底图切换由其自身的图层管线管理；此处返回空数组保持契约兼容。
    return []
  }

  getBaseImagerySourceId(): string | undefined {
    return undefined
  }

  setBaseImagerySource(_id: string): boolean {
    return false
  }

  private preventContextMenu(event: Event) {
    event.preventDefault()
  }

  private createAttribution() {
    const attribution = document.createElement("span")
    attribution.className = "deck-attribution"
    attribution.textContent = "© OpenStreetMap contributors · Terrain: Mapzen"
    return attribution
  }

  private getTerrainSettings() {
    return {
      exaggerationEnabled: this.terrainEnabled,
      exaggerationScale: this.terrainScale,
    }
  }

  private setViewState(nextState: Partial<MapViewState>) {
    this.viewState = { ...this.viewState, ...nextState }
    this.deck?.setProps({ initialViewState: this.viewState })
    this.notifyHeadingChange()
  }

  private updateLayers() {
    this.deck?.setProps({ layers: createDeckLayers(this.getTerrainSettings()) })
  }

  private notifyHeadingChange() {
    const heading = this.getCameraHeading()

    for (const listener of this.headingListeners) {
      listener(heading)
    }
  }
}

export function createDeckMapEngine(): MapEngine {
  return new DeckMapEngine()
}
