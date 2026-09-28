import type { LayerDefinition } from "../../../features/catalog/model/types"
import type { GeoExtent } from "../../../features/catalog/model/types"
import type { LayerSchemeBundle } from "../../../features/layers/types"
import type { MapBounds } from "../../../map/types"

/** 图层显隐表，键为图层 ID，值为当前是否显示。 */
export type LayerVisibilityMap = Record<string, boolean>

/** 可参与卷帘范围计算的目录资源最小结构。 */
interface SwipeExtentResource {
  readonly id: string
  readonly extent?: GeoExtent
}

/** 卷帘影像选择侧。 */
export type SwipeLayerSide = "left" | "right"

/** 受比对模式影响的功能类别。 */
export type CompareLimitedFeature =
  | "swipe"
  | "split"
  | "drawing"
  | "measurement"
  | "flight"
  | "roaming"
  | "scene-switch"
  | "layer-catalog"
  | "screenshot"

/**
 * 捕获图层当前有效显隐状态，会话覆盖值优先于方案默认值。
 *
 * @param layers 图层定义集合
 * @param overrides 会话中的显隐覆盖值
 */
export function captureLayerVisibility(
  layers: readonly LayerDefinition[],
  overrides: Readonly<Record<string, boolean>> = {},
): LayerVisibilityMap {
  return Object.fromEntries(layers.map((layer) => [layer.id, overrides[layer.id] ?? layer.visible]))
}

/**
 * 构建卷帘焦点模式的显隐集合，仅显示左右影像并保留地形进入前状态。
 *
 * @param layers 图层定义集合
 * @param selectedIds 左右选中的影像图层 ID
 * @param currentVisibility 进入卷帘前的图层显隐集合
 */
export function buildSwipeFocusVisibility(
  layers: readonly LayerDefinition[],
  selectedIds: readonly string[],
  currentVisibility: Readonly<LayerVisibilityMap>,
  baseLayerId?: string,
): LayerVisibilityMap {
  const selected = new Set(selectedIds)

  return Object.fromEntries(
    layers.map((layer) => {
      if (selected.has(layer.id)) return [layer.id, true]
      if (layer.id === baseLayerId) return [layer.id, true]
      if (layer.type === "terrain") return [layer.id, currentVisibility[layer.id] ?? layer.visible]
      return [layer.id, false]
    }),
  )
}

/**
 * 解析卷帘共同底图；优先选择能明显覆盖比对焦点的大范围影像。
 *
 * @param layers 图层定义集合
 * @param selectedIds 左右选中的影像图层 ID
 * @param resources 目录资源集合，用于读取影像覆盖范围
 * @returns 可作为双侧兜底的影像图层 ID
 */
export function resolveSwipeBaseLayerId(
  layers: readonly LayerDefinition[],
  selectedIds: readonly string[],
  resources: readonly SwipeExtentResource[],
): string | undefined {
  const focusBounds = resolveSwipeFocusBounds(layers, selectedIds, resources)
  if (!focusBounds) return undefined

  const resourceById = new Map(resources.map((resource) => [resource.id, resource]))
  const selected = new Set(selectedIds)
  const candidates: Array<{ layer: LayerDefinition; extent: GeoExtent }> = []
  for (const layer of layers) {
    if (layer.type !== "imagery") continue

    const extent = resourceById.get(layer.resourceId)?.extent
    if (extent && extentCovers(extent, focusBounds)) candidates.push({ layer, extent })
  }

  candidates
    .filter((item) => calculateExtentArea(item.extent) > calculateExtentArea(focusBounds) * 1.2)
    .sort((left, right) => {
      const selectedDelta =
        Number(selected.has(right.layer.id)) - Number(selected.has(left.layer.id))
      if (selectedDelta !== 0) return selectedDelta
      return calculateExtentArea(left.extent) - calculateExtentArea(right.extent)
    })

  return candidates[0]?.layer.id
}

/**
 * 解析卷帘比对焦点范围；相交时取交集，不相交时取较小图层范围。
 *
 * @param layers 图层定义集合
 * @param selectedIds 左右选中的影像图层 ID
 * @param resources 目录资源集合，用于读取影像覆盖范围
 * @returns 可用于相机定位的经纬度范围
 */
