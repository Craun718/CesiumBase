<script setup lang="ts">
/**
 * 底栏状态条：
 * - 实时显示鼠标/视图中心的经纬度与高程读数，使用 aria-live polite 让屏幕阅读器在
 *   鼠标停下后播报当前坐标，避免污染持续性的 hover 流；
 * - 引擎就绪点用语义化 dot + 文本标注，disconnected 时切换为告警色。
 */
defineProps<{
  readoutText: string
  readoutTitle: string
  engineReady?: boolean
}>()
</script>

<template>
  <footer class="statusbar">
    <div class="status-group">
      <span
        class="engine-indicator"
        :class="{ 'is-ready': engineReady }"
        role="status"
        aria-live="polite"
      >
        <span class="engine-dot" aria-hidden="true"></span>
        <span>{{ engineReady ? "引擎就绪" : "引擎加载中" }}</span>
      </span>
    </div>
    <div class="status-group">
      <span :title="readoutTitle" aria-live="polite" class="readout">{{ readoutText }}</span>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.statusbar {
  border: 0;
  border-top: 1px solid var(--panel-border);
  background: var(--surface-chrome);
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  min-height: 36px;
  padding: 0 var(--edge-gutter, 18px);
}

.status-group {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  overflow: hidden;
}

.status-group span {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-md);
  white-space: nowrap;
}

.engine-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-family: var(--font-interface);
  font-size: var(--text-sm);
}

.engine-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 6px color-mix(in srgb, var(--warning) 55%, transparent);
  transition:
    background-color var(--motion-duration-base) var(--motion-ease-standard),
    box-shadow var(--motion-duration-base) var(--motion-ease-standard);
}

.engine-indicator.is-ready {
  color: var(--text-primary);
}

.engine-indicator.is-ready .engine-dot {
  background: var(--accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 70%, transparent);
}

.readout {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
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
  .status-group:last-child .readout {
    max-width: 60vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
