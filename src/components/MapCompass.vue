<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"

const props = withDefaults(
  defineProps<{
    heading: number
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  rotate: [heading: number]
  reset: []
}>()

const dial = ref<HTMLDivElement>()
const dragging = ref(false)
const resetting = ref(false)
const resetDuration = 500
let resetAnimationTimer: number | undefined

const normalizedHeading = computed(() => {
  if (!Number.isFinite(props.heading)) return 0

  return ((props.heading % 360) + 360) % 360
})
const continuousHeading = ref(normalizedHeading.value)

watch(normalizedHeading, (heading) => {
  const delta = ((((heading - continuousHeading.value + 180) % 360) + 360) % 360) - 180

  continuousHeading.value += delta
})

const compassRotation = computed(() => -continuousHeading.value)
const headingLabel = computed(() => `${Math.round(normalizedHeading.value)}°`)

function headingFromPointerEvent(event: PointerEvent) {
  const element = dial.value

  if (!element) return props.heading

  const rect = element.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const pointerAngle =
    (Math.atan2(event.clientX - centerX, centerY - event.clientY) * 180) / Math.PI

  return ((-pointerAngle % 360) + 360) % 360
}

function startDrag(event: PointerEvent) {
  if (props.disabled) return

  event.preventDefault()
  dragging.value = true
  dial.value?.setPointerCapture(event.pointerId)
  emit("rotate", headingFromPointerEvent(event))
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value || props.disabled) return

  emit("rotate", headingFromPointerEvent(event))
}

function stopDrag() {
  dragging.value = false
}

function resetNorth() {
  if (props.disabled) return

  resetting.value = false
  window.clearTimeout(resetAnimationTimer)
  requestAnimationFrame(() => {
    resetting.value = true
  })
  resetAnimationTimer = window.setTimeout(() => {
    resetting.value = false
  }, resetDuration)

  emit("reset")
}

onBeforeUnmount(() => {
  window.clearTimeout(resetAnimationTimer)
})

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return

  const step = event.shiftKey ? 1 : 5
  let nextHeading: number | undefined

  if (event.key === "ArrowLeft") {
    nextHeading = normalizedHeading.value + step
  } else if (event.key === "ArrowRight") {
    nextHeading = normalizedHeading.value - step
  } else if (event.key === "Home") {
    event.preventDefault()
    emit("reset")

    return
  }

  if (nextHeading === undefined) return

  event.preventDefault()
  emit("rotate", ((nextHeading % 360) + 360) % 360)
}
</script>

<template>
  <div class="map-compass" :class="{ 'is-disabled': disabled }">
    <div
      ref="dial"
      class="compass-dial"
      :class="{ 'is-dragging': dragging }"
      role="slider"
      tabindex="0"
      :aria-label="'视角方位'"
      :aria-valuemin="0"
      :aria-valuemax="360"
      :aria-valuenow="Math.round(normalizedHeading)"
      :aria-valuetext="`北偏东 ${Math.round(normalizedHeading)} 度`"
      :aria-disabled="disabled"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
      @keydown="handleKeydown"
    >
      <span class="compass-ring" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </span>
      <span
        class="north-needle"
        :style="{ transform: `rotate(${compassRotation}deg)` }"
        aria-hidden="true"
      >
        <i class="needle-arrow"></i>
        <small>N</small>
      </span>
    </div>

    <button
      class="north-reset"
      type="button"
      :disabled="disabled"
      aria-label="复位正北"
      title="复位正北"
      :class="{ 'is-resetting': resetting }"
      @click="resetNorth"
    >
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
    </button>
    <span class="compass-heading" aria-hidden="true">{{ headingLabel }}</span>
  </div>
</template>

<style scoped lang="scss">
.map-compass {
  position: absolute;
  right: 22px;
  bottom: 22px;
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: 7px;
  pointer-events: none;
}

.compass-dial {
  position: relative;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 1px solid rgba(72, 229, 255, 0.48);
  border-radius: 50%;
  color: var(--text-secondary);
  background:
    radial-gradient(circle at center, rgba(16, 47, 83, 0.28), rgba(3, 9, 19, 0.9)),
    rgba(7, 20, 42, 0.88);
  box-shadow:
    0 10px 28px rgba(1, 8, 20, 0.5),
    inset 0 0 18px rgba(72, 229, 255, 0.12);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.compass-dial:hover,
.compass-dial:focus-visible,
.compass-dial.is-dragging {
  border-color: rgba(72, 229, 255, 0.9);
  box-shadow:
    0 10px 30px rgba(1, 8, 20, 0.58),
    inset 0 0 22px rgba(72, 229, 255, 0.2);
}

.compass-dial:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 3px;
}

.compass-dial.is-dragging {
  cursor: grabbing;
}

.compass-ring {
  position: absolute;
  inset: 9px;
  border: 1px dashed rgba(103, 139, 191, 0.44);
  border-radius: 50%;
}

.compass-ring i {
  position: absolute;
  width: 1px;
  height: 6px;
  background: rgba(103, 139, 191, 0.62);
}

.compass-ring i:nth-child(1) {
  top: -1px;
  left: 50%;
}

.compass-ring i:nth-child(2) {
  top: 50%;
  right: -1px;
  transform: translateY(-50%) rotate(90deg);
}

.compass-ring i:nth-child(3) {
  bottom: -1px;
  left: 50%;
}

.compass-ring i:nth-child(4) {
  top: 50%;
  left: -1px;
  transform: translateY(-50%) rotate(90deg);
}

.north-needle {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 30px;
  height: 46px;
  transform-origin: center;
  transition: transform 80ms linear;
  will-change: transform;
}

.needle-arrow {
  width: 16px;
  height: 29px;
  color: #fff;
  background: currentColor;
  clip-path: polygon(50% 0%, 100% 65%, 50% 48%, 0% 65%);
  filter: drop-shadow(0 1px 3px rgba(1, 8, 20, 0.65));
}

.north-needle small {
  margin-top: 1px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.north-reset,
.compass-heading {
  pointer-events: auto;
}

.north-reset {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid rgba(79, 151, 255, 0.36);
  border-radius: 50%;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.9);
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.north-reset > .bi {
  font-size: 13px;
  line-height: 1;
}

.north-reset:hover,
.north-reset:focus-visible {
  border-color: rgba(72, 229, 255, 0.78);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.94);
}

.north-reset:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.north-reset.is-resetting {
  animation: reset-pulse 500ms ease;
}

.north-reset.is-resetting > .bi {
  animation: reset-spin 500ms cubic-bezier(0.32, 0.72, 0.25, 1);
}

@keyframes reset-pulse {
  0% {
    transform: scale(1);
  }

  35% {
    transform: scale(0.9);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes reset-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(-360deg);
  }
}

.compass-heading {
  padding: 3px 6px;
  border: 1px solid rgba(79, 151, 255, 0.24);
  border-radius: 3px;
  color: var(--text-secondary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1;
  background: rgba(7, 20, 42, 0.78);
}

.map-compass.is-disabled .compass-dial {
  cursor: not-allowed;
  opacity: 0.62;
}

.map-compass.is-disabled .north-reset {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 1023px) {
  .map-compass {
    display: none;
  }
}
</style>