export function resolveSwipeFocusBounds(
  layers: readonly LayerDefinition[],
  selectedIds: readonly string[],
  resources: readonly SwipeExtentResource[],
): MapBounds | undefined {
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]))
  const extents = selectedIds
    .map((layerId) => layers.find((layer) => layer.id === layerId))
    .map((layer) => (layer ? resourceById.get(layer.resourceId)?.extent : undefined))
    .filter((extent): extent is GeoExtent => Boolean(extent))

  const [first, second] = extents
  if (first && second) {
    const west = Math.max(first.west, second.west)
    const south = Math.max(first.south, second.south)
    const east = Math.min(first.east, second.east)
    const north = Math.min(first.north, second.north)
    if (west <= east && south <= north) return { west, south, east, north }

    return calculateExtentArea(first) <= calculateExtentArea(second) ? first : second
  }

  return first
}

/** 判断外层范围是否完整覆盖内层范围。 */
function extentCovers(outer: GeoExtent, inner: MapBounds): boolean {
  return (
    outer.west <= inner.west &&
    outer.south <= inner.south &&
    outer.east >= inner.east &&
    outer.north >= inner.north
  )
}

/** 计算经纬度范围的近似面积，仅用于候选排序。 */
function calculateExtentArea(extent: GeoExtent | MapBounds): number {
  return Math.max(0, extent.east - extent.west) * Math.max(0, extent.north - extent.south)
}

/**
 * 构建分屏某一侧的默认显隐集合；左侧隐藏地形、3D Tiles 和模型。
 *
 * @param layers 图层定义集合
 * @param side 分屏视口侧
 */
export function createSplitLayerVisibility(
  layers: readonly LayerDefinition[],
  side: SwipeLayerSide,
): LayerVisibilityMap {
  return Object.fromEntries(
    layers.map((layer) => [
      layer.id,
      side === "right" ||
      (layer.type !== "terrain" && layer.type !== "tileset" && layer.type !== "model")
        ? layer.visible
        : false,
    ]),
  )
}

/**
 * 按视口显隐集合生成独立方案包，不修改原始方案定义。
 *
 * @param bundle 目录构建出的方案资源闭包
 * @param visibility 某一侧视口的图层显隐集合
 */
export function createSplitSchemeBundle(
  bundle: LayerSchemeBundle,
  visibility: Readonly<LayerVisibilityMap>,
): LayerSchemeBundle {
  return {
    ...bundle,
    scheme: {
      ...bundle.scheme,
      layers: bundle.scheme.layers.map((layer) => ({
        ...layer,
        visible: visibility[layer.id] ?? layer.visible,
      })),
    },
  }
}

/**
 * 选择卷帘影像；选择对侧已选影像时自动交换左右内容。
 *
 * @param leftLayerId 当前左侧影像图层 ID
 * @param rightLayerId 当前右侧影像图层 ID
 * @param side 本次选择发生的侧
 * @param nextLayerId 新选中的影像图层 ID
 */
export function selectSwipeLayer(
  leftLayerId: string,
  rightLayerId: string,
  side: SwipeLayerSide,
  nextLayerId: string,
): { leftLayerId: string; rightLayerId: string } {
  if (side === "left" && nextLayerId === rightLayerId) {
    return { leftLayerId: rightLayerId, rightLayerId: leftLayerId }
  }

  if (side === "right" && nextLayerId === leftLayerId) {
    return { leftLayerId: rightLayerId, rightLayerId: leftLayerId }
  }

  return side === "left"
    ? { leftLayerId: nextLayerId, rightLayerId }
    : { leftLayerId, rightLayerId: nextLayerId }
}

/**
 * 根据指针在地图舞台内的横向位置计算归一化卷帘分割位置。
 *
 * @param clientX 指针客户端横坐标
 * @param stageLeft 地图舞台左边距
 * @param stageWidth 地图舞台宽度
 */
export function calculateSwipePositionFromClientX(
  clientX: number,
  stageLeft: number,
  stageWidth: number,
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(stageLeft) || stageWidth <= 0) return 0.5

  return Math.min(1, Math.max(0, (clientX - stageLeft) / stageWidth))
}

/**
 * 统一计算比对模式下的功能禁用原因。
 *
 * @param mode 当前比对模式
 * @param feature 需要判断的功能类别
 * @param splitAvailable 当前是否满足分屏最小宽度
 */
