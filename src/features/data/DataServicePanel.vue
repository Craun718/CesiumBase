<script setup lang="ts">
import { computed } from "vue"
import FloatingWindow from "../../components/FloatingWindow.vue"

const emit = defineEmits<{
  close: []
}>()

const demServiceUrl = computed(() => import.meta.env.VITE_DEM_SERVICE_URL?.trim() ?? "")
const demServiceToken = computed(() => import.meta.env.VITE_DEM_SERVICE_TOKEN?.trim() ?? "")
const isConfigured = computed(() => demServiceUrl.value.length > 0)
</script>

<template>
  <FloatingWindow
    id="left-data-panel"
    class="rail-panel panel-left"
    title="数据服务"
    tag="DEM"
    close-label="关闭数据服务"
    @close="emit('close')"
  >
    <p class="data-service-source">
      DEM 服务通过项目根目录
      <code>.env</code>
      中的
      <code>VITE_DEM_SERVICE_URL</code>
      /
      <code>VITE_DEM_SERVICE_TOKEN</code>
      配置；修改后重启开发服务器生效。
    </p>

    <div class="data-service-status" :class="{ 'is-configured': isConfigured }">
      <div class="status-meta">
        <strong>{{ isConfigured ? "已配置 DEM 服务" : "未配置 DEM 服务" }}</strong>
        <small v-if="isConfigured">
          <i
            v-if="demServiceToken"
            class="bi bi-shield-lock auth-badge"
            aria-label="已配置认证 Token"
            title="已配置认证 Token"
          ></i>
          {{ demServiceUrl }}
        </small>
        <small v-else>请在 .env 中设置 VITE_DEM_SERVICE_URL 后重启开发服务器</small>
      </div>
    </div>
  </FloatingWindow>
</template>

<style scoped lang="scss">
.data-service-source {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.data-service-source code {
  padding: 1px 5px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 3px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  background: rgba(7, 20, 42, 0.58);
}

.data-service-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  background: rgba(7, 20, 42, 0.45);
}

.data-service-status::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  content: "";
}

.data-service-status.is-configured::before {
  background: var(--cyan);
  box-shadow: 0 0 6px rgba(72, 229, 255, 0.6);
}

.status-meta {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.status-meta strong {
  color: var(--text-primary);
  font-size: 12px;
}

.status-meta small {
  overflow: hidden;
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-service-status.is-configured .status-meta small {
  color: var(--text-secondary);
}

.status-meta .auth-badge {
  margin-right: 4px;
  color: var(--cyan);
  font-size: 10px;
  vertical-align: -1px;
}
</style>
