<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import { useLocalStore } from "../../stores"
import DataServicePanel from "../../features/data/DataServicePanel.vue"
import {
  useMapController,
  type CoordinateReadout,
  type ImagerySource,
  type MapDrawGeometryType,
  type MapDrawState,
  type SceneMode,
} from "../../map"
import AppStatusBar from "./AppStatusBar.vue"
import AlertsPanel from "./AlertsPanel.vue"
import BasemapPanel from "./BasemapPanel.vue"
import DistributionPanel from "./DistributionPanel.vue"
import DrawingPanel from "./DrawingPanel.vue"
import OverviewPanel from "./OverviewPanel.vue"
import MapStage from "./MapStage.vue"
import OperationsMenu from "./OperationsMenu.vue"
import OperationsRail from "./OperationsRail.vue"
import RailPanel from "./RailPanel.vue"
import ResourcesPanel from "./ResourcesPanel.vue"
import TerrainPanel from "./TerrainPanel.vue"
import ViewFavoritesPanel from "../ViewFavoritesPanel.vue"
import ViewOperationsPanel from "../ViewOperationsPanel.vue"
import type { OperationMenuItem, RailAction, RailCommand, RailPanelPlacement } from "./operations"
import {
  mapOperations,
  viewOperations,
  type MapControls,
  type MapOperationId,
  type ViewOperationId,
} from "./mapControls"

type LeftActionId = "overview" | "distribution" | "map" | "data"
type RightActionId = "view" | "alerts" | "resources"
type RightCommandId = "return-guangxi"

const CUSTOM_BASEMAP_ID = "custom"

const mapController = useMapController()
const localStore = useLocalStore()

const sceneMode = ref<SceneMode>("3d")
const rotateEnabled = ref(false)
const northLocked = ref(false)
const terrainEnabled = ref(false)
const undergroundEnabled = ref(false)
const compassVisible = ref(true)
const viewCenterVisible = ref(false)
const viewPositionOpen = ref(false)
const viewCameraOpen = ref(false)
const viewFavoritesOpen = ref(false)
const terrainScale = ref(1)
const basemapOpen = ref(false)
const basemapSources = ref<ImagerySource[]>([])
const drawingOpen = ref(false)
const drawingState = ref<MapDrawState>({
  mode: null,
  activeCoordinates: [],
  features: [],
})
const activeBasemapId = ref<string | undefined>("tianditu-img")
const customBaseMapUrlInput = ref(localStore.customBaseMapUrl)

const activeBasemapLabel = computed(() => {
  const id = activeBasemapId.value
  if (!id) return "天地图影像"
  if (id === CUSTOM_BASEMAP_ID) return "自定义 URL"

  return basemapSources.value.find((item) => item.id === id)?.label ?? id
})

function isMapOperationDisabled(operationId: MapOperationId) {
  return (
    (operationId === "rotate-browse" || operationId === "underground") && sceneMode.value === "2d"
  )
}

function isMapOperationActive(operationId: MapOperationId) {
  if (operationId === "rotate-browse") return rotateEnabled.value
  if (operationId === "north-lock") return northLocked.value
  if (operationId === "underground") return undergroundEnabled.value
  if (operationId === "compass") return compassVisible.value
  if (operationId === "drawing") return drawingOpen.value

  return false
}

