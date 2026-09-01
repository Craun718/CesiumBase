import * as Cesium from "cesium"
import { onBeforeUnmount, onMounted, type Ref } from "vue"

type GeoJsonPosition = number[]

type PolygonGeometry = {
  type: "Polygon"
  coordinates: GeoJsonPosition[][]
}

type MultiPolygonGeometry = {
  type: "MultiPolygon"
  coordinates: GeoJsonPosition[][][]
}

type ProvinceGeometry = PolygonGeometry | MultiPolygonGeometry
type FeatureGeometry = ProvinceGeometry | MultiLineStringGeometry

type MultiLineStringGeometry = {
  type: "MultiLineString"
  coordinates: GeoJsonPosition[][]
}

type ProvinceFeature = {
  properties: {
    name?: string
  }
  geometry: FeatureGeometry
}

type ProvinceCollection = {
  features: ProvinceFeature[]
}

const provinceBoundaryUrl = "/vector/中国_省.geojson"
const guangxiProvinceName = "广西壮族自治区"
const otherProvinceBoundaryZIndex = 1
const guangxiBoundaryZIndex = 2
const otherProvinceColor = Cesium.Color.fromCssColorString("#00008b").withAlpha(0.8)
const guangxiColor = Cesium.Color.fromCssColorString("#eab308")
const outsideGuangxiColor = Cesium.Color.fromCssColorString("#031b4e").withAlpha(0.65)

export function useCesiumMap(container: Ref<HTMLElement | undefined>) {
  let viewer: Cesium.Viewer | undefined

  onMounted(() => {
    if (!container.value) return

    viewer = createViewer(container.value)
  })

  onBeforeUnmount(() => {
    if (viewer && !viewer.isDestroyed()) {
      viewer.destroy()
    }

    viewer = undefined
  })
}

function createViewer(container: HTMLElement) {
  const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
  })

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: new Cesium.ImageryLayer(imageryProvider),
    baseLayerPicker: false,
    // Render credits into a detached element so the widget shows no credit bar.
    creditContainer: document.createElement("div"),
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    contextOptions: {
      webgl: {
        alpha: true,
      },
    },
  })

  configureScene(viewer)
  setInitialCamera(viewer)
  void addProvinceBoundaries(viewer)

  return viewer
}

function configureScene(viewer: Cesium.Viewer) {
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#030a18")
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#081b35")
  viewer.scene.globe.showGroundAtmosphere = true

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true
  }

  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false
  }

  if (viewer.scene.sun) {
    viewer.scene.sun.show = false
  }

  if (viewer.scene.moon) {
    viewer.scene.moon.show = false
  }

  viewer.scene.fog.enabled = true
}

function setInitialCamera(viewer: Cesium.Viewer) {
  // Bounds derived from the Guangxi city boundary GeoJSON.
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(104.446538, 21.018748, 112.0569, 26.386391),
  })
}

async function addProvinceBoundaries(viewer: Cesium.Viewer) {
  try {
    const response = await fetch(provinceBoundaryUrl)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as ProvinceCollection

    if (viewer.isDestroyed()) {
      return
    }

    for (const feature of data.features) {
      if (!isProvinceGeometry(feature.geometry)) {
        continue
      }

      const isGuangxi = feature.properties.name === guangxiProvinceName
      const color = isGuangxi ? guangxiColor : otherProvinceColor
      const width = isGuangxi ? 4 : 2
      const zIndex = isGuangxi ? guangxiBoundaryZIndex : otherProvinceBoundaryZIndex

      forEachProvinceRing(feature.geometry, (ring) => {
        addBoundary(viewer, ring, color, width, zIndex)
      })
    }

    const guangxiFeature = data.features.find(
      (feature) => feature.properties.name === guangxiProvinceName,
    )

    if (guangxiFeature && isProvinceGeometry(guangxiFeature.geometry)) {
      addOutsideGuangxiMask(viewer, guangxiFeature.geometry)
    }
  } catch (error) {
    console.error("Failed to load province boundaries", error)
  }
}

function isProvinceGeometry(geometry: FeatureGeometry): geometry is ProvinceGeometry {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon"
}

function forEachProvinceRing(
  geometry: ProvinceGeometry,
  callback: (ring: GeoJsonPosition[]) => void,
) {
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(callback)
    return
  }

  geometry.coordinates.forEach((polygon) => {
    polygon.forEach(callback)
  })
}

function addOutsideGuangxiMask(viewer: Cesium.Viewer, geometry: ProvinceGeometry) {
  const maskOuterRing: GeoJsonPosition[] = [
    [40, 0],
    [170, 0],
    [170, 60],
    [40, 60],
  ]
  const guangxiHoles: Cesium.PolygonHierarchy[] = []

  forEachProvincePolygon(geometry, (polygon) => {
    const outerRing = ensureRingOrientation(polygon[0], true)
    const holes = polygon.slice(1).map((ring) => {
      return new Cesium.PolygonHierarchy(
        toCartesianPositionsAtHeight(closeRing(ensureRingOrientation(ring, false)), 0),
      )
    })

    guangxiHoles.push(
      new Cesium.PolygonHierarchy(toCartesianPositionsAtHeight(closeRing(outerRing), 0), holes),
    )
  })

  if (guangxiHoles.length === 0) {
    return
  }

  viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(
        toCartesianPositionsAtHeight(closeRing(ensureRingOrientation(maskOuterRing, false)), 0),
        guangxiHoles,
      ),
      material: new Cesium.ColorMaterialProperty(outsideGuangxiColor),
      classificationType: Cesium.ClassificationType.BOTH,
      arcType: Cesium.ArcType.GEODESIC,
      zIndex: 0,
    },
  })
}

function forEachProvincePolygon(
  geometry: ProvinceGeometry,
  callback: (polygon: GeoJsonPosition[][]) => void,
) {
  if (geometry.type === "Polygon") {
    callback(geometry.coordinates)
    return
  }

  geometry.coordinates.forEach(callback)
}

function ensureRingOrientation(ring: GeoJsonPosition[], clockwise: boolean) {
  const area = getSignedRingArea(ring)
  const isClockwise = area < 0

  if (clockwise ? !isClockwise : isClockwise) {
    return [...ring].reverse()
  }

  return ring
}

function getSignedRingArea(ring: GeoJsonPosition[]) {
  let area = 0

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]

    if (!current || !next) {
      continue
    }

    area += current[0] * next[1] - next[0] * current[1]
  }

  return area / 2
}

function addBoundary(
  viewer: Cesium.Viewer,
  ring: GeoJsonPosition[],
  color: Cesium.Color,
  width: number,
  zIndex: number,
) {
  const closedRing = closeRing(ring)

  if (closedRing.length < 3) {
    return
  }

  viewer.entities.add({
    polyline: {
      positions: toCartesianPositions(closedRing),
      width,
      material: color,
      arcType: Cesium.ArcType.GEODESIC,
      clampToGround: true,
      classificationType: Cesium.ClassificationType.BOTH,
      zIndex,
    },
  })
}

function closeRing(ring: GeoJsonPosition[]) {
  const first = ring[0]
  const last = ring.at(-1)

  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first]
  }

  return ring
}

function toCartesianPositions(ring: GeoJsonPosition[]) {
  const degrees = ring.flatMap((position) => [position[0], position[1]])

  return Cesium.Cartesian3.fromDegreesArray(degrees)
}

function toCartesianPositionsAtHeight(ring: GeoJsonPosition[], height: number) {
  const degrees = ring.flatMap((position) => [position[0], position[1], height])

  return Cesium.Cartesian3.fromDegreesArrayHeights(degrees)
}
