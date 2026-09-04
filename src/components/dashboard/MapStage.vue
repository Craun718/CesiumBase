<script setup lang="ts">
import ErrorBoundary from "../ErrorBoundary.vue"
import MapViewport from "../MapViewport.vue"
import type { MapControls } from "./mapControls"

defineProps<{ controls: MapControls }>()
</script>

<template>
  <div class="map-stage">
    <ErrorBoundary>
      <MapViewport
        :compass-visible="controls.compassVisible"
        :north-locked="controls.northLocked"
        :view-center-visible="controls.viewCenterVisible"
      />
    </ErrorBoundary>
    <span class="stage-label" aria-hidden="true">
      {{ controls.sceneMode === "3d" ? "三维态势视图" : "二维态势视图" }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.map-stage {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}

.stage-label {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border: 1px solid rgba(72, 229, 255, 0.28);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  background: rgba(7, 20, 42, 0.62);
}

@media (max-width: 1023px) {
  .map-stage {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
}
</style>
