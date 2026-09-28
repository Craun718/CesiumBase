<script setup lang="ts">
import { computed } from "vue"
import ComparePanel from "./ComparePanel.vue"
import FlightRouteSettingsPanel from "../FlightRouteSettingsPanel.vue"
import FlightTourPanel from "../FlightTourPanel.vue"
import OrbitFlightPanel from "../OrbitFlightPanel.vue"
import ViewFavoritesPanel from "../ViewFavoritesPanel.vue"
import ViewOperationsPanel from "../ViewOperationsPanel.vue"
import MeasurementPanel from "./MeasurementPanel.vue"
import OperationsMenu from "./OperationsMenu.vue"
import OperationsRail from "./OperationsRail.vue"
import RailPanel from "./RailPanel.vue"
import type { DashboardControls } from "./composables/useDashboardWorkspace"
import type { CompareLimitedFeature } from "./composables/compareVisibility"
import type { OperationMenuItem, RailAction, RailCommand, RailPanelPlacement } from "./operations"
import {
  measurementOperations,
  viewOperations,
  type MeasurementOperationId,
  type ViewOperationId,
} from "./mapControls"

const props = defineProps<{
  controls: DashboardControls
}>()

type RightActionId = "view" | "measure"
type RightCommandId = "return-guangxi"

const rightActions = computed<Array<RailAction<RightActionId>>>(() => [
  {
    id: "view",
    label: "视角操作",
    icon: "bi-eye",
    customMenu: true,
    highlightExternalPanel: false,
  },
  {
    id: "measure",
    label: "测量操作",
    icon: "bi-rulers",
    customMenu: true,
    disabled: Boolean(props.controls.compare.compareUnavailableReason("measurement")),
    disabledReason: props.controls.compare.compareUnavailableReason("measurement"),
  },
])

const rightCommands = [
  { id: "return-guangxi", label: "返回广西", icon: "bi-geo-alt" },
] satisfies Array<RailCommand<RightCommandId>>

const viewMenuItems = computed<Array<OperationMenuItem<ViewOperationId>>>(() =>
  viewOperations.map((operation) => {
    const compareFeature = getViewCompareFeature(operation.id)
    const compareDisabledReason = compareFeature
      ? props.controls.compare.compareUnavailableReason(compareFeature)
      : undefined
    const sceneDisabledReason =
      operation.id === "view-orbit-flight" && props.controls.scene.sceneMode === "2d"
        ? "仅3D模式可用"
        : undefined

    return {
      ...operation,
      active:
        (operation.id === "view-center" && props.controls.view.viewCenterVisible) ||
        (operation.id === "view-orbit-flight" && props.controls.view.orbitFlightOpen) ||
        (operation.id === "view-position" && props.controls.view.viewPositionOpen) ||
        (operation.id === "view-camera" && props.controls.view.viewCameraOpen) ||
        (operation.id === "view-favorites" && props.controls.view.viewFavoritesOpen) ||
        (operation.id === "view-flight" && props.controls.view.viewFlightOpen) ||
        (operation.id === "view-swipe-compare" && props.controls.compare.mode === "swipe") ||
        (operation.id === "view-split-compare" && props.controls.compare.mode === "split"),
      disabled: Boolean(compareDisabledReason ?? sceneDisabledReason),
      disabledReason: compareDisabledReason ?? sceneDisabledReason,
    }
  }),
)

const measurementMenuItems = computed<Array<OperationMenuItem<MeasurementOperationId>>>(() =>
  measurementOperations.map((operation) => ({
    ...operation,
    active: props.controls.measurement.state.mode === operation.id,
    open: props.controls.measurement.open && props.controls.measurement.state.mode === operation.id,
    disabled: Boolean(props.controls.compare.compareUnavailableReason("measurement")),
    disabledReason: props.controls.compare.compareUnavailableReason("measurement"),
  })),
)

/** 将视角操作映射到受比对模式限制的功能类别。 */
function getViewCompareFeature(operationId: ViewOperationId): CompareLimitedFeature | undefined {
  if (operationId === "view-swipe-compare") return "swipe"
  if (operationId === "view-split-compare") return "split"
  if (operationId === "view-screenshot") return "screenshot"
  if (operationId === "view-orbit-flight") return "roaming"
  if (
    operationId === "view-position" ||
    operationId === "view-camera" ||
    operationId === "view-favorites" ||
    operationId === "view-flight"
  ) {
    return "flight"
  }

  return undefined
}

/** 将通用面板位置归一化为右侧可用位置。 */
function getPanelPlacement(placement: RailPanelPlacement) {
  return placement === "right-third" ? placement : "right"
}

/** 获取右侧一级入口当前关联的外部面板。 */
function getExternalPanel(actionId: RightActionId) {
  const { controls } = props

  if (actionId === "measure" && controls.measurement.open) {
    return { controlId: "right-measure-panel", close: controls.measurement.closePanel }
  }
  if (actionId !== "view") return undefined

  if (controls.compare.mode === "swipe") {
    return {
      controlId: "right-compare-panel",
      close: controls.compare.exitSwipeCompare,
    }
  }

  if (controls.compare.mode === "split") {
    return {
      controlId: "right-compare-panel",
      close: controls.compare.exitSplitCompare,
    }
  }

  const view = controls.view
  if (view.viewPositionOpen) {
    return { controlId: "right-view-position-panel", close: view.closeViewPanel }
  }
  if (view.viewCameraOpen) {
    return { controlId: "right-view-camera-panel", close: view.closeViewPanel }
  }
  if (view.viewFavoritesOpen) {
    return { controlId: "right-view-favorites-panel", close: view.closeViewPanel }
  }
  if (view.viewFlightOpen) {
    return { controlId: "right-view-flight-panel", close: view.closeViewPanel }
  }
  if (view.orbitFlightOpen) {
    return { controlId: "right-view-orbit-flight-panel", close: view.stopOrbitFlight }
  }

  return undefined
}

