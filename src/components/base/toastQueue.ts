/**
 * 全局提示条队列的纯逻辑。
 *
 * 迁移前有三处提示条（操作反馈、图层失败、截图反馈），各自 `position: fixed` 到不同坐标、
 * 各自持有一个 `setTimeout`，同一时刻可能互相压住。这里把「队列状态」抽成纯函数，
 * 由 `ToastProvider.vue` 独占计时与渲染，调用方只描述「要显示什么」。
 *
 * 调用方一般不传 id，交给 `createToastId` 按内容派生：这样不同内容并存堆叠、各自计时，
 * 相同内容合并成一条并重置停留时间，不需要每个调用方自己维护槽位常量。
 *
 * 时间以调用方传入的 `now` 为基准（不读 `Date.now()`），这样过期行为可以被单测直接覆盖。
 */

/** 提示条的语义分档，决定图标与描边色。 */
export type ToastTone = "success" | "error" | "warning" | "info"

/** 队列里的一条提示。 */
export interface ToastItem {
  /** 稳定标识，用于去重、关闭与列表 `:key`。 */
  readonly id: string
  readonly tone: ToastTone
  readonly message: string
  /** 可选的粗体标题行。 */
  readonly title?: string
  /** 自动关闭时长（毫秒）；`0` 表示只能手动关闭。 */
  readonly duration: number
  /** 自动关闭的绝对时刻；`duration` 为 0 时无意义。 */
  readonly expiresAt: number
  /** 关闭后是否记住该 id，阻止同样内容被反复重新弹出。 */
  readonly rememberDismiss: boolean
}

/** 队列快照；所有变更函数都返回新对象。 */
export interface ToastState {
  readonly items: readonly ToastItem[]
  /** 已关闭且要求被记住的 id，最新的在末尾。 */
  readonly dismissedIds: readonly string[]
}

/** 入队参数。 */
export interface ToastOptions {
  /** 稳定标识；省略时由 `createToastId` 按内容派生。 */
  readonly id?: string
  readonly message: string
  readonly tone?: ToastTone
  readonly title?: string
  readonly duration?: number
  readonly rememberDismiss?: boolean
}

/** 参与 id 派生的字段。 */
export type ToastIdentity = Pick<ToastOptions, "message" | "tone" | "title">

/** 同时显示的上限；超出时丢弃最早的，避免提示条压满大屏。 */
export const MAX_TOASTS = 3
/** 自动关闭的最短时长，防止传入过小的值让提示一闪而过。 */
export const MIN_DURATION = 1000
/** 未指定时长时的默认自动关闭时长；提示条会并存，默认值取「一眼能读完」的短时长。 */
export const DEFAULT_DURATION = 3000
/** 记住的关闭记录上限，防止长时间运行后无限增长。 */
export const MAX_DISMISSED = 50

const TONE_ICONS: Record<ToastTone, string> = {
  success: "bi-check-circle",
  error: "bi-exclamation-triangle",
  warning: "bi-info-circle",
  info: "bi-info-circle",
}

/** 创建空队列。 */
export function createToastState(): ToastState {
  return { items: [], dismissedIds: [] }
}

/** 取提示条图标类名。 */
export function getToastIcon(tone: ToastTone): string {
  return TONE_ICONS[tone]
}

/**
 * 按内容派生 id：内容相同 → id 相同 → `showToast` 合并它们并重置计时；
 * 内容不同 → id 不同 → 各自占一条并存堆叠。
 *
 * `tone` 与 `title` 必须参与，否则同一句「操作失败」的成功态与错误态会互相顶掉。
 * `duration` 不参与——同内容重推时新条目的时长与到期时刻会整体替换旧条目，这正是「重置计时」。
 * 这里只把三段拼成一个 key，不做转义也不反解，因此内容里出现 `|` 也无妨。
 */
export function createToastId(identity: ToastIdentity): string {
  return `${identity.tone ?? "success"}|${identity.title ?? ""}|${identity.message.trim()}`
}

/**
 * 生成一条提示。
 *
 * 未显式指定 `id` 时按内容派生（见 `createToastId`）。
 * 内容为空白时返回 `undefined`——调用方据此跳过，避免队列里出现空壳提示条。
 */
export function createToast(options: ToastOptions, now: number): ToastItem | undefined {
  const message = options.message.trim()
  if (!message) return undefined

  const requested = options.duration ?? DEFAULT_DURATION
  const duration = requested > 0 ? Math.max(MIN_DURATION, requested) : 0

  return {
    id: options.id ?? createToastId({ ...options, message }),
    tone: options.tone ?? "success",
    message,
    title: options.title,
    duration,
    expiresAt: duration > 0 ? now + duration : 0,
    rememberDismiss: options.rememberDismiss ?? false,
  }
}

/**
 * 入队。
 *
 * 已要求记住的 id 直接忽略。同 id 的旧条目被替换而不是叠加：新条目带着自己的 `expiresAt`
 * 入队，于是计时从此刻重新开始，这正好对应「同一组内容再次出现时刷新停留时间」。
 * 由内容派生的 id 让「同 id」等价于「同内容」，调用方因此天然得到「不同内容并存、同内容合并」。
 */
export function showToast(state: ToastState, toast: ToastItem): ToastState {
  if (state.dismissedIds.includes(toast.id)) return state

  const items = [...state.items.filter((item) => item.id !== toast.id), toast]

  return { ...state, items: items.slice(Math.max(0, items.length - MAX_TOASTS)) }
}

/** 关闭指定提示；条目不存在时原样返回，保证调用方可以无脑重复关闭。 */
export function dismissToast(state: ToastState, id: string): ToastState {
  const target = state.items.find((item) => item.id === id)
  if (!target) return state

  return {
    items: state.items.filter((item) => item.id !== id),
    dismissedIds: target.rememberDismiss
      ? [...state.dismissedIds, id].slice(-MAX_DISMISSED)
      : state.dismissedIds,
  }
}

/** 关闭所有已到期的提示。 */
export function expireToasts(state: ToastState, now: number): ToastState {
  const due = state.items.filter((item) => item.duration > 0 && item.expiresAt <= now)

  return due.reduce((next, item) => dismissToast(next, item.id), state)
}

/** 最近一个到期时刻；没有可自动关闭的条目时返回 `undefined`。 */
export function nextExpiry(state: ToastState): number | undefined {
  const pending = state.items.filter((item) => item.duration > 0).map((item) => item.expiresAt)

  return pending.length === 0 ? undefined : Math.min(...pending)
}
