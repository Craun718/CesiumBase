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
    minimizable?: boolean
    minimized?: boolean
    minimizeLabel?: string
    restoreLabel?: string
  }>(),
  {
    tag: undefined,
    tagTone: "default",
    variant: "panel",
    closable: true,
    closeLabel: undefined,
    minimizable: false,
    minimized: false,
    minimizeLabel: undefined,
    restoreLabel: undefined,
  },
)

const emit = defineEmits<{
  close: []
  minimize: []
}>()

const placementClass = computed(() => `panel-${props.placement}`)

/** 面板进入方向由 placement 推断：左侧系从右滑入，右侧系从左滑入。 */
const align = computed<"left" | "right">(() =>
  props.placement.startsWith("left") ? "left" : "right",
)
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
    :minimizable="minimizable"
    :minimized="minimized"
    :minimize-label="minimizeLabel"
    :restore-label="restoreLabel"
    :align="align"
    @close="emit('close')"
    @minimize="emit('minimize')"
  >
    <slot></slot>
  </FloatingWindow>
</template>

<style scoped lang="scss">
@use "./railPanel";
</style>
