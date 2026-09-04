<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import ErrorBoundary from "./components/ErrorBoundary.vue"
import MapViewport from "./components/MapViewport.vue"
import FloatingWindow from "./components/FloatingWindow.vue"
import ViewOperationsPanel from "./components/ViewOperationsPanel.vue"
import ViewFavoritesPanel from "./components/ViewFavoritesPanel.vue"
import {
  mapEngineId,
  provideMapController,
  type CoordinateReadout,
  type ImagerySource,
  type SceneMode,
} from "./map"
import { useLocalStore } from "./stores"

type LeftPanelId = "overview" | "distribution" | "map"
type RightMenuId = "view" | "alerts" | "resources"
type ViewPanelId = "view-position" | "view-camera" | "view-favorites"
type ViewOperationId = ViewPanelId | "view-fullscreen" | "view-screenshot" | "view-center"
type RightPanelId = "alerts" | "resources"
type RightCommandId = "return-guangxi"
type MapOperationId =
  | "scene-mode"
  | "rotate-browse"
  | "north-lock"
  | "terrain"
  | "underground"
  | "basemap"
  | "compass"

const activeLeftPanel = ref<LeftPanelId | null>(null)
const activeRightPanel = ref<RightPanelId | null>(null)
const activeViewPanel = ref<ViewPanelId | null>(null)
const expandedLeftMenu = ref<LeftPanelId | null>(null)
const expandedRightMenu = ref<RightMenuId | null>(null)
const sceneMode = ref<SceneMode>("3d")
const rotateEnabled = ref(false)
const northLocked = ref(false)
const terrainEnabled = ref(false)
const undergroundEnabled = ref(false)
const compassVisible = ref(true)
const viewCenterVisible = ref(false)
const terrainScale = ref(1)
const basemapOpen = ref(false)
// 图源列表在打开底图面板时从引擎拉取；激活 id 默认与注册表首项对齐，避免状态栏空白。
const basemapSources = ref<ImagerySource[]>([])
const activeBasemapId = ref<string | undefined>("tianditu-img")
const localStore = useLocalStore()
const CUSTOM_BASEMAP_ID = "custom"
// 自定义底图 URL 输入框，初始值来自 localStore（localStorage 持久化）
const customBaseMapUrlInput = ref<string>(localStore.customBaseMapUrl)
const mapController = provideMapController()
let disposeMountState: (() => void) | undefined
let disposeCoordinateReadout: (() => void) | undefined
const coordinateReadout = ref<CoordinateReadout | undefined>(mapController.getCoordinateReadout())

const activeBasemapLabel = computed(() => {
  const id = activeBasemapId.value
  if (!id) return "天地图影像"
  if (id === CUSTOM_BASEMAP_ID) return "自定义 URL"
  const source = basemapSources.value.find((item) => item.id === id)
  return source?.label ?? id
})

const mapEngineLabel = mapEngineId === "deck-gl" ? "DECK.GL" : "CESIUM"

const coordinateReadoutText = computed(() => {
  if (!coordinateReadout.value) {
    return "经度 -- · 纬度 -- · 高程 --"
  }

  const { longitude, latitude, height } = coordinateReadout.value

  return `经度 ${longitude.toFixed(5)}° · 纬度 ${latitude.toFixed(5)}° · 高程 ${Math.round(
    height,
  )}m`
})

const coordinateReadoutTitle = computed(() =>
  !coordinateReadout.value
    ? "等待地图读数就绪"
    : coordinateReadout.value.source === "pointer"
      ? "鼠标位置"
      : "视图中心",
)

const leftActions = [
  { id: "overview", label: "态势总览", icon: "bi-speedometer2" },
  { id: "distribution", label: "区域分布", icon: "bi-bar-chart-line" },
  { id: "map", label: "地图操作", icon: "bi-map" },
] satisfies Array<{ id: LeftPanelId; label: string; icon: string }>

const rightActions = [
  { id: "view", label: "视角操作", icon: "bi-eye" },
  { id: "alerts", label: "实时告警", icon: "bi-bell" },
  { id: "resources", label: "资源负载", icon: "bi-cpu" },
] satisfies Array<{ id: RightMenuId; label: string; icon: string }>

const rightCommands = [
  { id: "return-guangxi", label: "返回广西", icon: "bi-geo-alt" },
] satisfies Array<{ id: RightCommandId; label: string; icon: string }>

