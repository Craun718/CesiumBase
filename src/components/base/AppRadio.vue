<script setup lang="ts">
/**
 * 单选组里的一项（Reka RadioGroupItem 封装），只加语义、不加外观。
 *
 * 固定以 `asChild` 渲染：Reka 的 `role="radio"`、`aria-checked`、`data-state`
 * 以及 RovingFocus 接管的 `tabindex` / 方向键处理，全部合并到调用方自己写的那个元素上。
 * 这样调用方保留原有的 `<button class="…">`，组件内的 scoped 样式照常生效；
 * 如果改由本组件渲染根元素，调用方的选择器就够不到它了——Reka 的 `Radio` 以 Fragment 为根，
 * 父组件的 scope id 传不下去（这也是 Reka 自己要用 `useForwardScopeId` 手动补救的原因）。
 *
 * 默认插槽必须恰好是一个元素，否则 `asChild` 无处合并属性。
 * 不传 `name`，理由与 `AppSelect` / `AppSwitch` 相同（本仓库没有原生表单提交）。
 */
import { RadioGroupItem } from "reka-ui"

defineProps<{
  /** 与 `AppRadioGroup` 的 `modelValue` 比较的值。 */
  value: string
  disabled?: boolean
}>()
</script>

<template>
  <RadioGroupItem as-child :value="value" :disabled="disabled">
    <slot />
  </RadioGroupItem>
</template>
