import * as Cesium from "cesium"
import type { MapBounds } from "../../types"

export function setInitialCamera(viewer: Cesium.Viewer) {
  // Bounds derived from the Guangxi city boundary GeoJSON.
  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(105, 21, 112.0569, 26.5),
  })
}

export function flyToBounds(viewer: Cesium.Viewer, bounds: MapBounds) {
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
    duration: 1,
  })
}
