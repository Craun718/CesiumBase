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
    viewCenterVisible?: boolean
  }>(),
  {
    compassVisible: false,
    northLocked: false,
    viewCenterVisible: false,
  },
)

onMounted(async () => {
  if (mapContainer.value) {
    try {
      await mapController.mount(mapContainer.value)
    } catch (error) {
      console.error("[map] 引擎挂载失败", error)
      throw error
    }
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
  <div v-if="viewCenterVisible" class="view-center-marker" aria-hidden="true">
    <span class="marker-line marker-line-x"></span>
    <span class="marker-line marker-line-y"></span>
    <span class="marker-ring"></span>
    <span class="marker-dot"></span>
  </div>
  <MapCompass
    v-if="compassVisible"
    :heading="cameraHeading"
    :disabled="northLocked"
    @rotate="mapController.setCameraHeading($event)"
    @reset="mapController.resetCameraNorth()"
  />
</template>

<style scoped lang="scss">
.view-center-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: block;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.marker-line,
.marker-ring,
.marker-dot {
  position: absolute;
  background: transparent;
}

.marker-line-x {
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  transform: translateY(-50%);
  background: linear-gradient(
    to right,
    rgba(72, 225, 255, 0.88) 0 28%,
    transparent 28% 72%,
    rgba(72, 225, 255, 0.88) 72% 100%
  );
}

.marker-line-y {
  top: 0;
  left: 50%;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
  background: linear-gradient(
    to bottom,
    rgba(72, 225, 255, 0.88) 0 28%,
    transparent 28% 72%,
    rgba(72, 225, 255, 0.88) 72% 100%
  );
}

.marker-ring {
  inset: 11px;
  border: 1px solid rgba(72, 225, 255, 0.88);
  border-radius: 50%;
  background: transparent;
  box-shadow:
    0 0 0 2px rgba(3, 9, 19, 0.36),
    inset 0 0 6px rgba(72, 225, 255, 0.24);
}

.marker-dot {
  top: 50%;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 6px rgba(3, 9, 19, 0.9);
}
</style>
