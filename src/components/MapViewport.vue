<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController } from "../map"
import MapCompass from "./MapCompass.vue"

const mapController = useMapController()
const mapContainer = ref<HTMLDivElement>()
const cameraHeading = ref(mapController.getCameraHeading())
let disposeCameraHeadingChange: (() => void) | undefined

withDefaults(
  defineProps<{
    compassVisible?: boolean
    northLocked?: boolean
  }>(),
  {
    compassVisible: false,
    northLocked: false,
  },
)

onMounted(() => {
  if (mapContainer.value) {
    mapController?.mount(mapContainer.value)
  }

  disposeCameraHeadingChange = mapController.onCameraHeadingChange((heading) => {
    cameraHeading.value = heading
  })
})

onBeforeUnmount(() => {
  disposeCameraHeadingChange?.()
  mapController?.unmount()
})
</script>

<template>
  <div ref="mapContainer" class="map-viewport"></div>
  <MapCompass
    v-if="compassVisible"
    :heading="cameraHeading"
    :disabled="northLocked"
    @rotate="mapController.setCameraHeading($event)"
    @reset="mapController.resetCameraNorth()"
  />
</template>
