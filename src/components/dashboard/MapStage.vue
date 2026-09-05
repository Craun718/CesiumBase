<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController } from "../../map"
import ErrorBoundary from "../ErrorBoundary.vue"
import MapViewport from "../MapViewport.vue"
import type { MapControls } from "./mapControls"

defineProps<{ controls: MapControls }>()

const mapController = useMapController()
const flightPreparing = ref(mapController.getFlightPlaybackState().status === "preparing")
let disposeFlightPlaybackState: (() => void) | undefined

onMounted(() => {
  disposeFlightPlaybackState = mapController.onFlightPlaybackStateChange((state) => {
    flightPreparing.value = state.status === "preparing"
  })
})

onBeforeUnmount(() => {
  disposeFlightPlaybackState?.()
  disposeFlightPlaybackState = undefined
})
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
    <div v-if="flightPreparing" class="flight-preparing" role="status" aria-live="polite">
      <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
      <span>正在采样地形并准备漫游</span>
    </div>
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

.flight-preparing {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 32px);
  padding: 9px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.flight-preparing > i {
  color: var(--cyan);
  font-size: 16px;
  animation: flight-spin 1s linear infinite;
}

.flight-preparing > span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
}

@keyframes flight-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1023px) {
  .map-stage {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
}
</style>
