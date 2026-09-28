<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue"
import RailPanel from "./RailPanel.vue"
import AppRadio from "../../components/base/AppRadio.vue"
import AppRadioGroup from "../../components/base/AppRadioGroup.vue"
import type { Drawing3DControls } from "./composables/useDrawing3DControls"
import type {
  MapDraw3DCoordinate,
  MapDraw3DFeature,
  MapDraw3DGeometry,
  MapDraw3DGeometryType,
} from "../../map"

const props = defineProps<{
  controls: Drawing3DControls
  placement: "left" | "left-third"
}>()

type Draw3DModeId = MapDraw3DGeometryType
type Draw3DParamKey =
  | "boxLength"
  | "boxWidth"
  | "boxHeight"
  | "cylLength"
  | "cylRadius"
  | "sphereRadius"
  | "wallHeight"

interface Draw3DParamConfig {
  key: Draw3DParamKey
  label: string
}

interface Draw3DModeConfig {
  id: Draw3DModeId
  label: string
  icon: string
  hint: string
  /** model3d 本期仅占位，联调后启用。 */
  disabled?: boolean
  params?: Draw3DParamConfig[]
}

const drawModes: Draw3DModeConfig[] = [
  {
    id: "label",
    label: "标注",
    icon: "bi-type",
    hint: "在地图单击放置文字标注",
  },
  {
    id: "billboard",
    label: "图标",
    icon: "bi-image",
    hint: "在地图单击放置图标标注",
  },
  {
    id: "box",
    label: "长方体",
    icon: "bi-box",
    hint: "设置尺寸 → 在地图单击放置",
    params: [
      { key: "boxLength", label: "长" },
      { key: "boxWidth", label: "宽" },
      { key: "boxHeight", label: "高" },
    ],
  },
  {
    id: "cylinder",
    label: "圆柱",
    icon: "bi-database",
    hint: "设置高度与半径 → 在地图单击放置",
    params: [
      { key: "cylLength", label: "高度" },
      { key: "cylRadius", label: "半径" },
    ],
  },
  {
    id: "sphere",
    label: "球体",
    icon: "bi-globe2",
    hint: "设置半径 → 在地图单击放置",
    params: [{ key: "sphereRadius", label: "半径" }],
  },
  {
    id: "wall",
    label: "墙体",
    icon: "bi-bricks",
    hint: "设置高度 → 左键添加节点（≥2），右键完成",
    params: [{ key: "wallHeight", label: "高度" }],
  },
  {
    id: "polylineVolume",
    label: "管线",
    icon: "bi-bezier2",
    hint: "左键添加节点（≥2），右键完成（默认矩形截面）",
  },
  {
    id: "waterSurface",
    label: "水面",
    icon: "bi-water",
    hint: "左键添加节点（≥3），右键完成",
  },
  {
    id: "videoSurface",
    label: "视频面",
    icon: "bi-play-btn",
    hint: "设置高度 → 左键添加节点（≥2），右键完成（暂用占位纹理）",
    params: [{ key: "wallHeight", label: "高度" }],
  },
  {
    id: "model3d",
    label: "模型",
    icon: "bi-boxes",
    hint: "三维模型绘制下期开放",
    disabled: true,
  },
]

const typeLabels: Record<MapDraw3DGeometryType, string> = {
  label: "标注",
  billboard: "图标",
  model3d: "模型",
  box: "长方体",
  cylinder: "圆柱",
  sphere: "球体",
  wall: "墙体",
  polylineVolume: "管线",
  waterSurface: "水面",
  videoSurface: "视频面",
}

const paramValues = reactive<Record<Draw3DParamKey, number>>({
  boxLength: 80,
  boxWidth: 80,
  boxHeight: 80,
  cylLength: 60,
  cylRadius: 15,
  sphereRadius: 30,
  wallHeight: 25,
})
const paramError = ref(false)

/** 清空全部前的二次确认：首次点击进入待确认态，3 秒后自动复原。 */
const clearArmed = ref(false)
let clearArmTimer: ReturnType<typeof setTimeout> | undefined

const activeMode = computed(() => drawModes.find((mode) => mode.id === props.controls.state.mode))
const featureCount = computed(() => props.controls.state.features.length)

/** 校验输入是否合法（正数 + 有限）。 */
function validatePositive(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1_000_000
}

/** 按模式归并当前参数，生成传给引擎的绘制选项。 */
function buildOptions(mode: Draw3DModeConfig): Record<string, unknown> {
  switch (mode.id) {
    case "box":
      return {
        dimensions: [paramValues.boxLength, paramValues.boxWidth, paramValues.boxHeight],
      }
    case "cylinder":
      return {
        length: paramValues.cylLength,
        topRadius: paramValues.cylRadius,
        bottomRadius: paramValues.cylRadius,
      }
    case "sphere":
      return { radiusMeters: paramValues.sphereRadius }
    case "wall":
    case "videoSurface":
      return { heightMeters: paramValues.wallHeight }
    default:
      return {}
  }
}

/** 校验当前模式的全部参数，非法时标记错误。 */
function validateModeParams(mode: Draw3DModeConfig) {
  if (!mode.params) return true

  const valid = mode.params.every((param) => validatePositive(paramValues[param.key]))
  paramError.value = !valid
  return valid
}

/** 开始三维绘制：带参数模式先校验并传入选项。 */
function handleStartDrawing(mode: Draw3DModeConfig) {
  if (mode.disabled) return
  if (mode.params && !validateModeParams(mode)) return

  props.controls.start(mode.id, buildOptions(mode) as never)
}

