import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics"
import { registerInitialBaseLayers } from "./baseImagery"
import { findCesiumImagerySource, DEFAULT_CESIUM_IMAGERY_SOURCE_ID } from "./imagerySources"

/**
 * 创建 Viewer 并应用默认图源（影像底图）。
 *
 * 默认图源取自 `imagerySources` 注册表首项；后续可通过
 * `applyCesiumImagerySource` 在不重建 Viewer 的情况下热切换。
 *
 * 注：天地图 Key（VITE_TIANDITU_KEY）必须在 .env 中配置，否则抛错。
 * 可选：在 .env 中配置 `VITE_CESIUM_ION_ACCESS_TOKEN` 后，会在首帧
 * 后异步加载 Cesium World Terrain 地形，留空则不加载地形。
 */
export async function createViewer(container: HTMLElement) {
  const defaultSource = findCesiumImagerySource(DEFAULT_CESIUM_IMAGERY_SOURCE_ID)

  if (!defaultSource) {
    // 理论上不会触发：注册表首项永远存在。这里给出显式保护以便排错。
    throw new Error(`默认图源 ${DEFAULT_CESIUM_IMAGERY_SOURCE_ID} 未在注册表中定义`)
  }

  const baseLayers = defaultSource.createLayers()
  const baseLayer = baseLayers[0]

  const ionAccessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim()
  const demServiceUrl = import.meta.env.VITE_DEM_SERVICE_URL?.trim()

  if (ionAccessToken) {
    Cesium.Ion.defaultAccessToken = ionAccessToken
  } else {
    console.warn(
      "[Cesium] 未配置 VITE_CESIUM_ION_ACCESS_TOKEN，无法加载地形；如需地形请在 .env 中填入 Cesium ion 令牌",
    )
  }

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
    // 使用设备物理像素渲染，避免高分屏上先按 1x 绘制再放大产生明显锯齿。
    useBrowserRecommendedResolution: false,
    contextOptions: {
      webgl: {
        alpha: true,
        // 允许在截屏回调中直接读取 WebGL 画布，避免渲染缓冲区已被清空。
        preserveDrawingBuffer: true,
      },
    },
  })

  logMapDiagnostic("cesium:viewer-created", {
    viewport: [container.clientWidth, container.clientHeight],
    canvas: [viewer.canvas.clientWidth, viewer.canvas.clientHeight],
  })

  for (const layer of baseLayers.slice(1)) {
    viewer.imageryLayers.add(layer)
  }

  // 把已加入 Viewer 的基底图层登记到 baseImagery 跟踪表，便于后续热切换时整体替换。
  registerInitialBaseLayers(viewer, defaultSource, baseLayers)

  // 首帧后再加载地形，避免 Ion 元数据请求阻塞地球与底图显示。
  // 已配置自建 DEM 时跳过 World Terrain，避免默认地形在首帧后覆盖自定义服务。
  loadTerrainAfterFirstRender(viewer, Boolean(ionAccessToken) && !demServiceUrl)

  return viewer
}

function loadTerrainAfterFirstRender(viewer: Cesium.Viewer, shouldLoadWorldTerrain: boolean) {
  const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
    removePostRenderListener()
    startTerrainResources(viewer, shouldLoadWorldTerrain)
  })
}

function startTerrainResources(viewer: Cesium.Viewer, shouldLoadWorldTerrain: boolean) {
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

  if (!shouldLoadWorldTerrain) return

  logMapDiagnostic("cesium:world-terrain:start")

  const terrain = Cesium.Terrain.fromWorldTerrain({
    requestVertexNormals: true,
    requestWaterMask: true,
  })
  const removeReadyListener = terrain.readyEvent.addEventListener(() => {
    removeTerrainListeners()

    if (!viewer.isDestroyed()) {
      logMapDiagnostic("cesium:world-terrain:ready")
    }
  })
  const removeErrorListener = terrain.errorEvent.addEventListener((error) => {
    removeTerrainListeners()

    if (!viewer.isDestroyed()) {
      logMapDiagnostic("cesium:world-terrain:error", String(error))
    }
  })

  function removeTerrainListeners() {
    removeReadyListener()
    removeErrorListener()
  }

  viewer.scene.setTerrain(terrain)
}