const viewOperations = [
  { id: "view-position", label: "视角定位", icon: "bi-crosshair", kind: "panel" },
  { id: "view-camera", label: "相机参数", icon: "bi-camera-reels", kind: "panel" },
  { id: "view-favorites", label: "视图收藏", icon: "bi-bookmark-star", kind: "panel" },
  { id: "view-fullscreen", label: "场景全屏", icon: "bi-arrows-fullscreen", kind: "command" },
  { id: "view-screenshot", label: "场景截屏下载", icon: "bi-camera", kind: "command" },
  { id: "view-center", label: "显示视角中心", icon: "bi-crosshair2", kind: "toggle" },
] satisfies Array<{
  id: ViewOperationId
  label: string
  icon: string
  kind: "panel" | "command" | "toggle"
}>

const mapOperations = [
  { id: "scene-mode", label: "2D/3D切换", icon: "bi-layers", kind: "mode" },
  { id: "rotate-browse", label: "旋转浏览", icon: "bi-arrow-repeat", kind: "toggle" },
  { id: "north-lock", label: "正北锁定", icon: "bi-compass", kind: "toggle" },
  { id: "terrain", label: "地形突出", icon: "bi-mountain", kind: "command" },
  { id: "underground", label: "地下模式", icon: "bi-layers-half", kind: "toggle" },
  { id: "basemap", label: "底图切换", icon: "bi-grid-1x2", kind: "command" },
  { id: "compass", label: "显示指北针", icon: "bi-signpost-2", kind: "toggle" },
] satisfies Array<{
  id: MapOperationId
  label: string
  icon: string
  kind: "command" | "mode" | "toggle"
}>

const expandedLeftAction = computed(
  () => leftActions.find((action) => action.id === expandedLeftMenu.value) ?? null,
)

const expandedRightAction = computed(
  () => rightActions.find((action) => action.id === expandedRightMenu.value) ?? null,
)

function toggleLeftPanel(panel: LeftPanelId) {
  if (panel === "map") {
    expandedLeftMenu.value = expandedLeftMenu.value === panel ? null : panel
    activeLeftPanel.value = null
    return
  }

  if (activeLeftPanel.value === panel) {
    closeLeftPanel()
    return
  }

  if (expandedLeftMenu.value === panel) {
    openLeftPanel(panel)
    return
  }

  expandedLeftMenu.value = panel
  activeLeftPanel.value = null
}

function toggleRightAction(action: RightMenuId) {
  if (action === "view") {
    if (expandedRightMenu.value === action) {
      expandedRightMenu.value = null
      return
    }

    expandedRightMenu.value = action
    activeRightPanel.value = null
    return
  }

  if (activeRightPanel.value === action) {
    closeRightPanel()
    return
  }

  if (expandedRightMenu.value === action) {
    openRightPanel(action)
    return
  }

  expandedRightMenu.value = action
  activeRightPanel.value = null
}

function activateRightCommand(commandId: RightCommandId) {
  if (commandId === "return-guangxi") {
    mapController.returnToGuangxi()
  }
}

function isRightActionActive(action: RightMenuId) {
  if (action === "view") {
    return expandedRightMenu.value === action || activeViewPanel.value !== null
  }

  return expandedRightMenu.value === action || activeRightPanel.value === action
}

function getRightActionControls(action: RightMenuId) {
  if (expandedRightMenu.value === action) {
    return action === "view" ? "right-view-secondary-menu" : "right-secondary-menu"
  }

  if (action === "view" && activeViewPanel.value) {
    return `right-${activeViewPanel.value}-panel`
  }

  return `right-${action}-panel`
}

function openLeftPanel(panel: LeftPanelId) {
  expandedLeftMenu.value = null
  activeLeftPanel.value = panel
}

function openRightPanel(panel: RightPanelId) {
  expandedRightMenu.value = null
  activeRightPanel.value = panel
}

function openViewPanel(panel: ViewPanelId) {
  activeViewPanel.value = panel
}

function openRightActionPanel(action: RightMenuId) {
  if (action === "view") return

  openRightPanel(action)
}

function isViewOperationActive(operationId: ViewOperationId) {
  return operationId === "view-center" && viewCenterVisible.value
}

