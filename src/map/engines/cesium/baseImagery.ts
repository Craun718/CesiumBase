import type * as Cesium from "cesium"
import {
  CUSTOM_IMAGERY_SOURCE_ID,
  createCustomCesiumImagerySource,
  findCesiumImagerySource,
  type CesiumImagerySource,
} from "./imagerySources"

/**
 * 基底图层当前状态。
 * 使用 WeakMap 避免与 Viewer 生命周期耦合（Viewer 销毁时自动释放）。
 */
interface ViewerBaseState {
  layers: Cesium.ImageryLayer[]
  sourceId: string
  /** 仅自定义 URL 图源存在；用于区分不同 URL 的自定义图源。 */
  customUrl?: string
}

const viewerBaseStates = new WeakMap<Cesium.Viewer, ViewerBaseState>()

/**
 * 应用指定预置图源到 Viewer：移除已有基底图层，按图源工厂创建新图层并插入到最底层。
 *
 * @returns 是否实际发生替换（false 表示目标 id 与当前一致或无效）。
 */
export function applyCesiumImagerySource(viewer: Cesium.Viewer, sourceId: string): boolean {
  const source = findCesiumImagerySource(sourceId)

  if (!source) {
    console.warn(`[Cesium] 未知图源 id: ${sourceId}`)
    return false
  }

  return applyCesiumSourceToViewer(viewer, source)
}

/**
 * 应用自定义瓦片 URL 图源到 Viewer。
 *
 * @returns 是否实际发生替换（false 表示 URL 为空或与当前自定义图源一致）。
 */
export function applyCesiumCustomUrlSource(viewer: Cesium.Viewer, url: string): boolean {
  const trimmedUrl = url.trim()

  if (!trimmedUrl) {
    return false
  }

  return applyCesiumSourceToViewer(viewer, createCustomCesiumImagerySource(trimmedUrl), trimmedUrl)
}

/** 获取 Viewer 上当前应用的图源 id；无记录时返回 undefined。 */
export function getCurrentCesiumImagerySourceId(viewer: Cesium.Viewer): string | undefined {
  return viewerBaseStates.get(viewer)?.sourceId
}

/** 获取 Viewer 上当前自定义图源的 URL；非自定义图源或未记录时返回 undefined。 */
export function getCurrentCesiumCustomUrl(viewer: Cesium.Viewer): string | undefined {
  return viewerBaseStates.get(viewer)?.customUrl
}

/**
 * 在 Viewer 上注册初始基底图层（仅由 createViewer 调用一次）。
 * 后续切换走 `applyCesiumImagerySource` / `applyCesiumCustomUrlSource`。
 */
export function registerInitialBaseLayers(
  viewer: Cesium.Viewer,
  source: CesiumImagerySource,
  layers: Cesium.ImageryLayer[],
): void {
  if (viewerBaseStates.has(viewer)) return

  for (const layer of layers) {
    ;(layer as Cesium.ImageryLayer & { __baseImagerySourceId?: string }).__baseImagerySourceId =
      source.id
  }

  viewerBaseStates.set(viewer, { layers, sourceId: source.id })
}

/** 在新建图层实例上挂一个内部标记，记录其归属图源 id。 */
function tagLayersWithSource(source: CesiumImagerySource): Cesium.ImageryLayer[] {
  return source.createLayers().map((layer) => {
    ;(layer as Cesium.ImageryLayer & { __baseImagerySourceId?: string }).__baseImagerySourceId =
      source.id
    return layer
  })
}

/** 把某个图源应用到 Viewer（移除旧基底，插入新基底到最底层）。 */
function applyCesiumSourceToViewer(
  viewer: Cesium.Viewer,
  source: CesiumImagerySource,
  customUrl?: string,
): boolean {
  const current = viewerBaseStates.get(viewer)

  // 目标是同一个图源（预置图源按 id、自定义图源按 id + URL）时视为已应用。
  if (current && current.sourceId === source.id && current.customUrl === customUrl) {
    return false
  }

  // 移除旧基底图层（销毁以释放 GPU 资源）
  for (const layer of current?.layers ?? []) {
    viewer.imageryLayers.remove(layer, true)
  }

  // 构造新基底图层。逆序插入 index = 0，既保持基底组在最下层，
  // 也保持“底图在前、注记在后”的组内顺序。
  const nextLayers = tagLayersWithSource(source)
  const collection = viewer.imageryLayers

  for (let i = nextLayers.length - 1; i >= 0; i -= 1) {
    collection.add(nextLayers[i], 0)
  }

  viewerBaseStates.set(viewer, {
    layers: nextLayers,
    sourceId: source.id,
    ...(customUrl === undefined ? {} : { customUrl }),
  })
  return true
}

export { CUSTOM_IMAGERY_SOURCE_ID }
