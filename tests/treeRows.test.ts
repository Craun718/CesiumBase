import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildTreeByParent,
  collectTreeIds,
  flattenVisibleRows,
  readTreeChildren,
  readTreeId,
  resolveCollapsedIds,
  resolveExpandedIds,
  type ParentLinkedItem,
} from "../src/components/base/treeRows.js"

interface TreeRecord extends ParentLinkedItem {
  readonly name: string
}

/** 造一条记录；父级默认缺省，即顶层。 */
function makeNode(id: string, parentId?: string, name = id): TreeRecord {
  return { id, name, ...(parentId ? { parentId } : {}) }
}

test("buildTreeByParent 按 parentId 装配层级并保持输入顺序", () => {
  const tree = buildTreeByParent([
    makeNode("b", "a"),
    makeNode("a"),
    makeNode("b2", "b"),
    makeNode("b1", "b"),
  ])

  assert.deepEqual(
    tree.map((item) => item.id),
    ["a"],
  )
  assert.deepEqual(
    tree[0]?.children.map((item) => item.id),
    ["b"],
  )
  assert.deepEqual(
    tree[0]?.children[0]?.children.map((item) => item.id),
    ["b2", "b1"],
  )
})

test("buildTreeByParent 保留条目原有字段", () => {
  const tree = buildTreeByParent([makeNode("a", undefined, "顶层")])

  assert.equal(tree[0]?.name, "顶层")
})

test("buildTreeByParent 把父级缺失的条目光作顶层", () => {
  const tree = buildTreeByParent([makeNode("a"), makeNode("orphan", "missing")])

  assert.deepEqual(
    tree.map((item) => item.id),
    ["a", "orphan"],
  )
})

test("buildTreeByParent 把自指的条目光作顶层", () => {
  const tree = buildTreeByParent([makeNode("a", "a")])

  assert.deepEqual(
    tree.map((item) => item.id),
    ["a"],
  )
  assert.deepEqual(tree[0]?.children, [])
})

test("buildTreeByParent 遇到父子互指时收敛为两个顶层节点", () => {
  const tree = buildTreeByParent([makeNode("a", "b"), makeNode("b", "a")])

  assert.deepEqual(
    tree.map((item) => item.id),
    ["a", "b"],
  )
  assert.deepEqual(collectTreeIds(tree).sort(), ["a", "b"])
})

test("buildTreeByParent 对长链只上溯有限次", () => {
  const tree = buildTreeByParent([makeNode("a", "b"), makeNode("b", "c"), makeNode("c")])

  assert.deepEqual(collectTreeIds(tree), ["c", "b", "a"])
})

test("flattenVisibleRows 收起的分支不输出子孙", () => {
  const tree = buildTreeByParent([makeNode("a"), makeNode("b", "a"), makeNode("c", "b")])

  assert.deepEqual(
    flattenVisibleRows(tree, ["a", "b"]).map((row) => [row.item.id, row.depth]),
    [
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ],
  )
  assert.deepEqual(
    flattenVisibleRows(tree, ["a"]).map((row) => [row.item.id, row.depth]),
    [
      ["a", 0],
      ["b", 1],
    ],
  )
  assert.deepEqual(
    flattenVisibleRows(tree, []).map((row) => row.item.id),
    ["a"],
  )
})

test("collectTreeIds 覆盖整棵树，与展开状态无关", () => {
  const tree = buildTreeByParent([makeNode("a"), makeNode("b", "a"), makeNode("c", "b")])

  assert.deepEqual(collectTreeIds(tree), ["a", "b", "c"])
})

test("resolveExpandedIds 默认全展开，只排除被收起的节点", () => {
  const tree = buildTreeByParent([makeNode("a"), makeNode("b", "a"), makeNode("c", "b")])

  assert.deepEqual(resolveExpandedIds(tree, []), ["a", "b", "c"])
  assert.deepEqual(resolveExpandedIds(tree, ["b"]), ["a", "c"])
})

test("resolveCollapsedIds 与 resolveExpandedIds 互为逆运算", () => {
  const tree = buildTreeByParent([makeNode("a"), makeNode("b", "a"), makeNode("c", "b")])
  const allIds = collectTreeIds(tree)

  assert.deepEqual(resolveCollapsedIds(allIds, resolveExpandedIds(tree, ["c"])), ["c"])
})

test("resolveCollapsedIds 把新增节点视作展开", () => {
  const before = buildTreeByParent([makeNode("a")])
  const after = buildTreeByParent([makeNode("a"), makeNode("b", "a")])
  const collapsed = resolveCollapsedIds(collectTreeIds(before), resolveExpandedIds(before, []))

  assert.deepEqual(collapsed, [])
  assert.deepEqual(resolveExpandedIds(after, collapsed), ["a", "b"])
})

test("readTreeId 兼容空对象、字符串与浅拷贝", () => {
  assert.equal(readTreeId({ id: "a" }), "a")
  assert.equal(readTreeId("a"), "a")
  assert.equal(readTreeId({ ...makeNode("b") }), "b")
  assert.equal(readTreeId({}), "")
  assert.equal(readTreeId(undefined), "")
  assert.equal(readTreeId({ id: 7 }), "")
})

test("readTreeChildren 对叶子返回 undefined 而不是空数组", () => {
  const [parent] = buildTreeByParent([makeNode("a"), makeNode("b", "a")])
  assert.ok(parent, "应当建出顶层节点")

  const [leaf] = parent.children
  assert.ok(leaf, "应当建出子节点")

  assert.equal(readTreeChildren(parent), parent.children)
  assert.equal(readTreeChildren(leaf), undefined)
})
