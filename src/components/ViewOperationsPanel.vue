<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import {
  clampCameraHeight,
  MAX_CAMERA_HEIGHT,
  MIN_CAMERA_HEIGHT,
  useMapController,
  type CameraState,
} from "../map"

const mapController = useMapController()

type ViewOperationSection = "position" | "camera"

defineProps<{ section: ViewOperationSection }>()

const LOG_HEIGHT_RANGE = Math.log10(MAX_CAMERA_HEIGHT) - Math.log10(MIN_CAMERA_HEIGHT)

const coordinateForm = reactive({
  longitude: "108.25",
  latitude: "23.7",
})

const cameraForm = reactive({
  heading: "0",
  pitch: "-90",
  height: "700000",
})

let headingOverride: number | undefined
let headingInteractionDeadline = 0
const feedback = ref("")
const feedbackTone = ref<"info" | "error">("info")
let disposeMountState: (() => void) | undefined
let disposeCameraState: (() => void) | undefined
let feedbackTimer: number | undefined

const heightSliderPosition = computed({
  get: () => heightToSlider(parseNumber(cameraForm.height) ?? 700_000),
  set: (position: number) => {
    const height = Math.round(clampCameraHeight(sliderToHeight(position)))
    cameraForm.height = String(height)
    mapController.setCameraState({ height })
  },
})

function parseNumber(value: string) {
  const result = Number(value)
  return Number.isFinite(result) ? result : undefined
}

function applyCoordinate() {
  const longitude = parseNumber(coordinateForm.longitude)
  const latitude = parseNumber(coordinateForm.latitude)

  if (
    longitude === undefined ||
    latitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    showFeedback("请输入有效经度（-180~180）和纬度（-90~90）", "error")
    return
  }

  mapController.flyToCoordinate({ longitude, latitude })
  showFeedback("视角正在飞行到指定坐标")
}

function applyCameraField(field: "heading" | "pitch" | "height") {
  const value = parseNumber(cameraForm[field])
  if (value === undefined) {
    showFeedback("相机参数必须是有效数字", "error")
    return
  }

  if (field === "heading") {
    const heading = Math.min(360, Math.max(-360, value))
    headingOverride = heading
    headingInteractionDeadline = performance.now() + 120
    cameraForm.heading = String(Math.round(heading))
    mapController.setCameraState({ heading })
    return
  }

  if (field === "pitch") {
    const pitch = Math.min(0, Math.max(-90, value))
    cameraForm.pitch = String(Math.round(pitch))
    mapController.setCameraState({ pitch })
    return
  }

  const height = Math.round(clampCameraHeight(value))
  cameraForm.height = String(height)
  mapController.setCameraState({ height })
}

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360
}

function syncCameraState(state: CameraState) {
  if (performance.now() < headingInteractionDeadline) return

  const normalizedHeading =
    headingOverride === undefined ? undefined : normalizeHeading(headingOverride)
  const heading = normalizedHeading === state.heading ? headingOverride : state.heading
  if (normalizedHeading !== state.heading) {
    headingOverride = undefined
  }

  syncField("longitude", state.longitude.toFixed(6))
  syncField("latitude", state.latitude.toFixed(6))
  syncField("heading", String(Math.round(heading ?? state.heading)))
  syncField("pitch", String(Math.round(state.pitch)))
  syncField("height", String(Math.round(state.height)))
}

function syncField(field: string, value: string) {
  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLInputElement &&
    activeElement.type === "number" &&
    activeElement.dataset.cameraField === field
  ) {
    return
  }

  if (field in coordinateForm) {
    coordinateForm[field as keyof typeof coordinateForm] = value
    return
  }

  if (field in cameraForm) {
    cameraForm[field as keyof typeof cameraForm] = value
  }
}

function heightToSlider(height: number) {
  const safeHeight = clampCameraHeight(height)
  return ((Math.log10(safeHeight) - Math.log10(MIN_CAMERA_HEIGHT)) / LOG_HEIGHT_RANGE) * 1000
}

function sliderToHeight(position: number) {
  return (
    MIN_CAMERA_HEIGHT * 10 ** ((Math.min(1000, Math.max(0, position)) / 1000) * LOG_HEIGHT_RANGE)
  )
}

function showFeedback(message: string, tone: "info" | "error" = "info") {
  feedback.value = message
  feedbackTone.value = tone
  window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => {
    feedback.value = ""
  }, 3200)
}

