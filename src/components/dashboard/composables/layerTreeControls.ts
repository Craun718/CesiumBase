import { ref } from "vue"

/** 创建图层树开关状态；保留 ref 对象以便组合根继续响应式包装。 */
export function createLayerTreeControls() {
  const layerTreeOpen = ref(false)

  return {
    layerTreeOpen,
    /** 切换图层树浮窗。 */
    toggleLayerTree() {
      layerTreeOpen.value = !layerTreeOpen.value
    },
    /** 关闭图层树浮窗。 */
    closeLayerTree() {
      layerTreeOpen.value = false
    },
  }
}
