<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  createFlightRoute,
  normalizeFlightRoute,
  parseFlightRouteGeoJson,
  serializeFlightRouteGeoJson,
  useMapController,
  type FlightPlaybackState,
  type FlightRoute,
} from "../map"
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
      <ul v-else class="route-list" role="radiogroup" aria-label="航线列表">
        <li v-for="route in localStore.flightRoutes" :key="route.id">
          <div class="route-item">
            <button
              type="button"
              role="radio"
              class="route-select"
              :aria-checked="route.id === selectedRouteId"
              :class="{ 'is-active': route.id === selectedRouteId }"
              :disabled="playbackActive"
              :title="playbackActive ? '停止播放后才能切换航线' : undefined"
              @click="selectRoute(route)"
            >
              <span class="route-name">{{ route.name }}</span>
              <span class="route-meta">{{ route.waypoints.length }} 航点</span>
            </button>
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
      </ul>
    </section>

    <section class="block" aria-label="航线参数">
      <div class="block-head">
        <h3>航线参数</h3>
        <span>{{ selectedRouteName }}</span>
      </div>

      <button
        type="button"
        class="wide-button settings-toggle"
        :class="{ 'is-active': settingsOpen }"
        :aria-expanded="settingsOpen"
        aria-controls="flight-route-settings-panel"
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
.flight-tour {
  display: grid;
  gap: 12px;
  min-width: 0;
  font-size: 12px;
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
    font-size: 12px;
    font-weight: 700;
  }

  > span {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  padding: 7px 6px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.2;
  background: rgba(7, 20, 42, 0.55);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

button:hover:not(:disabled),
button:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
  outline: none;
}

button:focus-visible {
  border-color: rgba(72, 229, 255, 0.6);
  box-shadow: 0 0 0 2px rgba(72, 229, 255, 0.22);
}

button:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: rgba(7, 20, 42, 0.32);
  cursor: not-allowed;
}

button.is-active {
  border-color: rgba(72, 229, 255, 0.58);
  color: var(--cyan);
  background: rgba(72, 229, 255, 0.09);
}

button.danger {
  color: var(--amber);
}

button.danger:hover:not(:disabled) {
  border-color: rgba(255, 182, 72, 0.58);
  background: rgba(255, 182, 72, 0.08);
}

.empty {
  padding: 10px;
  border: 1px dashed var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-muted);
  text-align: center;
}

.route-list {
  display: grid;
  max-height: 150px;
  gap: 5px;
  overflow-y: auto;
  padding-right: 2px;
}

.route-list {
  list-style: none;
  margin: 0;
  padding: 0;
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
  padding: 7px 4px;
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
  font-weight: 650;
}

.route-meta {
  flex: none;
  color: var(--text-muted);
  font-size: 10px;
}

input {
  width: 100%;
  min-width: 0;
  padding: 6px 7px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: 11px;
  background: rgba(7, 20, 42, 0.58);
  outline: none;
  transition: border-color 140ms ease;
}

input[type="range"] {
  height: 16px;
  padding: 0;
  accent-color: var(--cyan);
}

input:focus {
  border-color: rgba(72, 229, 255, 0.58);
}

input:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.status {
  font-family: var(--font-data);

  &.playing {
    color: var(--cyan);
  }

  &.completed {
    color: var(--blue);
  }
}

.playback-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: 10px;
}

.feedback {
  margin: 0;
  padding: 7px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  background: rgba(7, 20, 42, 0.5);

  &.error {
    border-color: rgba(255, 182, 72, 0.45);
    color: var(--amber);
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
