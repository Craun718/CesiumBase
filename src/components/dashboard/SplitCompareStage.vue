<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { CesiumLayerRegistry } from "../../features/layers/layerRegistry"
import { MapController, useMapController } from "../../map"
import MapViewport from "../MapViewport.vue"
import type { LayerSchemeBundle } from "../../features/layers/types"
import type { CompareControls } from "./composables/useCompareControls"
import { createSplitViewportSynchronizer } from "./composables/splitViewportSync"

const props = defineProps<{
  active: boolean
  controls: CompareControls
  compassVisible: boolean
  northLocked: boolean
  viewCenterVisible: boolean
}>()

const rightController = useMapController()
const leftController = new MapController()
const leftLayerRegistry = new CesiumLayerRegistry(leftController)
const stageRoot = ref<HTMLDivElement>()
const rightPane = ref<HTMLElement>()

let splitViewportSync: ReturnType<typeof createSplitViewportSynchronizer> | undefined
let resizeObserver: ResizeObserver | undefined
let leftPaneElement: HTMLElement | undefined
let leftApplySequence = 0

/** 将右侧 3D 视口状态同步到左侧 2D 视口。 */
function syncLeftViewport() {
  splitViewportSync?.sync()
}

/** 应用左侧分屏方案，并按变更类型避免整包重建。 */
async function applyLeftBundle(
  bundle: LayerSchemeBundle | undefined,
  previous: LayerSchemeBundle | undefined,
) {
  if (!bundle) return

  const sequence = ++leftApplySequence
  if (!previous || previous.scheme.id !== bundle.scheme.id) {
    await leftLayerRegistry.applyScheme(bundle)
    return
  }

  const changes = bundle.scheme.layers.filter((layer) => {
    const previousLayer = previous.scheme.layers.find((item) => item.id === layer.id)
    return previousLayer?.visible !== layer.visible
  })

  for (const layer of changes) {
    if (sequence !== leftApplySequence) return
    await leftLayerRegistry.setLayerVisible(layer.id, layer.visible)
  }
}

/** 响应分屏舞台尺寸变化并同步两个引擎画布。 */
function handleStageResize() {
  leftController.resize()
  rightController.resize()
}

/** 跟踪左侧视口 DOM，保证分屏创建时也能触发画布尺寸校正。 */
function setLeftPaneElement(element: unknown) {
  if (leftPaneElement) resizeObserver?.unobserve(leftPaneElement)
  leftPaneElement = element instanceof HTMLElement ? element : undefined
  if (leftPaneElement) resizeObserver?.observe(leftPaneElement)
}

watch(
  () => props.controls.leftBundle,
  (bundle, previous) => {
    void applyLeftBundle(bundle, previous)
  },
  { immediate: true },
)

watch(
  () => props.controls.split.cameraSyncEnabled,
  (enabled) => {
    if (enabled) syncLeftViewport()
  },
)

onMounted(() => {
  splitViewportSync = createSplitViewportSynchronizer({
    leftController,
    rightController,
    isCameraSyncEnabled: () => props.controls.split.cameraSyncEnabled,
  })

  if (stageRoot.value) {
    resizeObserver = new ResizeObserver(handleStageResize)
    resizeObserver.observe(stageRoot.value)
  }
  if (rightPane.value) resizeObserver?.observe(rightPane.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  leftPaneElement = undefined
  splitViewportSync?.dispose()
  splitViewportSync = undefined
  leftLayerRegistry.dispose()
  leftController.unmount()
})
</script>

<template>
  <div ref="stageRoot" class="split-compare-stage" :class="{ active: props.active }">
    <section
      v-if="active"
      class="split-pane left-pane"
      :ref="setLeftPaneElement"
      aria-label="2D 视口"
    >
      <MapViewport :controller="leftController" rendering-profile="secondary" />
      <span class="pane-tag" aria-hidden="true">2D</span>
    </section>

    <div v-if="active" class="split-divider" aria-hidden="true"></div>

    <section ref="rightPane" class="split-pane right-pane" aria-label="3D 视口">
      <MapViewport
        :compass-visible="compassVisible"
        :north-locked="northLocked"
        :view-center-visible="viewCenterVisible"
      />
      <span v-if="active" class="pane-tag" aria-hidden="true">3D</span>
    </section>
  </div>
</template>

<style scoped lang="scss">
.split-compare-stage {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--shadow-base);
}

.split-compare-stage.active {
  grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
}

.split-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.split-divider {
  min-width: 1px;
  background: color-mix(in srgb, var(--accent) 72%, transparent);
}

.pane-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  padding: 3px 7px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: var(--text-xs);
  line-height: 1.2;
  background: color-mix(in srgb, var(--panel-bg) 78%, transparent);
  pointer-events: none;
}
</style>
