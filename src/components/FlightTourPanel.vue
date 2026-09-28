<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  createFlightRoute,
  DEFAULT_FLIGHT_SPEED,
  MAX_FLIGHT_SPEED,
  MIN_FLIGHT_SPEED,
  normalizeFlightRoute,
  parseFlightRouteGeoJson,
  serializeFlightRouteGeoJson,
  useMapController,
  type FlightPlaybackState,
  type FlightRoute,
} from "../map"
import AppRadio from "./base/AppRadio.vue"
import AppRadioGroup from "./base/AppRadioGroup.vue"
import { useLocalStore } from "../stores"

const mapController = useMapController()
const localStore = useLocalStore()

const props = withDefaults(
  defineProps<{
    selectedRouteId?: string
    settingsOpen?: boolean
  }>(),
  {
    selectedRouteId: "",
    settingsOpen: false,
  },
)

const emit = defineEmits<{
  "update:selectedRouteId": [routeId: string]
  toggleSettings: []
}>()

const selectedRouteId = computed({
  get: () => props.selectedRouteId,
  set: (routeId: string) => {
    emit("update:selectedRouteId", routeId)
  },
})

const preparing = ref(false)
const mapReady = ref(false)
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")
const confirmingDeleteId = ref<string | null>(null)
const playback = ref<FlightPlaybackState>(mapController.getFlightPlaybackState())
const fileInput = ref<HTMLInputElement | undefined>()

let disposeMountState: (() => void) | undefined
let disposePlaybackState: (() => void) | undefined
let feedbackTimer: number | undefined
let disposed = false

const selectedRoute = computed(() =>
  localStore.flightRoutes.find((route) => route.id === selectedRouteId.value),
)

const canPlay = computed(
  () =>
    mapReady.value &&
    !preparing.value &&
    playback.value.status !== "playing" &&
    Boolean(selectedRoute.value && selectedRoute.value.waypoints.length >= 2),
)

const canSeek = computed(
  () =>
    playback.value.status === "playing" ||
    playback.value.status === "paused" ||
    playback.value.status === "completed",
)

const playbackControlsDisabled = computed(() => !mapReady.value || preparing.value)
const playbackActive = computed(() => preparing.value || playback.value.status !== "idle")

const selectedRouteName = computed(() => selectedRoute.value?.name ?? "未选择航线")
const statusText = computed(() => {
  if (preparing.value) return "准备中"

  switch (playback.value.status) {
    case "playing":
      return "播放中"
    case "paused":
      return "已暂停"
    case "completed":
      return "已结束"
    default:
      return "待播放"
  }
})

const totalDistanceText = computed(() => formatDistance(playback.value.totalDistance))
const remainingSeconds = computed(() => {
  const distance = playback.value.totalDistance * (1 - playback.value.progress)
  return distance / Math.max(playback.value.speed, 1)
})

const progressSliderValue = computed(() => Math.round(playback.value.progress * 1000))

/** 飞行速度显示值：空闲期取航线持久值，播放期取引擎运行时值。 */
const displaySpeed = computed(() => {
  if (playback.value.status === "idle") {
    return selectedRoute.value?.speed ?? DEFAULT_FLIGHT_SPEED
  }
  return playback.value.speed || DEFAULT_FLIGHT_SPEED
})
const speedInputValue = computed(() => String(Math.round(displaySpeed.value)))
const speedSliderValue = computed(() => Math.round(displaySpeed.value))
watch(playbackActive, (active) => {
  if (active) {
    confirmingDeleteId.value = null
  }

  syncFlightRoutePreview()
})

watch(selectedRouteId, () => {
  confirmingDeleteId.value = null
})

watch(selectedRoute, () => syncFlightRoutePreview(), { deep: true })

/** 按当前播放状态同步航线预览，飞行过程中保持地图清爽。 */
function syncFlightRoutePreview() {
  if (!mapReady.value) return

  if (playbackActive.value) {
    mapController.clearFlightRoutePreview()
    return
  }

  const route = selectedRoute.value
  if (route && route.waypoints.length > 0) {
    mapController.setFlightRoutePreview(route)
    return
  }

  mapController.clearFlightRoutePreview()
}

