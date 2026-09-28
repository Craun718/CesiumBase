/**
 * 树形列表的共享模型工具：把「每条记录带 parentId」的平铺数组装配成嵌套树，
 * 再按当前展开集合摊平成可渲染的可见行。
 *
 * 两个树形面板（资源分类、图层分组）的数据源形状一致，而 Reka 的 `TreeRoot` 需要的是
 * 嵌套结构——`getChildren` 收到条目本身并返回子条目数组。缩进不再由模板内联 `paddingLeft`
 * 计算，改由行上的 `data-indent`（即 `aria-level`）在样式里决定，因此这里只负责产出
 * 「条目 + 层级深度」，`depth` 从 0 起，对应 Reka 的 `level = depth + 1`。
 *
 * 展开态刻意留在调用组件的 `ref` 里，不搬进 Reka 内部状态：面板关闭后重开需要保持
 * 同一份展开态，而 Reka 的实例状态跟着组件走。调用方持有的是**收起集合**，
 * 展开数组由 `resolveExpandedIds` 现算（见该函数注释）。
 */

/** 参与建树的条目：`id` 唯一，`parentId` 指向同级列表里的父条目。 */
export interface ParentLinkedItem {
  readonly id: string
  readonly parentId?: string
}

/** 建树后的节点：原条目加上子节点数组。 */
export type TreeNodeOf<T extends ParentLinkedItem> = T & { children: TreeNodeOf<T>[] }

/** 摊平后的可见行：节点本身与从 0 起的层级深度。 */
export interface TreeRow<T extends ParentLinkedItem> {
  readonly item: TreeNodeOf<T>
  readonly depth: number
}

/**
 * 把 `parentId` 关联的平铺列表装配成嵌套树，同级保持输入顺序。
 *
 * 以下三种情况一律按顶层处理，避免出现取不到的父级或递归不收敛的结构：
 * 父级 id 不存在、条目把自己当父级、父子互指形成环。环检测沿父链上溯，
 * 一旦数据里出现互指，两条记录都会落到顶层，宁可少一层也不让摊平递归栈溢出。
 */
export function buildTreeByParent<T extends ParentLinkedItem>(
  items: readonly T[],
): TreeNodeOf<T>[] {
  const nodes: TreeNodeOf<T>[] = items.map((item) => ({ ...item, children: [] }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const roots: TreeNodeOf<T>[] = []

  for (const node of nodes) {
    const parentId = node.parentId
    const parent = parentId && parentId !== node.id ? byId.get(parentId) : undefined
    if (!parent || createsCycle(node.id, byId)) {
      roots.push(node)
      continue
    }

    parent.children.push(node)
  }

  return roots
}

/** 深度优先收集树中全部节点 id，顺序与 `flattenVisibleRows` 在全展开时一致。 */
export function collectTreeIds<T extends ParentLinkedItem>(
  nodes: readonly TreeNodeOf<T>[],
): string[] {
  return nodes.flatMap((node) => [node.id, ...collectTreeIds(node.children)])
}

/**
 * 按展开集合摊平为可见行。
 *
 * 收起的节点只输出自己，不带子孙；这也是搜索态之外唯一的可见性来源。
 */
export function flattenVisibleRows<T extends ParentLinkedItem>(
  nodes: readonly TreeNodeOf<T>[],
  expandedIds: readonly string[],
): TreeRow<T>[] {
  const expanded = new Set(expandedIds)
  const rows: TreeRow<T>[] = []

  const walk = (list: readonly TreeNodeOf<T>[], depth: number) => {
    for (const node of list) {
      rows.push({ item: node, depth })
      if (expanded.has(node.id)) walk(node.children, depth + 1)
    }
  }

  walk(nodes, 0)
  return rows
}

/**
 * 由「已收起集合」算出 Reka 需要的展开数组：全部节点减去收起的那几个。
 *
 * 调用方存收起集合而不是展开集合，是为了让「默认全展开」这个语义天然成立——
 * 新加的分类 / 分组不在收起集合里，加入后直接就是展开的，不需要在数据变化时补写状态。
 */
export function resolveExpandedIds<T extends ParentLinkedItem>(
  nodes: readonly TreeNodeOf<T>[],
  collapsedIds: readonly string[],
): string[] {
  const collapsed = new Set(collapsedIds)
  return collectTreeIds(nodes).filter((id) => !collapsed.has(id))
}

/** `resolveExpandedIds` 的逆运算：把 Reka 回传的展开数组折算回收起集合。 */
export function resolveCollapsedIds(
  allIds: readonly string[],
  expandedIds: readonly string[],
): string[] {
  const expanded = new Set(expandedIds)
  return allIds.filter((id) => !expanded.has(id))
}

/**
 * 读取条目的 id 作为树键。
 *
 * 入参可能不是条目：Reka 的 `TreeRoot` 在未选中时会拿空对象调 `getKey`，
 * 多选切换回来的又可能是 `{...条目}` 的浅拷贝，两种情况都要能读出一个可比较的字符串。
 */
export function readTreeId(value: unknown): string {
  if (typeof value === "string") return value
  const id = (value as { id?: unknown } | null | undefined)?.id
  return typeof id === "string" ? id : ""
}

/**
 * 读取条目的子节点，供 Reka 的 `getChildren` 使用。
 *
 * 叶子必须返回 `undefined` 而不是空数组：`TreeItem` 用 `!!getChildren(value)` 判断
 * `hasChildren`，空数组为真会让叶子带上无意义的 `aria-expanded`，并把行点击变成一次永远
 * 没有结果的展开。
 */
export function readTreeChildren<T extends ParentLinkedItem>(
  node: TreeNodeOf<T>,
): TreeNodeOf<T>[] | undefined {
  return node.children.length > 0 ? node.children : undefined
}

/**
 * 判断把 `id` 挂到它的父级下是否会形成环——沿父链上溯，遇到自己即为环。
 *
 * 数据来自后端的父子表单，互指虽然不该出现，但一旦出现就会让摊平递归永远走不到头。
 */
function createsCycle<T extends ParentLinkedItem>(
  id: string,
  byId: ReadonlyMap<string, TreeNodeOf<T>>,
): boolean {
  const seen = new Set<string>([id])
  let currentId = byId.get(id)?.parentId

  while (currentId) {
    if (seen.has(currentId)) return true
    seen.add(currentId)
    currentId = byId.get(currentId)?.parentId
  }

  return false
}
