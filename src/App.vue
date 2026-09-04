<script setup lang="ts">
import AppTopBar from "./components/dashboard/AppTopBar.vue"
import DashboardWorkspace from "./components/dashboard/DashboardWorkspace.vue"
import { provideMapController } from "./map"

provideMapController()
</script>

<template>
  <div class="screen-shell">
    <AppTopBar />
    <DashboardWorkspace />
  </div>
</template>

<style scoped lang="scss">
.screen-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

@media (max-width: 1023px) {
  .screen-shell {
    --edge-gutter: 10px;
  }
}
</style>
