import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { LayerDefinition } from "../src/features/catalog/model/types.js"
import type { LayerSchemeBundle } from "../src/features/layers/types.js"
import { reactive } from "vue"
import {
  buildSwipeFocusVisibility,
  calculateSwipePositionFromClientX,
  captureLayerVisibility,
  createSwipePositionScheduler,
  createSplitSchemeBundle,
  createSplitLayerVisibility,
  handleCompareEscape,
  hasSwipeDividerDragButton,
  isSwipeDividerDragTermination,
  resolveWorkspaceEscapePriority,
  resolveSwipeBaseLayerId,
  resolveSwipeFocusBounds,
  selectSwipeLayer,
  stepSwipePosition,
} from "../src/components/dashboard/composables/compareVisibility.js"
import { useCompareControls } from "../src/components/dashboard/composables/useCompareControls.js"
import { viewOperations } from "../src/components/dashboard/mapControls.js"

const layers = [
  createImageryLayer("layer-tdt", true),
  createImageryLayer("layer-xyz", false),
  createVectorLayer("layer-vector", true),
  createTerrainLayer("layer-terrain", true),
  createTilesetLayer("layer-tileset", true),
  createImageryLayer("layer-temp", true),
] satisfies LayerDefinition[]

test("captureLayerVisibility 保留方案默认值与会话覆盖值", () => {
  assert.deepEqual(
    captureLayerVisibility(layers, {
      "layer-tdt": false,
      "layer-vector": false,
    }),
    {
      "layer-tdt": false,
      "layer-xyz": false,
      "layer-vector": false,
      "layer-terrain": true,
      "layer-tileset": true,
      "layer-temp": true,
    },
  )
})

test("buildSwipeFocusVisibility 只显示左右影像并保留当前地形", () => {
  assert.deepEqual(
    buildSwipeFocusVisibility(
      layers,
      ["layer-tdt", "layer-xyz"],
      captureLayerVisibility(layers, { "layer-terrain": false }),
    ),
    {
      "layer-tdt": true,
      "layer-xyz": true,
      "layer-vector": false,
      "layer-terrain": false,
      "layer-tileset": false,
      "layer-temp": false,
    },
  )
})

test("卷帘显隐保留底图兜底并自动选择可用的对比范围", () => {
  const wideExtent = { west: 104, south: 20, east: 112, north: 26 }
  const localExtent = { west: 109.2, south: 23.7, east: 109.3, north: 23.8 }
  const resources = [
    createResource("resource-layer-tdt", wideExtent),
    createResource("resource-layer-xyz", localExtent),
    createResource("resource-layer-temp", localExtent),
  ]

  assert.deepEqual(
    buildSwipeFocusVisibility(
      layers,
      ["layer-xyz", "layer-temp"],
      captureLayerVisibility(layers),
      "layer-tdt",
    ),
    {
      "layer-tdt": true,
      "layer-xyz": true,
      "layer-vector": false,
      "layer-terrain": true,
      "layer-tileset": false,
      "layer-temp": true,
    },
  )
  assert.equal(resolveSwipeBaseLayerId(layers, ["layer-tdt", "layer-xyz"], resources), "layer-tdt")
  assert.equal(resolveSwipeBaseLayerId(layers, ["layer-xyz", "layer-temp"], resources), "layer-tdt")
  assert.deepEqual(
    resolveSwipeFocusBounds(layers, ["layer-tdt", "layer-xyz"], resources),
    localExtent,
  )
})

test("卷帘分割线拖拽按动画帧合并位置更新", () => {
  const applied: number[] = []
  const frames: Array<() => void> = []
  const scheduler = createSwipePositionScheduler(
    (position) => applied.push(position),
    (callback) => {
      frames.push(callback)
      return frames.length
    },
    (frameId) => {
      if (frameId === frames.length) frames.pop()
    },
  )

  scheduler.schedule(0.42)
  scheduler.schedule(0.58)
  scheduler.schedule(0.64)
  assert.deepEqual(applied, [])

  frames[0]?.()
  assert.deepEqual(applied, [0.64])

  scheduler.schedule(0.7)
  scheduler.cancel()
  assert.deepEqual(applied, [0.64])
})