function activateViewOperation(operationId: ViewOperationId) {
  if (
    operationId === "view-position" ||
    operationId === "view-camera" ||
    operationId === "view-favorites"
  ) {
    openViewPanel(operationId)
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

function createSceneTimestamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function closeLeftPanel() {
  expandedLeftMenu.value = null
  activeLeftPanel.value = null
}

function closeRightPanel() {
  activeRightPanel.value = null
  expandedRightMenu.value = null
}

function closeViewPanel() {
  activeViewPanel.value = null
}

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
    if (basemapOpen.value) {
      basemapOpen.value = false
    }

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
    if (terrainEnabled.value) {
      terrainEnabled.value = false
      mapController.setTerrainExaggeration(false, terrainScale.value)
    }

    if (basemapOpen.value) return

    openBasemapPanel()

    return
  }

  compassVisible.value = !compassVisible.value
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

/** 切换图源后保留面板，便于连续对比；关闭走面板右上角 X。 */
function selectBasemap(id: string) {
  const applied = mapController.setBaseImagerySource(id)
  if (applied) {
    activeBasemapId.value = id
  }
}

/** 应用自定义瓦片 URL：写入 localStore 持久化并切换到自定义图源。 */
function applyCustomBasemap() {
  const url = customBaseMapUrlInput.value.trim()
  if (!url) return

  const applied = mapController.setCustomBaseImagerySource(url)
  if (!applied) return

  localStore.customBaseMapUrl = url
  activeBasemapId.value = CUSTOM_BASEMAP_ID
}

/** 引擎挂载完成后，若 localStore 已有自定义 URL 则自动恢复。 */
function restoreCustomBaseMapUrl() {
  const url = localStore.customBaseMapUrl.trim()
  if (!url) return

  const applied = mapController.setCustomBaseImagerySource(url)
  if (applied) {
    activeBasemapId.value = CUSTOM_BASEMAP_ID
  }
}

disposeMountState = mapController.onMountStateChange((ready) => {
  if (ready) {
    restoreCustomBaseMapUrl()
  }
})

onBeforeUnmount(() => {
  disposeMountState?.()
  disposeMountState = undefined
  disposeCoordinateReadout?.()
  disposeCoordinateReadout = undefined
})

onMounted(() => {
  disposeCoordinateReadout = mapController.onCoordinateReadoutChange((readout) => {
    coordinateReadout.value = readout
  })
})

const overviewMetrics = [
  { label: "监测目标", value: "1,286", trend: "+24" },
  { label: "在线设备", value: "1,092", trend: "96.4%" },
  { label: "今日事件", value: "38", trend: "-6" },
  { label: "覆盖区域", value: "36", trend: "省份" },
]

const areaDistribution = [
  { name: "华东区域", value: 86 },
  { name: "华南区域", value: 72 },
  { name: "华北区域", value: 64 },
  { name: "西南区域", value: 48 },
  { name: "东北区域", value: 35 },
]

const alerts = [
  { level: "critical", title: "边界区域越限", location: "A-07 监测网格" },
  { level: "warning", title: "设备信号波动", location: "B-15 前置站点" },
  { level: "info", title: "图层加载完成", location: "基础影像服务" },
  { level: "warning", title: "资源负载升高", location: "渲染节点 03" },
]

const resourceLoads = [
  { name: "渲染节点", value: 68, state: "正常" },
  { name: "影像服务", value: 46, state: "稳定" },
  { name: "数据链路", value: 81, state: "繁忙" },
]
</script>

<template>
  <div class="screen-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <i class="bi bi-globe2"></i>
        </span>
        <div>
          <p>MAP ENGINE</p>
          <h1>数字态势监控中心</h1>
        </div>
      </div>

      <div class="system-status">
        <span class="status-pill is-online">运行正常</span>
        <span class="status-pill">演示数据</span>
      </div>
    </header>

    <main class="dashboard-body">
      <div class="content-grid">
        <aside class="side-rail rail-left" aria-label="左侧操作">
          <div class="rail-actions">
            <button
              v-for="action in leftActions"
              :key="action.id"
              class="rail-button"
              :class="{
                'is-active': expandedLeftMenu === action.id || activeLeftPanel === action.id,
              }"
              type="button"
              :aria-expanded="expandedLeftMenu === action.id || activeLeftPanel === action.id"
              :aria-controls="
                expandedLeftMenu === action.id ? 'left-secondary-menu' : `left-${action.id}-panel`
              "
              @click="toggleLeftPanel(action.id)"
            >
              <i class="bi" :class="action.icon" aria-hidden="true"></i>
              <span>{{ action.label }}</span>
            </button>
          </div>

          <FloatingWindow
            v-if="expandedLeftMenu === 'map' && activeLeftPanel === null"
            id="left-map-secondary-menu"
            class="rail-panel panel-left rail-submenu map-submenu"
            title="地图操作"
            tag="MAP CONTROL"
            variant="submenu"
            close-label="关闭地图操作二级菜单"
            @close="expandedLeftMenu = null"
          >
            <div class="submenu-operation-list">
              <button
                v-for="operation in mapOperations"
                :key="operation.id"
                class="submenu-option map-operation"
                :class="{
                  'is-active': operation.kind === 'toggle' && isMapOperationActive(operation.id),
                  'is-open':
                    (operation.id === 'terrain' && terrainEnabled) ||
                    (operation.id === 'basemap' && basemapOpen),
                }"
                type="button"
                :disabled="isMapOperationDisabled(operation.id)"
                :aria-pressed="
                  operation.kind === 'toggle' ? isMapOperationActive(operation.id) : undefined
                "
                :title="isMapOperationDisabled(operation.id) ? '仅3D模式可用' : undefined"
                @click="activateMapOperation(operation.id)"
              >
                <i class="bi" :class="operation.icon" aria-hidden="true"></i>
                <span>{{ operation.label }}</span>
                <i
                  v-if="operation.kind === 'command'"
                  class="bi bi-chevron-right submenu-chevron"
                  aria-hidden="true"
                ></i>
                <span v-else-if="operation.kind === 'mode'" class="operation-mode">
                  {{ sceneMode.toUpperCase() }}
                </span>
                <span v-else class="operation-switch" aria-hidden="true">
                  <span class="operation-switch-thumb"></span>
                </span>
              </button>
            </div>
          </FloatingWindow>

          <FloatingWindow
            v-else-if="expandedLeftAction && activeLeftPanel === null"
            id="left-secondary-menu"
            class="rail-panel panel-left rail-submenu"
            :title="expandedLeftAction.label"
            variant="submenu"
            :close-label="`关闭${expandedLeftAction.label}二级菜单`"
            @close="expandedLeftMenu = null"
          >
            <button
              class="submenu-option"
              type="button"
              @click="openLeftPanel(expandedLeftAction.id)"
            >
              <i class="bi" :class="expandedLeftAction.icon" aria-hidden="true"></i>
              <span>{{ expandedLeftAction.label }}</span>
              <i class="bi bi-chevron-right submenu-chevron" aria-hidden="true"></i>
            </button>
          </FloatingWindow>

          <FloatingWindow
            v-if="activeLeftPanel === 'overview'"
            id="left-overview-panel"
            class="rail-panel panel-left"
            title="态势总览"
            tag="TOTAL"
            close-label="关闭态势总览"
            @close="closeLeftPanel"
          >
            <div class="metric-grid">
              <article v-for="metric in overviewMetrics" :key="metric.label">
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
                <small>{{ metric.trend }}</small>
              </article>
            </div>
          </FloatingWindow>

          <FloatingWindow
            v-if="activeLeftPanel === 'distribution'"
            id="left-distribution-panel"
            class="rail-panel panel-left"
            title="区域分布"
            tag="REGION"
            close-label="关闭区域分布"
            @close="closeLeftPanel"
          >
            <div class="distribution-list">
              <div v-for="area in areaDistribution" :key="area.name" class="distribution-row">
                <span>{{ area.name }}</span>
                <div class="distribution-track" aria-hidden="true">
                  <i :style="{ width: `${area.value}%` }"></i>
                </div>
                <strong>{{ area.value }}</strong>
              </div>
            </div>
          </FloatingWindow>
        </aside>

        <div class="map-stage">
          <ErrorBoundary>
            <MapViewport
              :compass-visible="compassVisible"
              :north-locked="northLocked"
              :view-center-visible="viewCenterVisible"
            />
          </ErrorBoundary>
          <span class="stage-label" aria-hidden="true">
            {{ sceneMode === "3d" ? "三维态势视图" : "二维态势视图" }}
          </span>
        </div>

        <FloatingWindow
          v-if="basemapOpen"
          id="basemap-window"
          class="basemap-window"
          title="底图切换"
          tag="BASEMAP"
          close-label="关闭底图切换"
          @close="closeBasemapPanel"
        >
          <div v-if="basemapSources.length === 0" class="basemap-empty">
            当前引擎暂无可切换的底图
          </div>
          <div v-else class="basemap-options" role="radiogroup" aria-label="底图切换">
            <button
              v-for="source in basemapSources"
              :key="source.id"
              class="basemap-option"
              :class="{ 'is-active': source.id === activeBasemapId }"
              type="button"
              role="radio"
              :aria-checked="source.id === activeBasemapId"
              :title="source.description"
              @click="selectBasemap(source.id)"
            >
              <span class="basemap-radio" aria-hidden="true"></span>
              <span class="basemap-meta">
                <strong>{{ source.label }}</strong>
                <small v-if="source.description">{{ source.description }}</small>
              </span>
            </button>
          </div>
          <div class="basemap-custom">
            <label for="basemap-custom-url">自定义瓦片 URL</label>
            <input
              id="basemap-custom-url"
              v-model="customBaseMapUrlInput"
              type="text"
              spellcheck="false"
              placeholder="https://tile.example.com/{z}/{x}/{y}.png"
            />
            <button
              type="button"
              class="basemap-custom-apply"
              :disabled="!customBaseMapUrlInput.trim()"
              @click="applyCustomBasemap"
            >
              应用自定义底图
            </button>
          </div>
        </FloatingWindow>

        <FloatingWindow
          v-if="terrainEnabled"
          id="terrain-scale-window"
          class="terrain-scale-window"
          title="地形起伏倍率"
          tag="TERRAIN"
          close-label="关闭地形突出"
          @close="closeTerrainPanel"
        >
          <div class="terrain-scale-body">
            <strong>{{ terrainScale.toFixed(1) }}x</strong>
            <input
              class="terrain-slider"
              type="range"
              :value="terrainScale"
              min="0.5"
              max="5"
              step="0.1"
              aria-label="地形起伏倍率"
              @input="handleTerrainScaleInput"
            />
          </div>
        </FloatingWindow>

        <aside class="side-rail rail-right" aria-label="右侧操作">
          <div class="rail-actions">
            <button
              v-for="command in rightCommands"
              :key="command.id"
              class="rail-button"
              type="button"
              @click="activateRightCommand(command.id)"
            >
              <i class="bi" :class="command.icon" aria-hidden="true"></i>
              <span>{{ command.label }}</span>
            </button>
            <button
              v-for="action in rightActions"
              :key="action.id"
              class="rail-button"
              :class="{ 'is-active': isRightActionActive(action.id) }"
              type="button"
              :aria-expanded="isRightActionActive(action.id)"
              :aria-controls="getRightActionControls(action.id)"
              @click="toggleRightAction(action.id)"
            >
              <i class="bi" :class="action.icon" aria-hidden="true"></i>
              <span>{{ action.label }}</span>
            </button>
          </div>

          <FloatingWindow
            v-if="expandedRightMenu === 'view'"
            id="right-view-secondary-menu"
            class="rail-panel panel-right rail-submenu"
            title="视角操作"
            variant="submenu"
            close-label="关闭视角操作二级菜单"
            @close="expandedRightMenu = null"
          >
            <div class="submenu-operation-list">
              <button
                v-for="operation in viewOperations"
                :key="operation.id"
                class="submenu-option"
                :class="{ 'is-active': isViewOperationActive(operation.id) }"
                type="button"
                :aria-pressed="
                  operation.kind === 'toggle' ? isViewOperationActive(operation.id) : undefined
                "
                @click="activateViewOperation(operation.id)"
              >
                <i class="bi" :class="operation.icon" aria-hidden="true"></i>
                <span>{{ operation.label }}</span>
                <i
                  v-if="operation.kind === 'panel'"
                  class="bi bi-chevron-right submenu-chevron"
                  aria-hidden="true"
                ></i>
                <span
                  v-else-if="operation.kind === 'toggle'"
                  class="operation-switch"
                  aria-hidden="true"
                >
                  <span class="operation-switch-thumb"></span>
                </span>
              </button>
            </div>
          </FloatingWindow>

          <FloatingWindow
            v-else-if="expandedRightAction && activeRightPanel === null"
            id="right-secondary-menu"
            class="rail-panel panel-right rail-submenu"
            :title="expandedRightAction.label"
            variant="submenu"
            :close-label="`关闭${expandedRightAction.label}二级菜单`"
            @close="expandedRightMenu = null"
          >
            <button
              class="submenu-option"
              type="button"
              @click="openRightActionPanel(expandedRightAction.id)"
            >
              <i class="bi" :class="expandedRightAction.icon" aria-hidden="true"></i>
              <span>{{ expandedRightAction.label }}</span>
              <i class="bi bi-chevron-right submenu-chevron" aria-hidden="true"></i>
            </button>
          </FloatingWindow>

          <FloatingWindow
            v-if="activeViewPanel === 'view-position'"
            id="right-view-position-panel"
            class="rail-panel panel-right panel-right-third"
            title="视角定位"
            tag="VIEW"
            close-label="关闭视角定位"
            @close="closeViewPanel"
          >
            <ViewOperationsPanel section="position" />
          </FloatingWindow>

          <FloatingWindow
            v-if="activeViewPanel === 'view-camera'"
            id="right-view-camera-panel"
            class="rail-panel panel-right panel-right-third"
            title="相机参数"
            tag="CAMERA"
            close-label="关闭相机参数"
            @close="closeViewPanel"
          >
            <ViewOperationsPanel section="camera" />
          </FloatingWindow>

          <FloatingWindow
            v-if="activeViewPanel === 'view-favorites'"
            id="right-view-favorites-panel"
            class="rail-panel panel-right panel-right-third"
            title="视图收藏"
            tag="FAVORITES"
            close-label="关闭视图收藏"
            @close="closeViewPanel"
          >
            <ViewFavoritesPanel />
          </FloatingWindow>

          <FloatingWindow
            v-if="activeRightPanel === 'alerts'"
            id="right-alerts-panel"
            class="rail-panel panel-right"
            title="实时告警"
            tag="ALERT"
            tag-tone="alert"
            close-label="关闭实时告警"
            @close="closeRightPanel"
          >
            <ul class="alert-list">
              <li v-for="alert in alerts" :key="alert.title" :class="alert.level">
                <span class="alert-dot" aria-hidden="true"></span>
                <div>
                  <strong>{{ alert.title }}</strong>
                  <small>{{ alert.location }}</small>
                </div>
              </li>
            </ul>
          </FloatingWindow>

          <FloatingWindow
            v-if="activeRightPanel === 'resources'"
            id="right-resources-panel"
            class="rail-panel panel-right"
            title="资源负载"
            tag="LOAD"
            close-label="关闭资源负载"
            @close="closeRightPanel"
          >
            <div class="resource-list">
              <div v-for="resource in resourceLoads" :key="resource.name">
                <div class="resource-row">
                  <span>{{ resource.name }}</span>
                  <strong>{{ resource.value }}%</strong>
                </div>
                <div class="resource-track" aria-hidden="true">
                  <i :style="{ width: `${resource.value}%` }"></i>
                </div>
                <small>{{ resource.state }}</small>
              </div>
            </div>
          </FloatingWindow>
        </aside>
      </div>
    </main>

    <footer class="statusbar">
      <div class="status-group">
        <span>{{ mapEngineLabel }} · {{ sceneMode === "3d" ? "3D MODE" : "2D MODE" }}</span>
        <span>CGCS2000</span>
        <span>{{ activeBasemapLabel }}</span>
        <span :title="coordinateReadoutTitle" aria-live="off">{{ coordinateReadoutText }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.screen-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  padding: 0;
  --edge-gutter: 18px;
  overflow: hidden;
  background: #030913;
}