function activateMapOperation(operationId: MapOperationId) {
  if (isMapOperationDisabled(operationId)) return

  if (operationId === "scene-mode") {
    const nextMode: SceneMode = sceneMode.value === "3d" ? "2d" : "3d"
    sceneMode.value = nextMode
    mapController.setSceneMode(nextMode)

    if (nextMode === "2d" && rotateEnabled.value) {
      rotateEnabled.value = false
      mapController.setRotateBrowse(false)
    }

    if (nextMode === "2d" && undergroundEnabled.value) {
      undergroundEnabled.value = false
      mapController.setUndergroundMode(false)
    }

    return
  }

  if (operationId === "rotate-browse") {
    rotateEnabled.value = !rotateEnabled.value
    mapController.setRotateBrowse(rotateEnabled.value)
    return
  }

  if (operationId === "north-lock") {
    northLocked.value = !northLocked.value
    mapController.setNorthLock(northLocked.value)
    return
  }

  if (operationId === "terrain") {
    // 与底图切换互斥：打开地形面板前先关闭底图面板。
    closeDrawingPanel()
    basemapOpen.value = false

    if (terrainEnabled.value) return

    terrainEnabled.value = true
    mapController.setTerrainExaggeration(true, terrainScale.value)
    return
  }

  if (operationId === "underground") {
    undergroundEnabled.value = !undergroundEnabled.value
    mapController.setUndergroundMode(undergroundEnabled.value)
    return
  }

  if (operationId === "basemap") {
    // 与地形突出互斥：打开底图面板前先关闭地形面板并回退引擎夸张设置。
    closeDrawingPanel()
    if (terrainEnabled.value) {
      terrainEnabled.value = false
      mapController.setTerrainExaggeration(false, terrainScale.value)
    }

    if (basemapOpen.value) return

    openBasemapPanel()
    return
  }

  if (operationId === "drawing") {
    // 地图左侧三级功能面板同一时间只保留一个。
    if (drawingOpen.value) {
      closeDrawingPanel()
      return
    }

    terrainEnabled.value = false
    mapController.setTerrainExaggeration(false, terrainScale.value)
    basemapOpen.value = false
    drawingOpen.value = true
    return
  }

  compassVisible.value = !compassVisible.value
}

function createSceneTimestamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function activateViewOperation(operationId: ViewOperationId) {
  if (operationId === "view-position") {
    viewCameraOpen.value = false
    viewFavoritesOpen.value = false
    viewPositionOpen.value = !viewPositionOpen.value
    return
  }

  if (operationId === "view-camera") {
    viewPositionOpen.value = false
    viewFavoritesOpen.value = false
    viewCameraOpen.value = !viewCameraOpen.value
    return
  }

  if (operationId === "view-favorites") {
    viewPositionOpen.value = false
    viewCameraOpen.value = false
    viewFavoritesOpen.value = !viewFavoritesOpen.value
    return
  }

  if (operationId === "view-fullscreen") {
    mapController.toggleSceneFullscreen().catch(() => {})
    return
  }

  if (operationId === "view-center") {
    viewCenterVisible.value = !viewCenterVisible.value
    return
  }

  const dataUrl = mapController.captureScreenshot()
  if (!dataUrl) return

  const link = document.createElement("a")
  link.href = dataUrl
  link.download = `scene-${createSceneTimestamp()}.png`
  link.click()
}

function closeViewPanel() {
  viewPositionOpen.value = false
  viewCameraOpen.value = false
  viewFavoritesOpen.value = false
}

function handleTerrainScaleInput(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return

  const nextScale = Number(input.value)
  if (Number.isNaN(nextScale)) return

  terrainScale.value = nextScale
  mapController.setTerrainExaggerationScale(nextScale)
}

function closeTerrainPanel() {
  terrainEnabled.value = false
  mapController.setTerrainExaggeration(false, terrainScale.value)
}

/** 打开底图面板并同步引擎当前图源列表与激活项；引擎未挂载时静默忽略。 */
function openBasemapPanel() {
  const sources = mapController.listBaseImagerySources()
  if (sources.length > 0) {
    basemapSources.value = sources
    activeBasemapId.value = mapController.getBaseImagerySourceId()
  }

  basemapOpen.value = true
}

function closeBasemapPanel() {
  basemapOpen.value = false
}

/** 开始一种绘制类型；引擎未挂载时保持面板状态不变。 */
function startDrawing(type: MapDrawGeometryType) {
  mapController.startDrawing(type)
}

/** 完成当前草图。 */
function finishDrawing() {
  mapController.finishDrawing()
}

/** 取消当前草图。 */
function cancelDrawing() {
  mapController.cancelDrawing()
}

/** 清空绘制草图与成果。 */
function clearDrawings() {
  mapController.clearDrawings()
}

/** 提交成果名称；空名称回退为当前名称。 */
function renameDrawing(event: Event, id: string) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return

  const feature = drawingState.value.features.find((item) => item.id === id)
  if (!feature) return

  const name = input.value.trim()
  if (!name || !mapController.renameDrawing(id, name)) {
    input.value = feature.name
  }
}