test("createSplitLayerVisibility 为左右视口建立独立默认显隐", () => {
  const left = createSplitLayerVisibility(layers, "left")
  const right = createSplitLayerVisibility(layers, "right")

  assert.deepEqual(left, {
    "layer-tdt": true,
    "layer-xyz": false,
    "layer-vector": true,
    "layer-terrain": false,
    "layer-tileset": false,
    "layer-temp": true,
  })
  assert.deepEqual(right, {
    "layer-tdt": true,
    "layer-xyz": false,
    "layer-vector": true,
    "layer-terrain": true,
    "layer-tileset": true,
    "layer-temp": true,
  })
})

test("createSplitSchemeBundle 按视口显隐生成独立方案包", () => {
  const bundle = createSchemeBundle(layers)
  const left = createSplitSchemeBundle(bundle, createSplitLayerVisibility(layers, "left"))
  const right = createSplitSchemeBundle(bundle, createSplitLayerVisibility(layers, "right"))

  assert.deepEqual(
    left.scheme.layers.map((layer) => [layer.id, layer.visible]),
    [
      ["layer-tdt", true],
      ["layer-xyz", false],
      ["layer-vector", true],
      ["layer-terrain", false],
      ["layer-tileset", false],
      ["layer-temp", true],
    ],
  )
  assert.deepEqual(
    right.scheme.layers.map((layer) => [layer.id, layer.visible]),
    [
      ["layer-tdt", true],
      ["layer-xyz", false],
      ["layer-vector", true],
      ["layer-terrain", true],
      ["layer-tileset", true],
      ["layer-temp", true],
    ],
  )
  assert.equal(left.scheme.id, bundle.scheme.id)
  assert.equal(left.resources, bundle.resources)
  assert.equal(left.sources, bundle.sources)
})

test("selectSwipeLayer 选择对侧图层时自动交换左右内容", () => {
  assert.deepEqual(selectSwipeLayer("layer-tdt", "layer-xyz", "left", "layer-xyz"), {
    leftLayerId: "layer-xyz",
    rightLayerId: "layer-tdt",
  })
  assert.deepEqual(selectSwipeLayer("layer-tdt", "layer-xyz", "right", "layer-temp"), {
    leftLayerId: "layer-tdt",
    rightLayerId: "layer-temp",
  })
})

test("卷帘手柄不依赖 transform 居中，避免按下缩放覆盖定位", () => {
  const source = readFileSync("src/components/dashboard/SwipeCompareDivider.vue", "utf8")
  const styleStart = source.indexOf(".swipe-divider-handle {")
  const styleEnd = source.indexOf(".swipe-divider-handle:focus-visible", styleStart)
  const handleStyle = source.slice(styleStart, styleEnd)

  assert.match(handleStyle, /margin:\s*-19px\s+0\s+0\s+-19px/)
  assert.doesNotMatch(handleStyle, /transform:\s*translate\(-50%,\s*-50%\)/)
})

