<script setup lang="ts">
import { computed, ref, watch } from "vue"
import RailPanel from "./RailPanel.vue"
import AppRadio from "../../components/base/AppRadio.vue"
import AppRadioGroup from "../../components/base/AppRadioGroup.vue"
import type { Drawing2DControls } from "./composables/useDrawingControls"
import type {
  MapDrawCoordinate,
  MapDrawFeature,
  MapDrawGeometry,
  MapDrawGeometryType,
} from "../../map"

const props = defineProps<{
  controls: Drawing2DControls
  placement: "left" | "left-third"
}>()

type DrawModeId = MapDrawGeometryType
type DrawModeParam = "width" | "distance"

interface DrawModeConfig {
  id: DrawModeId
  label: string
  icon: string
  hint: string
  minimumCoordinates: number
  needsParam?: DrawModeParam
}

const drawModes: DrawModeConfig[] = [
  {
    id: "point",
    label: "点",
    icon: "bi-geo-alt-fill",
    hint: "在地图单击完成点",
    minimumCoordinates: 1,
  },
  {
    id: "polyline",
    label: "折线",
    icon: "bi-activity",
    hint: "左键添加节点（≥2），右键完成",
    minimumCoordinates: 2,
  },
  {
    id: "polygon",
    label: "多边形",
    icon: "bi-pentagon",
    hint: "左键添加节点（≥3），右键完成",
    minimumCoordinates: 3,
  },
  {
    id: "rectangle",
    label: "矩形",
    icon: "bi-square",
    hint: "左键按住起点，拖拽出矩形，松开落定",
    minimumCoordinates: 0,
  },
  {
    id: "circle",
    label: "圆",
    icon: "bi-circle",
    hint: "左键按住圆心，拖拽出半径，松开落定",
    minimumCoordinates: 0,
  },
  {
    id: "ellipse",
    label: "椭圆",
    icon: "bi-egg",
    hint: "左键按住中心（长半轴起点），拖到鼠标位置（长半轴终点）",
    minimumCoordinates: 0,
  },
  {
    id: "corridor",
    label: "走廊带",
    icon: "bi-arrows-expand",
    hint: "设置宽度 → 左键添加节点（≥2），右键完成",
    minimumCoordinates: 2,
    needsParam: "width",
  },
]

const typeLabels: Record<MapDrawGeometryType, string> = {
  point: "点",
  polyline: "折线",
  polygon: "多边形",
  rectangle: "矩形",
  circle: "圆",
  ellipse: "椭圆",
  corridor: "走廊",
  buffer: "缓冲区",
}

const DEFAULT_WIDTH_METERS = 100
const DEFAULT_DISTANCE_METERS = 50

const widthInput = ref<number>(DEFAULT_WIDTH_METERS)
const distanceInput = ref<number>(DEFAULT_DISTANCE_METERS)
const widthError = ref(false)
const distanceError = ref(false)

const activeMode = computed(() => drawModes.find((mode) => mode.id === props.controls.state.mode))
const featureCount = computed(() => props.controls.state.features.length)
const paramMode = computed(() => activeMode.value?.needsParam)
const showParamPanel = computed(() => paramMode.value !== undefined)
const selectedFeature = computed(() => {
  const id = props.controls.state.selectedFeatureId
  if (!id) return undefined
  return props.controls.state.features.find((feature) => feature.id === id)
})
const bufferable = computed(() => {
  if (!selectedFeature.value) return false
  const type = selectedFeature.value.type
  return type !== "corridor" && type !== "buffer"
})
const bufferHint = computed(() => {
  if (!selectedFeature.value) return "在下方成果列表中选中要素后再建立缓冲区"
  if (!bufferable.value) return "走廊带与缓冲区本身不支持再次建立缓冲区"
  return ""
})
const canApplyBuffer = computed(() => bufferable.value && !distanceError.value)

/** 校验输入是否合法（正数 + 有限）。 */
function validatePositive(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1_000_000
}

