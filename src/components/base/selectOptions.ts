/**
 * 下拉选项的模型与转换工具。
 *
 * 原生 `<option>` 的两种写法（静态数组 / 字典型标签表）在这里统一成同一种结构，
 * 由 `AppSelect.vue` 负责渲染。放进独立 `.ts` 是为了让「标签表怎么变成选项列表」
 * 这类映射有单测，而不是散在七个组件的模板里。
 */

/** 一个下拉选项。 */
export interface SelectOption<T extends string = string> {
  readonly value: T
  /** 触发器和列表里显示的文字；Reka 也用它作为列表项的 `textContent`。 */
  readonly label: string
  readonly disabled?: boolean
}

/**
 * 把「值 → 显示名」的标签表转成选项数组。
 *
 * `order` 给出时按它排列，否则沿用对象的键顺序（与原 `v-for` 遍历对象的行为一致）。
 */
export function toSelectOptions<T extends string>(
  labels: Readonly<Record<T, string>>,
  order?: readonly T[],
): SelectOption<T>[] {
  const keys = order ?? (Object.keys(labels) as T[])

  return keys.map((value) => ({ value, label: labels[value] }))
}

/**
 * 在选项数组开头插入一个占位项。
 *
 * 用于「未分组 / 顶层 / 全部」这类空值选项：它们的 `value` 是空串，
 * 由下拉控件翻译成 `EMPTY_SELECT_VALUE` 之后再交给 Reka，
 * 因此选中后显示这一项的 `label` 而不是 `placeholder`。
 */
export function withEmptyOption<T extends string>(
  options: readonly SelectOption<T>[],
  label: string,
  value = "",
): SelectOption<T>[] {
  return [{ value: value as T, label }, ...options]
}

/**
 * 空值选项交给 Reka 时使用的替身值。
 *
 * Reka 的 `SelectItem` 明确禁止 `value=""`：空串在它那里是「未选择」的保留值（`SelectRoot`
 * 用它显示 placeholder），传空串会在渲染时直接抛错，而抛错发生在组件树内部，会让所在的一次
 * 补丁整体中断、之后每次更新都重跑这棵已经坏掉的子树。本仓库约定用 `value: ""` 表达
 * 「未分组 / 顶层 / 未分类」这类空值选项，两者冲突，所以在传给 Reka 之前换成这个哨兵值，
 * 回传时再换回空串——调用方看到的选项值和模型值始终是空串。
 *
 * 哨兵值只在下拉控件内部出现，不会与真实选项冲突（选项值都是 id、枚举名或标签）。
 */
export const EMPTY_SELECT_VALUE = "__select-empty__"

/** 把调用方的取值翻译成 Reka 可接受的取值：空串换成哨兵，其余原样。 */
export function toSelectControlValue(value: string | undefined): string | undefined {
  return value === "" ? EMPTY_SELECT_VALUE : value
}

/** 把 Reka 回传的取值翻译回调用方的模型值：哨兵值和空值都还原成空串。 */
export function fromSelectControlValue(value: unknown): string {
  if (value === null || value === undefined || value === EMPTY_SELECT_VALUE) return ""

  return String(value)
}

/** 把选项列表里的空值项换成哨兵值，其余原样；供下拉控件交给 Reka 渲染。 */
export function toSelectControlOptions<T extends string>(
  options: readonly SelectOption<T>[],
): SelectOption<string>[] {
  return options.map((option) =>
    option.value === "" ? { ...option, value: EMPTY_SELECT_VALUE } : option,
  )
}
