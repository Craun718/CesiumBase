import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildLayerTree,
  filterLayerTree,
  type LayerTreeNode,
} from "../src/features/layers/layerTree.js"
import type {
  LayerDefinition,
  LayerGroupDefinition,
  LayerSchemeDefinition,
} from "../src/features/layers/types.js"

/** 造一条影像图层；默认不可见，顺序与名称可按需覆盖。 */
function makeLayer(id: string, groupId?: string, sortOrder = 10, name = id): LayerDefinition {
  return {
    id,
    name,
    resourceId: `resource-${id}`,
    visible: false,
    sortOrder,
    renderOrder: 0,
    ...(groupId ? { groupId } : {}),
    type: "imagery",
    style: { opacity: 1 },
  }
}

/** 造一个图层分组；默认展开，可挂到父分组下。 */
function makeGroup(
  id: string,
  sortOrder = 10,
  parentId?: string,
  name = id,
  defaultExpanded = true,
): LayerGroupDefinition {
  return {
    id,
    name,
    sortOrder,
    defaultExpanded,
    ...(parentId ? { parentId } : {}),
  }
}

/** 造一个只关心分组与图层的方案，其余字段取最小必填值。 */
function makeScheme(
  groups: readonly LayerGroupDefinition[],
  layers: readonly LayerDefinition[],
): LayerSchemeDefinition {
  return {
    id: "scheme-test",
    name: "测试方案",
    sortOrder: 10,
    status: "enabled",
    defaultActive: false,
    groups,
    layers,
  }
}

/** 按当前顺序取节点名，用来断言树形顺序。 */
function namesOf(nodes: readonly LayerTreeNode[]): string[] {
  return nodes.map((node) => node.name)
}

/** 读取分组节点的子节点；传入叶子节点即失败。 */
function childrenOf(node: LayerTreeNode | undefined): readonly LayerTreeNode[] {
  if (!node || node.nodeType !== "group") throw new Error("期望一个分组节点")
  return node.children
}

test("根级顺序为「方案分组 → 未分组 → 临时图层」", () => {
  const tree = buildLayerTree({
    scheme: makeScheme(
      [makeGroup("g-b", 20, undefined, "B 组"), makeGroup("g-a", 10, undefined, "A 组")],
      [makeLayer("l-ungrouped")],
    ),
    resources: [],
    temporaryLayers: [makeLayer("l-temporary")],
    visibilityOverrides: {},
  })

  assert.deepEqual(namesOf(tree), ["A 组", "B 组", "未分组", "临时图层"])
})

test("合成根分组声明为默认展开", () => {
  const tree = buildLayerTree({
    scheme: makeScheme([], [makeLayer("l-ungrouped")]),
    resources: [],
    temporaryLayers: [makeLayer("l-temporary")],
    visibilityOverrides: {},
  })
  const [ungrouped, temporary] = tree

  assert.equal(ungrouped?.nodeType === "group" && ungrouped.defaultExpanded, true)
  assert.equal(temporary?.nodeType === "group" && temporary.defaultExpanded, true)
})

test("组内顺序为先子分组、后图层，与 sortOrder 无关", () => {
  const tree = buildLayerTree({
    scheme: makeScheme(
      [makeGroup("g-root", 10, undefined, "根组"), makeGroup("g-child", 30, "g-root", "子组")],
      // 图层的 sortOrder 比子分组小，位置仍应在子分组之后
      [makeLayer("l-1", "g-root", 10, "根组图层")],
    ),
    resources: [],
    temporaryLayers: [],
    visibilityOverrides: {},
  })

  assert.deepEqual(namesOf(tree), ["根组"])
  assert.deepEqual(namesOf(childrenOf(tree[0])), ["子组", "根组图层"])
})

test("搜索命中分组时保留整棵子树", () => {
  const tree = buildLayerTree({
    scheme: makeScheme(
      [
        makeGroup("g-root", 10, undefined, "影像底图"),
        makeGroup("g-child", 10, "g-root", "卫星影像"),
      ],
      [makeLayer("l-1", "g-child", 10, "高分一号"), makeLayer("l-2", "g-root", 10, "天地图影像")],
    ),
    resources: [],
    temporaryLayers: [],
    visibilityOverrides: {},
  })

  const filtered = filterLayerTree(tree, "卫星")

  assert.deepEqual(namesOf(filtered), ["影像底图"])
  assert.deepEqual(namesOf(childrenOf(filtered[0])), ["卫星影像"])
  assert.deepEqual(namesOf(childrenOf(childrenOf(filtered[0])[0])), ["高分一号"])
})

test("搜索命中图层时保留祖先分组，不带同组其他图层", () => {
  const tree = buildLayerTree({
    scheme: makeScheme(
      [
        makeGroup("g-root", 10, undefined, "影像底图"),
        makeGroup("g-child", 10, "g-root", "卫星影像"),
      ],
      [makeLayer("l-1", "g-child", 10, "高分一号"), makeLayer("l-2", "g-root", 10, "天地图影像")],
    ),
    resources: [],
    temporaryLayers: [],
    visibilityOverrides: {},
  })

  const filtered = filterLayerTree(tree, "高分")

  assert.deepEqual(namesOf(filtered), ["影像底图"])
  assert.deepEqual(namesOf(childrenOf(filtered[0])), ["卫星影像"])
  assert.deepEqual(namesOf(childrenOf(childrenOf(filtered[0])[0])), ["高分一号"])
})

test("搜索无命中时返回空数组", () => {
  const tree = buildLayerTree({
    scheme: makeScheme(
      [makeGroup("g-root", 10, undefined, "影像底图")],
      [makeLayer("l-1", "g-root")],
    ),
    resources: [],
    temporaryLayers: [],
    visibilityOverrides: {},
  })

  assert.deepEqual(filterLayerTree(tree, "不存在的名字"), [])
})
