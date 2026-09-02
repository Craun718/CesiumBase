<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController } from "../map"

const mapController = useMapController()
const mapContainer = ref<HTMLDivElement>()

onMounted(() => {
  if (mapContainer.value) {
    mapController?.mount(mapContainer.value)
  }
})

onBeforeUnmount(() => {
  mapController?.unmount()
})
</script>

<template>
  <div ref="mapContainer" class="map-viewport"></div>
</template>
