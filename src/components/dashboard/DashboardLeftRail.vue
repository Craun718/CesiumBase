<script setup lang="ts">
import { computed } from "vue"
import Drawing3DPanel from "./Drawing3DPanel.vue"
import DrawingPanel from "./DrawingPanel.vue"
import LayerTreePanel from "../../features/layers/LayerTreePanel.vue"
import OperationsMenu from "./OperationsMenu.vue"
import OperationsRail from "./OperationsRail.vue"
import RegionTreePanel from "./RegionTreePanel.vue"
import TerrainPanel from "./TerrainPanel.vue"
import type { DashboardControls } from "./composables/useDashboardWorkspace"
import type { OperationMenuItem, RailAction, RailPanelPlacement } from "./operations"
import { mapOperations, type MapOperationId } from "./mapControls"

const props = defineProps<{
  controls: DashboardControls
}>()

type LeftActionId = "layerTree" | "regionTree" | "map" | "drawing" | "drawing3d"

const leftActions = computed<Array<RailAction<LeftActionId>>>(() => [
  {
    id: "layerTree",
    label: "图层树",
    icon: "bi-layers",
    directPanel: true,
    disabled: Boolean(props.controls.compare.compareUnavailableReason("layer-catalog")),
    disabledReason: props.controls.compare.compareUnavailableReason("layer-catalog"),
  },
  { id: "regionTree", label: "政区树", icon: "bi-bar-chart-line" },
  { id: "map", label: "地图操作", icon: "bi-map", customMenu: true },
  {
    id: "drawing",
    label: "绘制操作",
    icon: "bi-pencil",
    directPanel: true,
    disabled: Boolean(props.controls.compare.compareUnavailableReason("drawing")),
    disabledReason: props.controls.compare.compareUnavailableReason("drawing"),
  },
  {
    id: "drawing3d",
    label: "3D 绘制",
    icon: "bi-boxes",
    directPanel: true,
    disabled: Boolean(props.controls.compare.compareUnavailableReason("drawing")),
    disabledReason: props.controls.compare.compareUnavailableReason("drawing"),
  },
])

const mapMenuItems = computed<Array<OperationMenuItem<MapOperationId>>>(() =>
  mapOperations.map((operation) => ({
    ...operation,
    active: operation.kind === "toggle" && props.controls.scene.isOperationActive(operation.id),
    open: (operation.id === "terrain" && props.controls.scene.terrainEnabled) || false,
    disabled:
      props.controls.scene.isOperationDisabled(operation.id) ||
      (operation.id === "scene-mode" &&
        Boolean(props.controls.compare.compareUnavailableReason("scene-switch"))),
    disabledReason: props.controls.scene.isOperationDisabled(operation.id)
      ? "仅3D模式可用"
      : operation.id === "scene-mode"
        ? props.controls.compare.compareUnavailableReason("scene-switch")
        : undefined,
    badge: operation.kind === "mode" ? props.controls.scene.sceneMode.toUpperCase() : undefined,
  })),
)

/** 将通用面板位置归一化为左侧可用位置。 */
function getPanelPlacement(placement: RailPanelPlacement) {
  return placement === "left-third" ? placement : "left"
}

/** 获取一级入口当前关联的外部面板，供操作栏互斥关闭。 */
function getExternalPanel(actionId: LeftActionId) {
  const { controls } = props

  if (actionId === "layerTree" && controls.layers.layerTreeOpen) {
    return { controlId: "layer-tree-window", close: controls.layers.closeLayerTree }
  }
  if (actionId === "drawing" && controls.drawing2d.open) {
    return { controlId: "drawing-window", close: controls.drawing2d.closePanel }
  }
  if (actionId === "drawing3d" && controls.drawing3d.open) {
    return { controlId: "drawing-3d-window", close: controls.drawing3d.closePanel }
  }
  if (actionId !== "map" || !controls.scene.terrainEnabled) return undefined

  return { controlId: "terrain-scale-window", close: controls.scene.closeTerrainPanel }
}

/** 响应左侧一级入口。 */
function activatePanel(actionId: LeftActionId) {
  const { controls } = props

  if (actionId === "layerTree") controls.layers.toggleLayerTree()
  if (actionId === "drawing") controls.openDrawingPanel()
  if (actionId === "drawing3d") controls.openDrawing3DPanel()
}
</script>

<template>
  <OperationsRail
    side="left"
    label="左侧操作"
    :actions="leftActions"
    :get-external-panel="getExternalPanel"
    @panel="activatePanel"
  >
    <template #menu="{ action, close }">
      <OperationsMenu
        v-if="action.id === 'map'"
        side="left"
        action-id="map"
        title="地图操作"
        tag="MAP CONTROL"
        :operations="mapMenuItems"
        @activate="controls.activateMapOperation"
        @close="close"
      />
    </template>

    <template #panels="{ activePanelId, panelPlacement, closePanel }">
      <LayerTreePanel
        v-if="controls.layers.layerTreeOpen"
        :placement="getPanelPlacement(panelPlacement)"
        @close="controls.layers.closeLayerTree"
      />

      <DrawingPanel
        v-if="controls.drawing2d.open"
        :controls="controls.drawing2d"
        :placement="getPanelPlacement(panelPlacement)"
      />

      <Drawing3DPanel
        v-if="controls.drawing3d.open"
        :controls="controls.drawing3d"
        :placement="getPanelPlacement(panelPlacement)"
      />

      <TerrainPanel
        v-if="controls.scene.terrainEnabled"
        :controls="controls.scene"
        :placement="getPanelPlacement(panelPlacement)"
      />

      <RegionTreePanel
        v-if="activePanelId === 'regionTree'"
        :placement="getPanelPlacement(panelPlacement)"
        @close="closePanel"
      />
    </template>
  </OperationsRail>
</template>
