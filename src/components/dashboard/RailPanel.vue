<script setup lang="ts">
import { computed } from "vue"
import FloatingWindow from "../FloatingWindow.vue"
import type { RailPanelPlacement } from "./operations"

const props = withDefaults(
  defineProps<{
    id: string
    title: string
    placement: RailPanelPlacement
    tag?: string
    tagTone?: "default" | "alert"
    variant?: "panel" | "submenu"
    closable?: boolean
    closeLabel?: string
  }>(),
  {
    tag: undefined,
    tagTone: "default",
    variant: "panel",
    closable: true,
    closeLabel: undefined,
  },
)

const emit = defineEmits<{
  close: []
}>()

const placementClass = computed(() => `panel-${props.placement}`)
</script>

<template>
  <FloatingWindow
    :id="id"
    class="rail-panel"
    :class="placementClass"
    :title="title"
    :tag="tag"
    :tag-tone="tagTone"
    :variant="variant"
    :closable="closable"
    :close-label="closeLabel"
    @close="emit('close')"
  >
    <slot></slot>
  </FloatingWindow>
</template>

<style scoped lang="scss">
@use "./railPanel";
</style>
