import type * as Cesium from "cesium"
import { findCesiumImagerySource, type CesiumImagerySource } from "./imagerySources"

/**
 * 在 Viewer 上记录当前已应用的基底图层集合。
 * 使用 WeakMap 避免与 Viewer 生命周期耦合（Viewer 销毁时自动释放）。
 */
const viewerBaseLayers = new WeakMap<Cesium.Viewer, Cesium.ImageryLayer[]>()

/**
 * 应用指定图源到 Viewer：移除已有基底图层，按图源工厂创建新图层并插入到最底层。
 *
 * 该函数是幂等的：在基底图层已替换为目标图源时不会重复重建。
 *
 * @returns 是否实际发生替换（false 表示目标 id 与当前一致或无效）。
 */
export function applyCesiumImagerySource(viewer: Cesium.Viewer, sourceId: string): boolean {
  const source = findCesiumImagerySource(sourceId)

  if (!source) {
    console.warn(`[Cesium] 未知图源 id: ${sourceId}`)
    return false
  }

  const current = viewerBaseLayers.get(viewer) ?? []
  const currentId = (
    current[0] as (Cesium.ImageryLayer & { __baseImagerySourceId?: string }) | undefined
  )?.__baseImagerySourceId

  if (currentId === source.id) {
    return false
  }

  // 移除旧基底图层（销毁以释放 GPU 资源）
  for (const layer of current) {
    viewer.imageryLayers.remove(layer, true)
  }

  // 构造新基底图层。Cesium 的 `add` 会将图层追加到最高层；
  // 为保持基底位于最下层，传入 index = 0。
  const nextLayers = tagLayersWithSource(source)
  const collection = viewer.imageryLayers

  for (let i = 0; i < nextLayers.length; i += 1) {
    collection.add(nextLayers[i], 0)
  }

  viewerBaseLayers.set(viewer, nextLayers)
  return true
}

/** 获取 Viewer 上当前应用的图源 id；无记录时返回 undefined。 */
export function getCurrentCesiumImagerySourceId(viewer: Cesium.Viewer): string | undefined {
  const current = viewerBaseLayers.get(viewer)
  const first = current?.[0] as
    | (Cesium.ImageryLayer & { __baseImagerySourceId?: string })
    | undefined

  return first?.__baseImagerySourceId
}

/**
 * 在 Viewer 上注册初始基底图层（仅由 createViewer 调用一次）。
 * 后续切换走 `applyCesiumImagerySource`。
 */
export function registerInitialBaseLayers(
  viewer: Cesium.Viewer,
  source: CesiumImagerySource,
): void {
  if (viewerBaseLayers.has(viewer)) return

  const layers = tagLayersWithSource(source)
  viewerBaseLayers.set(viewer, layers)
}

/** 在图层实例上挂一个内部标记，记录其归属图源 id。 */
function tagLayersWithSource(source: CesiumImagerySource): Cesium.ImageryLayer[] {
  return source.createLayers().map((layer) => {
    ;(layer as Cesium.ImageryLayer & { __baseImagerySourceId?: string }).__baseImagerySourceId =
      source.id
    return layer
  })
}
