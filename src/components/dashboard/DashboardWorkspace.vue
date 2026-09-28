<script setup lang="ts">
import { useDashboardWorkspace } from "./composables/useDashboardWorkspace"
import AppStatusBar from "./AppStatusBar.vue"
import DashboardLeftRail from "./DashboardLeftRail.vue"
import DashboardRightRail from "./DashboardRightRail.vue"
import MapStage from "./MapStage.vue"
import LayerErrorToast from "../../features/layers/LayerErrorToast.vue"

defineOptions({
  name: "DashboardWorkspace",
})

const controls = useDashboardWorkspace()
</script>

<template>
  <main class="dashboard-body">
    <div class="content-grid">
      <DashboardLeftRail :controls="controls" />

      <MapStage
        :compare-controls="controls.compare"
        :compass-visible="controls.scene.compassVisible"
        :north-locked="controls.scene.northLocked"
        :view-center-visible="controls.view.viewCenterVisible"
        :swipe-compare-active="controls.compare.mode === 'swipe' && controls.compare.swipeReady"
        :split-compare-active="controls.compare.mode === 'split'"
        :swipe-split-position="controls.compare.swipe.splitPosition"
        :swipe-divider-visible="controls.compare.swipeReady && controls.compare.swipe.showDivider"
        @update:swipe-split-position="controls.compare.setSwipeSplitPosition"
      />

      <DashboardRightRail :controls="controls" />
    </div>

    <LayerErrorToast />
  </main>

  <AppStatusBar
    :readout-text="controls.readout.text"
    :readout-title="controls.readout.title"
    :engine-ready="controls.ready"
  />
</template>

<style scoped lang="scss">
.dashboard-body {
  min-width: 0;
  min-height: 0;
  display: flex;
  pointer-events: none;
}

.content-grid {
  --rail-map-gap: 18px;
  --rail-width: 56px;
  --map-menu-width: min(302px, calc(100vw - 112px - 4 * var(--rail-map-gap)));

  flex: 1;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  align-items: stretch;
}

@media (max-width: 1439px) {
  .content-grid {
    --map-menu-width: min(286px, calc(100vw - 88px - 4 * var(--rail-map-gap)));
  }
}

@media (max-width: 1023px) {
  .dashboard-body {
    overflow: hidden;
  }

  .content-grid {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
  }
}
</style>
