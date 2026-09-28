<script setup lang="ts">
/**
 * 图层失败提示（薄壳）。
 *
 * 迁移前自己 `position: fixed` 到 `top: 68px / right: 76px`，用一个 `dismissedKey` 记住
 * 「这组失败图层已经被关掉了，别再弹」，另有一个 6 秒定时器。这两件事现在都由全局队列承担：
 * id 编码了失败的图层名集合，`rememberDismiss` 负责关闭后不再重现，时长交给队列计时。
 *
 * 本组件只负责在图层快照变化时把当前失败集合推进队列；失败集合变化时不主动顶掉上一条，
 * 新旧两条按各自时长并存到期，用户不会还没读完就被替换。
 */
import { onBeforeUnmount, onMounted } from "vue"
import { useCatalogStore } from "../catalog/store"
import { useToast } from "../../components/base/useToast"
import { useLayerRegistry } from "./useLayerRegistry"
import type { LayerSnapshot } from "./types"

/** 失败提示的停留时长：比操作反馈长一点，够读完图层名列表，又不至于长时间压住地图。 */
const DURATION = 4000

const layerCatalog = useCatalogStore()
const layerRegistry = useLayerRegistry()
const toast = useToast()

let disposeSnapshots: (() => void) | undefined
let lastKey = ""

onMounted(() => {
  disposeSnapshots = layerRegistry.onLayerSnapshotsChange(syncFailedLayers)
})

onBeforeUnmount(() => {
  disposeSnapshots?.()
  disposeSnapshots = undefined
})

/** 读取失败图层名称。 */
function getLayerName(layerId: string) {
  const layer =
    layerCatalog.activeScheme?.layers.find((item) => item.id === layerId) ??
    layerCatalog.temporaryLayers.find((item) => item.id === layerId)

  return layer?.name ?? "未命名"
}

/** 同步失败图层提示。 */
function syncFailedLayers(snapshots: readonly LayerSnapshot[]) {
  const names = snapshots
    .filter((snapshot) => snapshot.status === "error")
    .map((snapshot) => getLayerName(snapshot.layerId))

  if (names.length === 0) {
    if (lastKey) toast.dismiss(lastKey)
    lastKey = ""
    return
  }

  const key = `layer-error:${names.join("|")}`
  // 同一组失败图层重复上报时短路，避免无关的快照变化反复刷新这条的计时。
  if (key === lastKey) return

  lastKey = key

  toast.show({
    id: key,
    tone: "error",
    title: "部分图层加载失败",
    message: `失败图层：${names.join("、")}。请联系管理员检查上游服务或资源。`,
    duration: DURATION,
    rememberDismiss: true,
  })
}
</script>

<template>
  <!-- 提示条本身由 ToastProvider 渲染，本组件不产出 DOM。 -->
</template>
