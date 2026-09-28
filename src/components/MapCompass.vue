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
        <small>N</small>
        <i class="needle-arrow"></i>
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
    <span
      class="compass-heading"
      role="status"
      :aria-label="`当前方位 ${Math.round(normalizedHeading)} 度`"
      >{{ headingLabel }}</span
    >
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
  border: 1px solid color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: 50%;
  color: var(--text-secondary);
  background:
    radial-gradient(
      circle at center,
      color-mix(in srgb, var(--neutral-deep) 28%, transparent),
      color-mix(in srgb, var(--color-abyss) 90%, transparent)
    ),
    color-mix(in srgb, var(--color-panel) 88%, transparent);
  box-shadow:
    0 10px 28px color-mix(in srgb, var(--color-abyss) 50%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--accent) 12%, transparent);
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
  border-color: color-mix(in srgb, var(--accent) 90%, transparent);
  box-shadow:
    0 10px 30px color-mix(in srgb, var(--color-abyss) 58%, transparent),
    inset 0 0 22px color-mix(in srgb, var(--accent) 20%, transparent);
}

/* 表盘自带投影，会覆盖 global.css 里 :focus-visible 的 box-shadow，
   而它正是压在最亮底图上的那个元素，必须自己把衬托层补回来。 */
.compass-dial:focus-visible {
  outline-offset: 3px;
  box-shadow:
    var(--ring-shadow),
    0 10px 30px color-mix(in srgb, var(--color-abyss) 58%, transparent),
    inset 0 0 22px color-mix(in srgb, var(--accent) 20%, transparent);
}

.compass-dial.is-dragging {
  cursor: grabbing;
}

.compass-ring {
  position: absolute;
  inset: 9px;
  border: 1px dashed color-mix(in srgb, var(--text-secondary) 44%, transparent);
  border-radius: 50%;
}

.compass-ring i {
  position: absolute;
  width: 1px;
  height: 6px;
  background: color-mix(in srgb, var(--text-secondary) 62%, transparent);
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
  color: var(--text-max);
  background: currentColor;
  clip-path: polygon(50% 0%, 100% 65%, 50% 48%, 0% 65%);
  filter: drop-shadow(0 1px 3px color-mix(in srgb, var(--color-abyss) 65%, transparent));
}

.north-needle small {
  margin-top: 1px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: var(--weight-bold);
  line-height: 1;
}

.north-reset,
.compass-heading {
  pointer-events: auto;
}

.north-reset {
  display: grid;
  place-items: center;
  width: var(--control-md);
  height: var(--control-md);
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--neutral) 36%, transparent);
  border-radius: 50%;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-1) 90%, transparent);
}

.north-reset > .bi {
  font-size: var(--text-md);
  line-height: 1;
}

.north-reset:hover,
.north-reset:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 78%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--neutral) 32%, transparent);
}

/* 焦点环由 global.css 统一提供，小尺寸按钮自动应用 --ring-offset-tight */

.north-reset.is-resetting {
  animation: reset-pulse var(--motion-duration-medium) var(--motion-ease-standard);
}

.north-reset.is-resetting > .bi {
  animation: reset-spin var(--motion-duration-medium) var(--motion-ease-emphasized);
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
  border: 1px solid color-mix(in srgb, var(--neutral) 24%, transparent);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1;
  background: color-mix(in srgb, var(--color-panel) 78%, transparent);
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
