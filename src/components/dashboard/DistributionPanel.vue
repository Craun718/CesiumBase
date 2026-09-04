<script setup lang="ts">
import RailPanel from "./RailPanel.vue"

defineProps<{ placement: "left" | "left-third" }>()

const emit = defineEmits<{ close: [] }>()

const areaDistribution = [
  { name: "华东区域", value: 86 },
  { name: "华南区域", value: 72 },
  { name: "华北区域", value: 64 },
  { name: "西南区域", value: 48 },
  { name: "东北区域", value: 35 },
]
</script>

<template>
  <RailPanel
    id="left-distribution-panel"
    :placement="placement"
    title="区域分布"
    tag="REGION"
    close-label="关闭区域分布"
    @close="emit('close')"
  >
    <div class="distribution-list">
      <div v-for="area in areaDistribution" :key="area.name" class="distribution-row">
        <span>{{ area.name }}</span>
        <div class="distribution-track" aria-hidden="true">
          <i :style="{ width: `${area.value}%` }"></i>
        </div>
        <strong>{{ area.value }}</strong>
      </div>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.distribution-list {
  margin: 12px 0 0;
  padding: 0;
}

.distribution-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
}

.distribution-row span {
  display: block;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.distribution-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  text-align: right;
}

.distribution-track {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(31, 62, 104, 0.82);
}

.distribution-track i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  transition: width 180ms ease;
}
</style>
