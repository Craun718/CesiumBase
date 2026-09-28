import type {
  LayerDefinition,
  LayerSchemeDefinition,
  LayerSnapshot,
  LayerStatus,
  ResourceDefinition,
} from "./types"

export interface LayerTreeGroupNode {
  readonly nodeType: "group"
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly defaultExpanded: boolean
  readonly disabled: boolean
  readonly children: readonly LayerTreeNode[]
}

export interface LayerTreeLayerNode {
  readonly nodeType: "layer"
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly layer: LayerDefinition
  readonly resource?: ResourceDefinition
  readonly resourceName?: string
  readonly visible: boolean
  readonly status: LayerStatus
  readonly errorMessage?: string
  readonly canFlyTo: boolean
  readonly temporary: boolean
}

export type LayerTreeNode = LayerTreeGroupNode | LayerTreeLayerNode

export interface BuildLayerTreeInput {
  readonly scheme?: LayerSchemeDefinition
  readonly resources: readonly ResourceDefinition[]
  readonly temporaryLayers: readonly LayerDefinition[]
  readonly visibilityOverrides: Readonly<Record<string, boolean>>
  readonly snapshots?: readonly LayerSnapshot[]
}

interface MutableGroupNode extends Omit<LayerTreeGroupNode, "children"> {
  children: LayerTreeNode[]
}

const UNGROUPED_ID = "__layer-tree-ungrouped"
const TEMPORARY_ID = "__layer-tree-temporary"

/** 将当前方案、临时图层和运行时快照整理为地图端图层树。 */
export function buildLayerTree(input: BuildLayerTreeInput): readonly LayerTreeNode[] {
  const resourceMap = new Map(input.resources.map((resource) => [resource.id, resource]))
  const snapshotMap = new Map(
    (input.snapshots ?? []).map((snapshot) => [snapshot.layerId, snapshot]),
  )
  const rootChildren: LayerTreeNode[] = []
  const groupMap = new Map<string, MutableGroupNode>()

  for (const group of sortTreeItems(input.scheme?.groups ?? [])) {
    groupMap.set(group.id, {
      nodeType: "group",
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      defaultExpanded: group.defaultExpanded,
      disabled: group.status === "disabled",
      children: [],
    })
  }

  const schemeGroups = [...groupMap.values()]
  for (const group of schemeGroups) {
    const definition = input.scheme?.groups.find((item) => item.id === group.id)
    const parent = definition?.parentId ? groupMap.get(definition.parentId) : undefined
    if (parent && parent.id !== group.id) parent.children.push(group)
    else rootChildren.push(group)
  }

  const ungrouped = createRootGroup(UNGROUPED_ID, "未分组", 900000)
  for (const layer of sortTreeItems(input.scheme?.layers ?? [])) {
    const group = layer.groupId ? groupMap.get(layer.groupId) : undefined
    const target = group ?? ungrouped
    target.children.push(
      createLayerNode(layer, resourceMap, input.visibilityOverrides, snapshotMap, false),
    )
  }
  if (ungrouped.children.length > 0) rootChildren.push(ungrouped)

  const temporary = createRootGroup(TEMPORARY_ID, "临时图层", 910000)
  for (const layer of sortTreeItems(input.temporaryLayers)) {
    temporary.children.push(
      createLayerNode(layer, resourceMap, input.visibilityOverrides, snapshotMap, true),
    )
  }
  if (temporary.children.length > 0) rootChildren.push(temporary)

  // 根级排序把「未分组」「临时图层」两个合成分组（900000 / 910000）定位到方案分组之后。
  // 各层 children 不在这里补排序：分组的遍历顺序本就是全局 (sortOrder, name) 有序的，
  // 组内又是先 push 子分组、再 push 图层，因此每个 children 天然是「先子分组、后图层」。
  // 若改成全局按 sortOrder 排，同组内 sortOrder 很小的图层会被顶到子分组前面，
  // 破坏 LayerTreeBranch 两段式渲染依赖的不变量（由 tests/layerTree.test.ts 守住）。
  return sortTreeItems(rootChildren)
}

/** 搜索时保留命中图层的父级分组；分组命中时保留整个子树。 */
export function filterLayerTree(
  nodes: readonly LayerTreeNode[],
  keyword: string,
): readonly LayerTreeNode[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return nodes

  const result: LayerTreeNode[] = []
  for (const node of nodes) {
    if (node.nodeType === "layer") {
      const matched =
        node.name.toLowerCase().includes(query) ||
        (node.resourceName?.toLowerCase().includes(query) ?? false)
      if (matched) result.push(node)
      continue
    }

    if (node.name.toLowerCase().includes(query)) {
      result.push(node)
      continue
    }

    const children = filterLayerTree(node.children, query)
    if (children.length > 0) result.push({ ...node, children })
  }

  return result
}

/** 创建地图树专用根分组。 */
function createRootGroup(id: string, name: string, sortOrder: number): MutableGroupNode {
  return {
    nodeType: "group",
    id,
    name,
    sortOrder,
    defaultExpanded: true,
    disabled: false,
    children: [],
  }
}

/** 创建带有效显隐和运行状态的图层节点。 */
function createLayerNode(
  layer: LayerDefinition,
  resourceMap: ReadonlyMap<string, ResourceDefinition>,
  overrides: Readonly<Record<string, boolean>>,
  snapshots: ReadonlyMap<string, LayerSnapshot>,
  temporary: boolean,
): LayerTreeLayerNode {
  const resource = resourceMap.get(layer.resourceId)
  const snapshot = snapshots.get(layer.id)
  const resourceDisabled = resource !== undefined && !resource.enabled
  const status: LayerStatus = resourceDisabled ? "error" : (snapshot?.status ?? "loading")
  const errorMessage = resourceDisabled
    ? "资源已停用"
    : resource === undefined
      ? "资源不存在或已删除"
      : snapshot?.errorMessage

  return {
    nodeType: "layer",
    id: layer.id,
    name: layer.name,
    sortOrder: layer.sortOrder,
    layer,
    resource,
    resourceName: resource?.name,
    visible: layer.id in overrides ? overrides[layer.id] : layer.visible,
    status,
    errorMessage,
    canFlyTo: Boolean(resource?.extent),
    temporary,
  }
}

/** 按 sortOrder ASC、name ASC 排序树项，保证同序时稳定。 */
function sortTreeItems<T extends { readonly sortOrder: number; readonly name: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.name.localeCompare(right.name, "zh-Hans-CN")
  })
}
