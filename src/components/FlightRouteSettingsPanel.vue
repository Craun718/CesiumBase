<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import {
  DEFAULT_FLIGHT_CLEARANCE,
  DEFAULT_FLIGHT_HEIGHT,
  DEFAULT_FLIGHT_SPEED,
  MAX_FLIGHT_WAYPOINTS,
  normalizeFlightRoute,
  useMapController,
  type FlightPlaybackState,
  type FlightRoute,
  type FlightWaypoint,
} from "../map"
import { useLocalStore } from "../stores"

const props = defineProps<{
  selectedRouteId: string
}>()

const mapController = useMapController()
const localStore = useLocalStore()

const selectedRoute = computed(() =>
  localStore.flightRoutes.find((route) => route.id === props.selectedRouteId),
)
const playback = ref<FlightPlaybackState>(mapController.getFlightPlaybackState())
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")
const drawing = ref(false)
const confirmingClear = ref(false)

const routeForm = reactive({
  name: "",
  defaultHeight: String(DEFAULT_FLIGHT_HEIGHT),
  safetyClearance: String(DEFAULT_FLIGHT_CLEARANCE),
  speed: String(DEFAULT_FLIGHT_SPEED),
})

const playbackActive = computed(() => playback.value.status !== "idle")
const routeEditorDisabled = computed(() => !selectedRoute.value || playbackActive.value)
const heightSliderValue = computed(() => heightToSlider(Number(routeForm.defaultHeight)))
const selectedRouteName = computed(() => selectedRoute.value?.name ?? "未选择航线")

let disposePlaybackState: (() => void) | undefined
let disposeMapClick: (() => void) | undefined
let feedbackTimer: number | undefined

watch(props, () => syncRouteForm())

watch(playbackActive, (active) => {
  if (active) {
    drawing.value = false
    confirmingClear.value = false
  }
})

watch(
  () => props.selectedRouteId,
  () => {
    drawing.value = false
    confirmingClear.value = false
  },
)

onMounted(() => {
  syncRouteForm()
  disposeMapClick = mapController.onMapClick((coordinate) => {
    appendWaypoint(coordinate)
  })
  disposePlaybackState = mapController.onFlightPlaybackStateChange((state) => {
    playback.value = state
  })
})

onBeforeUnmount(() => {
  disposePlaybackState?.()
  disposePlaybackState = undefined
  disposeMapClick?.()
  disposeMapClick = undefined
  window.clearTimeout(feedbackTimer)
})

/** 将选中航线参数同步到表单显示值。 */
function syncRouteForm() {
  const route = selectedRoute.value
  if (!route) {
    routeForm.name = ""
    routeForm.defaultHeight = String(DEFAULT_FLIGHT_HEIGHT)
    routeForm.safetyClearance = String(DEFAULT_FLIGHT_CLEARANCE)
    routeForm.speed = String(DEFAULT_FLIGHT_SPEED)
    return
  }

  routeForm.name = route.name
  routeForm.defaultHeight = String(Math.round(route.defaultHeight))
  routeForm.safetyClearance = String(Math.round(route.safetyClearance))
  routeForm.speed = String(Math.round(route.speed))
}

/** 提交航线名称表单。 */
function applyRouteName() {
  const route = selectedRoute.value
  if (!route) return

  const name = routeForm.name.trim().slice(0, 50) || "未命名航线"
  routeForm.name = name
  updateSelectedRoute({ name })
}

/** 校验并提交一个航线数值参数。 */
function applyRouteSetting(field: "defaultHeight" | "safetyClearance" | "speed") {
  const route = selectedRoute.value
  if (!route) return

  const value = Number(routeForm[field])
  if (!Number.isFinite(value)) {
    syncRouteForm()
    showFeedback("参数必须是有效数字", "error")
    return
  }

  const normalized = normalizeFlightRoute({ ...route, [field]: value })
  routeForm.defaultHeight = String(Math.round(normalized.defaultHeight))
  routeForm.safetyClearance = String(Math.round(normalized.safetyClearance))
  routeForm.speed = String(Math.round(normalized.speed))
  updateSelectedRoute({
    defaultHeight: normalized.defaultHeight,
    safetyClearance: normalized.safetyClearance,
    speed: normalized.speed,
  })

  if (playback.value.status !== "idle") {
    mapController.updateFlightPlayback({
      speed: normalized.speed,
      loop: normalized.loop,
    })
  }
}

