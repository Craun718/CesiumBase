<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController, type OrbitFlightState } from "../map"
import { useLocalStore } from "../stores"
import type { SceneMode } from "../map"

const MIN_ORBIT_DURATION_SECONDS = 5
const MAX_ORBIT_DURATION_SECONDS = 120
const DEFAULT_ORBIT_DURATION_SECONDS = 20

const props = defineProps<{
  sceneMode: SceneMode
}>()

const mapController = useMapController()
const localStore = useLocalStore()

/** 同步 localStore 中可能缺失的 orbitPreferences（老用户无此字段）。 */
function normalizeOrbitPreferences() {
  const current = localStore.orbitPreferences
  if (!current || typeof current !== "object") {
    localStore.orbitPreferences = { durationSeconds: DEFAULT_ORBIT_DURATION_SECONDS }
    return
  }
  const value = Number(current.durationSeconds)
  if (!Number.isFinite(value)) {
    localStore.orbitPreferences = { durationSeconds: DEFAULT_ORBIT_DURATION_SECONDS }
    return
  }
  const clamped = Math.min(
    MAX_ORBIT_DURATION_SECONDS,
    Math.max(MIN_ORBIT_DURATION_SECONDS, Math.round(value)),
  )
  if (clamped !== current.durationSeconds) {
    localStore.orbitPreferences = { durationSeconds: clamped }
  }
}

const durationSeconds = ref(DEFAULT_ORBIT_DURATION_SECONDS)
const orbitState = ref<OrbitFlightState>(mapController.getOrbitFlightState())
const mapReady = ref(false)
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")

let disposeMountState: (() => void) | undefined
let disposeOrbitState: (() => void) | undefined
let feedbackTimer: number | undefined
let disposed = false

const status = computed(() => orbitState.value.status)
const isTwoDimensional = computed(() => props.sceneMode === "2d")
const canToggle = computed(() => mapReady.value && !isTwoDimensional.value)
const canStart = computed(() => canToggle.value && status.value !== "playing")
const canPause = computed(() => canToggle.value && status.value === "playing")
const canStop = computed(() => canToggle.value && status.value !== "idle")
const canSeek = computed(() => canToggle.value && status.value !== "idle")
const disabledReason = computed(() => {
  if (!mapReady.value) return "等待地图就绪"
  if (isTwoDimensional.value) return "仅3D模式可用"
  return ""
})
const startLabel = computed(() => (status.value === "paused" ? "继续" : "开始"))
const startTitle = computed(() => {
  if (!canToggle.value) return disabledReason.value
  return status.value === "paused" ? "继续环绕飞行" : "开始环绕飞行"
})
const statusText = computed(() => {
  switch (status.value) {
    case "playing":
      return "播放中"
    case "paused":
      return "已暂停"
    default:
      return "待播放"
  }
})
const statusClass = computed(() => {
  switch (status.value) {
    case "playing":
      return "playing"
    case "paused":
      return "paused"
    default:
      return "stopped"
  }
})
const progressPercent = computed(() => Math.round(orbitState.value.progress * 100))
const progressSliderValue = computed(() => Math.round(orbitState.value.progress * 1000))

const durationInputValue = computed(() => String(durationSeconds.value))

/** 显示面板内操作反馈。 */
function showFeedback(message: string, tone: "info" | "error" = "info") {
  feedback.value = message
  feedbackTone.value = tone
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = ""
  }, 3600)
}

/** 应用新的周期值：写 store，必要时实时同步引擎。 */
function applyDurationValue(value: number) {
  const clamped = Math.min(
    MAX_ORBIT_DURATION_SECONDS,
    Math.max(MIN_ORBIT_DURATION_SECONDS, Math.round(value)),
  )
  durationSeconds.value = clamped
  localStore.orbitPreferences = { durationSeconds: clamped }
  if (orbitState.value.active) {
    mapController.setOrbitFlightSettings({ durationSeconds: clamped })
  }
}

function applyDurationNumber(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const value = Number(input.value)
  if (!Number.isFinite(value)) return
  applyDurationValue(value)
}

function applyDurationRange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  applyDurationValue(Number(input.value))
}

/** 开始：idle 时启动环绕；paused 时继续环绕。 */
function handleStart() {
  if (!canStart.value) return
  if (status.value === "paused") {
    mapController.resumeOrbitFlight()
    showFeedback("环绕飞行已继续")
  } else {
    mapController.setOrbitFlight(true, { durationSeconds: durationSeconds.value })
    showFeedback("环绕飞行已启动")
  }
}

/** 暂停：仅 playing 状态可调。 */
function handlePause() {
  if (!canPause.value) return
  mapController.pauseOrbitFlight()
  showFeedback("环绕飞行已暂停")
}

/** 停止：销毁 runtime，回到 idle。 */
function handleStop() {
  if (!canStop.value) return
  mapController.setOrbitFlight(false)
  showFeedback("环绕飞行已停止")
}

/** 拖动进度滑杆：按 [0, 1] 重新定位环绕角度。 */
function handleSeek(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const value = Number(input.value)
  if (!Number.isFinite(value)) return
  mapController.seekOrbitFlight(value / 1000)
}

