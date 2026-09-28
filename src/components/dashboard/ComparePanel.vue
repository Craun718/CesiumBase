<script setup lang="ts">
import type { CompareControls } from "./composables/useCompareControls"

const props = defineProps<{
  controls: CompareControls
}>()

const emit = defineEmits<{
  screenshot: []
}>()

/** 处理分割位置滑杆输入。 */
function handlePositionInput(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const position = Number(input.value)
  if (Number.isFinite(position)) props.controls.setSwipeSplitPosition(position)
}

/** 处理分屏方案选择。 */
function handleSplitSchemeChange(side: "left" | "right", event: Event) {
  const select = event.target
  if (!(select instanceof HTMLSelectElement)) return
  void props.controls.selectSplitScheme(side, select.value)
}

/** 处理分屏图层显隐切换。 */
function handleSplitLayerVisible(side: "left" | "right", layerId: string, event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  void props.controls.setSplitLayerVisible(side, layerId, input.checked)
}
</script>

<template>
  <div
    v-if="controls.mode === 'swipe'"
    class="compare-panel"
    role="region"
    aria-label="卷帘比对控制"
  >
    <div class="compare-field">
      <label for="swipe-left-layer">左侧影像</label>
      <select
        id="swipe-left-layer"
        :value="controls.swipe.leftLayerId"
        @change="controls.selectSwipeLayer('left', ($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>请选择</option>
        <option v-for="layer in controls.imageryLayers" :key="layer.id" :value="layer.id">
          {{ layer.name }}
        </option>
      </select>
    </div>

    <div class="compare-field">
      <label for="swipe-right-layer">右侧影像</label>
      <select
        id="swipe-right-layer"
        :value="controls.swipe.rightLayerId"
        @change="controls.selectSwipeLayer('right', ($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>请选择</option>
        <option v-for="layer in controls.imageryLayers" :key="layer.id" :value="layer.id">
          {{ layer.name }}
        </option>
      </select>
    </div>

    <div class="compare-field">
      <div class="compare-field-header">
        <label for="swipe-split-position">分割位置</label>
      </div>
      <div class="position-row">
        <input
          id="swipe-split-position"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="controls.swipe.splitPosition"
          @input="handlePositionInput"
          :disabled="!controls.swipeReady"
        />
        <div class="position-number-group">
          <input
            class="position-number"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="Math.round(controls.swipe.splitPosition * 100)"
            :disabled="!controls.swipeReady"
            @change="
              controls.setSwipeSplitPosition(
                Number(($event.target as HTMLInputElement).value) / 100,
              )
            "
          />
          <span aria-hidden="true">%</span>
        </div>
      </div>
    </div>

    <label class="compare-switch">
      <input
        type="checkbox"
        :checked="controls.swipe.showDivider"
        :disabled="!controls.swipeReady"
        @change="controls.setSwipeDividerVisible(($event.target as HTMLInputElement).checked)"
      />
      <span>显示分割线</span>
    </label>

    <p v-if="controls.error" class="compare-error" role="alert">{{ controls.error }}</p>

    <div class="compare-actions">
      <button
        type="button"
        title="截取当前卷帘视图"
        :disabled="!controls.swipeReady"
        @click="emit('screenshot')"
      >
        <i class="bi bi-camera" aria-hidden="true"></i>
        <span>截图</span>
      </button>
      <button type="button" title="退出卷帘比对并恢复图层" @click="controls.exitSwipeCompare()">
        <i class="bi bi-x-circle" aria-hidden="true"></i>
        <span>退出</span>
      </button>
    </div>
  </div>

  <div
    v-else-if="controls.mode === 'split'"
    class="compare-panel"
    role="region"
    aria-label="分屏联动控制"
  >
    <div class="compare-grid">
      <div class="compare-field">
        <label for="split-left-scheme">左侧 2D 方案</label>
        <select
          id="split-left-scheme"
          :value="controls.split.leftSchemeId"
          @change="handleSplitSchemeChange('left', $event)"
        >
          <option v-for="scheme in controls.schemeOptions" :key="scheme.id" :value="scheme.id">
            {{ scheme.name }}
          </option>
        </select>
      </div>

      <div class="compare-field">
        <label for="split-right-scheme">右侧 3D 方案</label>
        <select
          id="split-right-scheme"
          :value="controls.split.rightSchemeId"
          @change="handleSplitSchemeChange('right', $event)"
        >
          <option v-for="scheme in controls.schemeOptions" :key="scheme.id" :value="scheme.id">
            {{ scheme.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="compare-grid">
      <fieldset class="layer-group">
        <legend>2D 图层</legend>
        <label
          v-for="layer in controls.leftBundle?.scheme.layers"
          :key="layer.id"
          class="compare-switch"
        >
          <input
            type="checkbox"
            :checked="controls.split.leftVisibility[layer.id]"
            @change="handleSplitLayerVisible('left', layer.id, $event)"
          />
          <span>{{ layer.name }}</span>
        </label>
      </fieldset>

      <fieldset class="layer-group">
        <legend>3D 图层</legend>
        <label
          v-for="layer in controls.rightBundle?.scheme.layers"
          :key="layer.id"
          class="compare-switch"
        >
          <input
            type="checkbox"
            :checked="controls.split.rightVisibility[layer.id]"
            @change="handleSplitLayerVisible('right', layer.id, $event)"
          />
          <span>{{ layer.name }}</span>
        </label>
      </fieldset>
    </div>

    <label class="compare-switch">
      <input
        type="checkbox"
        :checked="controls.split.cameraSyncEnabled"
        @change="controls.setSplitCameraSyncEnabled(($event.target as HTMLInputElement).checked)"
      />
      <span>相机同步</span>
    </label>

    <p v-if="controls.error" class="compare-error" role="alert">{{ controls.error }}</p>

    <div class="compare-actions split-exit">
      <button type="button" title="退出分屏联动并恢复右侧视口" @click="controls.exitSplitCompare()">
        <i class="bi bi-x-circle" aria-hidden="true"></i>
        <span>退出</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.compare-panel {
  display: grid;
  gap: 12px;
}

.compare-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.layer-group {
  display: grid;
  min-width: 0;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-sm);
}

.layer-group legend {
  padding: 0 3px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.compare-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

label {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

select,
input[type="range"],
input[type="number"] {
  min-width: 0;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--shadow-base) 72%, transparent);
}

select {
  width: 100%;
  padding: 7px 8px;
  font-size: var(--text-sm);
}

.position-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.position-number-group {
  display: inline-grid;
  grid-template-columns: 42px auto;
  align-items: center;
  gap: 3px;
}

.position-number {
  width: 45px;
  padding: 5px 3px;
  text-align: right;
  font-size: 13px;
}

.position-number-group > span {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.compare-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.compare-error {
  margin: 0;
  color: var(--warning);
  font-size: var(--text-xs);
}

.compare-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.split-exit {
  grid-template-columns: minmax(0, 1fr);
}

.compare-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  background: color-mix(in srgb, var(--panel-bg) 76%, transparent);
}

.compare-actions button:hover,
.compare-actions button:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 68%, transparent);
  color: var(--accent);
}
</style>
