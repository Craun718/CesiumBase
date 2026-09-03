import * as Cesium from "cesium"

// 天地图 Key 在项目根目录 .env 中配置（参考 .env.example）。
// 未配置时，加载任何天地图底图都会直接报错。
const TIANDITU_KEY = (import.meta.env.VITE_TIANDITU_KEY ?? "").trim()

const TIANDITU_SUBDOMAINS = ["0", "1", "2", "3", "4", "5", "6", "7"]
const TIANDITU_MAXIMUM_LEVEL = 18
const DEFAULT_CUSTOM_MAXIMUM_LEVEL = 18

/** 自定义 URL 图源固定 id（用于引擎切换与 UI 状态标识）。 */
export const CUSTOM_IMAGERY_SOURCE_ID = "custom"

/**
 * 引擎无关的图源描述。引擎负责把描述实例化为真正的图层（如 ImageryLayer）。
 * UI 层只读取 id/label/description 用于展示与选择。
 */
export interface ImagerySource {
  /** 图源唯一 id（用于引擎切换）。 */
  readonly id: string
  /** 图源显示名（中文）。 */
  readonly label: string
  /** 图源描述/备注（可选，悬停提示或副标题）。 */
  readonly description?: string
}

/** 引擎内部的图源描述：在 `ImagerySource` 的基础上增加图层工厂。仅 Cesium 引擎使用，不对外暴露。 */
export interface CesiumImagerySource extends ImagerySource {
  /** 为一个 Viewer 创建该图源的全部基底图层（1 或多个）。 */
  createLayers(): Cesium.ImageryLayer[]
}

/** 生成天地图 WMTS 瓦片服务（w = Web 墨卡托投影，与 Cesium 默认 WebMercatorTilingScheme 一致）。 */
function createTiandituUrlTemplate(
  layer: "img" | "cia" | "vec" | "cva",
): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url:
      "https://t{s}.tianditu.gov.cn/" +
      layer +
      "_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
      "&LAYER=" +
      layer +
      "&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles" +
      "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=" +
      TIANDITU_KEY,
    subdomains: TIANDITU_SUBDOMAINS,
    maximumLevel: TIANDITU_MAXIMUM_LEVEL,
  })
}

/**
 * 当前可用的图源注册表。后续接入新图源（如 OSM、高德、CGCS2000 离线瓦片等），
 * 只需在此数组追加即可；UI 与引擎会自动识别。
 *
 * 注：现阶段两条图源共用同一 Key（VITE_TIANDITU_KEY），分别提供矢量与影像两种风格。
 */
export const CESIUM_IMAGERY_SOURCES: readonly CesiumImagerySource[] = [
  {
    id: "tianditu-img",
    label: "天地图影像",
    description: "天地图 WMTS 影像底图 + 注记（默认）",
    createLayers: () => [
      new Cesium.ImageryLayer(createTiandituUrlTemplate("img")),
      new Cesium.ImageryLayer(createTiandituUrlTemplate("cia")),
    ],
  },
  {
    id: "tianditu-vec",
    label: "天地图矢量",
    description: "天地图 WMTS 矢量底图 + 注记",
    createLayers: () => [
      new Cesium.ImageryLayer(createTiandituUrlTemplate("vec")),
      new Cesium.ImageryLayer(createTiandituUrlTemplate("cva")),
    ],
  },
] as const

/** 默认图源 id（注册表首项）。 */
export const DEFAULT_CESIUM_IMAGERY_SOURCE_ID: string = CESIUM_IMAGERY_SOURCES[0].id

/** 按 id 查找图源；找不到时返回 undefined。 */
export function findCesiumImagerySource(id: string): CesiumImagerySource | undefined {
  return CESIUM_IMAGERY_SOURCES.find((source) => source.id === id)
}

/**
 * 由用户提供的瓦片 URL 创建自定义图源。
 *
 * 支持 XYZ（`{z}/{x}/{y}`）及 WMTS 等 Cesium `UrlTemplateImageryProvider` 支持
 * 的模板占位符；若 URL 中包含 `{s}` 会自动启用子域轮询。
 */
export function createCustomCesiumImagerySource(url: string): CesiumImagerySource {
  return {
    id: CUSTOM_IMAGERY_SOURCE_ID,
    label: "自定义 URL",
    description: url,
    createLayers: () => [
      new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url,
          // 仅当 URL 使用 {s} 时启用子域轮询，避免无谓的网络请求
          ...(url.includes("{s}") ? { subdomains: "abc" } : {}),
          maximumLevel: DEFAULT_CUSTOM_MAXIMUM_LEVEL,
        }),
      ),
    ],
  }
}

/** 引擎无关的图源列表（用于 UI 与契约）。 */
export function listCesiumImagerySources(): ImagerySource[] {
  return CESIUM_IMAGERY_SOURCES.map(({ id, label, description }) => {
    const source: ImagerySource =
      description === undefined ? { id, label } : { id, label, description }
    return source
  })
}
