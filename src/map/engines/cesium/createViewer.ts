import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics"
import type { MapEngineCreationOptions } from "../../types"
import { addFallbackTiandituLayers } from "./layerOperations"

/** 分屏 2D 辅助视口的渲染分辨率；牺牲少量清晰度换取更稳定的缩放帧率。 */
const SECONDARY_RESOLUTION_SCALE = 0.85

/**
 * 创建不携带默认影像的 Viewer；正式底图由 LayerRegistry 按方案下发。
 * 可选：在 .env 中配置 `VITE_CESIUM_ION_ACCESS_TOKEN` 后，初始化 ion 资源与世界地形兜底所需令牌。
 */
export async function createViewer(container: HTMLElement, options?: MapEngineCreationOptions) {
  const ionAccessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim()
  const renderingProfile = options?.renderingProfile ?? "primary"
  const renderingSettings = {
    useBrowserRecommendedResolution: renderingProfile === "secondary",
    preserveDrawingBuffer: renderingProfile !== "secondary",
    resolutionScale: renderingProfile === "secondary" ? SECONDARY_RESOLUTION_SCALE : 1,
  }

  if (ionAccessToken) {
    Cesium.Ion.defaultAccessToken = ionAccessToken
  }

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: false,
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
    // 主视口使用设备物理像素；分屏 2D 辅助视口按浏览器推荐分辨率降低双渲染循环压力。
    useBrowserRecommendedResolution: renderingSettings.useBrowserRecommendedResolution,
    contextOptions: {
      webgl: {
        alpha: true,
        // 截图能力只保留在主视口；辅助视口关闭保留缓冲以降低显存与合成压力。
        preserveDrawingBuffer: renderingSettings.preserveDrawingBuffer,
      },
    },
  })

  addFallbackTiandituLayers(viewer, import.meta.env.VITE_TIANDITU_KEY)

  viewer.resolutionScale = renderingSettings.resolutionScale

  logMapDiagnostic("cesium:viewer-created", {
    viewport: [container.clientWidth, container.clientHeight],
    canvas: [viewer.canvas.clientWidth, viewer.canvas.clientHeight],
  })

  // 贴地绘制能力只服务主视口；分屏辅助视口不加载额外地形高度缓存。
  if (renderingProfile === "primary") {
    loadTerrainResourcesAfterFirstRender(viewer)
  }

  return viewer
}

/** 首帧后再初始化地形高度缓存，避免阻塞 Viewer 创建。 */
function loadTerrainResourcesAfterFirstRender(viewer: Cesium.Viewer) {
  const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
    removePostRenderListener()
    startTerrainResources(viewer)
  })
}

/** 初始化贴地绘制依赖的地形高度资源。 */
function startTerrainResources(viewer: Cesium.Viewer) {
  logMapDiagnostic("cesium:terrain-heights:start")

  Cesium.GroundPrimitive.initializeTerrainHeights().then(
    () => {
      if (!viewer.isDestroyed()) {
        logMapDiagnostic("cesium:terrain-heights:complete")
      }
    },
    (error) => {
      if (!viewer.isDestroyed()) {
        logMapDiagnostic("cesium:terrain-heights:error", String(error))
      }
    },
  )
}
