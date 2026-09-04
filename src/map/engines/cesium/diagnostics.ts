import type * as Cesium from "cesium"
import { isMapDebugEnabled, logMapDiagnostic } from "../../diagnostics"

type DiagnosticsDisposer = () => void

/** 调试模式下把 Viewer 挂到 window，便于在控制台直接检查场景状态。 */
function exposeViewer(viewer: Cesium.Viewer) {
  if (!isMapDebugEnabled) return

  Object.assign(window, { __cesiumViewer: viewer })
}

function watchImageryLayer(layer: Cesium.ImageryLayer): DiagnosticsDisposer {
  return layer.errorEvent.addEventListener((error) => {
    logMapDiagnostic("cesium:imagery-error", error)
  })
}

export function installCesiumDiagnostics(viewer: Cesium.Viewer): DiagnosticsDisposer {
  if (!isMapDebugEnabled) return () => {}

  exposeViewer(viewer)

  const disposers: DiagnosticsDisposer[] = []
  disposers.push(
    viewer.scene.renderError.addEventListener((scene, error) => {
      logMapDiagnostic("cesium:render-error", error)
      console.error("[map] Cesium render error", { scene, error })
    }),
  )

  for (let index = 0; index < viewer.imageryLayers.length; index += 1) {
    disposers.push(watchImageryLayer(viewer.imageryLayers.get(index)))
  }

  disposers.push(
    viewer.imageryLayers.layerAdded.addEventListener((layer) => {
      logMapDiagnostic("cesium:imagery-layer-added", layer.imageryProvider)
      disposers.push(watchImageryLayer(layer))
    }),
  )

  const handleContextLost = (event: Event) => {
    event.preventDefault()
    logMapDiagnostic("cesium:webgl-context-lost")
    console.error("[map] Cesium WebGL context lost")
  }
  const handleContextRestored = () => {
    logMapDiagnostic("cesium:webgl-context-restored")
  }

  viewer.canvas.addEventListener("webglcontextlost", handleContextLost)
  viewer.canvas.addEventListener("webglcontextrestored", handleContextRestored)

  let renderCount = 0
  const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
    renderCount += 1

    if (renderCount === 1) {
      logMapDiagnostic("cesium:first-render", {
        canvas: [viewer.canvas.clientWidth, viewer.canvas.clientHeight],
        drawingBuffer: [viewer.canvas.width, viewer.canvas.height],
      })
    }

    if (renderCount >= 3) removePostRenderListener()
  })
  disposers.push(removePostRenderListener)

  return () => {
    for (const dispose of disposers) dispose()
    viewer.canvas.removeEventListener("webglcontextlost", handleContextLost)
    viewer.canvas.removeEventListener("webglcontextrestored", handleContextRestored)
  }
}
