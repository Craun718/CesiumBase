import { onScopeDispose, reactive, ref } from "vue"
import type {
  MapController,
  MapDraw3DGeometryType,
  MapDraw3DStartOptions,
  MapDraw3DState,
} from "../../../map"
import {
  restoreDrawing3DFeatures,
  serializeDrawing3DFeatures,
} from "../../../map/drawingPersistence"
import { useLocalStore } from "../../../stores"

/** 三维绘制控制域：面板状态、引擎交互和本机成果持久化。 */
export function useDrawing3DControls(mapController: MapController) {
  const localStore = useLocalStore()
  const open = ref(false)
  const state = ref<MapDraw3DState>({
    mode: null,
    activeCoordinates: [],
    features: [],
    selectedFeatureId: null,
  })
  let persistenceEnabled = false

  onScopeDispose(
    mapController.on3DDrawingStateChange((value) => {
      state.value = value
      if (persistenceEnabled) {
        localStore.drawing3DFeatures = serializeDrawing3DFeatures(value.features)
      }
    }),
  )

  /** 开始一种三维绘制类型。 */
  function start(type: MapDraw3DGeometryType, options?: MapDraw3DStartOptions) {
    mapController.start3DDrawing(type, options)
  }

  /** 同步三维绘制参数。 */
  function setOption(option: Partial<MapDraw3DStartOptions>) {
    mapController.set3DDrawingOption(option)
  }

  /** 完成当前三维草图。 */
  function finish() {
    mapController.finish3DDrawing()
  }

  /** 取消当前三维草图。 */
  function cancel() {
    mapController.cancel3DDrawing()
  }

  /** 清空全部三维成果。 */
  function clear() {
    mapController.clear3DDrawings()
  }

  /** 提交三维成果名称；空名称或失败时回滚输入框。 */
  function rename(event: Event, id: string) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return

    const feature = state.value.features.find((item) => item.id === id)
    if (!feature) return

    const name = input.value.trim()
    if (!name || !mapController.rename3DDrawing(id, name)) {
      input.value = feature.name
    }
  }

  /** 删除单个三维成果。 */
  function remove(id: string) {
    mapController.remove3DDrawing(id)
  }

  /** 选中或取消选中三维成果。 */
  function selectFeature(id: string | null) {
    mapController.select3DDrawingFeature(id)
  }

  /** 关闭面板并退出三维绘制模式。 */
  function closePanel() {
    mapController.stop3DDrawing()
    mapController.set3DDrawingFeaturesVisible(false)
    open.value = false
  }

  /** 显示三维绘制成果并打开面板。 */
  function openPanel() {
    mapController.set3DDrawingFeaturesVisible(true)
    open.value = true
  }

  /** 引擎就绪后恢复本机三维成果，并开启后续持久化。 */
  function restore() {
    persistenceEnabled = true
    mapController.restore3DDrawings(restoreDrawing3DFeatures(localStore.drawing3DFeatures))
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
    selectFeature,
    closePanel,
    openPanel,
    restore,
  })
}

export type Drawing3DControls = ReturnType<typeof useDrawing3DControls>
