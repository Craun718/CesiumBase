<script setup lang="ts">
import { onActivated, onBeforeUnmount, onMounted, ref } from "vue"
import { useMapController, type MapController, type MapRenderingProfile } from "@/map"
import MapCompass from "./MapCompass.vue"

const props = withDefaults(
  defineProps<{
    controller?: MapController
    compassVisible?: boolean
    northLocked?: boolean
    viewCenterVisible?: boolean
    renderingProfile?: MapRenderingProfile
  }>(),
  {
    compassVisible: false,
    northLocked: false,
    viewCenterVisible: false,
  },
)

const mapController = props.controller ?? useMapController()
const mapContainer = ref<HTMLDivElement>()
const cameraHeading = ref(mapController.getCameraHeading())
let disposeCameraHeadingChange: (() => void) | undefined

onMounted(async () => {
  if (mapContainer.value) {
    try {
      await mapController.mount(mapContainer.value, {
        renderingProfile: props.renderingProfile ?? "primary",
      })
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
  mapController.unmount()
})

onActivated(() => {
  mapController.resize()
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
    var(--accent-line) 0 28%,
    transparent 28% 72%,
    var(--accent-line) 72% 100%
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
    var(--accent-line) 0 28%,
    transparent 28% 72%,
    var(--accent-line) 72% 100%
  );
}

.marker-ring {
  inset: 11px;
  border: 1px solid var(--accent-line);
  border-radius: 50%;
  background: transparent;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--color-abyss) 36%, transparent),
    inset 0 0 6px var(--accent-glow);
}

.marker-dot {
  top: 50%;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-abyss) 90%, transparent);
}
</style>
