import { onScopeDispose, reactive, ref } from "vue"
import type { MapController, MeasurementState } from "../../../map"
import type { MeasurementOperationId } from "../mapControls"

/** 测量控制域：维护面板开关并同步引擎测量状态。 */
export function useMeasurementControls(mapController: MapController) {
  const open = ref(false)
  const state = ref<MeasurementState>(mapController.getMeasurementState())

  onScopeDispose(
    mapController.onMeasurementStateChange((value) => {
      state.value = value
    }),
  )

  /** 打开测量面板并切换到指定模式；绘制互斥由组合根处理。 */
  function activate(operationId: MeasurementOperationId) {
    open.value = true
    mapController.setMeasurementMode(operationId)
  }

  /** 关闭测量面板并退出测量模式。 */
  function closePanel() {
    open.value = false
    mapController.setMeasurementMode(null)
  }

  /** 撤销最后一个确认点。 */
  function undoPoint() {
    mapController.undoMeasurementPoint()
  }

  /** 清空测量点并保持模式。 */
  function clear() {
    mapController.clearMeasurement()
  }

  return reactive({
    open,
    state,
    activate,
    closePanel,
    undoPoint,
    clear,
  })
}

export type MeasurementControls = ReturnType<typeof useMeasurementControls>
