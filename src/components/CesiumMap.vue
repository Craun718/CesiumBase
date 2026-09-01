<script setup lang="ts">
import { ref } from 'vue'
import { useCesiumMap } from '../map/useCesiumMap'
import 'cesium/Source/Widgets/widgets.css'

const mapContainer = ref<HTMLDivElement>()
useCesiumMap(mapContainer)
</script>

<template>
  <div ref="mapContainer" class="cesium-map"></div>
</template>


<style scoped lang="scss">
.cesium-map,
.cesium-map :deep(.cesium-widget),
.cesium-map :deep(.cesium-widget) canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cesium-map :deep(.cesium-widget-credits) {
  color: rgba(220, 236, 255, 0.72);
  font-size: 11px;
}

.cesium-map :deep(.cesium-widget-credits a) {
  color: rgba(72, 229, 255, 0.82);
}

:deep(.cesium-viewer-bottom) {
  bottom: 8px;
  left: 12px;
}

</style>
