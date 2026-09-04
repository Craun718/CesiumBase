<script setup lang="ts">
import { mapEngineId, type SceneMode } from "../../map"

defineProps<{
  basemapLabel: string
  readoutText: string
  readoutTitle: string
  sceneMode: SceneMode
}>()

const mapEngineLabel = mapEngineId.toUpperCase()
</script>

<template>
  <footer class="statusbar">
    <div class="status-group">
      <span>{{ mapEngineLabel }} · {{ sceneMode === "3d" ? "3D MODE" : "2D MODE" }}</span>
      <span>CGCS2000</span>
      <span>{{ basemapLabel }}</span>
      <span :title="readoutTitle" aria-live="off">{{ readoutText }}</span>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.statusbar {
  border: 0;
  border-top: 1px solid var(--panel-border);
  background: #0a2540;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 var(--edge-gutter, 18px);
}

.status-group {
  display: flex;
  align-items: center;
  gap: 18px;
  overflow: hidden;
}

.status-group span {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 1023px) {
  .statusbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px var(--edge-gutter, 12px);
  }

  .status-group {
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .status-group:last-child {
    display: none;
  }
}
</style>
