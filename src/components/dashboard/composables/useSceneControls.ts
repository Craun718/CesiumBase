import { reactive, ref } from "vue"
import type { MapController, SceneMode } from "../../../map"
import type { MapOperationId } from "../mapControls"

/** 场景控制域的响应式状态与引擎操作。 */
export function useSceneControls(mapController: MapController) {
  const sceneMode = ref<SceneMode>("3d")
  const rotateEnabled = ref(false)
  const northLocked = ref(false)
  const terrainEnabled = ref(false)
  const undergroundEnabled = ref(false)
  const compassVisible = ref(true)
  const terrainScale = ref(1)

  /** 切换场景模式，并在进入二维时关闭仅三维可用的场景能力。 */
  function setSceneMode(mode: SceneMode) {
    sceneMode.value = mode
    mapController.setSceneMode(mode)

    if (mode !== "2d") return

    if (rotateEnabled.value) {
      rotateEnabled.value = false
      mapController.setRotateBrowse(false)
    }
    if (undergroundEnabled.value) {
      undergroundEnabled.value = false
      mapController.setUndergroundMode(false)
    }
  }

  /** 切换旋转浏览。 */
  function toggleRotateBrowse() {
    rotateEnabled.value = !rotateEnabled.value
    mapController.setRotateBrowse(rotateEnabled.value)
  }

  /** 设置正北锁定；互斥停止环绕由组合根负责。 */
  function setNorthLock(enabled: boolean) {
    northLocked.value = enabled
    mapController.setNorthLock(enabled)
  }

  /** 开启地形夸张；开启前的绘制面板关闭由组合根负责。 */
  function enableTerrain() {
    if (terrainEnabled.value) return

    terrainEnabled.value = true
    mapController.setTerrainExaggeration(true, terrainScale.value)
    mapController.setDrawingFeaturesVisible(true)
  }

  /** 切换地下模式。 */
  function toggleUnderground() {
    undergroundEnabled.value = !undergroundEnabled.value
    mapController.setUndergroundMode(undergroundEnabled.value)
  }

  /** 切换指北针显隐。 */
  function toggleCompass() {
    compassVisible.value = !compassVisible.value
  }

  /** 判断地图菜单项当前是否禁用。 */
  function isOperationDisabled(operationId: MapOperationId) {
    return (
      (operationId === "rotate-browse" || operationId === "underground") && sceneMode.value === "2d"
    )
  }

  /** 判断地图菜单项当前是否激活。 */
  function isOperationActive(operationId: MapOperationId) {
    if (operationId === "rotate-browse") return rotateEnabled.value
    if (operationId === "north-lock") return northLocked.value
    if (operationId === "underground") return undergroundEnabled.value
    return operationId === "compass" && compassVisible.value
  }

  /** 更新地形起伏倍率。 */
  function setTerrainScaleFromEvent(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return

    const nextScale = Number(input.value)
    if (Number.isNaN(nextScale)) return

    terrainScale.value = nextScale
    mapController.setTerrainExaggerationScale(nextScale)
  }

  /** 关闭地形面板并恢复原始地形倍率。 */
  function closeTerrainPanel() {
    terrainEnabled.value = false
    mapController.setTerrainExaggeration(false, terrainScale.value)
  }

  return reactive({
    sceneMode,
    rotateEnabled,
    northLocked,
    terrainEnabled,
    undergroundEnabled,
    compassVisible,
    terrainScale,
    setSceneMode,
    toggleRotateBrowse,
    setNorthLock,
    enableTerrain,
    toggleUnderground,
    toggleCompass,
    isOperationDisabled,
    isOperationActive,
    setTerrainScaleFromEvent,
    closeTerrainPanel,
  })
}

export type SceneControls = ReturnType<typeof useSceneControls>