onMounted(() => {
  normalizeOrbitPreferences()
  durationSeconds.value = localStore.orbitPreferences.durationSeconds
  // 启动前以引擎实际值为准，避免显示与运行时不一致
  const engineState = mapController.getOrbitFlightState()
  orbitState.value = engineState
  durationSeconds.value = engineState.durationSeconds

  disposeMountState = mapController.onMountStateChange((ready) => {
    if (disposed) return
    mapReady.value = ready
    if (ready) {
      const nextState = mapController.getOrbitFlightState()
      orbitState.value = nextState
      durationSeconds.value = nextState.durationSeconds
    }
  })

  disposeOrbitState = mapController.onOrbitFlightStateChange((state) => {
    if (disposed) return
    orbitState.value = state
    durationSeconds.value = state.durationSeconds
  })
})

onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(feedbackTimer)
  disposeMountState?.()
  disposeMountState = undefined
  disposeOrbitState?.()
  disposeOrbitState = undefined
})
</script>

<template>
  <div class="orbit-flight">
    <section class="block" aria-label="状态与控制">
      <div class="block-head">
        <h3>环绕飞行</h3>
        <span :class="['status', statusClass]">{{ statusText }}</span>
      </div>

      <div class="playback-actions">
        <button
          type="button"
          class="action"
          :class="{ 'is-active': status === 'playing' }"
          :disabled="!canStart"
          :title="startTitle"
          @click="handleStart"
        >
          <i class="bi bi-play-fill" aria-hidden="true"></i>
          <span>{{ startLabel }}</span>
        </button>
        <button
          type="button"
          class="action"
          :disabled="!canPause"
          :title="canPause ? '暂停环绕飞行' : '请先开始环绕飞行'"
          @click="handlePause"
        >
          <i class="bi bi-pause-fill" aria-hidden="true"></i>
          <span>暂停</span>
        </button>
        <button
          type="button"
          class="action"
          :disabled="!canStop"
          :title="canStop ? '停止环绕飞行' : '环绕飞行未启动'"
          @click="handleStop"
        >
          <i class="bi bi-stop-fill" aria-hidden="true"></i>
          <span>停止</span>
        </button>
      </div>

      <p v-if="!canToggle && disabledReason" class="hint">{{ disabledReason }}</p>
    </section>

    <section class="block" aria-label="进度">
      <div class="parameter">
        <div class="parameter-head">
          <span>环绕进度</span>
          <span class="progress-readout">{{ progressPercent }}%</span>
        </div>
        <input
          :value="progressSliderValue"
          type="range"
          min="0"
          max="1000"
          step="1"
          aria-label="环绕进度滑杆"
          :disabled="!canSeek"
          @input="handleSeek"
        />
        <p class="parameter-meta">
          <span>0%</span>
          <span>{{ statusText }}</span>
          <span>100%</span>
        </p>
      </div>
    </section>

    <section class="block" aria-label="周期参数">
      <div class="parameter">
        <div class="parameter-head">
          <span>环绕周期</span>
          <input
            :value="durationInputValue"
            type="number"
            :min="MIN_ORBIT_DURATION_SECONDS"
            :max="MAX_ORBIT_DURATION_SECONDS"
            step="1"
            aria-label="环绕周期，单位秒每圈"
            :disabled="!mapReady"
            @change="applyDurationNumber"
          />
        </div>
        <input
          :value="durationSeconds"
          type="range"
          :min="MIN_ORBIT_DURATION_SECONDS"
          :max="MAX_ORBIT_DURATION_SECONDS"
          step="1"
          aria-label="环绕周期滑杆，单位秒每圈"
          :disabled="!mapReady"
          @input="applyDurationRange"
        />
        <p class="parameter-meta">
          <span>{{ MIN_ORBIT_DURATION_SECONDS }}s</span>
          <span>当前 {{ durationSeconds }} 秒/圈</span>
          <span>{{ MAX_ORBIT_DURATION_SECONDS }}s</span>
        </p>
      </div>
    </section>

    <p v-if="feedback" class="feedback" :class="feedbackTone" role="status" aria-live="polite">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/fields" as fields;

.orbit-flight {
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

.playback-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.action {
  display: grid;
  grid-template-rows: auto auto;
  justify-items: center;
  gap: 4px;
  min-height: var(--control-lg);
  padding: var(--space-2) var(--space-2);
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  background: color-mix(in srgb, var(--surface-1) 55%, transparent);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;

  > i {
    font-size: var(--text-base);
  }
}

.action:hover:not(:disabled),
.action:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
}

.action:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: var(--ring-offset);
}

.action:disabled {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 32%, transparent);
  cursor: not-allowed;
}

.action.is-active {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.parameter {
  display: grid;
  gap: 5px;
}

.parameter-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 70px;
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

.progress-readout {
  font-family: var(--font-mono);
  color: var(--accent);
  text-align: right;
}

/* 面板字段统一走玻璃档（见 _fields.scss）：本面板浮在裸地图上，底色必须半透明。
   数值输入自动走等宽分支；滑块不吃这套皮肤，只有高度与内边距来自同一处。 */
@include fields.glass-controls;

.parameter-meta {
  display: flex;
  justify-content: space-between;
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}

.status {
  font-family: var(--font-mono);

  &.playing {
    color: var(--accent);
  }

  &.paused {
    color: var(--warning);
  }

  &.stopped {
    color: var(--text-muted);
  }
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
</style>
