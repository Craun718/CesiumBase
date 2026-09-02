import * as Cesium from "cesium"

export function createViewer(container: HTMLElement) {
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

  return viewer
}
