import type { SceneMode, SceneModeTransitionOptions, ViewportState } from "../../../map/types"

interface SplitViewportController {
  onMountStateChange(listener: (ready: boolean) => void): () => void
  onViewportStateChange(listener: (state: ViewportState) => void): () => void
  getViewportState(): ViewportState
  setViewportState(state: ViewportState): void
  setSceneMode(mode: SceneMode, options?: SceneModeTransitionOptions): void
}

interface SplitViewportSynchronizerOptions {
  readonly leftController: SplitViewportController
  readonly rightController: SplitViewportController
  readonly isCameraSyncEnabled: () => boolean
}

interface SplitViewportSynchronizer {
  sync(): void
  dispose(): void
}

/** 创建 2D/3D 分屏相机同步器，只有两侧引擎都就绪后才允许写入左侧视口。 */
export function createSplitViewportSynchronizer({
  leftController,
  rightController,
  isCameraSyncEnabled,
}: SplitViewportSynchronizerOptions): SplitViewportSynchronizer {
  let leftReady = false
  let rightReady = false
  let lastSyncedStateKey: string | undefined

  const disposeLeftMountState = leftController.onMountStateChange((ready) => {
    leftReady = ready
    if (!ready) {
      lastSyncedStateKey = undefined
      return
    }

    leftController.setSceneMode("2d", { immediate: true })
    sync()
  })
  const disposeRightMountState = rightController.onMountStateChange((ready) => {
    rightReady = ready
    if (!ready) {
      lastSyncedStateKey = undefined
      return
    }

    sync()
  })
  const disposeRightViewportState = rightController.onViewportStateChange(() => {
    sync()
  })

  /** 将右侧当前视口状态写入左侧；重复状态用于避免持续回调抖动。 */
  function sync() {
    if (!leftReady || !rightReady || !isCameraSyncEnabled()) return

    const state = rightController.getViewportState()
    const stateKey = JSON.stringify(state)
    if (stateKey === lastSyncedStateKey) return

    lastSyncedStateKey = stateKey
    leftController.setViewportState(state)
  }

  /** 释放两侧控制器监听并复位同步状态。 */
  function dispose() {
    disposeRightViewportState()
    disposeRightMountState()
    disposeLeftMountState()
    leftReady = false
    rightReady = false
    lastSyncedStateKey = undefined
  }

  return { sync, dispose }
}
