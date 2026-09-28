import * as Cesium from "cesium"
import type { AxiosInstance } from "axios"
import { appHttpClient, getJsonResponse } from "../../../http/httpClient.js"
import { TERRAIN_MASK } from "../../themeColors.js"
import {
  closeRing,
  ensureRingOrientation,
  forEachProvincePolygon,
  isProvinceGeometry,
  type GeoJsonPosition,
  type ProvinceCollection,
  type ProvinceGeometry,
} from "./geojson.js"

const provinceBoundaryUrl = "/vector/广西壮族自治区_自治区.geojson"
const guangxiProvinceName = "广西壮族自治区"
const outsideGuangxiColor = Cesium.Color.fromCssColorString(TERRAIN_MASK).withAlpha(0.65)

export async function addProvinceBoundaries(
  viewer: Cesium.Viewer,
  httpClient: AxiosInstance = appHttpClient,
): Promise<Cesium.Entity | undefined> {
  try {
    const data = await getJsonResponse<ProvinceCollection>(httpClient, provinceBoundaryUrl)

    if (viewer.isDestroyed()) {
      return
    }

    const guangxiFeature = data.features.find(
      (feature) => feature.properties.name === guangxiProvinceName,
    )

    if (!guangxiFeature || !isProvinceGeometry(guangxiFeature.geometry)) {
      return
    }

    return addOutsideGuangxiMask(viewer, guangxiFeature.geometry)
  } catch (error) {
    console.error("Failed to load province boundaries", error)
  }
}

function addOutsideGuangxiMask(
  viewer: Cesium.Viewer,
  geometry: ProvinceGeometry,
): Cesium.Entity | undefined {
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
    return undefined
  }

  return viewer.entities.add({
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

function toCartesianPositionsAtHeight(ring: GeoJsonPosition[], height: number) {
  const degrees = ring.flatMap((position) => [position[0], position[1], height])

  return Cesium.Cartesian3.fromDegreesArrayHeights(degrees)
}
