<script setup lang="ts">
import RailPanel from "./RailPanel.vue"
import type { SceneControls } from "./composables/useSceneControls"

defineProps<{
  controls: SceneControls
  placement: "left" | "left-third"
}>()
</script>

<template>
  <RailPanel
    id="terrain-scale-window"
    class="terrain-scale-window window-compact"
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
        @input="controls.setTerrainScaleFromEvent($event)"
      />
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.terrain-scale-window {
  --rail-panel-width: min(220px, calc(100vw - 160px));
  min-width: 0;
}

.terrain-scale-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.terrain-scale-body > strong {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

.terrain-slider {
  width: 100%;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}
</style>