onMounted(() => {
  disposeMountState = mapController.onMountStateChange((ready) => {
    if (!ready) return

    syncCameraState(mapController.getCameraState())
    disposeCameraState?.()
    disposeCameraState = mapController.onCameraStateChange(syncCameraState)
  })
})

onBeforeUnmount(() => {
  disposeMountState?.()
  disposeCameraState?.()
  window.clearTimeout(feedbackTimer)
})
</script>

<template>
  <div class="view-operations">
    <template v-if="section === 'position'">
      <div class="field-grid">
        <label>
          <span>经度</span>
          <input
            v-model="coordinateForm.longitude"
            type="number"
            inputmode="decimal"
            min="-180"
            max="180"
            step="any"
            data-camera-field="longitude"
            @keydown.enter="applyCoordinate"
          />
        </label>
        <label>
          <span>纬度</span>
          <input
            v-model="coordinateForm.latitude"
            type="number"
            inputmode="decimal"
            min="-90"
            max="90"
            step="any"
            data-camera-field="latitude"
            @keydown.enter="applyCoordinate"
          />
        </label>
      </div>
      <button class="action-button" type="button" @click="applyCoordinate">
        <i class="bi bi-crosshair" aria-hidden="true"></i>
        飞行定位
      </button>
    </template>

    <template v-else-if="section === 'camera'">
      <div class="parameter">
        <div class="parameter-head">
          <label for="camera-heading-number">方位角</label>
          <input
            id="camera-heading-number"
            v-model="cameraForm.heading"
            class="parameter-number"
            type="number"
            inputmode="decimal"
            min="-360"
            max="360"
            step="1"
            data-camera-field="heading"
            @change="applyCameraField('heading')"
          />
        </div>
        <input
          v-model="cameraForm.heading"
          class="parameter-slider"
          type="range"
          min="-360"
          max="360"
          step="1"
          aria-label="方位角"
          data-camera-field="heading"
          @input="applyCameraField('heading')"
        />
      </div>

      <div class="parameter">
        <div class="parameter-head">
          <label for="camera-pitch-number">俯仰角</label>
          <input
            id="camera-pitch-number"
            v-model="cameraForm.pitch"
            class="parameter-number"
            type="number"
            inputmode="decimal"
            min="-90"
            max="0"
            step="1"
            data-camera-field="pitch"
            @change="applyCameraField('pitch')"
          />
        </div>
        <input
          v-model="cameraForm.pitch"
          class="parameter-slider"
          type="range"
          min="-90"
          max="0"
          step="1"
          aria-label="俯仰角"
          data-camera-field="pitch"
          @input="applyCameraField('pitch')"
        />
      </div>

      <div class="parameter">
        <div class="parameter-head">
          <label for="camera-height-number">相机高度</label>
          <input
            id="camera-height-number"
            v-model="cameraForm.height"
            class="parameter-number"
            type="number"
            inputmode="decimal"
            :min="MIN_CAMERA_HEIGHT"
            :max="MAX_CAMERA_HEIGHT"
            step="1"
            data-camera-field="height"
            @change="applyCameraField('height')"
          />
        </div>
        <input
          v-model="heightSliderPosition"
          class="parameter-slider"
          type="range"
          min="0"
          max="1000"
          step="1"
          aria-label="相机高度"
          data-camera-field="height"
        />
      </div>
    </template>

    <p v-if="feedback" class="operation-feedback" :class="`is-${feedbackTone}`" role="status">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.view-operations {
  display: grid;
  gap: 16px;
  margin-top: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
}

input {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  background: rgba(7, 20, 42, 0.58);
  outline: none;
}

input:focus-visible {
  border-color: rgba(72, 229, 255, 0.68);
  outline: 2px solid rgba(72, 229, 255, 0.3);
  outline-offset: 1px;
}

.parameter {
  display: grid;
  gap: 6px;
}

.parameter-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 68px;
  gap: 8px;
  align-items: center;
}

.parameter-head label {
  font-size: 12px;
}

.parameter-number {
  padding: 5px 6px;
  text-align: right;
}

.parameter-slider {
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  accent-color: var(--cyan);
}

.parameter-slider:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(79, 151, 255, 0.32);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.44);
  font-size: 12px;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.action-button:hover,
.action-button:focus-visible {
  border-color: rgba(72, 229, 255, 0.72);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.86);
}

.action-button:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.operation-feedback {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.operation-feedback.is-error {
  color: var(--rose);
}
</style>