export function resolveCompareUnavailableReason(
  mode: "none" | "swipe" | "split",
  feature: CompareLimitedFeature,
  splitAvailable: boolean,
): string | undefined {
  if (mode === "none") {
    return feature === "split" && !splitAvailable ? "屏幕宽度不足" : undefined
  }

  if (feature === "swipe" || feature === "split") {
    return mode !== feature ? "请先关闭当前比对模式" : undefined
  }

  // 分屏需要图层树定位比对数据；卷帘左右图层由比对面板统一管理。
  if (feature === "layer-catalog") {
    return mode === "swipe" ? "卷帘模式下暂不可用" : undefined
  }

  return mode === "split" ? "分屏模式下暂不可用" : undefined
}

/**
 * 处理 ESC 快捷键退出当前比对模式的逻辑。
 *
 * @param event 键盘事件
 * @param mode 当前比对模式
 * @param exitSwipe 退出卷帘比对的回调
 * @param exitSplit 退出分屏联动的回调
 * @returns 是否已消费当前 ESC 事件
 */
export function handleCompareEscape(
  event: Pick<KeyboardEvent, "key" | "preventDefault">,
  mode: "none" | "swipe" | "split",
  exitSwipe: () => void,
  exitSplit: () => void,
): boolean {
  if (event.key !== "Escape" || mode === "none") return false

  event.preventDefault()
  if (mode === "swipe") exitSwipe()
  else exitSplit()
  return true
}

/** 工作区 ESC 的处理优先级。 */
export type WorkspaceEscapePriority = "compare" | "editable" | "standard"

/**
 * 解析工作区 ESC 优先级；比对模式优先于表单焦点。
 *
 * @param mode 当前比对模式
 * @param target 键盘事件目标
 */
export function resolveWorkspaceEscapePriority(
  mode: "none" | "swipe" | "split",
  target: EventTarget | null,
): WorkspaceEscapePriority {
  if (mode !== "none") return "compare"

  if (target && typeof target === "object") {
    const editableTarget = target as {
      readonly isContentEditable?: unknown
      readonly tagName?: unknown
    }
    if (
      editableTarget.isContentEditable === true ||
      editableTarget.tagName === "INPUT" ||
      editableTarget.tagName === "TEXTAREA" ||
      editableTarget.tagName === "SELECT"
    ) {
      return "editable"
    }
  }

  return "standard"
}

/**
 * 判断卷帘拖拽是否仍持有有效指针按钮。
 *
 * @param event 当前指针事件
 */
export function hasSwipeDividerDragButton(event: Pick<PointerEvent, "buttons">): boolean {
  return event.buttons !== 0
}

/**
 * 判断事件类型是否会终止卷帘分割线拖拽。
 *
 * @param eventType 指针事件类型
 */
export function isSwipeDividerDragTermination(eventType: string): boolean {
  return (
    eventType === "pointerup" || eventType === "pointercancel" || eventType === "lostpointercapture"
  )
}

/**
 * 键盘微调卷帘分割位置。
 *
 * @param position 当前归一化位置
 * @param delta 步进增量，正值向右、负值向左
 */
export function stepSwipePosition(position: number, delta: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(delta)) return 0.5

  return Math.min(1, Math.max(0, position + delta))
}

/**
 * 创建卷帘分割位置调度器，将同一动画帧内的多次指针移动合并为一次提交。
 *
 * @param applyPosition 提交最终分割位置的回调
 * @param requestFrame 请求动画帧的方法
 * @param cancelFrame 取消动画帧的方法
 */
export function createSwipePositionScheduler(
  applyPosition: (position: number) => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (frameId: number) => void,
) {
  let frameId: number | undefined
  let pendingPosition: number | undefined

  return {
    /** 调度一次分割位置更新，同一帧内只保留最后一次位置。 */
    schedule(position: number) {
      pendingPosition = position
      if (frameId !== undefined) return

      frameId = requestFrame(() => {
        frameId = undefined
        if (pendingPosition === undefined) return

        const positionToApply = pendingPosition
        pendingPosition = undefined
        applyPosition(positionToApply)
      })
    },
    /** 取消尚未提交的分割位置更新。 */
    cancel() {
      if (frameId === undefined) return

      cancelFrame(frameId)
      frameId = undefined
      pendingPosition = undefined
    },
  }
}