test("useCompareControls 进入和退出卷帘时同步引擎配置并恢复显隐", async () => {
  const schemeLayers = [
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
    createVectorLayer("layer-vector", true),
    createTerrainLayer("layer-terrain", true),
    createImageryLayer("layer-temp", false),
  ] satisfies LayerDefinition[]
  const swipeBundle = createSchemeBundle(schemeLayers)
  const catalog = reactive({
    activeBundle: swipeBundle,
    catalog: {
      sources: [],
      resources: [],
      layerSchemes: [swipeBundle.scheme],
    },
    temporaryLayers: [] as LayerDefinition[],
    visibilityOverrides: { "layer-xyz": true },
  })
  const scene = {
    sceneMode: "3d" as const,
    setSceneMode(mode: "2d" | "3d") {
      void mode
    },
  }
  const engineOptions: unknown[] = []
  const visibilityCalls: Array<[string, boolean]> = []
  const flyToBoundsCalls: unknown[] = []
  const mapController = {
    setSwipeCompare(options: unknown) {
      engineOptions.push(options)
    },
    flyToBounds(bounds: unknown) {
      flyToBoundsCalls.push(bounds)
      return Promise.resolve(true)
    },
  }
  const layerRegistry = {
    async applyScheme() {
      return []
    },
    async setLayerVisible(layerId: string, visible: boolean) {
      visibilityCalls.push([layerId, visible])
      return {
        layerId,
        status: "loaded",
        origin: "scheme",
        canFlyTo: false,
      }
    },
  }
  const controls = useCompareControls({ mapController, layerRegistry, catalog, scene })

  await controls.startSwipeCompare()

  assert.equal(controls.mode, "swipe")
  assert.equal(controls.swipeReady, false)
  assert.deepEqual(controls.swipe, {
    leftLayerId: "",
    rightLayerId: "",
    splitPosition: 0.5,
    showDivider: true,
  })
  assert.equal(engineOptions.length, 0)
  assert.equal(visibilityCalls.length, 0)
  assert.equal(flyToBoundsCalls.length, 0)
  assert.deepEqual(catalog.visibilityOverrides, { "layer-xyz": true })

  await controls.exitSwipeCompare()

  assert.equal(controls.mode, "none")
  assert.deepEqual(engineOptions.at(-1), {
    enabled: false,
    leftLayerId: undefined,
    rightLayerId: undefined,
    baseLayerId: undefined,
    splitPosition: 0.5,
    showDivider: false,
  })

  await controls.startSwipeCompare()
  assert.equal(controls.panelMinimized, false)
  controls.setComparePanelMinimized(true)
  assert.equal(controls.mode, "swipe")
  assert.equal(controls.panelMinimized, true)

  await controls.selectSwipeLayer("left", "layer-tdt")

  assert.equal(controls.swipeReady, false)
  assert.equal(engineOptions.length, 1)
  assert.equal(visibilityCalls.length, 0)
  assert.deepEqual(catalog.visibilityOverrides, {
    "layer-xyz": true,
  })

  await controls.selectSwipeLayer("right", "layer-xyz")

  assert.equal(controls.swipeReady, true)
  assert.equal(engineOptions.length, 2)
  assert.deepEqual(engineOptions.at(-1), {
    enabled: true,
    leftLayerId: "layer-tdt",
    rightLayerId: "layer-xyz",
    baseLayerId: undefined,
    splitPosition: 0.5,
    showDivider: true,
  })
  assert.deepEqual(catalog.visibilityOverrides, {
    "layer-tdt": true,
    "layer-xyz": true,
    "layer-vector": false,
    "layer-terrain": true,
    "layer-temp": false,
  })

  await controls.selectSwipeLayer("right", "layer-temp")

  assert.equal(controls.swipeReady, true)
  await controls.selectSwipeLayer("right", "layer-temp")

  assert.equal(controls.swipe.rightLayerId, "layer-temp")
  assert.deepEqual(engineOptions.at(-1), {
    enabled: true,
    leftLayerId: "layer-tdt",
    rightLayerId: "layer-temp",
    baseLayerId: undefined,
    splitPosition: 0.5,
    showDivider: true,
  })

  await controls.exitSwipeCompare()

  assert.equal(controls.mode, "none")
  assert.equal(controls.panelMinimized, false)
  assert.deepEqual(catalog.visibilityOverrides, {
    "layer-tdt": true,
    "layer-xyz": true,
    "layer-vector": true,
    "layer-terrain": true,
    "layer-temp": false,
  })
  assert.deepEqual(engineOptions.at(-1), {
    enabled: false,
    leftLayerId: undefined,
    rightLayerId: undefined,
    baseLayerId: undefined,
    splitPosition: 0.5,
    showDivider: false,
  })
  assert.deepEqual(visibilityCalls.filter(([layerId]) => layerId === "layer-temp").at(-1), [
    "layer-temp",
    false,
  ])
})

