<script setup lang="ts" generic="OperationId extends string">
import RailPanel from "./RailPanel.vue"
import type { OperationMenuItem, OperationsSide } from "./operations"

defineProps<{
  side: OperationsSide
  actionId: string
  title: string
  tag?: string
  operations: Array<OperationMenuItem<OperationId>>
}>()

const emit = defineEmits<{
  activate: [operationId: OperationId]
  close: []
}>()
</script>

<template>
  <RailPanel
    :id="`${side}-${actionId}-secondary-menu`"
    :placement="side"
    :title="title"
    :tag="tag"
    variant="submenu"
    :close-label="`关闭${title}二级菜单`"
    @close="emit('close')"
  >
    <div class="submenu-operation-list">
      <button
        v-for="operation in operations"
        :key="operation.id"
        class="submenu-option"
        :class="{
          'is-active': operation.active,
          'is-open': operation.open,
        }"
        type="button"
        :disabled="operation.disabled"
        :aria-pressed="operation.kind === 'toggle' ? operation.active : undefined"
        :title="operation.disabled ? operation.disabledReason : undefined"
        @click="emit('activate', operation.id)"
      >
        <i class="bi" :class="operation.icon" aria-hidden="true"></i>
        <span>{{ operation.label }}</span>
        <i
          v-if="operation.kind === 'command' || operation.kind === 'panel'"
          class="bi bi-chevron-right submenu-chevron"
          aria-hidden="true"
        ></i>
        <span v-else-if="operation.kind === 'mode'" class="operation-mode">
          {{ operation.badge }}
        </span>
        <span v-else class="operation-switch" aria-hidden="true">
          <span class="operation-switch-thumb"></span>
        </span>
      </button>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
@use "./operationsMenu";
</style>