.dashboard-body {
  min-width: 0;
  min-height: 0;
  display: flex;
  pointer-events: none;
}

.topbar {
  border: 0;
  border-bottom: 1px solid var(--panel-border);
  background: #0a2540;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 74px;
  padding: 0 var(--edge-gutter);
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.brand-mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(72, 229, 255, 0.72);
  border-radius: 4px;
}

.brand-mark > .bi {
  color: var(--cyan);
  font-size: 22px;
  line-height: 1;
}

.brand p {
  margin: 0;
  color: var(--cyan);
  font-size: 10px;
  line-height: 1.2;
}

.brand h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.system-status {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.status-pill.is-online {
  color: var(--cyan);
}

.status-pill::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: "";
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

.side-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--rail-width);
  margin: var(--rail-map-gap);
  z-index: 1;
  pointer-events: auto;
  min-width: 0;
  max-height: 100%;
}

.rail-left {
  left: 0;
}

.rail-right {
  right: 0;
}

.rail-actions {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 0;
}

.rail-button {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: var(--rail-width);
  height: 56px;
  padding: 6px 4px;
  border: 1px solid rgba(79, 151, 255, 0.32);
  border-radius: 5px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.86);
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.rail-button > .bi {
  font-size: 18px;
  line-height: 1;
}

