<script setup lang="ts">
import { ref } from "vue"
import { useDeckMap } from "../map/useDeckMap"

const mapContainer = ref<HTMLDivElement>()
useDeckMap(mapContainer)
</script>

<template>
  <div ref="mapContainer" class="deck-map">
    <span class="map-attribution">© OpenStreetMap contributors · Terrain: Mapzen</span>
  </div>
</template>

<style scoped lang="scss">
.deck-map,
.deck-map :deep(canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.deck-map {
  color: rgba(220, 236, 255, 0.68);
  font-size: 11px;
}

.map-attribution {
  position: absolute;
  right: 10px;
  bottom: 8px;
  z-index: 1;
  pointer-events: none;
  color: rgba(28, 36, 46, 0.9);
  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.75);
}

:global(.deck-tooltip) {
  min-width: 132px;
  padding: 8px 10px;
  overflow: hidden;
  border: 1px solid rgba(72, 229, 255, 0.34);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.92);
  box-shadow: 0 12px 30px rgba(1, 8, 20, 0.58);
  color: #dcecff;
  font-family: var(--font-interface);
  font-size: 12px;
  text-align: left;
}

:global(.deck-tooltip strong) {
  display: block;
  color: #e9f5ff;
  font-size: 13px;
}

:global(.deck-tooltip span) {
  display: block;
  margin-top: 3px;
  color: #9db8dc;
  font-family: var(--font-data);
}
</style>
