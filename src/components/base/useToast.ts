import { inject, type ComputedRef, type InjectionKey } from "vue"
import type { ToastItem, ToastOptions } from "./toastQueue"

/** 全局提示条的读写入口。 */
export interface ToastApi {
  /** 当前队列快照；薄壳组件靠它判断自己的提示是否已被关闭。 */
  readonly items: ComputedRef<readonly ToastItem[]>
  /** 加入一条提示；内容为空白时忽略。 */
  readonly show: (options: ToastOptions) => void
  /** 关闭指定 id 的提示。 */
  readonly dismiss: (id: string) => void
}

export const toastKey: InjectionKey<ToastApi> = Symbol("Toast")

/** 读取全局提示条入口；`ToastProvider` 未挂载时抛错，避免提示静默丢失。 */
export function useToast(): ToastApi {
  const api = inject(toastKey)

  if (!api) {
    throw new Error("ToastProvider 必须在应用根部挂载后才能使用 useToast")
  }

  return api
}
