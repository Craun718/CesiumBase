import { onScopeDispose, reactive, ref } from "vue"
import type { MapController } from "../../../map"
import { useToast } from "../../base/useToast"
import type { ViewOperationId } from "../mapControls"

/** 截图反馈的停留时长；只是确认动作已完成，取最短的一档。 */
const SCREENSHOT_TOAST_DURATION = 2500

/** 视角控制域：面板切换、环绕飞行、截图反馈和引擎状态同步。 */
export function useViewControls(mapController: MapController) {
  const toast = useToast()
  const viewCenterVisible = ref(false)
  const viewPositionOpen = ref(false)
  const viewCameraOpen = ref(false)
  const viewFavoritesOpen = ref(false)
  const viewFlightOpen = ref(false)
  const orbitFlightOpen = ref(false)
  const orbitFlightEnabled = ref(false)
  const selectedFlightRouteId = ref("")
  const flightRouteSettingsOpen = ref(false)

  onScopeDispose(
    mapController.onOrbitFlightStateChange((state) => {
      orbitFlightEnabled.value = state.status !== "idle"
      if (state.status === "idle" && orbitFlightOpen.value) {
        orbitFlightOpen.value = false
      }
    }),
  )

  /** 关闭普通视角面板与航线参数面板，不影响环绕飞行状态。 */
  function closeRegularPanels() {
    viewPositionOpen.value = false
    viewCameraOpen.value = false
    viewFavoritesOpen.value = false
    viewFlightOpen.value = false
    flightRouteSettingsOpen.value = false
  }

  /** 关闭全部视角面板；环绕飞行同步停止。 */
  function closeViewPanel() {
    closeRegularPanels()
    if (orbitFlightOpen.value) {
      orbitFlightOpen.value = false
      orbitFlightEnabled.value = false
      mapController.setOrbitFlight(false)
    }
  }

  /** 打开一个普通视角面板并关闭其它普通面板。 */
  function openPanel(operationId: Exclude<ViewOperationId, "view-orbit-flight">) {
    closeRegularPanels()

    if (operationId === "view-position") viewPositionOpen.value = true
    if (operationId === "view-camera") viewCameraOpen.value = true
    if (operationId === "view-favorites") viewFavoritesOpen.value = true
    if (operationId === "view-flight") viewFlightOpen.value = true
  }

  /** 关闭航线参数四级面板。 */
  function closeFlightRouteSettings() {
    flightRouteSettingsOpen.value = false
  }

  /** 记录当前选中的漫游航线。 */
  function selectFlightRoute(routeId: string) {
    selectedFlightRouteId.value = routeId
  }

  /** 切换航线参数四级面板。 */
  function toggleFlightRouteSettings() {
    flightRouteSettingsOpen.value = !flightRouteSettingsOpen.value
  }

  /** 停止环绕飞行并关闭其面板。 */
  function stopOrbitFlight() {
    orbitFlightOpen.value = false
    orbitFlightEnabled.value = false
    mapController.setOrbitFlight(false)
  }

  /** 启动环绕飞行并打开面板；前置互斥由组合根处理。 */
  function startOrbitFlight(durationSeconds: number) {
    orbitFlightEnabled.value = true
    orbitFlightOpen.value = true
    mapController.setOrbitFlight(true, { durationSeconds })
  }

  /** 切换环绕飞行面板；启动或停止由组合根决定。 */
  function toggleOrbitPanel() {
    orbitFlightOpen.value = !orbitFlightOpen.value
  }

  /** 切换视角中心标记。 */
  function toggleViewCenter() {
    viewCenterVisible.value = !viewCenterVisible.value
  }

  /** 切换场景全屏；失败时保持静默，与既有行为一致。 */
  function toggleFullscreen() {
    mapController.toggleSceneFullscreen().catch(() => {})
  }

  /** 生成截图文件名使用的时间戳。 */
  function createSceneTimestamp() {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, "0")

    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
      now.getHours(),
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  }

  /**
   * 显示截图反馈；停留时长与自动关闭由提示条队列负责。
   *
   * 不指定 id，交给队列按内容派生：连拍多张时文件名各不相同，几条反馈并存各自计时；
   * 同一句失败提示重复出现才合并并重置计时。
   */
  function showScreenshotFeedback(message: string) {
    toast.show({ tone: "info", message, duration: SCREENSHOT_TOAST_DURATION })
  }

  /** 下载当前场景截图；失败时展示统一错误提示。 */
  function captureScreenshot() {
    const dataUrl = mapController.captureScreenshot()
    if (!dataUrl) {
      showScreenshotFeedback("截图失败，请稍后重试")
      return
    }

    const link = document.createElement("a")
    link.href = dataUrl
    link.download = `scene-${createSceneTimestamp()}.png`
    link.click()
    showScreenshotFeedback(`已保存为 ${link.download}`)
  }

  return reactive({
    viewCenterVisible,
    viewPositionOpen,
    viewCameraOpen,
    viewFavoritesOpen,
    viewFlightOpen,
    orbitFlightOpen,
    orbitFlightEnabled,
    selectedFlightRouteId,
    flightRouteSettingsOpen,
    closeRegularPanels,
    closeViewPanel,
    openPanel,
    closeFlightRouteSettings,
    selectFlightRoute,
    toggleFlightRouteSettings,
    stopOrbitFlight,
    startOrbitFlight,
    toggleOrbitPanel,
    toggleViewCenter,
    toggleFullscreen,
    captureScreenshot,
  })
}

export type ViewControls = ReturnType<typeof useViewControls>