/** 提交绘制：参数模式时把当前 width / distance 一并传入引擎。 */
function handleStartDrawing(mode: DrawModeConfig) {
  if (mode.needsParam === "width") {
    if (!validatePositive(widthInput.value)) {
      widthError.value = true
      return
    }
    widthError.value = false
    props.controls.start(mode.id, { widthMeters: widthInput.value })
    return
  }

  if (mode.needsParam === "distance") {
    if (!validatePositive(distanceInput.value)) {
      distanceError.value = true
      return
    }
    distanceError.value = false
    props.controls.start(mode.id, { distanceMeters: distanceInput.value })
    return
  }

  props.controls.start(mode.id)
}

/** 输入框实时回写到引擎，避免下一笔绘制沿用旧值。 */
function syncWidth() {
  if (validatePositive(widthInput.value)) {
    widthError.value = false
    props.controls.setOption({ widthMeters: widthInput.value })
  } else {
    widthError.value = true
  }
}

function syncDistance() {
  if (validatePositive(distanceInput.value)) {
    distanceError.value = false
  } else {
    distanceError.value = true
  }
}

/** 切换 mode 时若之前已经同步过引擎，保持现有输入值。 */
watch(activeMode, (mode) => {
  if (!mode) return
  if (mode.needsParam === "width" && !widthError.value) {
    props.controls.setOption({ widthMeters: widthInput.value })
  }
})

/** 读取成果首点坐标，用于窄面板内的结果扫描。 */
function getFeatureCoordinate(feature: MapDrawFeature) {
  const first = firstCoordinate(feature.geometry)

  if (!first) return "--"

  return `${first.longitude.toFixed(5)}°, ${first.latitude.toFixed(5)}°`
}

/** 按 geometry.type 提取首个坐标点；不同几何体的字段位置不同。 */
function firstCoordinate(geometry: MapDrawGeometry): MapDrawCoordinate | undefined {
  switch (geometry.type) {
    case "point":
      return geometry.coordinate
    case "polyline":
    case "polygon":
      return geometry.coordinates[0]
    case "rectangle":
      return geometry.southwest
    case "circle":
    case "ellipse":
      return geometry.center
    case "corridor":
      return geometry.path[0]
    case "buffer":
      return geometry.polygon[0]
  }
}

/** 对当前选中要素建立缓冲区；按钮 disabled 由模板控制。 */
function applyBuffer() {
  if (!canApplyBuffer.value) return
  props.controls.applyBuffer(distanceInput.value)
}
</script>