/** 将高度滑杆位置转换为默认高度。 */
function updateHeightSlider(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return

  const height = Math.round(sliderToHeight(Number(event.target.value)))
  routeForm.defaultHeight = String(height)
  applyRouteSetting("defaultHeight")
}

/** 提交范围滑杆对应的航线参数。 */
function updateRangeSetting(field: "safetyClearance" | "speed", event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return

  routeForm[field] = event.target.value
  applyRouteSetting(field)
}

/** 开启或关闭地图点击绘制航点模式。 */
function toggleDrawing() {
  if (!selectedRoute.value) {
    showFeedback("请先创建或选择航线", "error")
    return
  }
  if (playbackActive.value) return

  drawing.value = !drawing.value
  if (drawing.value) confirmingClear.value = false
}

/** 将地图点击坐标追加到当前航线。 */
function appendWaypoint(waypoint: FlightWaypoint) {
  const route = selectedRoute.value
  if (!route || !drawing.value || playbackActive.value) return
  if (route.waypoints.length >= MAX_FLIGHT_WAYPOINTS) {
    showFeedback(`航点数量不能超过 ${MAX_FLIGHT_WAYPOINTS} 个`, "error")
    return
  }

  updateSelectedRoute({ waypoints: [...route.waypoints, waypoint] })
}

/** 删除当前航线中的指定航点。 */
function removeWaypoint(index: number) {
  const route = selectedRoute.value
  if (!route || playbackActive.value) return

  updateSelectedRoute({
    waypoints: route.waypoints.filter((_waypoint, waypointIndex) => waypointIndex !== index),
  })
}

