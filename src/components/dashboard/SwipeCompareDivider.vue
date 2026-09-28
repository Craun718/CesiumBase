<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue"
import {
  calculateSwipePositionFromClientX,
  createSwipePositionScheduler,
  hasSwipeDividerDragButton,
  isSwipeDividerDragTermination,
  stepSwipePosition,
} from "./composables/compareVisibility.js"

const props = withDefaults(
  defineProps<{
    position: number
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

const emit = defineEmits<{
  "update:modelValue": [position: number]
}>()

const track = ref<HTMLDivElement>()
let dragging = false
const positionScheduler = createSwipePositionScheduler(
  updatePosition,
  (callback) => window.requestAnimationFrame(callback),
  (frameId) => window.cancelAnimationFrame(frameId),
)

/** 更新卷帘分割位置。 */
function updatePosition(position: number) {
  emit("update:modelValue", Math.min(1, Math.max(0, position)))
}

/** 处理分割线拖拽移动。 */
function handlePointerMove(event: PointerEvent) {
  if (!dragging || !track.value) return
  if (!hasSwipeDividerDragButton(event)) {
    stopDrag()
    return
  }

  const rect = track.value.getBoundingClientRect()
  positionScheduler.schedule(
    calculateSwipePositionFromClientX(event.clientX, rect.left, rect.width),
  )
}

/** 开始拖拽分割线。 */
function handlePointerDown(event: PointerEvent) {
  dragging = true
  const target = event.currentTarget

  if (target instanceof HTMLElement) {
    target.setPointerCapture(event.pointerId)
  }
}

/** 结束拖拽分割线。 */
function stopDrag() {
  dragging = false
}

/** 响应指针抬升、取消和捕获丢失，避免拖拽状态残留。 */
function handlePointerEnd(event: Event) {
  if (isSwipeDividerDragTermination(event.type)) stopDrag()
}

/** 键盘微调分割位置。 */
function handleKeyDown(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.05 : 0.01

  if (event.key === "ArrowLeft") {
    event.preventDefault()
    updatePosition(stepSwipePosition(props.position, -step))
  } else if (event.key === "ArrowRight") {
    event.preventDefault()
    updatePosition(stepSwipePosition(props.position, step))
  }
}

/** 双击分割线回到居中位置。 */
function handleDoubleClick() {
  updatePosition(0.5)
}

if (typeof window !== "undefined") {
  window.addEventListener("pointermove", handlePointerMove)
  window.addEventListener("pointerup", handlePointerEnd)
  window.addEventListener("pointercancel", handlePointerEnd)
  window.addEventListener("lostpointercapture", handlePointerEnd)
}

onBeforeUnmount(() => {
  positionScheduler.cancel()
  if (typeof window === "undefined") return
  window.removeEventListener("pointermove", handlePointerMove)
  window.removeEventListener("pointerup", handlePointerEnd)
  window.removeEventListener("pointercancel", handlePointerEnd)
  window.removeEventListener("lostpointercapture", handlePointerEnd)
})
</script>

<template>
  <div v-if="visible" ref="track" class="swipe-divider-track" @dblclick.stop @pointerdown.prevent>
    <div class="swipe-divider-line" :style="{ left: `${position * 100}%` }">
      <button
        class="swipe-divider-handle"
        type="button"
        title="拖拽卷帘分割线；左右方向键微调，双击回中"
        aria-label="卷帘分割线"
        @pointerdown.stop.prevent="handlePointerDown"
        @pointercancel="handlePointerEnd"
        @lostpointercapture="handlePointerEnd"
        @keydown="handleKeyDown"
        @dblclick.stop="handleDoubleClick"
      >
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.swipe-divider-track {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.swipe-divider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  color: var(--accent);
  pointer-events: none;

  &::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1px;
    width: 2px;
    content: "";
    background: color-mix(in srgb, var(--accent) 86%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 36%, transparent);
  }
}

.swipe-divider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  place-items: center;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid color-mix(in srgb, var(--accent) 78%, transparent);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 13px;
  cursor: ew-resize;
  background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
  box-shadow: var(--panel-shadow);
  margin: -19px 0 0 -19px;
  pointer-events: auto;
  touch-action: none;

  i {
    width: 9px;
    font-size: 12px;
    text-align: center;
  }
}

.swipe-divider-handle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