.rail-button > span {
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.rail-button:hover,
.rail-button:focus-visible,
.rail-button.is-active {
  border-color: rgba(72, 229, 255, 0.76);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.94);
}

.rail-button:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.rail-panel {
  position: absolute;
  top: 0;
  z-index: 3;
  width: var(--map-menu-width);
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
}

.rail-panel::-webkit-scrollbar {
  width: 4px;
}

.rail-panel::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(72, 229, 255, 0.45);
}

.panel-left {
  left: calc(100% + var(--rail-map-gap));
}

.panel-right {
  right: calc(100% + var(--rail-map-gap));
}

.panel-right-third {
  right: calc(100% + 2 * var(--rail-map-gap) + var(--map-menu-width));
}

.submenu-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 42px;
  margin-top: 12px;
  padding: 9px 10px;
  border: 1px solid rgba(79, 151, 255, 0.24);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.38);
  text-align: left;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.submenu-option > span {
  overflow: hidden;
  padding: 0 9px;
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.submenu-option > .bi:first-child,
.submenu-chevron {
  font-size: 15px;
  line-height: 1;
}

.submenu-option:hover,
.submenu-option:focus-visible {
  border-color: rgba(72, 229, 255, 0.68);
  color: var(--text-primary);
  background: rgba(16, 47, 83, 0.82);
}

.submenu-option:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.submenu-operation-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.submenu-operation-list .submenu-option {
  margin-top: 0;
}

.submenu-option.is-active,
.submenu-option.is-open {
  border-color: rgba(72, 229, 255, 0.72);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.86);
}