/** 响应视角二级菜单；比对类面板打开后收起二级菜单，保留地图视野。 */
function activateViewOperationFromMenu(operationId: ViewOperationId, close: () => void) {
  props.controls.activateViewOperation(operationId)
  if (operationId === "view-swipe-compare" || operationId === "view-split-compare") close()
}

/** 响应右侧命令。 */
function activateCommand(commandId: RightCommandId) {
  if (commandId === "return-guangxi") props.controls.returnToGuangxi()
}
</script>

<template>
  <OperationsRail
    side="right"
    label="右侧操作"
    :actions="rightActions"
    :commands="rightCommands"
    :get-external-panel="getExternalPanel"
    @command="activateCommand"
  >
    <template #menu="{ action, close }">
      <OperationsMenu
        v-if="action.id === 'view'"
        side="right"
        action-id="view"
        title="视角操作"
        :operations="viewMenuItems"
        @activate="(operationId) => activateViewOperationFromMenu(operationId, close)"
        @close="close"
      />

      <OperationsMenu
        v-else-if="action.id === 'measure'"
        side="right"
        action-id="measure"
        title="测量操作"
        tag="MEASURE"
        :operations="measurementMenuItems"
        @activate="controls.activateMeasurement"
        @close="close"
      />
    </template>

    <template #panels="{ panelPlacement }">
      <RailPanel
        v-if="controls.view.viewPositionOpen"
        id="right-view-position-panel"
        :placement="getPanelPlacement(panelPlacement)"
        title="视角定位"
        tag="VIEW"
        close-label="关闭视角定位"
        @close="controls.view.closeViewPanel"
      >
        <ViewOperationsPanel section="position" />
      </RailPanel>

      <RailPanel
        v-if="controls.view.viewCameraOpen"
        id="right-view-camera-panel"
        :placement="getPanelPlacement(panelPlacement)"
        title="相机参数"
        tag="CAMERA"
        close-label="关闭相机参数"
        @close="controls.view.closeViewPanel"
      >
        <ViewOperationsPanel section="camera" />
      </RailPanel>

      <RailPanel
        v-if="controls.view.viewFavoritesOpen"
        id="right-view-favorites-panel"
        :placement="getPanelPlacement(panelPlacement)"
        title="视图收藏"
        tag="FAVORITES"
        close-label="关闭视图收藏"
        @close="controls.view.closeViewPanel"
      >
        <ViewFavoritesPanel />
      </RailPanel>

      <RailPanel
        v-if="controls.view.viewFlightOpen"
        id="right-view-flight-panel"
        class="flight-window window-compact"
        :placement="getPanelPlacement(panelPlacement)"
        title="飞行漫游"
        tag="FLIGHT"
        close-label="关闭飞行漫游"
        @close="controls.view.closeViewPanel"
      >
        <FlightTourPanel
          :selected-route-id="controls.view.selectedFlightRouteId"
          :settings-open="controls.view.flightRouteSettingsOpen"
          @update:selected-route-id="controls.view.selectFlightRoute"
          @toggle-settings="controls.view.toggleFlightRouteSettings"
        />
      </RailPanel>

      <RailPanel
        v-if="controls.view.viewFlightOpen && controls.view.flightRouteSettingsOpen"
        id="flight-route-settings-panel"
        class="flight-route-window window-compact"
        placement="right-fourth"
        title="航线参数"
        tag="PARAMS"
        close-label="关闭航线参数"
        @close="controls.view.closeFlightRouteSettings"
      >
        <FlightRouteSettingsPanel :selected-route-id="controls.view.selectedFlightRouteId" />
      </RailPanel>

      <RailPanel
        v-if="controls.view.orbitFlightOpen"
        id="right-view-orbit-flight-panel"
        class="orbit-flight-window window-compact"
        :placement="getPanelPlacement(panelPlacement)"
        title="环绕飞行"
        tag="ORBIT"
        close-label="关闭环绕飞行"
        @close="controls.view.stopOrbitFlight"
      >
        <OrbitFlightPanel :scene-mode="controls.scene.sceneMode" />
      </RailPanel>

      <RailPanel
        v-if="controls.compare.mode === 'swipe' || controls.compare.mode === 'split'"
        id="right-compare-panel"
        :placement="getPanelPlacement(panelPlacement)"
        :title="controls.compare.mode === 'swipe' ? '卷帘比对' : '分屏联动'"
        tag="COMPARE"
        :close-label="controls.compare.mode === 'swipe' ? '退出卷帘比对' : '退出分屏联动'"
        :minimizable="true"
        :minimized="controls.compare.panelMinimized"
        :minimize-label="controls.compare.panelMinimized ? '还原比对控制' : '最小化比对控制'"
        :restore-label="controls.compare.panelMinimized ? '还原比对控制' : '最小化比对控制'"
        @minimize="controls.compare.setComparePanelMinimized(!controls.compare.panelMinimized)"
        @close="
          controls.compare.mode === 'swipe'
            ? controls.compare.exitSwipeCompare()
            : controls.compare.exitSplitCompare()
        "
      >
        <ComparePanel :controls="controls.compare" @screenshot="controls.view.captureScreenshot" />
      </RailPanel>

      <MeasurementPanel
        v-if="controls.measurement.open"
        :controls="controls.measurement"
        :placement="getPanelPlacement(panelPlacement)"
      />
    </template>
  </OperationsRail>
</template>

<style scoped lang="scss">
.flight-window,
.flight-route-window,
.orbit-flight-window {
  --rail-panel-width: min(300px, calc(100vw - 160px));
}
</style>
