import * as Cesium from "cesium"

// ===== 天地图底图配置 =====
// 天地图 Key（tk）在项目根目录 .env 中配置（参考 .env.example）：
//   VITE_TIANDITU_KEY=你的天地图Key
// Key 申请地址：https://console.tianditu.gov.cn/api/key
// 未配置 Key 时，加载底图会直接报错提示。
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY ?? ""

const TIANDITU_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"]
const TIANDITU_MAXIMUM_LEVEL = 18

/** 生成天地图 WMTS 瓦片服务（w = Web 墨卡托投影，与 Cesium 默认 WebMercatorTilingScheme 一致）。 */
function createTiandituImageryProvider(layer: "img" | "cia"): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url:
      "https://t{s}.tianditu.gov.cn/" +
      layer +
      "_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
      "&LAYER=" +
      layer +
      "&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles" +
      "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=" +
      TIANDITU_KEY.trim(),
    subdomains: TIANDITU_SUBDOMAINS,
    maximumLevel: TIANDITU_MAXIMUM_LEVEL,
  })
}

/** 创建天地图底图图层列表（遥感影像底图 + 影像注记），未配置 Key 时直接抛错。 */
function createBaseImageryLayers(): Cesium.ImageryLayer[] {
  if (TIANDITU_KEY.trim() === "") {
    throw new Error(
      "未配置天地图 Key，无法加载天地图底图。请在项目根目录 .env 文件中设置 VITE_TIANDITU_KEY（参考 .env.example）。",
    )
  }

  return [
    new Cesium.ImageryLayer(createTiandituImageryProvider("img")),
    new Cesium.ImageryLayer(createTiandituImageryProvider("cia")),
  ]
}

export function createViewer(container: HTMLElement) {
  const baseLayers = createBaseImageryLayers()
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

  return viewer
}
