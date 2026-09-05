<script setup lang="ts">
import { computed } from "vue"
import RailPanel from "./RailPanel.vue"
import { measurementOperations, type MapControls } from "./mapControls"

const props = defineProps<{
  controls: MapControls
  placement: "right" | "right-third"
}>()

const state = computed(() => props.controls.measurementState)
const resultText = computed(() => formatResult(state.value))
const statusText = computed(() => {
  if (state.value.error) return state.value.error
  if (state.value.mode === "area" && state.value.points.length < 3) {
    return `已选择 ${state.value.points.length}/3 个点`
  }

  return state.value.resultValue === undefined ? "等待测量点" : "测量中"
})

const displayPoints = computed(() => {
  const points = state.value.points.map((point) => ({ point, preview: false }))
  if (state.value.previewPoint && (state.value.mode === "length" || state.value.mode === "area")) {
    points.push({ point: state.value.previewPoint, preview: true })
  }

  return points
})

/** 计算单选按钮的焦点顺序，保证 radiogroup 支持键盘轮选。 */
function getModeTabIndex(index: number) {
  if (state.value.mode) return state.value.mode === measurementOperations[index].id ? 0 : -1
  return index === 0 ? 0 : -1
}

/** 处理测量模式单选组的方向键切换。 */
function handleModeKeydown(event: KeyboardEvent, index: number) {
  const offset = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1
  const nextIndex = (index + offset + measurementOperations.length) % measurementOperations.length
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
  const nextTarget = target?.parentElement?.children[nextIndex]

  if (!(nextTarget instanceof HTMLElement)) return

  event.preventDefault()
  nextTarget.click()
  nextTarget.focus()
}

/** 格式化当前模式的测量结果。 */
function formatResult(measurementState: MapControls["measurementState"]) {
  const value = measurementState.resultValue
  if (value === undefined) return "--"

  if (measurementState.mode === "area") {
    return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(3)} km²` : `${value.toFixed(1)} m²`
  }

  return value >= 1000 ? `${(value / 1000).toFixed(3)} km` : `${value.toFixed(1)} m`
}

/** 格式化测量点经纬度。 */
function formatCoordinate(value: number) {
  return `${value.toFixed(5)}°`
}

/** 格式化测量点高度。 */
function formatHeight(value: number) {
  return `${value.toFixed(1)} m`
}

/** 转换测量点来源显示文案。 */
function getSourceLabel(source: "scene" | "terrain") {
  return source === "scene" ? "场景表面" : "地形表面"
}
</script>

<template>
  <RailPanel
    id="right-measure-panel"
    class="measurement-window"
    :placement="placement"
    title="测量操作"
    tag="MEASURE"
    close-label="关闭测量操作"
    @close="controls.closeMeasurementPanel()"
  >
    <div class="measurement-body">
      <div class="mode-grid" role="radiogroup" aria-label="测量模式">
        <button
          v-for="(operation, index) in measurementOperations"
          :key="operation.id"
          class="mode-option"
          :class="{ 'is-active': state.mode === operation.id }"
          type="button"
          role="radio"
          :aria-checked="state.mode === operation.id"
          :tabindex="getModeTabIndex(index)"
          @click="controls.activateMeasurementOperation(operation.id)"
          @keydown.down.prevent="handleModeKeydown($event, index)"
          @keydown.up.prevent="handleModeKeydown($event, index)"
          @keydown.right.prevent="handleModeKeydown($event, index)"
          @keydown.left.prevent="handleModeKeydown($event, index)"
        >
          <i class="bi" :class="operation.icon" aria-hidden="true"></i>
          <span>{{ operation.label }}</span>
        </button>
      </div>

      <div class="result-block">
        <span>测量结果</span>
        <strong>{{ resultText }}</strong>
        <small :class="{ 'is-error': Boolean(state.error) }">{{ statusText }}</small>
      </div>

      <div class="point-list" aria-label="测量点列表">
        <div v-if="displayPoints.length === 0" class="empty-points">暂无测量点</div>
        <dl v-for="(item, index) in displayPoints" :key="`${index}-${item.point.longitude}`">
          <dt>
            <span>{{ index + 1 }}</span>
            <em v-if="item.preview">预览</em>
          </dt>
          <dd>
            <span
              >{{ formatCoordinate(item.point.longitude) }} ·
              {{ formatCoordinate(item.point.latitude) }}</span
            >
            <span
              >{{ formatHeight(item.point.height) }} · {{ getSourceLabel(item.point.source) }}</span
            >
          </dd>
        </dl>
      </div>

      <div class="action-row">
        <button
          class="action-button"
          type="button"
          :disabled="state.points.length === 0"
          title="当前没有可撤销的测量点"
          @click="controls.undoMeasurementPoint()"
        >
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
          撤销
        </button>
        <button
          class="action-button"
          type="button"
          :disabled="state.points.length === 0"
          title="当前没有可清空的测量点"
          @click="controls.clearMeasurement()"
        >
          <i class="bi bi-trash3" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.measurement-window {
  --window-padding: 12px;
  --window-head-padding: 9px;
  --window-title-size: 14px;
  --window-tag-size: 9px;
  --window-close-size: 21px;
  --rail-panel-width: min(268px, calc(100vw - 150px));
  min-width: 0;
}

.measurement-body {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.mode-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid rgba(79, 151, 255, 0.26);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.38);
  text-align: left;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.mode-option > .bi {
  font-size: 15px;
  line-height: 1;
}

.mode-option > span {
  overflow: hidden;
  padding-left: 7px;
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-option:hover,
.mode-option:focus-visible,
.mode-option.is-active {
  border-color: rgba(72, 229, 255, 0.72);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.86);
}

.mode-option:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.result-block {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid rgba(79, 151, 255, 0.24);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.56);
}

.result-block > span,
.result-block > small {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.2;
}

.result-block > strong {
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 19px;
  font-weight: 650;
  line-height: 1;
}

.result-block > small.is-error {
  color: var(--rose);
}

.point-list {
  max-height: 148px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
}

.point-list::-webkit-scrollbar {
  width: 4px;
}

.point-list::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(72, 229, 255, 0.45);
}

.point-list > dl {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(79, 151, 255, 0.14);
}

.point-list > dl:last-child {
  border-bottom: 0;
}

.point-list dt {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  border: 1px solid rgba(72, 229, 255, 0.3);
  border-radius: 3px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
}

.point-list dt em {
  margin-left: 4px;
  color: var(--amber);
  font-size: 10px;
  font-style: normal;
}

.point-list dd {
  display: grid;
  min-width: 0;
  gap: 2px;
  margin: 0;
}

.point-list dd > span {
  overflow: hidden;
  color: var(--text-secondary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-points {
  padding: 12px 0;
  border: 1px dashed rgba(79, 151, 255, 0.24);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 8px;
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

.action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.action-button:disabled:hover,
.action-button:disabled:focus-visible {
  border-color: rgba(79, 151, 255, 0.32);
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.44);
}
</style>