/** 创建并选中一条新的本地航线。 */
function createRoute() {
  if (playbackActive.value) return

  const route = createFlightRoute(`飞行航线 ${localStore.flightRoutes.length + 1}`)
  localStore.flightRoutes = [route, ...localStore.flightRoutes]
  selectedRouteId.value = route.id
  showFeedback("航线已创建，请开启航点绘制")
}

/** 切换当前选中的航线。 */
function selectRoute(route: FlightRoute) {
  if (playbackActive.value) return

  selectedRouteId.value = route.id
}

/** 切换航线循环播放设置。 */
function toggleLoop() {
  const route = selectedRoute.value
  if (!route) return

  const loop = !route.loop
  updateSelectedRoute({ loop })
  if (playback.value.status !== "idle") {
    mapController.updateFlightPlayback({ loop })
  }
}

/** 切换飞行期视角跟随模式。 */
function toggleFollowRoute() {
  if (playback.value.status === "idle") return

  const next = !playback.value.followRoute
  mapController.updateFlightPlayback({ followRoute: next })
  showFeedback(next ? "已开启视角跟随" : "已切换为自由视角")
}

/** 二次确认后删除本地航线。 */
function requestDeleteRoute(route: FlightRoute) {
  if (playbackActive.value) return

  if (confirmingDeleteId.value !== route.id) {
    confirmingDeleteId.value = route.id
    return
  }

  const remainingRoutes = localStore.flightRoutes.filter((item) => item.id !== route.id)
  localStore.flightRoutes = remainingRoutes
  confirmingDeleteId.value = null

  if (selectedRouteId.value === route.id) {
    selectedRouteId.value = remainingRoutes[0]?.id ?? ""
  }
}

/** 从文件选择器导入 GeoJSON 航线。 */
async function importRoute(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return

  const file = input.files?.[0]
  input.value = ""
  if (!file) return
  if (playbackActive.value) return

  try {
    const content = await file.text()
    if (disposed) return

    const fallbackName = file.name.replace(/\.(geojson|json)$/i, "").slice(0, 50) || "导入航线"
    const route = parseFlightRouteGeoJson(content, fallbackName)
    localStore.flightRoutes = [route, ...localStore.flightRoutes]
    selectedRouteId.value = route.id
    showFeedback(`已导入 ${route.name}，共 ${route.waypoints.length} 个航点`)
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "航线导入失败", "error")
  }
}

/** 导出当前航线为 GeoJSON 文件。 */
function exportRoute() {
  const route = selectedRoute.value
  if (!route || route.waypoints.length < 2) {
    showFeedback("航线至少需要 2 个航点才能导出", "error")
    return
  }

  const blob = new Blob([serializeFlightRouteGeoJson(route)], { type: "application/geo+json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${route.name.trim() || "flight-route"}.geojson`
  link.click()
  URL.revokeObjectURL(url)
  showFeedback("航线已导出")
}

/** 采样地形并启动当前航线播放。 */
async function startPlayback() {
  const route = selectedRoute.value
  if (!route || route.waypoints.length < 2 || preparing.value) return

  preparing.value = true
  showFeedback("正在采样地形并准备漫游")

  const started = await mapController.startFlight(normalizeFlightRoute(route))
  if (disposed) return

  preparing.value = false

  if (!started) {
    const state = mapController.getFlightPlaybackState()
    showFeedback(state.error ?? "飞行漫游启动失败", "error")
    return
  }

  showFeedback("飞行漫游已开始")
}

/** 暂停或继续当前飞行漫游。 */
function pauseOrResumePlayback() {
  if (playback.value.status === "playing") {
    mapController.pauseFlight()
    showFeedback("飞行漫游已暂停")
    return
  }

  if (playback.value.status === "paused" || playback.value.status === "completed") {
    mapController.resumeFlight()
    showFeedback("飞行漫游已继续")
  }
}

/** 停止当前飞行漫游。 */
function stopPlayback() {
  mapController.stopFlight()
  showFeedback("飞行漫游已停止")
}

/** 按进度滑杆位置定位飞行漫游。 */
function seekPlayback(event: Event) {
  if (!(event.target instanceof HTMLInputElement) || !canSeek.value) return

  mapController.seekFlight(Number(event.target.value) / 1000)
}

/** 应用新的飞行速度值：双写（持久化航线 + 实时同步引擎）。 */
function applySpeedValue(value: number) {
  const route = selectedRoute.value
  if (!route) return

  const normalized = normalizeFlightRoute({ ...route, speed: value })
  updateSelectedRoute({ speed: normalized.speed })

  if (playback.value.status !== "idle") {
    mapController.updateFlightPlayback({ speed: normalized.speed })
  }
}

function applySpeedNumber(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const value = Number(input.value)
  if (!Number.isFinite(value)) return
  applySpeedValue(value)
}

function applySpeedRange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  applySpeedValue(Number(input.value))
}

/** 打开航线导入文件选择器。 */
function chooseImportFile() {
  if (playbackActive.value) return

  fileInput.value?.click()
}

/** 规范化并更新本地存储中的选中航线。 */
function updateSelectedRoute(patch: Partial<FlightRoute>) {
  const route = selectedRoute.value
  if (!route) return

  localStore.flightRoutes = localStore.flightRoutes.map((item) =>
    item.id === route.id
      ? normalizeFlightRoute({ ...item, ...patch, updatedAt: new Date().toISOString() })
      : item,
  )
}

/** 显示面板内操作反馈。 */
function showFeedback(message: string, tone: "info" | "error" = "info") {
  feedback.value = message
  feedbackTone.value = tone
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = ""
  }, 3600)
}