/** 删除单个绘制成果。 */
function removeDrawing(id: string) {
  mapController.removeDrawing(id)
}

/** 关闭绘制面板时退出绘制模式，不删除已完成成果。 */
function closeDrawingPanel() {
  mapController.stopDrawing()
  drawingOpen.value = false
}

/** 切换图源后保留面板，便于连续对比；关闭走面板右上角 X。 */
function selectBasemap(id: string) {
  if (mapController.setBaseImagerySource(id)) {
    activeBasemapId.value = id
  }
}

/** 应用自定义瓦片 URL：写入 localStore 持久化并切换到自定义图源。 */
function applyCustomBasemap() {
  const url = customBaseMapUrlInput.value.trim()
  if (!url) return

  if (!mapController.setCustomBaseImagerySource(url)) return

  localStore.customBaseMapUrl = url
  activeBasemapId.value = CUSTOM_BASEMAP_ID
}

/** 引擎挂载完成后，若 localStore 已有自定义 URL 则自动恢复。 */
function restoreCustomBaseMapUrl() {
  const url = localStore.customBaseMapUrl.trim()
  if (!url) return

  if (mapController.setCustomBaseImagerySource(url)) {
    activeBasemapId.value = CUSTOM_BASEMAP_ID
  }
}

/** 引擎挂载完成后从 .env 加载 DEM 服务；URL 留空时静默跳过。 */
function restoreEnvTerrainService() {
  const url = import.meta.env.VITE_DEM_SERVICE_URL?.trim()
  if (!url) return

  const token = import.meta.env.VITE_DEM_SERVICE_TOKEN?.trim()

  mapController
    .setTerrainSource({
      id: "env-config",
      name: "默认 DEM 服务",
      url,
      authToken: token || undefined,
    })
    .catch((error) => {
      console.warn("[数据服务] 加载 DEM 失败", error)
    })
}

let disposeMountState: (() => void) | undefined
let disposeDrawingState: (() => void) | undefined

disposeMountState = mapController.onMountStateChange((ready) => {
  if (ready) {
    restoreCustomBaseMapUrl()
    restoreEnvTerrainService()
  }
})

disposeDrawingState = mapController.onDrawingStateChange((state) => {
  drawingState.value = state
})

onBeforeUnmount(() => {
  disposeMountState?.()
  disposeMountState = undefined
  disposeDrawingState?.()
  disposeDrawingState = undefined
})

const controls = reactive({
  sceneMode,
  rotateEnabled,
  northLocked,
  terrainEnabled,
  undergroundEnabled,
  compassVisible,
  viewCenterVisible,
  viewPositionOpen,
  viewCameraOpen,
  viewFavoritesOpen,
  terrainScale,
  basemapOpen,
  basemapSources,
  drawingOpen,
  drawingState,
  activeBasemapId,
  activeBasemapLabel,
  customBaseMapUrlInput,
  isMapOperationDisabled,
  isMapOperationActive,
  activateMapOperation,
  activateViewOperation,
  closeViewPanel,
  handleTerrainScaleInput,
  closeTerrainPanel,
  closeBasemapPanel,
  startDrawing,
  finishDrawing,
  cancelDrawing,
  clearDrawings,
  renameDrawing,
  removeDrawing,
  closeDrawingPanel,
  selectBasemap,
  applyCustomBasemap,
}) satisfies MapControls

const leftActions = [
  { id: "overview", label: "态势总览", icon: "bi-speedometer2" },
  { id: "distribution", label: "区域分布", icon: "bi-bar-chart-line" },
  { id: "map", label: "地图操作", icon: "bi-map", customMenu: true },
  { id: "data", label: "数据服务", icon: "bi-database" },
] satisfies Array<RailAction<LeftActionId>>

const rightActions = [
  { id: "view", label: "视角操作", icon: "bi-eye", customMenu: true },
  { id: "alerts", label: "实时告警", icon: "bi-bell" },
  { id: "resources", label: "资源负载", icon: "bi-cpu" },
] satisfies Array<RailAction<RightActionId>>

