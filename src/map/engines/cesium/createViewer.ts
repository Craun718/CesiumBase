import * as Cesium from "cesium"
import { registerInitialBaseLayers } from "./baseImagery"
import { findCesiumImagerySource, DEFAULT_CESIUM_IMAGERY_SOURCE_ID } from "./imagerySources"

/**
 * 创建 Viewer 并应用默认图源（影像底图）。
 *
 * 默认图源取自 `imagerySources` 注册表首项；后续可通过
 * `applyCesiumImagerySource` 在不重建 Viewer 的情况下热切换。
 *
 * 注：天地图 Key（VITE_TIANDITU_KEY）必须在 .env 中配置，否则抛错。
 */
export async function createViewer(container: HTMLElement) {
  await Cesium.GroundPrimitive.initializeTerrainHeights()

  const defaultSource = findCesiumImagerySource(DEFAULT_CESIUM_IMAGERY_SOURCE_ID)

  if (!defaultSource) {
    // 理论上不会触发：注册表首项永远存在。这里给出显式保护以便排错。
    throw new Error(`默认图源 ${DEFAULT_CESIUM_IMAGERY_SOURCE_ID} 未在注册表中定义`)
  }

  const baseLayers = defaultSource.createLayers()
  const baseLayer = baseLayers[0]

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer,
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

  for (const layer of baseLayers.slice(1)) {
    viewer.imageryLayers.add(layer)
  }

  // 把基底图层（含第一个）登记到 baseImagery 跟踪表，便于后续热切换时整体替换。
  registerInitialBaseLayers(viewer, defaultSource)

  return viewer
}
