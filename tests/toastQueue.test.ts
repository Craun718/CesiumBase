import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DEFAULT_DURATION,
  MAX_DISMISSED,
  MAX_TOASTS,
  MIN_DURATION,
  createToast,
  createToastId,
  createToastState,
  dismissToast,
  expireToasts,
  getToastIcon,
  nextExpiry,
  showToast,
  type ToastItem,
  type ToastOptions,
  type ToastState,
} from "../src/components/base/toastQueue.js"

type ToastOverrides = Partial<Parameters<typeof createToast>[0]>

/** 走内容派生 id 入队时的可选字段；`id` 由内容派生，这里刻意不给。 */
type ContentOverrides = Partial<Omit<ToastOptions, "id" | "message">>

/** 在指定时刻造一条提示；创建失败直接抛错，测试里不该走到那条分支。 */
function toastAt(now: number, id: string, overrides: ToastOverrides = {}) {
  const toast = createToast({ id, message: `消息 ${id}`, ...overrides }, now)

  assert.ok(toast, `提示 ${id} 应当创建成功`)
  return toast as ToastItem
}

/** 造一条提示；内容与 id 可覆写，其余字段走默认。 */
function makeToast(id: string, overrides: ToastOverrides = {}) {
  return toastAt(0, id, overrides)
}

/** 把若干提示依次入队，返回最终状态。 */
function queueOf(...toasts: readonly ToastItem[]) {
  return toasts.reduce(showToast, createToastState())
}

/** 不指定 id，按内容派生后入队；用来验证「不同内容并存、同内容合并」。 */
function pushContent(
  state: ToastState,
  message: string,
  at: number,
  overrides: ContentOverrides = {},
) {
  const toast = createToast({ message, ...overrides }, at)

  assert.ok(toast, `提示「${message}」应当创建成功`)
  return showToast(state, toast as ToastItem)
}

test("createToast 空白内容返回 undefined", () => {
  assert.equal(createToast({ id: "a", message: "   " }, 0), undefined)
  assert.equal(createToast({ id: "a", message: "" }, 0), undefined)
})

test("createToast 默认时长与优先级", () => {
  assert.equal(makeToast("a").duration, DEFAULT_DURATION)
  assert.equal(makeToast("b", { tone: "error" }).tone, "error")
  assert.equal(makeToast("c", { tone: "error" }).duration, DEFAULT_DURATION)
})

test("createToast 把过短的时长抬到下限", () => {
  assert.equal(makeToast("a", { duration: 50 }).duration, MIN_DURATION)
  assert.equal(makeToast("b", { duration: MIN_DURATION }).duration, MIN_DURATION)
})

test("createToast 时长为 0 表示只能手动关闭", () => {
  const toast = makeToast("a", { duration: 0 })

  assert.equal(toast.duration, 0)
  assert.equal(toast.expiresAt, 0)
})

test("createToast 按传入的 now 计算到期时刻", () => {
  assert.equal(makeToast("a", { duration: 4000 }).expiresAt, 4000)
  assert.equal(createToast({ id: "b", message: "x", duration: 4000 }, 1_000)?.expiresAt, 5_000)
})

test("showToast 同 id 覆盖并刷新到期时刻", () => {
  const first = queueOf(makeToast("a"))
  const second = showToast(first, toastAt(9_000, "a", { message: "新消息", duration: 2000 }))

  assert.equal(second.items.length, 1)
  assert.equal(second.items[0]?.message, "新消息")
  assert.equal(second.items[0]?.expiresAt, 11_000)
})

test("showToast 超过上限时丢弃最早的", () => {
  const toasts = ["a", "b", "c", "d"].map((id) => makeToast(id))
  const state = queueOf(...toasts)

  assert.equal(state.items.length, MAX_TOASTS)
  assert.deepEqual(
    state.items.map((item) => item.id),
    ["b", "c", "d"],
  )
})

test("createToastId 只对分档、标题与内容敏感", () => {
  const base = { message: "已保存", tone: "success" } as const

  assert.equal(createToastId(base), createToastId({ ...base }))
  assert.notEqual(createToastId(base), createToastId({ message: "已删除", tone: "success" }))
  assert.notEqual(createToastId(base), createToastId({ message: "已保存", tone: "error" }))
  assert.notEqual(createToastId(base), createToastId({ ...base, title: "部分失败" }))
})

test("createToastId 忽略首尾空白，并沿用默认分档", () => {
  assert.equal(createToastId({ message: " 已保存 " }), createToastId({ message: "已保存" }))
  assert.equal(
    createToastId({ message: "已保存" }),
    createToastId({ message: "已保存", tone: "success" }),
  )
})

