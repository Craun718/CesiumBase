import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { SceneMode, ViewportState } from "../src/map/types.js"
import { createSplitViewportSynchronizer } from "../src/components/dashboard/composables/splitViewportSync.js"

test("分屏切换保持右侧主视口常驻，只挂载或卸载左侧视口", () => {
  const mapStageSource = readFileSync("src/components/dashboard/MapStage.vue", "utf8")
  const splitStageSource = readFileSync("src/components/dashboard/SplitCompareStage.vue", "utf8")

  assert.match(mapStageSource, /<SplitCompareStage/)
  assert.match(mapStageSource, /:active="splitCompareActive"/)
  assert.doesNotMatch(mapStageSource, /v-if="splitCompareActive"/)
  assert.doesNotMatch(mapStageSource, /<MapViewport/)

  assert.match(splitStageSource, /<section\s+v-if="active"\s+class="split-pane left-pane"/)
  assert.match(splitStageSource, /<section\s+ref="rightPane"\s+class="split-pane right-pane"/)
  assert.match(
    splitStageSource,
    /<MapViewport\s+:controller="leftController"\s+rendering-profile="secondary"/,
  )
  assert.match(
    splitStageSource,
    /\.split-compare-stage\.active\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s+1px\s+minmax\(0, 1fr\)/,
  )
  assert.match(
    splitStageSource,
    /\.split-compare-stage\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  )
})

test("分屏相机同步等待左右视口都就绪后应用右侧当前状态", () => {
  const currentRightState = createViewportState(109.3, 23.8, 4_500, 32)
  const left = createSyncController()
  const right = createSyncController(currentRightState)

  const synchronizer = createSplitViewportSynchronizer({
    leftController: left.controller,
    rightController: right.controller,
    isCameraSyncEnabled: () => true,
  })

  left.setReady(true)
  right.notifyViewportState(currentRightState)
  assert.deepEqual(left.sceneModeCalls, [{ mode: "2d", options: { immediate: true } }])
  assert.deepEqual(left.appliedStates, [])

  right.setReady(true)
  assert.deepEqual(left.appliedStates, [currentRightState])

  right.notifyViewportState(currentRightState)
  assert.equal(left.appliedStates.length, 1)

  synchronizer.dispose()
})

test("分屏相机同步关闭时不写左侧，重新开启后可手动触发同步", () => {
  const currentRightState = createViewportState(109.6, 24.1, 8_000, 75)
  const left = createSyncController()
  const right = createSyncController(currentRightState)
  let enabled = false
  const synchronizer = createSplitViewportSynchronizer({
    leftController: left.controller,
    rightController: right.controller,
    isCameraSyncEnabled: () => enabled,
  })

  left.setReady(true)
  right.setReady(true)
  assert.deepEqual(left.appliedStates, [])

  enabled = true
  synchronizer.sync()
  assert.deepEqual(left.appliedStates, [currentRightState])

  synchronizer.dispose()
})

test("分屏相机同步在左侧视口重建后重放相同的右侧状态", () => {
  const currentRightState = createViewportState(109.4, 23.9, 6_000, 18)
  const left = createSyncController()
  const right = createSyncController(currentRightState)
  const synchronizer = createSplitViewportSynchronizer({
    leftController: left.controller,
    rightController: right.controller,
    isCameraSyncEnabled: () => true,
  })

  left.setReady(true)
  right.setReady(true)
  left.setReady(false)
  left.setReady(true)

  assert.deepEqual(left.sceneModeCalls, [
    { mode: "2d", options: { immediate: true } },
    { mode: "2d", options: { immediate: true } },
  ])
  assert.deepEqual(left.appliedStates, [currentRightState, currentRightState])

  synchronizer.dispose()
})

interface SyncController {
  readonly controller: {
    onMountStateChange(listener: (ready: boolean) => void): () => void
    onViewportStateChange(listener: (state: ViewportState) => void): () => void
    getViewportState(): ViewportState
    setViewportState(state: ViewportState): void
    setSceneMode(mode: SceneMode, options?: { immediate?: boolean }): void
  }
}

interface MutableSyncController extends SyncController {
  readonly sceneModeCalls: { mode: SceneMode; options?: { immediate?: boolean } }[]
  readonly appliedStates: ViewportState[]
  setReady(ready: boolean): void
  notifyViewportState(state: ViewportState): void
}

/** 创建可手动驱动挂载与相机事件的分屏控制器桩。 */
function createSyncController(state?: ViewportState): MutableSyncController {
  let currentState = state ?? createViewportState(0, 0, 1, 0)
  const mountListeners = new Set<(ready: boolean) => void>()
  const viewportListeners = new Set<(state: ViewportState) => void>()
  const sceneModeCalls: { mode: SceneMode; options?: { immediate?: boolean } }[] = []
  const appliedStates: ViewportState[] = []
  const controller = {
    onMountStateChange(listener: (ready: boolean) => void) {
      mountListeners.add(listener)
      return () => mountListeners.delete(listener)
    },
    onViewportStateChange(listener: (state: ViewportState) => void) {
      viewportListeners.add(listener)
      return () => viewportListeners.delete(listener)
    },
    getViewportState() {
      return currentState
    },
    setViewportState(next: ViewportState) {
      currentState = next
      appliedStates.push(next)
    },
    setSceneMode(mode: SceneMode, options?: { immediate?: boolean }) {
      sceneModeCalls.push({ mode, options })
    },
  }

  return {
    controller,
    sceneModeCalls,
    appliedStates,
    setReady(ready: boolean) {
      for (const listener of mountListeners) listener(ready)
    },
    notifyViewportState(next: ViewportState) {
      currentState = next
      for (const listener of viewportListeners) listener(next)
    },
  }
}

/** 创建分屏相机测试状态。 */
function createViewportState(
  longitude: number,
  latitude: number,
  distanceMeters: number,
  heading: number,
): ViewportState {
  return { longitude, latitude, distanceMeters, heading }
}
