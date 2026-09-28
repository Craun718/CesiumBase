import * as Cesium from "cesium"
import { logMapDiagnostic } from "../../diagnostics"

/**
 * 安装 Cesium 渲染与地形请求诊断，仅记录错误而不改变场景行为。
 */
export function installCesiumDiagnostics(viewer: Cesium.Viewer) {
  viewer.scene.renderError.addEventListener((_scene, error) => {
    logMapDiagnostic("cesium:scene-render-error", String(error))
  })

  let removeTerrainErrorListener: (() => void) | undefined
  const watchTerrainProvider = () => {
    removeTerrainErrorListener?.()
    removeTerrainErrorListener = viewer.scene.terrainProvider.errorEvent.addEventListener(
      (error) => {
        logMapDiagnostic("cesium:terrain-provider-error", String(error))
      },
    )
  }

  watchTerrainProvider()
  viewer.scene.terrainProviderChanged.addEventListener(watchTerrainProvider)
}