test("createToast 未指定 id 时按内容派生，显式 id 优先", () => {
  const first = createToast({ message: "已保存" }, 0)
  const sameContent = createToast({ message: "已保存", duration: 2000 }, 0)
  const otherContent = createToast({ message: "已删除" }, 0)
  const explicit = createToast({ id: "layer-error:a", message: "失败图层：a" }, 0)

  assert.equal(first?.id, sameContent?.id)
  assert.notEqual(first?.id, otherContent?.id)
  assert.equal(explicit?.id, "layer-error:a")
})

test("内容不同的提示并存，各自保留自己的到期时刻", () => {
  const state = pushContent(
    pushContent(createToastState(), "已保存", 0, { duration: 3000 }),
    "已删除",
    1000,
    {
      duration: 3000,
    },
  )

  assert.deepEqual(
    state.items.map((item) => item.expiresAt),
    [3000, 4000],
  )
  // 早的那条到点只清自己，不牵连后入队的
  assert.deepEqual(
    expireToasts(state, 3000).items.map((item) => item.message),
    ["已删除"],
  )
})

test("内容相同的提示合并成一条并重置计时", () => {
  const state = pushContent(
    pushContent(createToastState(), "已保存", 0, { duration: 3000 }),
    "已保存",
    2000,
    {
      duration: 3000,
    },
  )

  assert.equal(state.items.length, 1)
  assert.equal(state.items[0]?.expiresAt, 5000)
})

test("同一句文案不同分档时并存", () => {
  const state = pushContent(
    pushContent(createToastState(), "操作完成", 0, { tone: "success" }),
    "操作完成",
    0,
    {
      tone: "error",
    },
  )

  assert.equal(state.items.length, 2)
})

test("dismissToast 移除条目，条目不存在时原样返回", () => {
  const state = queueOf(makeToast("a"), makeToast("b"))
  const next = dismissToast(state, "a")

  assert.deepEqual(
    next.items.map((item) => item.id),
    ["b"],
  )
  assert.equal(dismissToast(next, "missing"), next)
})

test("dismissToast 只在 rememberDismiss 时记住 id", () => {
  const forgetful = dismissToast(queueOf(makeToast("a")), "a")

  assert.deepEqual(forgetful.dismissedIds, [])
  assert.equal(showToast(forgetful, makeToast("a")).items.length, 1)

  const remembered = dismissToast(queueOf(makeToast("b", { rememberDismiss: true })), "b")

  assert.deepEqual(remembered.dismissedIds, ["b"])
  assert.equal(showToast(remembered, makeToast("b", { rememberDismiss: true })), remembered)
})

test("dismissToast 记住的记录有上限", () => {
  let state = createToastState()

  for (let index = 0; index < MAX_DISMISSED + 5; index += 1) {
    const id = `layer-error:${index}`
    state = dismissToast(showToast(state, makeToast(id, { rememberDismiss: true })), id)
  }

  assert.equal(state.dismissedIds.length, MAX_DISMISSED)
  assert.equal(state.dismissedIds.at(-1), `layer-error:${MAX_DISMISSED + 4}`)
  assert.equal(state.dismissedIds.includes("layer-error:0"), false)
})

test("expireToasts 只关闭已到期的条目", () => {
  const state = queueOf(makeToast("a", { duration: 1000 }), makeToast("b", { duration: 5000 }))

  assert.deepEqual(
    expireToasts(state, 999).items.map((item) => item.id),
    ["a", "b"],
  )
  assert.deepEqual(
    expireToasts(state, 1000).items.map((item) => item.id),
    ["b"],
  )
})

test("expireToasts 不动只能手动关闭的条目", () => {
  const state = queueOf(makeToast("sticky", { duration: 0 }))

  assert.equal(expireToasts(state, 1_000_000), state)
})

test("nextExpiry 取最近到期时刻，无可自动关闭条目时返回 undefined", () => {
  assert.equal(nextExpiry(createToastState()), undefined)
  assert.equal(nextExpiry(queueOf(makeToast("sticky", { duration: 0 }))), undefined)
  assert.equal(
    nextExpiry(
      queueOf(
        makeToast("a", { duration: 5000 }),
        makeToast("b", { duration: 1000 }),
        makeToast("sticky", { duration: 0 }),
      ),
    ),
    1000,
  )
})

test("getToastIcon 覆盖全部分档且错误档可辨识", () => {
  const icons = (["success", "error", "warning", "info"] as const).map(getToastIcon)

  assert.equal(
    icons.every((icon) => icon.startsWith("bi-")),
    true,
  )
  assert.notEqual(icons[1], icons[3])
})
