<script setup lang="ts">
/**
 * 单选组容器（Reka RadioGroup 封装）。
 *
 * 负责调用方不该各写一遍的三件事：`role="radiogroup"` + 可访问名称、组内 roving tabindex
 * （整个组只占一个 Tab 停靠点，落在选中项上），以及方向键在选项间移动并选中。
 * 轮换、Home / End、「禁用项不参与轮换」都由 Reka 的 RovingFocus 在集合层维护，
 * 不需要像 `MeasurementPanel` 原先那样用 `parentElement.children[index]` 反查兄弟节点
 * ——那种写法一旦组里多出一个兄弟元素就会错位。
 *
 * 不传 `orientation` 时四个方向键都按前一项 / 后一项处理（RovingFocus 的规则是
 * 「没声明方向就不限轴」）。三处栅格单选组沿用原有的全方向 ±1 轮换，保持手感不变；
 * 竖直列表传 `"vertical"`，既让 `aria-orientation` 如实反映布局，也只响应上下键。
 *
 * 与 `AppSelect` / `AppSwitch` 一样不传 `name`：本仓库没有原生表单提交，
 * Reka 只有在 `name` 存在时才补隐藏的 `<input type="radio">`。
 *
 * 本组件不提供外观，`class` 会透传到根元素，由调用方按各自的栅格 / 列表皮肤处理；
 * 根元素到此处是单根组件链，调用方的 scoped 样式照常命中。
 */
import { RadioGroupRoot } from "reka-ui"

withDefaults(
  defineProps<{
    /** 四种调用点的「未选中」都是 `null`（图纸/测量的状态机如此），一并接受。 */
    modelValue?: string | null
    /**
     * 组的可访问名称，没有可见标题的单选组只能靠它被读出来，四个调用点都必须传。
     * 类型上可选只是为了让模板里写惯用的 `aria-label="…"`——Vue 会把连字符属性名
     * 还原成这个驼峰 prop，但 vue-tsc 不还原，写成必填会在模板侧误报缺失。
     */
    ariaLabel?: string
    orientation?: "horizontal" | "vertical"
    /** 整组禁用时，组内每一项同步为不可选、不可聚焦。 */
    disabled?: boolean
    /** 根元素标签；竖直列表用 `ul` 承接语义。 */
    as?: string
  }>(),
  { disabled: false, as: "div" },
)

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

/** Reka 的值域是 `AcceptableValue`，本仓库的单选值统一是字符串。 */
function handleUpdate(value: unknown) {
  emit("update:modelValue", String(value))
}
</script>

<template>
  <RadioGroupRoot
    :model-value="modelValue"
    :orientation="orientation"
    :disabled="disabled"
    :as="as"
    :aria-label="ariaLabel"
    @update:model-value="handleUpdate"
  >
    <slot />
  </RadioGroupRoot>
</template>