.submenu-option:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.submenu-option:disabled:hover,
.submenu-option:disabled:focus-visible {
  border-color: rgba(79, 151, 255, 0.24);
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.38);
}

.operation-mode,
.operation-switch {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.operation-mode {
  min-width: 34px;
  height: 21px;
  padding: 0 5px;
  border: 1px solid rgba(72, 229, 255, 0.36);
  border-radius: 3px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1;
}

.operation-switch {
  position: relative;
  width: 34px;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(103, 139, 191, 0.58);
  border-radius: 9px;
  background: rgba(9, 24, 45, 0.92);
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.operation-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition:
    transform 160ms ease,
    background-color 160ms ease;
}

.submenu-option.is-active .operation-switch {
  border-color: rgba(72, 229, 255, 0.78);
  background: rgba(20, 70, 100, 0.94);
}

.submenu-option.is-active .operation-switch-thumb {
  transform: translateX(16px);
  background: var(--cyan);
}

.terrain-scale-window {
  --window-padding: 10px;
  --window-head-padding: 8px;
  --window-title-size: 13px;
  --window-tag-size: 9px;
  --window-close-size: 20px;

  position: absolute;
  top: var(--rail-map-gap);
  left: calc(var(--rail-width) + 3 * var(--rail-map-gap) + var(--map-menu-width));
  z-index: 2;
  width: min(220px, calc(100vw - 160px));
  min-width: 0;
  pointer-events: auto;
}

.terrain-scale-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.terrain-scale-body > strong {
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
}

.terrain-slider {
  width: 100%;
  height: 16px;
  margin: 0;
  accent-color: var(--cyan);
}

.basemap-window {
  --window-padding: 10px;
  --window-head-padding: 8px;
  --window-title-size: 13px;
  --window-tag-size: 9px;
  --window-close-size: 20px;

  position: absolute;
  top: var(--rail-map-gap);
  left: calc(var(--rail-width) + 3 * var(--rail-map-gap) + var(--map-menu-width));
  z-index: 2;
  width: min(240px, calc(100vw - 160px));
  min-width: 0;
  pointer-events: auto;
}

.basemap-empty {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.basemap-options {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.basemap-option {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.55);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.basemap-option:hover,
.basemap-option:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
}

.basemap-option:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 1px;
}

.basemap-option.is-active {
  border-color: rgba(72, 229, 255, 0.55);
  color: var(--text-primary);
  background: rgba(72, 229, 255, 0.08);
}

.basemap-radio {
  width: 12px;
  height: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  background: transparent;
}

.basemap-option.is-active .basemap-radio {
  border-color: var(--cyan);
  background: var(--cyan);
  box-shadow: inset 0 0 0 2px rgba(7, 20, 42, 0.85);
}

.basemap-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.basemap-meta strong {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.basemap-meta small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.basemap-custom {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-inner-line);
}

.basemap-custom label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.basemap-custom input {
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  background: rgba(7, 20, 42, 0.55);
  outline: none;
  transition: border-color 140ms ease;
}

.basemap-custom input:focus {
  border-color: rgba(72, 229, 255, 0.55);
}

.basemap-custom-apply {
  padding: 7px 10px;
  border: 1px solid rgba(72, 229, 255, 0.45);
  border-radius: 4px;
  color: var(--cyan);
  font-size: 12px;
  background: rgba(72, 229, 255, 0.06);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.basemap-custom-apply:hover:not(:disabled),
.basemap-custom-apply:focus-visible {
  border-color: var(--cyan);
  color: var(--text-primary);
  background: rgba(72, 229, 255, 0.14);
}

.basemap-custom-apply:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: rgba(7, 20, 42, 0.35);
  cursor: not-allowed;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 4px;
}

.metric-grid article {
  min-height: 86px;
  padding: 14px 4px 6px 12px;
  border-left: 1px solid var(--panel-inner-line);
}

.metric-grid article:nth-child(even) {
  margin-right: -15px;
  padding-right: 16px;
}

.metric-grid span,
.resource-list small,
.distribution-row span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}