<template>
  <RailPanel
    id="drawing-window"
    class="drawing-window window-compact"
    :placement="placement"
    title="绘制操作"
    tag="DRAW"
    close-label="关闭绘制操作"
    @close="controls.closePanel()"
  >
    <div class="drawing-body">
      <!-- 编辑进行中整组禁用：Reka 会把组内每一项同步为不可选、不可聚焦 -->
      <AppRadioGroup
        class="draw-mode-group"
        aria-label="绘制类型"
        :model-value="controls.state.mode"
        :disabled="controls.state.editingActive"
      >
        <AppRadio v-for="mode in drawModes" :key="mode.id" :value="mode.id">
          <button
            class="draw-mode"
            :class="{
              'is-active': controls.state.mode === mode.id,
              'is-disabled': controls.state.editingActive,
            }"
            type="button"
            :aria-disabled="controls.state.editingActive"
            :disabled="controls.state.editingActive"
            :title="controls.state.editingActive ? '请先完成或取消当前编辑' : mode.hint"
            @click="handleStartDrawing(mode)"
          >
            <i class="bi" :class="mode.icon" aria-hidden="true"></i>
            <span>{{ mode.label }}</span>
          </button>
        </AppRadio>
      </AppRadioGroup>

      <div v-if="showParamPanel" class="drawing-param" role="group" aria-label="走廊带宽度">
        <div class="param-field">
          <label for="drawing-width-input">宽度</label>
          <div class="param-input-wrap">
            <input
              id="drawing-width-input"
              v-model.number="widthInput"
              type="number"
              min="1"
              max="1000000"
              step="10"
              :class="{ 'is-invalid': widthError }"
              :aria-invalid="widthError"
              :aria-describedby="widthError ? 'drawing-width-error' : undefined"
              @input="syncWidth"
            />
            <em>m</em>
          </div>
        </div>
        <p v-if="widthError" id="drawing-width-error" class="param-error">
          请输入大于 0 的数值（最大 1000000）
        </p>
      </div>

      <div class="drawing-buffer" role="group" aria-label="缓冲区工具">
        <div class="buffer-head">
          <i class="bi bi-bullseye" aria-hidden="true"></i>
          <span>缓冲区</span>
        </div>

        <div class="buffer-source" :class="{ 'is-empty': !selectedFeature }">
          <small>{{ selectedFeature ? "源要素" : "状态" }}</small>
          <strong>{{ selectedFeature ? selectedFeature.name : "未选中要素" }}</strong>
          <em v-if="selectedFeature">{{ typeLabels[selectedFeature.type] }}</em>
        </div>

        <div class="param-field">
          <label for="drawing-distance-input">距离</label>
          <div class="param-input-wrap">
            <input
              id="drawing-distance-input"
              v-model.number="distanceInput"
              type="number"
              min="1"
              max="1000000"
              step="10"
              :class="{ 'is-invalid': distanceError }"
              :aria-invalid="distanceError"
              :aria-describedby="distanceError ? 'drawing-distance-error' : undefined"
              @input="syncDistance"
            />
            <em>m</em>
          </div>
        </div>
        <p v-if="distanceError" id="drawing-distance-error" class="param-error">
          请输入大于 0 的数值（最大 1000000）
        </p>

        <button
          class="buffer-apply"
          type="button"
          :disabled="!canApplyBuffer"
          :title="canApplyBuffer ? '为选中要素建立缓冲区' : bufferHint"
          @click="applyBuffer"
        >
          <i class="bi bi-arrow-return-right" aria-hidden="true"></i>
          <span>建立缓冲区</span>
        </button>
        <p v-if="bufferHint" class="buffer-hint">{{ bufferHint }}</p>
      </div>

      <div class="drawing-status">
        <span class="status-dot" :class="{ 'is-active': activeMode !== undefined }"></span>
        <strong>{{ activeMode?.label ?? "未选择" }}</strong>
        <small>
          {{
            controls.state.selectedFeatureId
              ? "拖动控制点编辑 · 按 ESC 取消选中"
              : (activeMode?.hint ?? "选择类型后开始绘制")
          }}<template v-if="activeMode && !controls.state.selectedFeatureId">
            · 按 <kbd>ESC</kbd> 取消</template
          >
        </small>
      </div>

      <div class="drawing-results-head">
        <span>绘制成果</span>
      </div>

      <p v-if="featureCount === 0" class="drawing-empty">
        <i class="bi bi-vector-pen" aria-hidden="true"></i>
        <span>暂无绘制成果</span>
      </p>
      <ul v-else class="drawing-results" aria-label="绘制成果列表">
        <li
          v-for="feature in controls.state.features"
          :key="feature.id"
          :class="{
            'is-selected': feature.id === controls.state.selectedFeatureId,
          }"
          :aria-current="feature.id === controls.state.selectedFeatureId"
          @click="controls.selectFeature(feature.id)"
        >
          <div class="result-info">
            <input
              :value="feature.name"
              type="text"
              spellcheck="false"
              :aria-label="`重命名 ${feature.name}`"
              @click.stop
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              @keydown.escape.prevent="($event.target as HTMLInputElement).blur()"
              @change="controls.rename($event, feature.id)"
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
            @click.stop="controls.remove(feature.id)"
          >
            <i class="bi bi-trash3" aria-hidden="true"></i>
          </button>
        </li>
      </ul>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
@use "../../styles/fields" as fields;

.drawing-window {
  --rail-panel-width: min(326px, calc(100vw - 160px));
  min-width: 0;
}

.drawing-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.draw-mode-group {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.draw-mode,
.drawing-results button {
  display: grid;
  place-items: center;
  min-width: var(--control-md);
  min-height: var(--control-md);
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-1) 55%, transparent);
  cursor: pointer;
  transition:
    border-color var(--motion-duration-base) var(--motion-ease-standard),
    color var(--motion-duration-base) var(--motion-ease-standard),
    background var(--motion-duration-base) var(--motion-ease-standard);
}

.draw-mode {
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 8px 4px;
  font-size: var(--text-xs);
}

.draw-mode i,
.drawing-results i {
  font-size: var(--text-md);
  line-height: 1;
}

