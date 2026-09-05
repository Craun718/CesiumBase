<script setup lang="ts" generic="ActionId extends string, CommandId extends string">
import { computed, ref, watch } from "vue"
import RailPanel from "./RailPanel.vue"
import type {
  ExternalPanelControl,
  OperationsSide,
  RailAction,
  RailCommand,
  RailPanelPlacement,
} from "./operations"

const props = defineProps<{
  side: OperationsSide
  label: string
  actions: Array<RailAction<ActionId>>
  commands?: Array<RailCommand<CommandId>>
  getExternalPanel?: (actionId: ActionId) => ExternalPanelControl | undefined
}>()

const emit = defineEmits<{
  command: [commandId: CommandId]
  panel: [actionId: ActionId]
}>()

const expandedMenuId = ref<ActionId | null>(null)
const activePanelId = ref<ActionId | null>(null)

const expandedAction = computed(
  () => props.actions.find((action) => action.id === expandedMenuId.value) ?? null,
)

const panelPlacement = computed<RailPanelPlacement>(() =>
  expandedMenuId.value ? `${props.side}-third` : props.side,
)

function getSecondaryMenuId(actionId: ActionId) {
  return `${props.side}-${actionId}-secondary-menu`
}

function getPanelId(actionId: ActionId) {
  return `${props.side}-${actionId}-panel`
}

function toggleAction(actionId: ActionId) {
  const action = props.actions.find((item) => item.id === actionId)
  if (action?.directPanel) {
    const externalPanel = props.getExternalPanel?.(actionId)
    if (externalPanel) {
      externalPanel.close()
      return
    }

    closeOtherExternalPanels(actionId)
    expandedMenuId.value = null
    activePanelId.value = null
    emit("panel", actionId)
    return
  }

  if (expandedMenuId.value === actionId) {
    expandedMenuId.value = null
    return
  }

  closeOtherExternalPanels(actionId)
  expandedMenuId.value = actionId
  activePanelId.value = null
}

/** 关闭其他一级入口关联的外部面板，保证左侧功能面板互斥。 */
function closeOtherExternalPanels(nextActionId: ActionId) {
  for (const action of props.actions) {
    if (action.id === nextActionId) continue

    props.getExternalPanel?.(action.id)?.close()
  }
}

function openPanel(actionId: ActionId) {
  activePanelId.value = actionId
}

function closePanel() {
  activePanelId.value = null
}

function closeSecondaryMenu() {
  expandedMenuId.value = null
}

function isRailActionActive(actionId: ActionId) {
  return (
    Boolean(props.getExternalPanel?.(actionId)) ||
    expandedMenuId.value === actionId ||
    activePanelId.value === actionId
  )
}

function getActionControls(actionId: ActionId) {
  const externalPanel = props.getExternalPanel?.(actionId)
  if (externalPanel) return externalPanel.controlId

  if (expandedMenuId.value === actionId) return getSecondaryMenuId(actionId)
  if (activePanelId.value === actionId) return getPanelId(actionId)

  return getSecondaryMenuId(actionId)
}

watch(expandedMenuId, (nextActionId, previousActionId) => {
  if (!previousActionId || previousActionId === nextActionId) return

  activePanelId.value = null
  props.getExternalPanel?.(previousActionId)?.close()
})
</script>

<template>
  <aside class="side-rail" :class="`rail-${side}`" :aria-label="label">
    <div class="rail-actions">
      <button
        v-for="command in commands"
        :key="command.id"
        class="rail-button"
        type="button"
        @click="emit('command', command.id)"
      >
        <i class="bi" :class="command.icon" aria-hidden="true"></i>
        <span>{{ command.label }}</span>
      </button>

      <button
        v-for="action in actions"
        :key="action.id"
        class="rail-button"
        :class="{ 'is-active': isRailActionActive(action.id) }"
        type="button"
        :aria-expanded="isRailActionActive(action.id)"
        :aria-controls="getActionControls(action.id)"
        @click="toggleAction(action.id)"
      >
        <i class="bi" :class="action.icon" aria-hidden="true"></i>
        <span>{{ action.label }}</span>
      </button>
    </div>

    <slot
      v-if="expandedAction?.customMenu"
      name="menu"
      :action="expandedAction"
      :menu-id="getSecondaryMenuId(expandedAction.id)"
      :close="closeSecondaryMenu"
    />

    <RailPanel
      v-else-if="expandedAction"
      :id="getSecondaryMenuId(expandedAction.id)"
      :placement="side"
      :title="expandedAction.label"
      variant="submenu"
      :close-label="`关闭${expandedAction.label}二级菜单`"
      @close="closeSecondaryMenu"
    >
      <button
        class="submenu-option"
        type="button"
        :aria-expanded="activePanelId === expandedAction.id"
        :aria-controls="getPanelId(expandedAction.id)"
        @click="openPanel(expandedAction.id)"
      >
        <i class="bi" :class="expandedAction.icon" aria-hidden="true"></i>
        <span>{{ expandedAction.label }}</span>
        <i class="bi bi-chevron-right submenu-chevron" aria-hidden="true"></i>
      </button>
    </RailPanel>

    <slot
      name="panels"
      :active-panel-id="activePanelId"
      :panel-placement="panelPlacement"
      :close-panel="closePanel"
    />
  </aside>
</template>

<style scoped lang="scss">
@use "./operationsRail";
@use "./operationsMenu";
</style>