test("useCompareControls 分屏支持左右方案与显隐独立并在退出时恢复右视口", async () => {
  const schemeLayers = [
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
    createVectorLayer("layer-vector", true),
    createTerrainLayer("layer-terrain", true),
    createTilesetLayer("layer-tileset", true),
  ] satisfies LayerDefinition[]
  const bundle = createSchemeBundle(schemeLayers)
  const alternateScheme = {
    ...createSchemeBundle([
      createImageryLayer("layer-tdt", false),
      createTilesetLayer("layer-tileset", false),
    ]).scheme,
    id: "scheme-alternate",
    name: "对比方案",
  }
  const alternateBundle = { ...bundle, scheme: alternateScheme }
  const catalog = reactive({
    activeBundle: bundle,
    catalog: {
      sources: [],
      resources: [],
      layerSchemes: [bundle.scheme, alternateBundle.scheme],
    },
    temporaryLayers: [] as LayerDefinition[],
    visibilityOverrides: { "layer-tdt": false },
  })
  const sceneModes: Array<"2d" | "3d"> = []
  const scene = {
    sceneMode: "2d" as const,
    setSceneMode(mode: "2d" | "3d") {
      sceneModes.push(mode)
    },
  }
  const appliedBundles: string[] = []
  const layerRegistry = {
    async applyScheme(next: { scheme: { id: string } }) {
      appliedBundles.push(next.scheme.id)
      return []
    },
    async setLayerVisible() {
      return {
        layerId: "unused",
        status: "loaded",
        origin: "scheme",
        canFlyTo: false,
      }
    },
  }
  const controls = useCompareControls({
    mapController: { setSwipeCompare() {} },
    layerRegistry,
    catalog,
    scene,
  })

  controls.viewportWidth = 1024
  await controls.startSplitCompare()

  assert.equal(controls.mode, "split")
  assert.equal(controls.split.leftSchemeId, "scheme-default")
  assert.equal(controls.split.rightSchemeId, "scheme-default")
  assert.deepEqual(appliedBundles, ["scheme-default"])
  assert.equal(sceneModes.at(-1), "3d")
  assert.equal(
    controls.leftBundle?.scheme.layers.find((layer) => layer.id === "layer-terrain")?.visible,
    false,
  )
  assert.equal(
    controls.rightBundle?.scheme.layers.find((layer) => layer.id === "layer-terrain")?.visible,
    true,
  )

  await controls.setSplitLayerVisible("left", "layer-terrain", true)
  await controls.setSplitLayerVisible("right", "layer-terrain", false)

  assert.equal(controls.split.leftVisibility["layer-terrain"], true)
  assert.equal(controls.split.rightVisibility["layer-terrain"], false)
  assert.equal(appliedBundles.length, 2)

  await controls.selectSplitScheme("left", "scheme-alternate")
  await controls.selectSplitScheme("right", "scheme-alternate")

  assert.equal(controls.split.leftSchemeId, "scheme-alternate")
  assert.equal(controls.split.rightSchemeId, "scheme-alternate")
  assert.equal(controls.split.leftVisibility["layer-tileset"], false)
  assert.equal(controls.split.rightVisibility["layer-tileset"], false)
  assert.equal(appliedBundles.at(-1), "scheme-alternate")

  await controls.exitSplitCompare()

  assert.equal(controls.mode, "none")
  assert.equal(appliedBundles.at(-1), "scheme-default")
  assert.equal(sceneModes.at(-1), "2d")
  assert.equal(
    controls.rightBundle?.scheme.layers.find((layer) => layer.id === "layer-tdt")?.visible,
    false,
  )
  assert.equal(catalog.visibilityOverrides["layer-tdt"], false)
})

test("useCompareControls 在屏幕宽度不足时拒绝分屏", async () => {
  const bundle = createSchemeBundle([
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
  ])
  const catalog = reactive({
    activeBundle: bundle,
    catalog: {
      sources: [],
      resources: [],
      layerSchemes: [bundle.scheme],
    },
    temporaryLayers: [] as LayerDefinition[],
    visibilityOverrides: {},
  })
  const controls = useCompareControls({
    mapController: { setSwipeCompare() {} },
    layerRegistry: {
      async applyScheme() {
        return []
      },
      async setLayerVisible() {
        return {
          layerId: "unused",
          status: "loaded",
          origin: "scheme",
          canFlyTo: false,
        }
      },
    },
    catalog,
    scene: { sceneMode: "3d" as const, setSceneMode() {} },
  })

  controls.viewportWidth = 1023
  await controls.startSplitCompare()

  assert.equal(controls.mode, "none")
  assert.equal(controls.error, "屏幕宽度不足")

  controls.viewportWidth = 1024
  await controls.startSplitCompare()
  controls.viewportWidth = 1023
  await Promise.resolve()

  assert.equal(controls.mode, "none")
})

test("useCompareControls 在分屏启动过程中拦截重复启动", async () => {
  const bundle = createSchemeBundle([
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
    createTerrainLayer("layer-terrain", true),
  ])
  let releaseApply: (() => void) | undefined
  const applyGate = new Promise<void>((resolve) => {
    releaseApply = resolve
  })
  const appliedSchemes: string[] = []
  const controls = useCompareControls({
    mapController: { setSwipeCompare() {} },
    layerRegistry: {
      async applyScheme(next: { scheme: { id: string } }) {
        await applyGate
        appliedSchemes.push(next.scheme.id)
      },
      async setLayerVisible() {},
    },
    catalog: reactive({
      activeBundle: bundle,
      catalog: {
        sources: [],
        resources: [],
        layerSchemes: [bundle.scheme],
      },
      temporaryLayers: [] as LayerDefinition[],
      visibilityOverrides: {},
    }),
    scene: { sceneMode: "3d" as const, setSceneMode() {} },
  })

  controls.viewportWidth = 1024
  const firstStart = controls.startSplitCompare()
  const secondStart = controls.startSplitCompare()
  releaseApply?.()
  await Promise.all([firstStart, secondStart])

  assert.equal(controls.mode, "split")
  assert.equal(appliedSchemes.length, 1)
})