const rightCommands = [
  { id: "return-guangxi", label: "返回广西", icon: "bi-geo-alt" },
] satisfies Array<RailCommand<RightCommandId>>

const mapMenuItems = computed<Array<OperationMenuItem<MapOperationId>>>(() =>
  mapOperations.map((operation) => ({
    ...operation,
    active: operation.kind === "toggle" && isMapOperationActive(operation.id),
    open:
      (operation.id === "terrain" && controls.terrainEnabled) ||
      (operation.id === "basemap" && controls.basemapOpen) ||
      (operation.id === "drawing" && controls.drawingOpen),
    disabled: isMapOperationDisabled(operation.id),
    disabledReason: isMapOperationDisabled(operation.id) ? "仅3D模式可用" : undefined,
    badge: operation.kind === "mode" ? controls.sceneMode.toUpperCase() : undefined,
  })),
)

function getLeftExternalPanel(actionId: LeftActionId) {
  if (actionId !== "map") return

  if (controls.drawingOpen) {
    return { controlId: "drawing-window", close: closeDrawingPanel }
  }

  if (controls.terrainEnabled) {
    return { controlId: "terrain-scale-window", close: closeTerrainPanel }
  }

  if (controls.basemapOpen) {
    return { controlId: "basemap-window", close: closeBasemapPanel }
  }

  return undefined
}

const viewMenuItems = computed<Array<OperationMenuItem<ViewOperationId>>>(() =>
  viewOperations.map((operation) => ({
    ...operation,
    active:
      (operation.id === "view-center" && controls.viewCenterVisible) ||
      (operation.id === "view-position" && controls.viewPositionOpen) ||
      (operation.id === "view-camera" && controls.viewCameraOpen) ||
      (operation.id === "view-favorites" && controls.viewFavoritesOpen),
  })),
)

function activateRightCommand(commandId: RightCommandId) {
  if (commandId === "return-guangxi") {
    mapController.returnToGuangxi()
  }
}

function getRightExternalPanel(actionId: RightActionId) {
  if (actionId !== "view") return undefined

  if (controls.viewPositionOpen) {
    return { controlId: "right-view-position-panel", close: closeViewPanel }
  }

  if (controls.viewCameraOpen) {
    return { controlId: "right-view-camera-panel", close: closeViewPanel }
  }

  if (controls.viewFavoritesOpen) {
    return { controlId: "right-view-favorites-panel", close: closeViewPanel }
  }

  return undefined
}

function getLeftPanelPlacement(placement: RailPanelPlacement) {
  return placement === "left-third" ? placement : "left"
}

function getRightPanelPlacement(placement: RailPanelPlacement) {
  return placement === "right-third" ? placement : "right"
}

const readout = ref<CoordinateReadout | undefined>(mapController.getCoordinateReadout())

const coordinateReadoutText = computed(() => {
  if (!readout.value) return "经度 -- · 纬度 -- · 高程 --"

  const { longitude, latitude, height } = readout.value

  return `经度 ${longitude.toFixed(5)}° · 纬度 ${latitude.toFixed(5)}° · 高程 ${Math.round(
    height,
  )}m`
})

const coordinateReadoutTitle = computed(() =>
  !readout.value
    ? "等待地图读数就绪"
    : readout.value.source === "pointer"
      ? "鼠标位置"
      : "视图中心",
)

let disposeReadout: (() => void) | undefined

onMounted(() => {
  disposeReadout = mapController.onCoordinateReadoutChange((value) => {
    readout.value = value
  })
})

onBeforeUnmount(() => {
  disposeReadout?.()
  disposeReadout = undefined
})
</script>

