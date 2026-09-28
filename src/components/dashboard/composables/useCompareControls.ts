import { computed, onScopeDispose, reactive, ref, watch } from "vue"
import { buildLayerSchemeBundle } from "../../../features/catalog/layerScheme.js"
import type { CatalogSnapshot, LayerDefinition } from "../../../features/catalog/model/types"
import type { LayerSchemeBundle } from "../../../features/layers/types"
import type { MapBounds } from "../../../map/types"
import type { SceneMode, SwipeCompareOptions } from "../../../map/types"
import {
  buildSwipeFocusVisibility,
  captureLayerVisibility,
  createSplitLayerVisibility,
  createSplitSchemeBundle,
  resolveCompareUnavailableReason,
  resolveSwipeBaseLayerId,
  resolveSwipeFocusBounds,
  selectSwipeLayer as selectSwipeLayerIds,
  type CompareLimitedFeature,
  type LayerVisibilityMap,
  type SwipeLayerSide,
} from "./compareVisibility.js"

export type CompareMode = "none" | "swipe" | "split"

interface CompareMapController {
  setSwipeCompare(options: SwipeCompareOptions): void
  flyToBounds?(bounds: MapBounds): Promise<unknown> | void
}

interface CompareLayerRegistry {
  applyScheme(bundle: LayerSchemeBundle): Promise<unknown>
  setLayerVisible(layerId: string, visible: boolean): Promise<unknown>
}

interface CompareCatalogState {
  activeBundle?: LayerSchemeBundle
  catalog: Pick<CatalogSnapshot, "sources" | "resources" | "layerSchemes">
  temporaryLayers: readonly LayerDefinition[]
  visibilityOverrides: Record<string, boolean>
}

interface CompareSceneState {
  sceneMode: SceneMode
  setSceneMode(mode: SceneMode): void
}

interface CompareControlsOptions {
  readonly mapController: CompareMapController
  readonly layerRegistry: CompareLayerRegistry
  readonly catalog: CompareCatalogState
  readonly scene: CompareSceneState
}