test("useCompareControls 在启动期间宽度不足时完成启动后自动退出分屏", async () => {
  const bundle = createSchemeBundle([
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
  ])
  let releaseApply: (() => void) | undefined
  const applyGate = new Promise<void>((resolve) => {
    releaseApply = resolve
  })
  const appliedSchemes: string[] = []
  const controls = useCompareControls({
    mapController: { setSwipeCompare() {} },
    layerRegistry: {
      async applyScheme(next: { scheme: { id: string } }) {
        await applyGate
        appliedSchemes.push(next.scheme.id)
      },
      async setLayerVisible() {},
    },
    catalog: reactive({
      activeBundle: bundle,
      catalog: {
        sources: [],
        resources: [],
        layerSchemes: [bundle.scheme],
      },
      temporaryLayers: [] as LayerDefinition[],
      visibilityOverrides: {},
    }),
    scene: { sceneMode: "3d" as const, setSceneMode() {} },
  })

  controls.viewportWidth = 1024
  const splitStart = controls.startSplitCompare()
  controls.viewportWidth = 1023
  releaseApply?.()
  await splitStart

  assert.equal(controls.mode, "none")
  assert.deepEqual(appliedSchemes, ["scheme-default", "scheme-default"])
})

test("compareUnavailableReason 统一输出比对模式禁用原因", async () => {
  const bundle = createSchemeBundle([
    createImageryLayer("layer-tdt", true),
    createImageryLayer("layer-xyz", false),
  ])
  const createControls = () =>
    useCompareControls({
      mapController: { setSwipeCompare() {} },
      layerRegistry: {
        async applyScheme() {
          return []
        },
        async setLayerVisible() {
          return {
            layerId: "unused",
            status: "loaded",
            origin: "scheme",
            canFlyTo: false,
          }
        },
      },
      catalog: reactive({
        activeBundle: bundle,
        catalog: {
          sources: [],
          resources: [],
          layerSchemes: [bundle.scheme],
        },
        temporaryLayers: [] as LayerDefinition[],
        visibilityOverrides: {},
      }),
      scene: { sceneMode: "3d" as const, setSceneMode() {} },
    })

  const narrowControls = createControls()
  narrowControls.viewportWidth = 1023
  assert.equal(narrowControls.compareUnavailableReason("split"), "屏幕宽度不足")

  const swipeControls = createControls()
  await swipeControls.startSwipeCompare()
  assert.equal(swipeControls.compareUnavailableReason("split"), "请先关闭当前比对模式")
  assert.equal(swipeControls.compareUnavailableReason("drawing"), undefined)

  const splitControls = createControls()
  splitControls.viewportWidth = 1024
  await splitControls.startSplitCompare()
  assert.equal(splitControls.compareUnavailableReason("swipe"), "请先关闭当前比对模式")
  assert.equal(splitControls.compareUnavailableReason("layer-catalog"), undefined)
  assert.equal(splitControls.compareUnavailableReason("scene-switch"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("drawing"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("measurement"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("flight"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("roaming"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("screenshot"), "分屏模式下暂不可用")
  assert.equal(splitControls.compareUnavailableReason("split"), undefined)
})

test("ESC 优先退出当前比对模式", () => {
  const nonEscape = createKeyEvent("Enter")
  assert.equal(handleCompareEscape(nonEscape.event, "swipe", noop, noop), false)
  assert.equal(nonEscape.prevented, false)

  const swipe = createKeyEvent("Escape")
  const split = createKeyEvent("Escape")
  const none = createKeyEvent("Escape")
  let exited: "swipe" | "split" | undefined

  assert.equal(
    handleCompareEscape(
      swipe.event,
      "swipe",
      () => (exited = "swipe"),
      () => (exited = "split"),
    ),
    true,
  )
  assert.equal(swipe.prevented, true)
  assert.equal(exited, "swipe")

  assert.equal(
    handleCompareEscape(
      split.event,
      "split",
      () => (exited = "swipe"),
      () => (exited = "split"),
    ),
    true,
  )
  assert.equal(split.prevented, true)
  assert.equal(exited, "split")

  assert.equal(handleCompareEscape(none.event, "none", noop, noop), false)
  assert.equal(none.prevented, false)
  assert.equal(exited, "split")
})

test("工作区 ESC 优先级在比对模式下高于表单焦点", () => {
  const selectTarget = { tagName: "SELECT" } as unknown as EventTarget
  const buttonTarget = { tagName: "BUTTON" } as unknown as EventTarget

  assert.equal(resolveWorkspaceEscapePriority("swipe", selectTarget), "compare")
  assert.equal(resolveWorkspaceEscapePriority("none", selectTarget), "editable")
  assert.equal(resolveWorkspaceEscapePriority("none", buttonTarget), "standard")
})

test("卷帘拖拽能识别按钮丢失和指针终止事件", () => {
  assert.equal(hasSwipeDividerDragButton({ buttons: 1 }), true)
  assert.equal(hasSwipeDividerDragButton({ buttons: 0 }), false)
  assert.equal(isSwipeDividerDragTermination("pointerup"), true)
  assert.equal(isSwipeDividerDragTermination("pointercancel"), true)
  assert.equal(isSwipeDividerDragTermination("lostpointercapture"), true)
  assert.equal(isSwipeDividerDragTermination("pointermove"), false)
})

test("视角操作包含卷帘比对和分屏联动入口", () => {
  const swipe = viewOperations.find((operation) => operation.id === "view-swipe-compare")
  const split = viewOperations.find((operation) => operation.id === "view-split-compare")

  assert.equal(swipe?.label, "卷帘比对")
  assert.equal(swipe?.kind, "panel")
  assert.equal(split?.label, "分屏联动")
  assert.equal(split?.kind, "panel")
})

test("卷帘分割线位置计算和键盘步进均钳制到合法范围", () => {
  assert.equal(calculateSwipePositionFromClientX(120, 100, 200), 0.1)
  assert.equal(calculateSwipePositionFromClientX(80, 100, 200), 0)
  assert.equal(calculateSwipePositionFromClientX(300, 100, 200), 1)
  assert.ok(Math.abs(stepSwipePosition(0.1, 0.05) - 0.15) < Number.EPSILON)
  assert.equal(stepSwipePosition(0.98, 0.05), 1)
  assert.equal(stepSwipePosition(0.02, -0.05), 0)
})

/** 创建显隐测试所需的最小影像图层定义。 */
function createImageryLayer(id: string, visible: boolean): LayerDefinition {
  return {
    id,
    name: id,
    resourceId: `resource-${id}`,
    type: "imagery",
    visible,
    sortOrder: 10,
    renderOrder: 10,
    style: { opacity: 1 },
  }
}

/** 创建资源范围测试数据。 */
function createResource(
  id: string,
  extent?: { west: number; south: number; east: number; north: number },
) {
  return {
    id,
    name: id,
    enabled: true,
    origin: "inline-geojson",
    kind: "vector",
    ...(extent ? { extent } : {}),
  } as const
}

/** 空回调，用于避免测试触发额外逻辑。 */
function noop() {}

/** 创建 ESC 测试所需的最小键盘事件。 */
function createKeyEvent(key: string) {
  let prevented = false
  return {
    get prevented() {
      return prevented
    },
    event: {
      key,
      preventDefault() {
        prevented = true
      },
    },
  }
}

/** 创建显隐测试所需的最小矢量图层定义。 */
function createVectorLayer(id: string, visible: boolean): LayerDefinition {
  return {
    id,
    name: id,
    resourceId: `resource-${id}`,
    type: "vector",
    visible,
    sortOrder: 10,
    renderOrder: 10,
    style: {},
  }
}

/** 创建显隐测试所需的最小地形图层定义。 */
function createTerrainLayer(id: string, visible: boolean): LayerDefinition {
  return {
    id,
    name: id,
    resourceId: `resource-${id}`,
    type: "terrain",
    visible,
    sortOrder: 10,
    renderOrder: 10,
    style: {},
  }
}

/** 创建显隐测试所需的最小 3D Tiles 图层定义。 */
function createTilesetLayer(id: string, visible: boolean): LayerDefinition {
  return {
    id,
    name: id,
    resourceId: `resource-${id}`,
    type: "tileset",
    visible,
    sortOrder: 10,
    renderOrder: 10,
    style: { opacity: 1 },
  }
}

/** 创建比较控制测试所需的图层方案包。 */
function createSchemeBundle(layers: readonly LayerDefinition[]): LayerSchemeBundle {
  return {
    scheme: {
      id: "scheme-default",
      name: "默认方案",
      sortOrder: 10,
      status: "enabled",
      defaultActive: true,
      groups: [],
      layers,
    },
    resources: [],
    sources: [],
  }
}
