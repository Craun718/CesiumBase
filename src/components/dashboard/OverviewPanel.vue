<script setup lang="ts">
import RailPanel from "./RailPanel.vue"

defineProps<{ placement: "left" | "left-third" }>()

const emit = defineEmits<{ close: [] }>()

const overviewMetrics = [
  { label: "监测目标", value: "1,286", trend: "+24" },
  { label: "在线设备", value: "1,092", trend: "96.4%" },
  { label: "今日事件", value: "38", trend: "-6" },
  { label: "覆盖区域", value: "36", trend: "省份" },
]
</script>

<template>
  <RailPanel
    id="left-overview-panel"
    :placement="placement"
    title="态势总览"
    tag="TOTAL"
    close-label="关闭态势总览"
    @close="emit('close')"
  >
    <div class="metric-grid">
      <article v-for="metric in overviewMetrics" :key="metric.label">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.trend }}</small>
      </article>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 4px;
}

.metric-grid article {
  min-height: 86px;
  padding: 14px 4px 6px 12px;
  border-left: 1px solid var(--panel-inner-line);
}

.metric-grid article:nth-child(even) {
  margin-right: -15px;
  padding-right: 16px;
}

.metric-grid span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}

.metric-grid strong {
  display: block;
  margin-top: 11px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 25px;
  font-weight: 600;
  line-height: 1;
}

.metric-grid small {
  display: block;
  margin-top: 7px;
  color: var(--amber);
  font-size: 11px;
}
</style>
