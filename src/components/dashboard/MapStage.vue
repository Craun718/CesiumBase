<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController } from "../../map"
import ErrorBoundary from "../ErrorBoundary.vue"
import SplitCompareStage from "./SplitCompareStage.vue"
import SwipeCompareDivider from "./SwipeCompareDivider.vue"
import type { CompareControls } from "./composables/useCompareControls"

const props = defineProps<{
  compareControls: CompareControls
  compassVisible: boolean
  northLocked: boolean
  viewCenterVisible: boolean
  swipeCompareActive: boolean
  splitCompareActive: boolean
  swipeSplitPosition: number
  swipeDividerVisible: boolean
}>()

const emit = defineEmits<{
  "update:swipeSplitPosition": [position: number]
}>()

/** 更新卷帘分割位置。 */
function updateSwipeSplitPosition(position: number) {
  emit("update:swipeSplitPosition", position)
}

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
      <SplitCompareStage
        :active="splitCompareActive"
        :controls="compareControls"
        :compass-visible="compassVisible"
        :north-locked="northLocked"
        :view-center-visible="viewCenterVisible"
      />
    </ErrorBoundary>
    <SwipeCompareDivider
      v-if="props.swipeCompareActive"
      :position="props.swipeSplitPosition"
      :visible="props.swipeDividerVisible"
      @update:model-value="updateSwipeSplitPosition"
    />
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
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--text-sm);
  white-space: nowrap;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.flight-preparing > i {
  color: var(--accent);
  font-size: var(--icon-md);
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
