import { Deck, MapView, TerrainController, type PickingInfo } from "@deck.gl/core"
import { TerrainLayer } from "@deck.gl/geo-layers"
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers"
import { onBeforeUnmount, onMounted, type Ref } from "vue"

type StationStatus = "online" | "warning" | "critical"

interface Station {
  id: string
  name: string
  position: [number, number]
  status: StationStatus
  devices: number
}

interface NetworkLink {
  id: string
  source: [number, number]
  target: [number, number]
}

interface ProvinceProperties {
  name?: string
}

const provinceBoundaryUrl = "/vector/中国_省.geojson"
const guangxiProvinceName = "广西壮族自治区"

const stations: Station[] = [
  { id: "east", name: "华东枢纽", position: [121.47, 31.23], status: "online", devices: 218 },
  { id: "south", name: "华南枢纽", position: [113.26, 23.13], status: "warning", devices: 176 },
  { id: "north", name: "华北枢纽", position: [116.41, 39.9], status: "online", devices: 194 },
  {
    id: "southwest",
    name: "西南枢纽",
    position: [104.07, 30.57],
    status: "critical",
    devices: 132,
  },
  { id: "northeast", name: "东北枢纽", position: [126.53, 45.8], status: "online", devices: 96 },
  { id: "northwest", name: "西北枢纽", position: [103.83, 36.06], status: "online", devices: 88 },
]

const networkLinks: NetworkLink[] = [
  { id: "east-north", source: stations[0].position, target: stations[2].position },
  { id: "east-south", source: stations[0].position, target: stations[1].position },
  { id: "north-northeast", source: stations[2].position, target: stations[4].position },
  { id: "north-northwest", source: stations[2].position, target: stations[5].position },
  { id: "southwest-northwest", source: stations[3].position, target: stations[5].position },
  { id: "south-southwest", source: stations[1].position, target: stations[3].position },
]

const statusColors: Record<StationStatus, [number, number, number, number]> = {
  online: [72, 229, 255, 225],
  warning: [255, 182, 72, 235],
  critical: [255, 95, 120, 245],
}

type ControllerEvent = Parameters<TerrainController["handleEvent"]>[0] & {
  middleButton?: boolean
  rightButton?: boolean
  center?: { x: number; y: number }
}

// Cesium-style interaction: middle drag tilts/rotates, right drag zooms.
class CesiumStyleTerrainController extends TerrainController {
  private rightDragLastY: number | null = null

  handleEvent(event: ControllerEvent): boolean {
    if (event.type === "panstart" && event.middleButton) {
      return super.handleEvent({ ...event, rightButton: true })
    }

    if (event.rightButton) {
      if (event.type === "panstart") {
        this.rightDragLastY = event.center?.y ?? null
        return true
      }

      if (event.type === "panmove" && this.rightDragLastY !== null) {
        const currentY = event.center?.y

        if (currentY !== undefined) {
          const deltaY = currentY - this.rightDragLastY
          this.rightDragLastY = currentY

          // Reuse the wheel-zoom machinery; dragging up zooms in.
          return super.handleEvent({
            ...event,
            type: "wheel",
            delta: -deltaY * 2,
          } as ControllerEvent)
        }
      }

      if (event.type === "panend") {
        this.rightDragLastY = null
        return true
      }
    }

    return super.handleEvent(event)
  }
}

// Keep markers above the terrain surface to avoid depth fighting.
const stationAltitude = 1500

function withAltitude(position: [number, number]): [number, number, number] {
  return [position[0], position[1], stationAltitude]
}

export function useDeckMap(container: Ref<HTMLDivElement | undefined>) {
  let deck: Deck<MapView> | undefined
  let containerElement: HTMLDivElement | undefined

  const preventContextMenu = (event: Event) => {
    event.preventDefault()
  }

  onMounted(() => {
    if (!container.value) return

    containerElement = container.value
    containerElement.addEventListener("contextmenu", preventContextMenu)
    deck = createDeck(containerElement)
  })

  onBeforeUnmount(() => {
    containerElement?.removeEventListener("contextmenu", preventContextMenu)
    containerElement = undefined
    deck?.finalize()
    deck = undefined
  })
}

function createDeck(container: HTMLDivElement) {
  return new Deck({
    parent: container,
    views: new MapView({
      controller: {
        type: CesiumStyleTerrainController,
        dragRotate: true,
        touchRotate: true,
        keyboard: true,
        inertia: true,
      },
    }),
    initialViewState: {
      longitude: 108.25,
      latitude: 23.7,
      zoom: 6,
      minZoom: 2.5,
      maxZoom: 14,
      pitch: 45,
      bearing: -24,
      maxPitch: 70,
    },
    getTooltip,
    layers: createLayers(),
  })
}

function createLayers() {
  return [
    new TerrainLayer({
      id: "terrain-base-map",
      elevationData: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      texture: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      elevationDecoder: {
        rScaler: 256,
        gScaler: 1,
        bScaler: 1 / 256,
        offset: -32768,
      },
      meshMaxError: 4,
      minZoom: 0,
      maxZoom: 14,
      maxRequests: 8,
      strategy: "no-overlap",
    }),
    new GeoJsonLayer<ProvinceProperties>({
      id: "province-boundaries",
      data: provinceBoundaryUrl,
      stroked: true,
      filled: true,
      getFillColor: (feature) =>
        feature.properties?.name === guangxiProvinceName ? [234, 179, 8, 92] : [3, 27, 78, 145],
      getLineColor: (feature) =>
        feature.properties?.name === guangxiProvinceName ? [234, 179, 8, 255] : [72, 229, 255, 210],
      getLineWidth: (feature) => (feature.properties?.name === guangxiProvinceName ? 3 : 1.2),
      lineWidthUnits: "pixels",
      pickable: false,
    }),
    new ArcLayer<NetworkLink>({
      id: "network-links",
      data: networkLinks,
      greatCircle: true,
      numSegments: 96,
      getSourcePosition: (link) => withAltitude(link.source),
      getTargetPosition: (link) => withAltitude(link.target),
      getSourceColor: [72, 229, 255, 132],
      getTargetColor: [72, 229, 255, 132],
      getWidth: 1.4,
      widthUnits: "pixels",
      widthMinPixels: 1,
      getHeight: 0.42,
      pickable: false,
    }),
    new ScatterplotLayer<Station>({
      id: "station-halos",
      data: stations,
      getPosition: (station) => withAltitude(station.position),
      getRadius: 1,
      radiusUnits: "pixels",
      radiusScale: 28,
      getFillColor: (station) => [
        statusColors[station.status][0],
        statusColors[station.status][1],
        statusColors[station.status][2],
        48,
      ],
      stroked: false,
      pickable: false,
    }),
    new ScatterplotLayer<Station>({
      id: "stations",
      data: stations,
      getPosition: (station) => withAltitude(station.position),
      getRadius: 1,
      radiusUnits: "pixels",
      radiusScale: 8,
      getFillColor: (station) => statusColors[station.status],
      getLineColor: [3, 9, 19, 255],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [233, 245, 255, 96],
    }),
  ]
}

function getTooltip(info: PickingInfo) {
  const station = info.object as Station | undefined

  if (!station) return null

  return {
    html: `
      <strong>${station.name}</strong>
      <span>${station.devices} 台设备 / ${station.status.toUpperCase()}</span>
    `,
  }
}