<template>
  <main class="dashboard-body">
    <div class="content-grid">
      <OperationsRail
        side="left"
        label="左侧操作"
        :actions="leftActions"
        :get-external-panel="getLeftExternalPanel"
      >
        <template #menu="{ action, close }">
          <OperationsMenu
            v-if="action.id === 'map'"
            side="left"
            action-id="map"
            title="地图操作"
            tag="MAP CONTROL"
            :operations="mapMenuItems"
            @activate="activateMapOperation"
            @close="close"
          />
        </template>

        <template #panels="{ activePanelId, panelPlacement, closePanel }">
          <DrawingPanel
            v-if="controls.drawingOpen"
            :controls="controls"
            :placement="getLeftPanelPlacement(panelPlacement)"
          />

          <BasemapPanel
            v-if="controls.basemapOpen"
            :controls="controls"
            :placement="getLeftPanelPlacement(panelPlacement)"
          />

          <TerrainPanel
            v-if="controls.terrainEnabled"
            :controls="controls"
            :placement="getLeftPanelPlacement(panelPlacement)"
          />

          <OverviewPanel
            v-if="activePanelId === 'overview'"
            :placement="getLeftPanelPlacement(panelPlacement)"
            @close="closePanel"
          />

          <DistributionPanel
            v-if="activePanelId === 'distribution'"
            :placement="getLeftPanelPlacement(panelPlacement)"
            @close="closePanel"
          />

          <DataServicePanel
            v-if="activePanelId === 'data'"
            :placement="getLeftPanelPlacement(panelPlacement)"
            @close="closePanel"
          />
        </template>
      </OperationsRail>

      <MapStage :controls="controls" />

      <OperationsRail
        side="right"
        label="右侧操作"
        :actions="rightActions"
        :commands="rightCommands"
        :get-external-panel="getRightExternalPanel"
        @command="activateRightCommand"
      >
        <template #menu="{ close }">
          <OperationsMenu
            side="right"
            action-id="view"
            title="视角操作"
            :operations="viewMenuItems"
            @activate="activateViewOperation"
            @close="close"
          />
        </template>

        <template #panels="{ activePanelId, panelPlacement, closePanel }">
          <RailPanel
            v-if="controls.viewPositionOpen"
            id="right-view-position-panel"
            :placement="getRightPanelPlacement(panelPlacement)"
            title="视角定位"
            tag="VIEW"
            close-label="关闭视角定位"
            @close="closeViewPanel"
          >
            <ViewOperationsPanel section="position" />
          </RailPanel>

          <RailPanel
            v-if="controls.viewCameraOpen"
            id="right-view-camera-panel"
            :placement="getRightPanelPlacement(panelPlacement)"
            title="相机参数"
            tag="CAMERA"
            close-label="关闭相机参数"
            @close="closeViewPanel"
          >
            <ViewOperationsPanel section="camera" />
          </RailPanel>

          <RailPanel
            v-if="controls.viewFavoritesOpen"
            id="right-view-favorites-panel"
            :placement="getRightPanelPlacement(panelPlacement)"
            title="视图收藏"
            tag="FAVORITES"
            close-label="关闭视图收藏"
            @close="closeViewPanel"
          >
            <ViewFavoritesPanel />
          </RailPanel>

          <AlertsPanel
            v-if="activePanelId === 'alerts'"
            :placement="getRightPanelPlacement(panelPlacement)"
            @close="closePanel"
          />

          <ResourcesPanel
            v-if="activePanelId === 'resources'"
            :placement="getRightPanelPlacement(panelPlacement)"
            @close="closePanel"
          />
        </template>
      </OperationsRail>
    </div>
  </main>

  <AppStatusBar
    :basemap-label="controls.activeBasemapLabel"
    :readout-text="coordinateReadoutText"
    :readout-title="coordinateReadoutTitle"
    :scene-mode="controls.sceneMode"
  />
</template>

<style scoped lang="scss">
.dashboard-body {
  min-width: 0;
  min-height: 0;
  display: flex;
  pointer-events: none;
}

.content-grid {
  --rail-map-gap: 18px;
  --rail-width: 56px;
  --map-menu-width: min(302px, calc(100vw - 112px - 4 * var(--rail-map-gap)));

  flex: 1;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  align-items: stretch;
}

@media (max-width: 1439px) {
  .content-grid {
    --map-menu-width: min(286px, calc(100vw - 88px - 4 * var(--rail-map-gap)));
  }
}

@media (max-width: 1023px) {
  .dashboard-body {
    overflow: hidden;
  }

  .content-grid {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
  }
}
</style>