/** 二次确认后清空当前航线航点。 */
function clearWaypoints() {
  const route = selectedRoute.value
  if (!route || playbackActive.value) return

  if (!confirmingClear.value) {
    confirmingClear.value = true
    showFeedback("再次点击清空航点将确认操作", "error")
    return
  }

  updateSelectedRoute({ waypoints: [] })
  confirmingClear.value = false
  drawing.value = false
  showFeedback("航点已清空")
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

/** 将米制高度换算为对数滑杆位置。 */
function heightToSlider(height: number) {
  const minHeight = 100
  const maxHeight = 5000
  const safeHeight = Math.min(maxHeight, Math.max(minHeight, height))
  return (
    ((Math.log10(safeHeight) - Math.log10(minHeight)) /
      (Math.log10(maxHeight) - Math.log10(minHeight))) *
    1000
  )
}

/** 将对数滑杆位置换算为米制高度。 */
function sliderToHeight(position: number) {
  const minHeight = 100
  const maxHeight = 5000
  const safePosition = Math.min(1000, Math.max(0, position))
  return minHeight * 10 ** ((safePosition / 1000) * (Math.log10(maxHeight) - Math.log10(minHeight)))
}
</script>

<template>
  <div class="route-settings">
    <section class="block" aria-label="基础参数">
      <div class="block-head">
        <h3>基础参数</h3>
        <span>{{ selectedRouteName }}</span>
      </div>

      <div class="field-grid">
        <label>
          <span>航线名称</span>
          <input
            v-model="routeForm.name"
            type="text"
            maxlength="50"
            :disabled="routeEditorDisabled"
            @change="applyRouteName"
          />
        </label>
        <label>
          <span>默认高度</span>
          <input
            v-model="routeForm.defaultHeight"
            type="number"
            min="100"
            max="5000"
            step="1"
            :disabled="routeEditorDisabled"
            @change="applyRouteSetting('defaultHeight')"
          />
        </label>
      </div>
    </section>

    <section class="block" aria-label="高度参数">
      <div class="parameter">
        <div class="parameter-head">
          <span>默认高度</span>
          <small>100~5000m</small>
        </div>
        <input
          :value="heightSliderValue"
          type="range"
          min="0"
          max="1000"
          step="1"
          aria-label="默认高度"
          :disabled="routeEditorDisabled"
          @input="updateHeightSlider"
        />
      </div>
    </section>

    <section class="block" aria-label="安全与速度参数">
      <div class="parameter">
        <div class="parameter-head">
          <span>安全离地</span>
          <input
            v-model="routeForm.safetyClearance"
            type="number"
            min="10"
            max="500"
            step="1"
            :disabled="routeEditorDisabled"
            @change="applyRouteSetting('safetyClearance')"
          />
        </div>
        <input
          :value="Number(routeForm.safetyClearance)"
          type="range"
          min="10"
          max="500"
          step="1"
          aria-label="安全离地间距"
          :disabled="routeEditorDisabled"
          @input="updateRangeSetting('safetyClearance', $event)"
        />
      </div>

      <div class="parameter">
        <div class="parameter-head">
          <span>飞行速度</span>
          <input
            v-model="routeForm.speed"
            type="number"
            min="1"
            max="500"
            step="1"
            :disabled="!selectedRoute"
            @change="applyRouteSetting('speed')"
          />
        </div>
        <input
          :value="Number(routeForm.speed)"
          type="range"
          min="1"
          max="500"
          step="1"
          aria-label="飞行速度，单位米每秒"
          :disabled="!selectedRoute"
          @input="updateRangeSetting('speed', $event)"
        />
      </div>
    </section>

    <section class="block" aria-label="航点管理">
      <div class="block-head">
        <h3>航点管理</h3>
        <span>{{ selectedRoute?.waypoints.length ?? 0 }} 个</span>
      </div>

      <div class="block-footer">
        <button
          type="button"
          :class="{ 'is-active': drawing }"
          :aria-pressed="drawing"
          :disabled="routeEditorDisabled"
          :title="drawing ? '关闭航点绘制' : '开启航点绘制'"
          @click="toggleDrawing"
        >
          <i class="bi bi-pencil" aria-hidden="true"></i>
          {{ drawing ? "结束绘制" : "绘制航点" }}
        </button>
        <button
          type="button"
          class="danger"
          :disabled="routeEditorDisabled || selectedRoute?.waypoints.length === 0"
          :title="confirmingClear ? '再次点击确认清空' : '清空航点'"
          @click="clearWaypoints"
        >
          <i class="bi bi-eraser" aria-hidden="true"></i>
          {{ confirmingClear ? "确认清空" : "清空航点" }}
        </button>
      </div>

      <div v-if="selectedRoute?.waypoints.length" class="waypoint-list">
        <div
          v-for="(waypoint, index) in selectedRoute.waypoints"
          :key="`${index}-${waypoint.longitude}-${waypoint.latitude}`"
          class="waypoint"
        >
          <span>{{ index + 1 }}</span>
          <small>{{ waypoint.longitude.toFixed(5) }}, {{ waypoint.latitude.toFixed(5) }}</small>
          <button
            type="button"
            class="icon-button"
            title="删除航点"
            :aria-label="`删除第 ${index + 1} 个航点`"
            :disabled="routeEditorDisabled"
            @click="removeWaypoint(index)"
          >
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>

    <p v-if="feedback" class="feedback" :class="feedbackTone" role="status" aria-live="polite">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.route-settings {
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

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.block-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
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

label {
  display: grid;
  gap: 4px;
  min-width: 0;

  span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
  }
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

.parameter {
  display: grid;
  gap: 5px;
}

.parameter-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  gap: 6px;
  align-items: center;

  span {
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--text-muted);
    font-size: 10px;
    text-align: right;
  }
}

.waypoint-list {
  display: grid;
  max-height: 150px;
  gap: 5px;
  overflow-y: auto;
  padding-right: 2px;
}

.waypoint {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 26px;
  gap: 6px;
  align-items: center;
  padding: 4px 5px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.4);

  > span {
    color: var(--cyan);
    font-family: var(--font-data);
    font-size: 10px;
    text-align: center;
  }

  small {
    overflow: hidden;
    font-family: var(--font-data);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.icon-button {
  padding: 6px 0;
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

@media (max-width: 520px) {
  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