/** 输入框实时回写到引擎，避免下一笔绘制沿用旧值。 */
function syncParam(key: Draw3DParamKey) {
  if (!validatePositive(paramValues[key])) {
    paramError.value = true
    return
  }

  paramError.value = false
  const mode = activeMode.value
  if (mode && mode.params?.some((param) => param.key === key)) {
    props.controls.setOption(buildOptions(mode) as never)
  }
}

/** 二次确认后清空全部三维绘制成果。 */
function handleClearClick() {
  if (!clearArmed.value) {
    clearArmed.value = true
    clearArmTimer = setTimeout(() => {
      clearArmed.value = false
    }, 3000)
    return
  }

  if (clearArmTimer) clearTimeout(clearArmTimer)
  clearArmed.value = false
  props.controls.clear()
}

onBeforeUnmount(() => {
  if (clearArmTimer) clearTimeout(clearArmTimer)
})

/** 读取成果首个坐标，用于窄面板内的结果展示。 */
function getFeatureCoordinate(feature: MapDraw3DFeature) {
  const first = firstCoordinate(feature.geometry)

  if (!first) return "--"

  return `${first.longitude.toFixed(5)}°, ${first.latitude.toFixed(5)}°`
}

/** 按 geometry.form 提取首个坐标点。 */
function firstCoordinate(geometry: MapDraw3DGeometry): MapDraw3DCoordinate | undefined {
  if (geometry.form === "point") return geometry.coordinate
  return geometry.coordinates[0]
}
</script>

<template>
  <RailPanel
    id="drawing-3d-window"
    class="drawing3d-window window-compact"
    :placement="placement"
    title="3D 绘制"
    tag="3D DRAW"
    close-label="关闭 3D 绘制"
    @close="controls.closePanel()"
  >
    <div class="drawing-body">
      <!-- 禁用是逐项判定的（三维模式各自依赖不同的绘制数据），不设组级 disabled -->
      <AppRadioGroup
        class="draw-mode-group"
        aria-label="三维绘制类型"
        :model-value="controls.state.mode"
      >
        <AppRadio
          v-for="mode in drawModes"
          :key="mode.id"
          :value="mode.id"
          :disabled="mode.disabled"
        >
          <button
            class="draw-mode"
            :class="{
              'is-active': controls.state.mode === mode.id,
              'is-disabled': mode.disabled,
            }"
            type="button"
            :aria-disabled="mode.disabled"
            :disabled="mode.disabled"
            :title="mode.hint"
            @click="handleStartDrawing(mode)"
          >
            <i class="bi" :class="mode.icon" aria-hidden="true"></i>
            <span>{{ mode.label }}</span>
          </button>
        </AppRadio>
      </AppRadioGroup>

      <div
        v-if="activeMode?.params?.length"
        class="drawing-param"
        role="group"
        aria-label="三维绘制参数"
      >
        <div v-for="param in activeMode.params" :key="param.key" class="param-field">
          <label :for="`drawing3d-${param.key}-input`">{{ param.label }}</label>
          <div class="param-input-wrap">
            <input
              :id="`drawing3d-${param.key}-input`"
              v-model.number="paramValues[param.key]"
              type="number"
              min="1"
              max="1000000"
              step="5"
              :class="{ 'is-invalid': paramError }"
              :aria-invalid="paramError"
              :aria-describedby="paramError ? 'drawing3d-param-error' : undefined"
              @input="syncParam(param.key)"
            />
            <em>m</em>
          </div>
        </div>
        <p v-if="paramError" id="drawing3d-param-error" class="param-error">
          请输入大于 0 的数值（最大 1000000）
        </p>
      </div>

      <div class="drawing-status">
        <span class="status-dot" :class="{ 'is-active': activeMode !== undefined }"></span>
        <strong>{{ activeMode?.label ?? "未选择" }}</strong>
        <small>
          {{
            controls.state.selectedFeatureId
              ? "单击地图空白处取消选中"
              : (activeMode?.hint ?? "选择类型后开始绘制")
          }}<template v-if="activeMode && !controls.state.selectedFeatureId">
            · 按 <kbd>ESC</kbd> 取消</template
          >
        </small>
      </div>

      <div class="drawing-results-head">
        <span>绘制成果</span>
        <button
          v-if="featureCount > 0"
          class="clear-all"
          :class="{ 'is-armed': clearArmed }"
          type="button"
          :title="clearArmed ? '再次点击确认清空' : '清空全部三维绘制成果'"
          @click="handleClearClick"
        >
          {{ clearArmed ? "确认清空？" : "清空" }}
        </button>
      </div>

      <p v-if="featureCount === 0" class="drawing-empty">
        <i class="bi bi-vector-pen" aria-hidden="true"></i>
        <span>暂无三维绘制成果</span>
      </p>
      <ul v-else class="drawing-results" aria-label="三维绘制成果列表">
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
            title="删除三维绘制成果"
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

.drawing3d-window {
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

.clear-all {
  padding: 3px 8px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-size: var(--text-overline);
  background: color-mix(in srgb, var(--surface-1) 55%, transparent);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.clear-all:hover,
.clear-all:focus-visible {
  border-color: color-mix(in srgb, var(--danger-deep) 50%, transparent);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger-deep) 8%, transparent);
}

.clear-all.is-armed {
  border-color: color-mix(in srgb, var(--danger) 65%, transparent);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger-deep) 14%, transparent);
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

.drawing-results .result-remove {
  color: var(--danger);
}

.drawing-results .result-remove:hover,
.drawing-results .result-remove:focus-visible {
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
