<script setup lang="ts">
import RailPanel from "./RailPanel.vue"

const emit = defineEmits<{ close: [] }>()

const resourceLoads = [
  { name: "渲染节点", value: 68, state: "正常" },
  { name: "影像服务", value: 46, state: "稳定" },
  { name: "数据链路", value: 81, state: "繁忙" },
]
</script>

<template>
  <RailPanel
    id="right-resources-panel"
    placement="right"
    title="资源负载"
    tag="LOAD"
    close-label="关闭资源负载"
    @close="emit('close')"
  >
    <div class="resource-list">
      <div v-for="resource in resourceLoads" :key="resource.name">
        <div class="resource-row">
          <span>{{ resource.name }}</span>
          <strong>{{ resource.value }}%</strong>
        </div>
        <div class="resource-track" aria-hidden="true">
          <i :style="{ width: `${resource.value}%` }"></i>
        </div>
        <small>{{ resource.state }}</small>
      </div>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.resource-list {
  display: grid;
  gap: 15px;
  margin: 12px 0 0;
  padding: 0;
}

.resource-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.resource-row span,
.resource-row strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.resource-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
}

.resource-list > div > small {
  margin-top: 6px;
}

.resource-track {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(31, 62, 104, 0.82);
}

.resource-track i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  transition: width 180ms ease;
}
</style>
