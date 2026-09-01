import * as Cesium from 'cesium'
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

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
    url: 'https://tile.openstreetmap.org/',
  })

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: new Cesium.ImageryLayer(imageryProvider),
    baseLayerPicker: false,
    // Render credits into a detached element so the widget shows no credit bar.
    creditContainer: document.createElement('div'),
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

  return viewer
}

function configureScene(viewer: Cesium.Viewer) {
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#030a18')
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#081b35')
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
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(105.8, 35.9, 8_500_000),
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0,
    },
  })
}