.metric-grid strong {
  display: block;
  margin-top: 11px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 25px;
  font-weight: 600;
  line-height: 1;
}

.metric-grid small {
  display: block;
  margin-top: 7px;
  color: var(--amber);
  font-size: 11px;
}

.distribution-list,
.resource-list,
.alert-list {
  margin: 12px 0 0;
  padding: 0;
}

.distribution-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
}

.distribution-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.distribution-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  text-align: right;
}

.distribution-track,
.resource-track {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(31, 62, 104, 0.82);
}

.distribution-track i,
.resource-track i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  transition: width 180ms ease;
}

.map-stage {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}

.stage-label {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border: 1px solid rgba(72, 229, 255, 0.28);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  background: rgba(7, 20, 42, 0.62);
}

.alert-list {
  display: grid;
  gap: 9px;
  list-style: none;
}

.alert-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border-left: 2px solid var(--blue);
  background: rgba(19, 40, 72, 0.44);
}

.alert-list .critical {
  border-left-color: var(--rose);
}

.alert-list .warning {
  border-left-color: var(--amber);
}

.alert-list .info {
  border-left-color: var(--cyan);
}

.alert-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--blue);
}

.critical .alert-dot {
  background: var(--rose);
}

.warning .alert-dot {
  background: var(--amber);
}

