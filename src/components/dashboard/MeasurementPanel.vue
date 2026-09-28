<script setup lang="ts">
import { computed } from "vue"
import RailPanel from "./RailPanel.vue"
import AppRadio from "../../components/base/AppRadio.vue"
import AppRadioGroup from "../../components/base/AppRadioGroup.vue"
import type { MeasurementState } from "../../map"
import { measurementOperations } from "./mapControls"
import type { MeasurementControls } from "./composables/useMeasurementControls"

const props = defineProps<{
  controls: MeasurementControls
  placement: "right" | "right-third"
}>()

const state = computed(() => props.controls.state)
const resultText = computed(() => formatResult(state.value))
const statusText = computed(() => {
  if (state.value.error) return state.value.error
  if (state.value.mode === "length" || state.value.mode === "area") {
    if (state.value.completed) return "已完成，左键开始新测量"
    const requiredPoints = state.value.mode === "area" ? 3 : 2
    if (state.value.points.length < requiredPoints) {
      return `已选择 ${state.value.points.length}/${requiredPoints} 个点，右键完成`
    }

    return "左键添加点，右键完成"
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

/** 格式化当前模式的测量结果。 */
function formatResult(measurementState: MeasurementState) {
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
    @close="controls.closePanel()"
  >
    <div class="measurement-body">
      <!-- 选中态由 state.mode 单向决定：Reka 只回传选中意图，是否真正生效仍看 activate 的结果 -->
      <AppRadioGroup class="mode-grid" aria-label="测量模式" :model-value="state.mode">
        <AppRadio
          v-for="operation in measurementOperations"
          :key="operation.id"
          :value="operation.id"
        >
          <button
            class="mode-option"
            :class="{ 'is-active': state.mode === operation.id }"
            type="button"
            @click="controls.activate(operation.id)"
          >
            <i class="bi" :class="operation.icon" aria-hidden="true"></i>
            <span>{{ operation.label }}</span>
          </button>
        </AppRadio>
      </AppRadioGroup>

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
          @click="controls.undoPoint()"
        >
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
          撤销
        </button>
        <button
          class="action-button"
          type="button"
          :disabled="state.points.length === 0"
          title="当前没有可清空的测量点"
          @click="controls.clear()"
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
  min-height: var(--control-md);
  padding: var(--space-2) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--neutral) 26%, transparent);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--neutral-soft) 70%, transparent);
  text-align: left;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.mode-option > .bi {
  font-size: var(--text-lg);
  line-height: 1;
}

.mode-option > span {
  overflow: hidden;
  padding-left: 7px;
  font-size: var(--text-sm);
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-option:hover,
.mode-option:focus-visible,
.mode-option.is-active {
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--neutral-deep) 86%, transparent);
}

.result-block {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--neutral) 24%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel) 56%, transparent);
}

.result-block > span,
.result-block > small {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
}

.result-block > strong {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  line-height: 1;
}

.result-block > small.is-error {
  color: var(--danger);
}

.point-list {
  max-height: 148px;
  overflow-y: auto;
}

.point-list > dl {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--neutral) 14%, transparent);
}

.point-list > dl:last-child {
  border-bottom: 0;
}

.point-list dt {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: var(--radius-xs);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.point-list dt em {
  margin-left: 4px;
  color: var(--warning);
  font-size: var(--text-2xs);
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
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-points {
  padding: 12px 0;
  border: 1px dashed color-mix(in srgb, var(--neutral) 24%, transparent);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-sm);
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
  min-height: var(--control-md);
  padding: 0 var(--space-4);
  border: 1px solid color-mix(in srgb, var(--neutral) 32%, transparent);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--neutral-soft) 80%, transparent);
  font-size: var(--text-sm);
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.action-button:hover,
.action-button:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--neutral-deep) 86%, transparent);
}

.action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.action-button:disabled:hover,
.action-button:disabled:focus-visible {
  border-color: color-mix(in srgb, var(--neutral) 32%, transparent);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--neutral-soft) 44%, transparent);
}
</style>
