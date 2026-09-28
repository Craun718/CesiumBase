import { onScopeDispose, reactive, ref } from "vue"
import type { MapController } from "../../../map"
import { restoreDrawingFeatures, serializeDrawingFeatures } from "../../../map/drawingPersistence"
import type { MapDrawGeometryType, MapDrawStartOptions, MapDrawState } from "../../../map"
import { useLocalStore } from "../../../stores"

/** 二维绘制控制域：面板状态、引擎交互和本机成果持久化。 */
export function useDrawingControls(mapController: MapController) {
  const localStore = useLocalStore()
  const open = ref(false)
  const state = ref<MapDrawState>({
    mode: null,
    activeCoordinates: [],
    features: [],
    selectedFeatureId: null,
    editingActive: false,
  })
  let persistenceEnabled = false

  onScopeDispose(
    mapController.onDrawingStateChange((value) => {
      state.value = value
      if (persistenceEnabled) {
        localStore.drawingFeatures = serializeDrawingFeatures(value.features)
      }
    }),
  )

  /** 开始一种绘制类型；引擎未挂载时面板状态不变。 */
  function start(type: MapDrawGeometryType, options?: MapDrawStartOptions) {
    mapController.startDrawing(type, options)
  }

  /** 同步绘制参数。 */
  function setOption(option: Partial<MapDrawStartOptions>) {
    mapController.setDrawingOption(option)
  }

  /** 完成当前草图。 */
  function finish() {
    mapController.finishDrawing()
  }

  /** 取消当前草图。 */
  function cancel() {
    mapController.cancelDrawing()
  }

  /** 清空全部绘制成果。 */
  function clear() {
    mapController.clearDrawings()
  }

  /** 提交成果名称；空名称或失败时回滚输入框。 */
  function rename(event: Event, id: string) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return

    const feature = state.value.features.find((item) => item.id === id)
    if (!feature) return

    const name = input.value.trim()
    if (!name || !mapController.renameDrawing(id, name)) {
      input.value = feature.name
    }
  }

  /** 删除单个绘制成果。 */
  function remove(id: string) {
    mapController.removeDrawing(id)
  }

  /** 为选中要素建立缓冲区；调用方负责参数校验。 */
  function applyBuffer(distanceMeters: number) {
    const id = state.value.selectedFeatureId
    if (!id || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return
    mapController.createBufferFromFeature(id, distanceMeters)
  }

  /** 选中或取消选中成果。 */
  function selectFeature(id: string | null) {
    mapController.selectDrawingFeature(id)
  }

  /** 关闭面板并退出绘制模式，不删除已完成成果。 */
  function closePanel() {
    mapController.stopDrawing()
    mapController.setDrawingFeaturesVisible(false)
    open.value = false
  }

  /** 显示绘制成果，并打开面板。 */
  function openPanel() {
    mapController.setDrawingFeaturesVisible(true)
    open.value = true
  }

  /** 引擎就绪后恢复本机成果，并开启后续状态持久化。 */
  function restore() {
    persistenceEnabled = true
    mapController.restoreDrawings(restoreDrawingFeatures(localStore.drawingFeatures))
  }

  return reactive({
    open,
    state,
    start,
    setOption,
    finish,
    cancel,
    clear,
    rename,
    remove,
    applyBuffer,
    selectFeature,
    closePanel,
    openPanel,
    restore,
  })
}

export type Drawing2DControls = ReturnType<typeof useDrawingControls>