/** 比较控制域：负责卷帘与分屏的会话状态、显隐切换和互斥基础状态。 */
export function useCompareControls({
  mapController,
  layerRegistry,
  catalog,
  scene,
}: CompareControlsOptions) {
  const mode = ref<CompareMode>("none")
  const transition = ref<"idle" | "starting" | "exiting">("idle")
  const error = ref<string>()
  const viewportWidth = ref(typeof window === "undefined" ? 1024 : window.innerWidth)
  const swipe = reactive({
    leftLayerId: "",
    rightLayerId: "",
    splitPosition: 0.5,
    showDivider: true,
  })
  const panelMinimized = ref(false)
  const split = reactive({
    leftSchemeId: "",
    rightSchemeId: "",
    leftVisibility: {} as LayerVisibilityMap,
    rightVisibility: {} as LayerVisibilityMap,
    cameraSyncEnabled: true,
  })

  let swipeVisibilitySnapshot: LayerVisibilityMap | undefined
  let swipeBaseLayerId: string | undefined
  let splitVisibilitySnapshot: LayerVisibilityMap | undefined
  let sceneModeBeforeSplit: SceneMode | undefined

  const layers = computed(() => [
    ...(catalog.activeBundle?.scheme.layers ?? []),
    ...catalog.temporaryLayers,
  ])
  const imageryLayers = computed(() => layers.value.filter((layer) => layer.type === "imagery"))
  const swipeReady = computed(() => Boolean(swipe.leftLayerId && swipe.rightLayerId))
  const sceneMode = computed(() => scene.sceneMode)
  const schemeOptions = computed(() =>
    catalog.catalog.layerSchemes.filter((scheme) => scheme.status === "enabled"),
  )
  const splitAvailable = computed(() => viewportWidth.value >= 1024)
  const leftBundle = computed(() => {
    const bundle = resolveSchemeBundle(split.leftSchemeId)
    return bundle ? createSplitSchemeBundle(bundle, split.leftVisibility) : undefined
  })
  const rightBundle = computed(() => {
    const bundle = resolveSchemeBundle(split.rightSchemeId)
    return bundle ? createSplitSchemeBundle(bundle, split.rightVisibility) : undefined
  })

  /** 从完整目录中构建指定方案实际引用的资源闭包。 */
  function resolveSchemeBundle(schemeId: string): LayerSchemeBundle | undefined {
    if (!schemeId) return undefined
    return buildLayerSchemeBundle(catalog.catalog, schemeId)
  }

  /** 读取当前卷帘的引擎配置。 */
  function createSwipeEngineOptions(enabled: boolean): SwipeCompareOptions {
    const engineEnabled = enabled && swipeReady.value

    return {
      enabled: engineEnabled,
      leftLayerId: engineEnabled ? swipe.leftLayerId : undefined,
      rightLayerId: engineEnabled ? swipe.rightLayerId : undefined,
      baseLayerId: engineEnabled ? swipeBaseLayerId : undefined,
      splitPosition: swipe.splitPosition,
      showDivider: engineEnabled && swipe.showDivider,
    }
  }

  /** 将显隐集合同步到目录会话状态和图层注册器。 */
  async function applyVisibility(nextVisibility: LayerVisibilityMap) {
    catalog.visibilityOverrides = { ...nextVisibility }

    for (const layer of layers.value) {
      const visible = nextVisibility[layer.id]
      if (visible === undefined) continue
      await layerRegistry.setLayerVisible(layer.id, visible)
    }
  }

  /** 定位到左右影像的有效比对范围，定位失败不打断卷帘模式。 */
  function flyToSwipeFocusBounds(bounds: MapBounds) {
    const result = mapController.flyToBounds?.(bounds)
    if (!(result instanceof Promise)) return

    void result.catch(() => undefined)
  }

  /** 将右侧分屏方案应用到全局主视口。 */
  async function applyRightSplitBundle() {
    if (!rightBundle.value) return
    await layerRegistry.applyScheme(rightBundle.value)
  }

  /** 进入卷帘配置态，等待用户选择左右影像后再改变地图。 */
  async function startSwipeCompare() {
    if (transition.value !== "idle" || mode.value !== "none") {
      error.value = "请先关闭当前比对模式"
      return
    }
    if (imageryLayers.value.length < 2) {
      error.value = "当前方案至少需要两个影像图层"
      return
    }

    swipeVisibilitySnapshot = undefined
    swipeBaseLayerId = undefined
    swipe.leftLayerId = ""
    swipe.rightLayerId = ""
    swipe.splitPosition = 0.5
    swipe.showDivider = true
    panelMinimized.value = false
    error.value = undefined
    transition.value = "starting"

    try {
      mode.value = "swipe"
    } finally {
      transition.value = "idle"
    }
  }

  /** 退出卷帘并恢复进入前图层显隐。 */
  async function exitSwipeCompare() {
    if (transition.value !== "idle" || mode.value !== "swipe") return

    const restoredVisibility = swipeVisibilitySnapshot
    swipeVisibilitySnapshot = undefined
    swipeBaseLayerId = undefined
    transition.value = "exiting"

    try {
      mode.value = "none"
      error.value = undefined
      panelMinimized.value = false
      mapController.setSwipeCompare(createSwipeEngineOptions(false))
      swipe.leftLayerId = ""
      swipe.rightLayerId = ""
      if (restoredVisibility) await applyVisibility(restoredVisibility)
    } finally {
      transition.value = "idle"
    }
  }

  /** 进入 2D/3D 分屏，右侧主视口保留完整 3D 方案。 */
  async function startSplitCompare() {
    if (transition.value !== "idle" || mode.value !== "none") {
      error.value = "请先关闭当前比对模式"
      return
    }
    if (!splitAvailable.value) {
      error.value = "屏幕宽度不足"
      return
    }

    const activeId = catalog.activeBundle?.scheme.id
    const activeScheme = schemeOptions.value.find((scheme) => scheme.id === activeId)
    if (!activeId || !activeScheme) {
      error.value = "当前没有可用的图层方案"
      return
    }

    splitVisibilitySnapshot = captureLayerVisibility(layers.value, catalog.visibilityOverrides)
    sceneModeBeforeSplit = scene.sceneMode
    split.leftSchemeId = activeId
    split.rightSchemeId = activeId
    split.leftVisibility = createSplitLayerVisibility(layers.value, "left")
    split.rightVisibility = createSplitLayerVisibility(layers.value, "right")
    split.cameraSyncEnabled = true
    error.value = undefined
    panelMinimized.value = false
    transition.value = "starting"

    try {
      await applyRightSplitBundle()
      scene.setSceneMode("3d")
      mode.value = "split"
    } finally {
      transition.value = "idle"
    }

    if (!splitAvailable.value && mode.value === "split") {
      await exitSplitCompare()
    }
  }

  /** 退出分屏并恢复右侧主视口的方案、显隐和场景模式。 */
  async function exitSplitCompare() {
    if (
      transition.value !== "idle" ||
      mode.value !== "split" ||
      !splitVisibilitySnapshot ||
      !catalog.activeBundle
    ) {
      return
    }

    const activeBundle = catalog.activeBundle
    const restoredVisibility = splitVisibilitySnapshot
    const restoredSceneMode = sceneModeBeforeSplit ?? scene.sceneMode
    splitVisibilitySnapshot = undefined
    sceneModeBeforeSplit = undefined
    transition.value = "exiting"

    try {
      mode.value = "none"
      error.value = undefined
      panelMinimized.value = false
      split.leftSchemeId = activeBundle.scheme.id
      split.rightSchemeId = activeBundle.scheme.id
      split.leftVisibility = createSplitLayerVisibility(activeBundle.scheme.layers, "left")
      split.rightVisibility = restoredVisibility
      await layerRegistry.applyScheme(createSplitSchemeBundle(activeBundle, restoredVisibility))
      catalog.visibilityOverrides = { ...restoredVisibility }
      scene.setSceneMode(restoredSceneMode)
    } finally {
      transition.value = "idle"
    }
  }

  /** 切换某一侧分屏视口的图层方案。 */
  async function selectSplitScheme(side: SwipeLayerSide, schemeId: string) {
    if (mode.value !== "split") return
    if (!schemeOptions.value.some((scheme) => scheme.id === schemeId)) {
      error.value = "图层方案不存在或未启用"
      return
    }

    const bundle = resolveSchemeBundle(schemeId)
    if (!bundle) {
      error.value = "图层方案不存在或未启用"
      return
    }

    if (side === "left") {
      split.leftSchemeId = schemeId
      split.leftVisibility = createSplitLayerVisibility(bundle.scheme.layers, "left")
    } else {
      split.rightSchemeId = schemeId
      split.rightVisibility = createSplitLayerVisibility(bundle.scheme.layers, "right")
      await applyRightSplitBundle()
    }
    error.value = undefined
  }

  /** 切换某一侧分屏视口的图层显隐。 */
  async function setSplitLayerVisible(side: SwipeLayerSide, layerId: string, visible: boolean) {
    if (mode.value !== "split") return

    const bundle = side === "left" ? leftBundle.value : rightBundle.value
    if (!bundle?.scheme.layers.some((layer) => layer.id === layerId)) {
      error.value = "图层不存在或已移除"
      return
    }

    if (side === "left") split.leftVisibility = { ...split.leftVisibility, [layerId]: visible }
    else split.rightVisibility = { ...split.rightVisibility, [layerId]: visible }
    error.value = undefined

    if (side === "right") await applyRightSplitBundle()
  }

  /** 切换右侧 3D 到左侧 2D 的相机同步。 */
  function setSplitCameraSyncEnabled(enabled: boolean) {
    if (mode.value !== "split") return
    split.cameraSyncEnabled = enabled
  }

  /** 跟踪浏览器视口宽度，用于分屏可用性判断。 */
  function handleViewportResize() {
    viewportWidth.value = window.innerWidth
  }

  /** 输出当前比对模式下指定功能的禁用原因。 */
  function compareUnavailableReason(feature: CompareLimitedFeature) {
    return resolveCompareUnavailableReason(mode.value, feature, splitAvailable.value)
  }

  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleViewportResize)
    onScopeDispose(() => {
      window.removeEventListener("resize", handleViewportResize)
    })
  }

  watch(splitAvailable, (available) => {
    if (!available && transition.value === "idle" && mode.value === "split") {
      void exitSplitCompare()
    }
  })

  /** 切换左右影像，并在选择对侧影像时自动交换。 */
  async function selectSwipeLayer(side: SwipeLayerSide, nextLayerId: string) {
    if (mode.value !== "swipe") return
    if (!imageryLayers.value.some((layer) => layer.id === nextLayerId)) {
      error.value = "影像图层不存在或已移除"
      return
    }

    const next = selectSwipeLayerIds(swipe.leftLayerId, swipe.rightLayerId, side, nextLayerId)
    swipe.leftLayerId = next.leftLayerId
    swipe.rightLayerId = next.rightLayerId
    error.value = undefined
    if (!next.leftLayerId || !next.rightLayerId) {
      swipeBaseLayerId = undefined
      return
    }

    const selectedIds = [next.leftLayerId, next.rightLayerId]
    const visibilitySnapshot =
      swipeVisibilitySnapshot ?? captureLayerVisibility(layers.value, catalog.visibilityOverrides)
    const firstActivation = !swipeVisibilitySnapshot
    if (firstActivation) swipeVisibilitySnapshot = visibilitySnapshot

    const baseLayerId = resolveSwipeBaseLayerId(
      layers.value,
      selectedIds,
      catalog.catalog.resources,
    )
    swipeBaseLayerId = baseLayerId

    await applyVisibility(
      buildSwipeFocusVisibility(layers.value, selectedIds, visibilitySnapshot, baseLayerId),
    )
    mapController.setSwipeCompare(createSwipeEngineOptions(true))

    if (firstActivation) {
      const focusBounds = resolveSwipeFocusBounds(
        layers.value,
        selectedIds,
        catalog.catalog.resources,
      )
      if (focusBounds) flyToSwipeFocusBounds(focusBounds)
    }
  }

  /** 更新卷帘分割线位置。 */
  function setSwipeSplitPosition(position: number) {
    if (mode.value !== "swipe" || !swipeReady.value) return
    if (!Number.isFinite(position)) return

    swipe.splitPosition = Math.min(1, Math.max(0, position))
    mapController.setSwipeCompare(createSwipeEngineOptions(true))
  }

  /** 切换卷帘分割线显示状态。 */
  function setSwipeDividerVisible(visible: boolean) {
    if (mode.value !== "swipe" || !swipeReady.value) return

    swipe.showDivider = visible
    mapController.setSwipeCompare(createSwipeEngineOptions(true))
  }

  /** 只收起或还原比对控制面板，不退出当前比对模式。 */
  function setComparePanelMinimized(minimized: boolean) {
    if (mode.value === "none") return

    panelMinimized.value = minimized
  }

  return reactive({
    mode,
    transition,
    error,
    viewportWidth,
    swipe,
    split,
    panelMinimized,
    imageryLayers,
    swipeReady,
    schemeOptions,
    splitAvailable,
    leftBundle,
    rightBundle,
    sceneMode,
    startSwipeCompare,
    exitSwipeCompare,
    startSplitCompare,
    exitSplitCompare,
    selectSwipeLayer,
    selectSplitScheme,
    setSplitLayerVisible,
    setSplitCameraSyncEnabled,
    compareUnavailableReason,
    setSwipeSplitPosition,
    setSwipeDividerVisible,
    setComparePanelMinimized,
  })
}

export type CompareControls = ReturnType<typeof useCompareControls>