.info .alert-dot {
  background: var(--cyan);
}

.alert-list strong,
.alert-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-list strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.alert-list small {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 11px;
}

.resource-list {
  display: grid;
  gap: 15px;
}

.resource-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.resource-row span,
.resource-row strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.resource-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
}

.resource-list > div > small {
  margin-top: 6px;
}

.statusbar {
  border: 0;
  border-top: 1px solid var(--panel-border);
  background: #0a2540;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 var(--edge-gutter);
}

.status-group {
  display: flex;
  align-items: center;
  gap: 18px;
  overflow: hidden;
}

.status-group span {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 1439px) {
  .content-grid {
    --map-menu-width: min(286px, calc(100vw - 88px - 4 * var(--rail-map-gap)));
  }
}

@media (max-width: 1023px) {
  .screen-shell {
    gap: 0;
    padding: 0;
    --edge-gutter: 12px;
  }

  .dashboard-body {
    overflow: hidden;
  }

  .topbar {
    min-height: 62px;
    padding: 0 var(--edge-gutter);
  }

  .brand h1 {
    font-size: 18px;
  }

  .system-status {
    gap: 6px;
  }

  .status-pill {
    font-size: 11px;
  }

  .content-grid {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
  }

  .map-stage {
    display: none;
  }

  .terrain-scale-window,
  .basemap-window {
    position: relative;
    top: auto;
    right: auto;
    left: auto;
    width: min(240px, 100%);
  }

  .side-rail {
    position: relative;
    inset: auto;
    width: auto;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    max-width: 100%;
    padding: 2px;
    overflow: visible;
    scrollbar-width: thin;
    scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
    pointer-events: auto;
  }

  .rail-actions {
    flex: 0 0 auto;
    flex-direction: row;
  }

  .rail-panel {
    position: relative;
    flex-basis: 100%;
    width: 100%;
    max-height: none;
    overflow: visible;
  }

  .panel-left,
  .panel-right {
    left: auto;
    right: auto;
  }

  .statusbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px var(--edge-gutter);
  }

  .status-group {
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 12px var(--edge-gutter);
  }

  .brand h1 {
    white-space: normal;
  }

  .status-group:last-child {
    display: none;
  }

  .rail-button {
    width: 50px;
    height: 48px;
  }
}
</style>
