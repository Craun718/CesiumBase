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
</style>