/** 格式化航线里程显示。 */
function formatDistance(distance: number) {
  if (!Number.isFinite(distance) || distance <= 0) return "-- km"
  return `${(distance / 1000).toFixed(distance < 10_000 ? 2 : 1)} km`
}

/** 格式化剩余飞行时长。 */
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds === Number.POSITIVE_INFINITY) return "--:--"

  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`
}

/** 规范化 localStorage 中恢复的航线数据。 */
function normalizeStoredRoutes() {
  if (!Array.isArray(localStore.flightRoutes)) {
    localStore.flightRoutes = []
    return
  }

  localStore.flightRoutes = localStore.flightRoutes.map((route) => normalizeFlightRoute(route))
}

onMounted(() => {
  normalizeStoredRoutes()
  selectedRouteId.value = localStore.flightRoutes[0]?.id ?? ""
  disposePlaybackState = mapController.onFlightPlaybackStateChange((state) => {
    playback.value = state
  })
  disposeMountState = mapController.onMountStateChange((ready) => {
    mapReady.value = ready
    if (!ready) {
      preparing.value = false
      return
    }

    syncFlightRoutePreview()
  })
})

onBeforeUnmount(() => {
  disposed = true
  mapController.stopFlight()
  mapController.clearFlightRoutePreview()
  disposeMountState?.()
  disposePlaybackState?.()
  window.clearTimeout(feedbackTimer)
})
</script>

<template>
  <div class="flight-tour">
    <section class="block" aria-label="航线管理">
      <div class="block-head">
        <h3>航线管理</h3>
        <span>{{ localStore.flightRoutes.length }} 条</span>
      </div>

      <div class="route-actions">
        <button
          type="button"
          :disabled="playbackActive"
          :title="playbackActive ? '停止播放后才能新建航线' : '新建本地航线'"
          @click="createRoute"
        >
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          新建
        </button>
        <button
          type="button"
          :disabled="playbackActive"
          :title="playbackActive ? '停止播放后才能导入航线' : '导入 GeoJSON 航线'"
          @click="chooseImportFile"
        >
          <i class="bi bi-upload" aria-hidden="true"></i>
          导入
        </button>
        <button type="button" :disabled="!selectedRoute" @click="exportRoute">
          <i class="bi bi-download" aria-hidden="true"></i>
          导出
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          :disabled="playbackActive"
          @change="importRoute"
        />
      </div>

      <div v-if="localStore.flightRoutes.length === 0" class="empty">暂无本地航线</div>
      <AppRadioGroup
        v-else
        as="ul"
        class="route-list"
        aria-label="航线列表"
        orientation="vertical"
        :model-value="selectedRouteId"
      >
        <li v-for="route in localStore.flightRoutes" :key="route.id">
          <div class="route-item">
            <AppRadio :value="route.id" :disabled="playbackActive">
              <button
                type="button"
                class="route-select"
                :class="{ 'is-active': route.id === selectedRouteId }"
                :disabled="playbackActive"
                :title="playbackActive ? '停止播放后才能切换航线' : undefined"
                @click="selectRoute(route)"
              >
                <span class="route-name">{{ route.name }}</span>
                <span class="route-meta">{{ route.waypoints.length }} 航点</span>
              </button>
            </AppRadio>
            <button
              type="button"
              class="route-delete danger"
              :title="confirmingDeleteId === route.id ? '确认删除航线' : '删除航线'"
              :aria-label="
                confirmingDeleteId === route.id ? `确认删除 ${route.name}` : `删除 ${route.name}`
              "
              :disabled="playbackActive"
              @click="requestDeleteRoute(route)"
            >
              {{ confirmingDeleteId === route.id ? "确认删除" : "删除航线" }}
            </button>
          </div>
        </li>
      </AppRadioGroup>
    </section>

    <section class="block" aria-label="航线参数">
      <div class="block-head">
        <h3>航线参数</h3>
        <span>{{ selectedRouteName }}</span>
      </div>

      <!-- 参数面板是 DashboardRightRail 里的同级 RailPanel，收起时整个被 v-if 摘掉；
           此时 aria-controls 会指向不存在的 id，所以只在展开时声明这条关系 -->
      <button
        type="button"
        class="wide-button settings-toggle"
        :class="{ 'is-active': settingsOpen }"
        :aria-expanded="settingsOpen"
        :aria-controls="settingsOpen ? 'flight-route-settings-panel' : undefined"
        :title="settingsOpen ? '收起航线参数面板' : '展开航线参数面板'"
        @click="emit('toggleSettings')"
      >
        <i class="bi bi-sliders" aria-hidden="true"></i>
        <span>{{ settingsOpen ? "收起参数" : "航线参数" }}</span>
        <i
          class="bi"
          :class="settingsOpen ? 'bi-chevron-down' : 'bi-chevron-right'"
          aria-hidden="true"
        ></i>
      </button>
    </section>

    <section class="block" aria-label="播放控制">
      <div class="block-head">
        <h3>播放控制</h3>
        <span :class="['status', playback.status]">{{ statusText }}</span>
      </div>

      <div class="playback-actions">
        <button
          type="button"
          :disabled="!canPlay"
          :title="
            playback.status === 'paused' || playback.status === 'completed'
              ? '继续播放'
              : '开始播放'
          "
          @click="
            playback.status === 'paused' || playback.status === 'completed'
              ? pauseOrResumePlayback()
              : startPlayback()
          "
        >
          <i class="bi bi-play-fill" aria-hidden="true"></i>
          {{ playback.status === "paused" || playback.status === "completed" ? "继续" : "播放" }}
        </button>
        <button
          type="button"
          :disabled="playbackControlsDisabled || playback.status !== 'playing'"
          title="暂停播放"
          @click="pauseOrResumePlayback"
        >
          <i class="bi bi-pause-fill" aria-hidden="true"></i>
          暂停
        </button>
        <button
          type="button"
          :disabled="
            playbackControlsDisabled ||
            playback.status === 'idle' ||
            playback.status === 'preparing'
          "
          title="停止播放"
          @click="stopPlayback"
        >
          <i class="bi bi-stop-fill" aria-hidden="true"></i>
          停止
        </button>
        <button
          type="button"
          :class="{ 'is-active': selectedRoute?.loop }"
          :aria-pressed="selectedRoute?.loop ?? false"
          :disabled="!selectedRoute"
          title="循环播放"
          @click="toggleLoop"
        >
          <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
          循环
        </button>
        <button
          type="button"
          :class="{ 'is-active': playback.followRoute }"
          :aria-pressed="playback.followRoute"
          :disabled="playbackControlsDisabled || playback.status === 'idle'"
          :title="playback.followRoute ? '视角跟随航线行进方向' : '切换为自由视角'"
          @click="toggleFollowRoute"
        >
          <i class="bi bi-compass" aria-hidden="true"></i>
          跟随
        </button>
      </div>

      <div class="parameter" aria-label="飞行速度">
        <div class="parameter-head">
          <span>飞行速度</span>
          <input
            :value="speedInputValue"
            type="number"
            :min="MIN_FLIGHT_SPEED"
            :max="MAX_FLIGHT_SPEED"
            step="1"
            aria-label="飞行速度，单位米每秒"
            :disabled="!selectedRoute"
            @change="applySpeedNumber"
          />
        </div>
        <input
          :value="speedSliderValue"
          type="range"
          :min="MIN_FLIGHT_SPEED"
          :max="MAX_FLIGHT_SPEED"
          step="1"
          aria-label="飞行速度滑杆，单位米每秒"
          :disabled="!selectedRoute"
          @input="applySpeedRange"
        />
        <p class="parameter-meta">
          <span>{{ MIN_FLIGHT_SPEED }}m/s</span>
          <span>当前 {{ speedInputValue }} m/s</span>
          <span>{{ MAX_FLIGHT_SPEED }}m/s</span>
        </p>
      </div>

      <div class="playback-meta">
        <span>里程 {{ totalDistanceText }}</span>
        <span>剩余 {{ formatDuration(remainingSeconds) }}</span>
      </div>
      <input
        :value="progressSliderValue"
        type="range"
        min="0"
        max="1000"
        step="1"
        aria-label="播放进度"
        :disabled="playbackControlsDisabled || !canSeek"
        @input="seekPlayback"
      />
    </section>

    <p v-if="feedback" class="feedback" :class="feedbackTone" role="status" aria-live="polite">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/fields" as fields;

.flight-tour {
  display: grid;
  gap: 12px;
  min-width: 0;
  font-size: var(--text-sm);
}

.block {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 0;
}

.block + .block {
  padding-top: 10px;
  border-top: 1px solid var(--panel-inner-line);
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  > span {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.route-actions,
.playback-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.playback-actions {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.settings-toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  padding-inline: 9px;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: var(--control-md);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
  background: color-mix(in srgb, var(--color-panel) 55%, transparent);
  cursor: pointer;
}

button:hover:not(:disabled),
button:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
}

button:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: var(--ring-offset);
}

button:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 32%, transparent);
  cursor: not-allowed;
}

button.is-active {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}

button.danger {
  color: var(--warning);
}

button.danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--warning) 58%, transparent);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.empty {
  padding: 10px;
  border: 1px dashed var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-align: center;
}

.route-list {
  display: grid;
  max-height: 150px;
  gap: 5px;
  overflow-y: auto;
  padding: 0 2px 0 0;
  margin: 0;
  list-style: none;
}

.route-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 66px;
  gap: 5px;
  align-items: center;
}

.route-list .route-select {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 7px 8px;
  text-align: left;
}

.route-delete {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  white-space: nowrap;
}

.route-name,
.route-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-name {
  flex: 1 1 auto;
  min-width: 0;
  color: inherit;
  font-weight: var(--weight-semibold);
}

.route-meta {
  flex: none;
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

/* 面板字段统一走玻璃档（见 _fields.scss）：本面板浮在裸地图上，底色必须半透明。
   数值输入自动走等宽分支；滑块不吃这套皮肤，只有高度与内边距来自同一处。
   导入用的 `type="file"` 已被排除链挡在外面，继续由 .visually-hidden 隐藏。 */
@include fields.glass-controls;

.status {
  font-family: var(--font-mono);

  &.playing {
    color: var(--accent);
  }

  &.completed {
    color: var(--text-secondary);
  }
}

.playback-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}

.parameter {
  display: grid;
  gap: 5px;
}

.parameter-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  gap: 6px;
  align-items: center;

  > span {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.parameter-meta {
  display: flex;
  justify-content: space-between;
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}

.feedback {
  margin: 0;
  padding: 7px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  background: color-mix(in srgb, var(--color-panel) 50%, transparent);

  &.error {
    border-color: color-mix(in srgb, var(--warning) 45%, transparent);
    color: var(--warning);
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 520px) {
  .playback-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
