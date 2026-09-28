<script setup lang="ts">
import { computed } from "vue"
import type { CatalogLoadStatus } from "../catalog/api"

const props = defineProps<{
  status: CatalogLoadStatus
  error?: string
}>()

const emit = defineEmits<{
  retry: []
}>()

const message = computed(() => {
  if (props.status === "loading") return "正在从目录服务拉取数据"
  return props.error ?? "目录服务请求失败"
})
</script>

<template>
  <div
    v-if="status !== 'ready'"
    class="catalog-state"
    :class="`is-${status}`"
    role="status"
    aria-live="polite"
  >
    <i
      class="bi"
      :class="status === 'loading' ? 'bi-arrow-repeat' : 'bi-exclamation-triangle'"
      aria-hidden="true"
    ></i>
    <span>{{ message }}</span>
    <button v-if="status === 'error'" type="button" @click="emit('retry')">重试</button>
  </div>
</template>

<style scoped lang="scss">
.catalog-state {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--color-panel) 50%, transparent);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

.catalog-state i {
  flex: none;
  color: var(--warning);
}

.catalog-state span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.catalog-state.is-error {
  border-color: color-mix(in srgb, var(--danger-deep) 32%, transparent);
  background: color-mix(in srgb, var(--danger-deep) 8%, transparent);
}

.catalog-state.is-error i,
.catalog-state.is-error span {
  color: var(--danger);
}

.catalog-state button {
  flex: none;
  margin-left: auto;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-xs);
  padding: 4px 8px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  cursor: pointer;
}

.catalog-state button:hover,
.catalog-state button:focus-visible {
  border-color: var(--accent);
}
</style>