.draw-mode:hover,
.draw-mode:focus-visible,
.drawing-results button:hover,
.drawing-results button:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--neutral) 30%, transparent);
}

.draw-mode.is-active {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.draw-mode.is-disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.draw-mode.is-disabled:hover,
.draw-mode.is-disabled:focus-visible {
  border-color: var(--panel-inner-line);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--color-panel) 55%, transparent);
}

.drawing-param {
  display: grid;
  gap: 4px;
  padding: 8px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel) 42%, transparent);
}

.drawing-buffer {
  display: grid;
  gap: 6px;
  padding: 8px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel) 42%, transparent);
}

.buffer-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
}

.buffer-head i {
  font-size: var(--text-body);
  color: var(--accent);
}

.buffer-source {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 4px 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--surface-3) 58%, transparent);
}

.buffer-source small {
  color: var(--text-muted);
  font-size: var(--text-overline);
  letter-spacing: 0.04em;
}

.buffer-source strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buffer-source em {
  color: var(--accent);
  font-size: var(--text-overline);
  font-style: normal;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
}

.buffer-source.is-empty strong {
  color: var(--text-muted);
  font-style: italic;
}

.buffer-apply {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: var(--control-md);
  padding: 0 var(--space-5);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: var(--radius-xs);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.buffer-apply:hover:not(:disabled),
.buffer-apply:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 70%, transparent);
  color: var(--accent-pale);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.buffer-apply:focus-visible:not(:disabled) {
  outline-offset: 1px;
}

.buffer-apply:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 55%, transparent);
  cursor: not-allowed;
}

.buffer-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
}

.param-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.param-field label {
  flex: 0 0 auto;
  cursor: pointer;
}

.param-input-wrap {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

/* 数值档（等宽、横向内边距 6px），宽度交给 flex 撑满，所以不给 width: 100%。
   `.is-invalid` 必须留在 @include 之后：它与 mixin 展开出的 `input:focus` 权重相同，
   校验失败时能不能压过强调色描边，全靠这条源序。 */
.param-input-wrap input {
  @include fields.glass-control($numeric: true, $width: false);
  flex: 1;
}

.param-input-wrap input.is-invalid {
  border-color: color-mix(in srgb, var(--danger-deep) 60%, transparent);
  background: color-mix(in srgb, var(--danger-deep) 6%, transparent);
}

.param-input-wrap em {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-style: normal;
  font-size: var(--text-xs);
}

.param-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-2xs);
  line-height: var(--leading-snug);
}

.drawing-status {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 3px 8px;
  align-items: center;
  padding: 8px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel) 42%, transparent);
}

.status-dot {
  grid-row: 1;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-dot.is-active {
  background: var(--accent);
  box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 68%, transparent);
}

.drawing-status strong {
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-tight);
}

.drawing-status small {
  grid-column: 2;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
}

.drawing-status small kbd {
  display: inline-block;
  padding: 0 4px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  background: color-mix(in srgb, var(--surface-3) 58%, transparent);
}

.drawing-results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.drawing-results-head strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.drawing-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 14px 8px;
  border: 1px dashed var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 30%, transparent);
  font-size: var(--text-sm);
  text-align: center;
}

.drawing-empty i {
  font-size: var(--text-xl);
  line-height: 1;
  opacity: 0.7;
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
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel) 42%, transparent);
  cursor: pointer;
}

.drawing-results li.is-selected {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  box-shadow: inset 3px 0 0 var(--accent);
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
  font-size: var(--text-overline);
  font-weight: var(--weight-semibold);
}

.result-meta small {
  flex: 1;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-overline);
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawing-results button {
  width: 100%;
  height: var(--control-md);
}

.drawing-results button {
  color: var(--danger);
}

.drawing-results button:hover,
.drawing-results button:focus-visible {
  border-color: color-mix(in srgb, var(--danger-deep) 50%, transparent);
  background: color-mix(in srgb, var(--danger-deep) 10%, transparent);
}

/* 成果列表里的重命名框属于行内档：不给固定高度，免得撑高一行、少显示一条成果。 */
.drawing-results {
  @include fields.inline-controls;
}

.drawing-results input {
  flex: 0 0 42%;
  cursor: text;
}

@media (max-width: 285px) {
  .draw-mode-group {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
