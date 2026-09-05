<script setup lang="ts">
import { computed } from "vue"
import RailPanel from "./RailPanel.vue"
import type { MapControls } from "./mapControls"
import type { MapDrawFeature, MapDrawGeometryType } from "../../map"

const props = defineProps<{
  controls: MapControls
  placement: "left" | "left-third"
}>()

const drawModes: Array<{
  id: MapDrawGeometryType
  label: string
  icon: string
  hint: string
  minimumCoordinates: number
}> = [
  {
    id: "point",
    label: "点",
    icon: "bi-geo-fill",
    hint: "在地图单击完成点",
    minimumCoordinates: 1,
  },
  {
    id: "polyline",
    label: "折线",
    icon: "bi-activity",
    hint: "左键添加节点，右键完成",
    minimumCoordinates: 2,
  },
  {
    id: "polygon",
    label: "多边形",
    icon: "bi-pentagon",
    hint: "左键添加 3 个以上节点，右键完成",
    minimumCoordinates: 3,
  },
]

const typeLabels: Record<MapDrawGeometryType, string> = {
  point: "点",
  polyline: "折线",
  polygon: "多边形",
}

const activeMode = computed(() =>
  drawModes.find((mode) => mode.id === props.controls.drawingState.mode),
)
const featureCount = computed(() => props.controls.drawingState.features.length)

/** 读取成果首点坐标，用于窄面板内的结果扫描。 */
function getFeatureCoordinate(feature: MapDrawFeature) {
  const first = feature.coordinates[0]
  const firstText = first ? `${first.longitude.toFixed(5)}°, ${first.latitude.toFixed(5)}°` : "--"

  return firstText
}
</script>

<template>
  <RailPanel
    id="drawing-window"
    class="drawing-window"
    :placement="placement"
    title="绘制操作"
    tag="DRAW"
    close-label="关闭绘制操作"
    @close="controls.closeDrawingPanel()"
  >
    <div class="drawing-body">
      <div class="draw-mode-group" role="radiogroup" aria-label="绘制类型">
        <button
          v-for="mode in drawModes"
          :key="mode.id"
          class="draw-mode"
          :class="{ 'is-active': controls.drawingState.mode === mode.id }"
          type="button"
          role="radio"
          :aria-checked="controls.drawingState.mode === mode.id"
          :title="mode.hint"
          @click="controls.startDrawing(mode.id)"
        >
          <i class="bi" :class="mode.icon" aria-hidden="true"></i>
          <span>{{ mode.label }}</span>
        </button>
      </div>

      <div class="drawing-status">
        <span class="status-dot" :class="{ 'is-active': activeMode !== undefined }"></span>
        <strong>{{ activeMode?.label ?? "未选择" }}</strong>
        <small>{{ activeMode?.hint ?? "选择类型后开始绘制" }}</small>
      </div>

      <div class="drawing-results-head">
        <span>绘制成果</span>
      </div>

      <p v-if="featureCount === 0" class="drawing-empty">暂无绘制成果</p>
      <ul v-else class="drawing-results" aria-label="绘制成果列表">
        <li v-for="feature in controls.drawingState.features" :key="feature.id">
          <div class="result-info">
            <input
              :value="feature.name"
              type="text"
              spellcheck="false"
              :aria-label="`重命名 ${feature.name}`"
              @change="controls.renameDrawing($event, feature.id)"
            />
            <div class="result-meta">
              <span>{{ typeLabels[feature.type] }}</span>
              <small>{{ getFeatureCoordinate(feature) }}</small>
            </div>
          </div>
          <button
            class="result-remove"
            type="button"
            title="删除绘制成果"
            :aria-label="`删除 ${feature.name}`"
            @click="controls.removeDrawing(feature.id)"
          >
            <i class="bi bi-trash3" aria-hidden="true"></i>
          </button>
        </li>
      </ul>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.drawing-window {
  --window-padding: 10px;
  --window-head-padding: 8px;
  --window-title-size: 13px;
  --window-tag-size: 9px;
  --window-close-size: 20px;
  --rail-panel-width: min(286px, calc(100vw - 160px));
  min-width: 0;
}

.drawing-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.draw-mode-group,
.drawing-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.draw-mode,
.drawing-actions button,
.drawing-results button {
  display: grid;
  place-items: center;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.55);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.draw-mode {
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 8px 4px;
  font-size: 12px;
}

.draw-mode i,
.drawing-actions i,
.drawing-results i {
  font-size: 14px;
  line-height: 1;
}

.draw-mode:hover,
.draw-mode:focus-visible,
.drawing-actions button:hover:not(:disabled),
.drawing-actions button:focus-visible:not(:disabled),
.drawing-results button:hover,
.drawing-results button:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
  background: rgba(31, 62, 104, 0.5);
}

.draw-mode:focus-visible,
.drawing-actions button:focus-visible,
.drawing-results button:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 1px;
}

.draw-mode.is-active {
  border-color: rgba(72, 229, 255, 0.55);
  color: var(--cyan);
  background: rgba(72, 229, 255, 0.08);
}

.drawing-status {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 3px 8px;
  align-items: center;
  padding: 8px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.42);
}

.status-dot {
  grid-row: 1;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-dot.is-active {
  background: var(--cyan);
  box-shadow: 0 0 7px rgba(72, 229, 255, 0.68);
}

.drawing-status strong {
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.2;
}

.drawing-status small {
  grid-column: 2;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.drawing-count {
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}

.drawing-actions button,
.drawing-results button {
  width: 100%;
  height: 30px;
}

.drawing-actions button:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: rgba(7, 20, 42, 0.3);
  cursor: not-allowed;
}

.drawing-actions button.is-danger,
.drawing-results button {
  color: var(--rose);
}

.drawing-actions button.is-danger:hover:not(:disabled),
.drawing-actions button.is-danger:focus-visible:not(:disabled),
.drawing-results button:hover,
.drawing-results button:focus-visible {
  border-color: rgba(247, 108, 137, 0.5);
  background: rgba(247, 108, 137, 0.1);
}

.drawing-results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.drawing-results-head strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
}

.drawing-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.drawing-results {
  display: grid;
  gap: 6px;
  max-height: 180px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.drawing-results li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: center;
  padding: 7px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.42);
}

.result-info {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 5px;
  align-items: center;
}

.result-meta {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.result-meta span {
  color: var(--text-primary);
  font-size: 9px;
  font-weight: 650;
}

.result-meta small {
  flex: 1;
  overflow: hidden;
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 8px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawing-results input {
  flex: 0 0 42%;
  width: 100%;
  min-width: 0;
  padding: 5px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 11px;
  background: rgba(4, 12, 26, 0.58);
  outline: none;
}

.drawing-results input:focus {
  border-color: rgba(72, 229, 255, 0.55);
  color: var(--text-primary);
}
</style>
