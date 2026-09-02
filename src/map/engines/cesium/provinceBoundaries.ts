import * as Cesium from "cesium"
import {
  closeRing,
  ensureRingOrientation,
  forEachProvincePolygon,
  forEachProvinceRing,
  isProvinceGeometry,
  type GeoJsonPosition,
  type ProvinceCollection,
  type ProvinceGeometry,
} from "./geojson"

const provinceBoundaryUrl = "/vector/广西壮族自治区_自治区.geojson"
const guangxiProvinceName = "广西壮族自治区"
const guangxiBoundaryZIndex = 2
const guangxiColor = Cesium.Color.fromCssColorString("#eab308")
const outsideGuangxiColor = Cesium.Color.fromCssColorString("#031b4e").withAlpha(0.65)

export async function addProvinceBoundaries(viewer: Cesium.Viewer) {
  try {
    const response = await fetch(provinceBoundaryUrl)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as ProvinceCollection

    if (viewer.isDestroyed()) {
      return
    }

    const guangxiFeature = data.features.find(
      (feature) => feature.properties.name === guangxiProvinceName,
    )

    if (!guangxiFeature || !isProvinceGeometry(guangxiFeature.geometry)) {
      return
    }

    forEachProvinceRing(guangxiFeature.geometry, (ring) => {
      addBoundary(viewer, ring, guangxiColor, 4, guangxiBoundaryZIndex)
    })

    addOutsideGuangxiMask(viewer, guangxiFeature.geometry)
  } catch (error) {
    console.error("Failed to load Guangxi boundary", error)
  }
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

function toCartesianPositions(ring: GeoJsonPosition[]) {
  const degrees = ring.flatMap((position) => [position[0], position[1]])

  return Cesium.Cartesian3.fromDegreesArray(degrees)
}

function toCartesianPositionsAtHeight(ring: GeoJsonPosition[], height: number) {
  const degrees = ring.flatMap((position) => [position[0], position[1], height])

  return Cesium.Cartesian3.fromDegreesArrayHeights(degrees)
}
