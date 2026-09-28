<script setup lang="ts">
import RailPanel from "./RailPanel.vue"

defineProps<{ placement: "right" | "right-third" }>()

const emit = defineEmits<{ close: [] }>()

const alerts = [
  { level: "critical", title: "边界区域越限", location: "A-07 监测网格" },
  { level: "warning", title: "设备信号波动", location: "B-15 前置站点" },
  { level: "info", title: "图层加载完成", location: "基础影像服务" },
  { level: "warning", title: "资源负载升高", location: "渲染节点 03" },
]
</script>

<template>
  <RailPanel
    id="right-alerts-panel"
    :placement="placement"
    title="实时告警"
    tag="ALERT"
    tag-tone="alert"
    close-label="关闭实时告警"
    @close="emit('close')"
  >
    <ul class="alert-list">
      <li v-for="alert in alerts" :key="alert.title" :class="alert.level">
        <span class="alert-dot" aria-hidden="true"></span>
        <div>
          <strong>{{ alert.title }}</strong>
          <small>{{ alert.location }}</small>
        </div>
      </li>
    </ul>
  </RailPanel>
</template>

<style scoped lang="scss">
.alert-list {
  display: grid;
  gap: 9px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.alert-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border-left: 2px solid var(--neutral);
  background: color-mix(in srgb, var(--neutral-soft) 44%, transparent);
}

.alert-list .critical {
  border-left-color: var(--danger);
}

.alert-list .warning {
  border-left-color: var(--warning);
}

.alert-list .info {
  border-left-color: var(--accent);
}

.alert-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--neutral);
}

.critical .alert-dot {
  background: var(--danger);
}

.warning .alert-dot {
  background: var(--warning);
}

.info .alert-dot {
  background: var(--accent);
}

.alert-list strong,
.alert-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-list strong {
  color: var(--text-primary);
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
}

.alert-list small {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: var(--text-xs);
}
</style>
