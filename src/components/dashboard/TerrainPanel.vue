<script setup lang="ts">
import RailPanel from "./RailPanel.vue"
import type { MapControls } from "./mapControls"

defineProps<{
  controls: MapControls
  placement: "left" | "left-third"
}>()
</script>

<template>
  <RailPanel
    id="terrain-scale-window"
    class="terrain-scale-window"
    :placement="placement"
    title="地形起伏倍率"
    tag="TERRAIN"
    close-label="关闭地形突出"
    @close="controls.closeTerrainPanel()"
  >
    <div class="terrain-scale-body">
      <strong>{{ controls.terrainScale.toFixed(1) }}x</strong>
      <input
        class="terrain-slider"
        type="range"
        :value="controls.terrainScale"
        min="0.5"
        max="5"
        step="0.1"
        aria-label="地形起伏倍率"
        @input="controls.handleTerrainScaleInput($event)"
      />
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.terrain-scale-window {
  --window-padding: 10px;
  --window-head-padding: 8px;
  --window-title-size: 13px;
  --window-tag-size: 9px;
  --window-close-size: 20px;
  --rail-panel-width: min(220px, calc(100vw - 160px));
  min-width: 0;
}

.terrain-scale-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.terrain-scale-body > strong {
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
}

.terrain-slider {
  width: 100%;
  height: 16px;
  margin: 0;
  accent-color: var(--cyan);
}
</style>
