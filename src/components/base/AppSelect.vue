<script setup lang="ts" generic="T extends string">
/**
 * 统一的下拉选择（Reka Select 封装）。
 *
 * 迁移前是 17 处原生 `<select>` + 七份各自微调的皮肤（`appearance: none` 加一张
 * 数据 URL 箭头图）。原生弹层无法跟随主题，所以改为组件库实现；这里把那七份皮肤
 * 收敛成一处，调用方只需要给出选项数组。
 *
 * 使用约定：
 * - 外层固定包一层 `.select-field` 单根节点。Reka 的 `SelectRoot` 渲染的是
 *   `[触发器, 隐藏原生 select]` 片段，直接当 flex/grid 子项会破坏调用方的排版；
 *   有单根节点后，调用方传进来的 `class` 也落在它身上。
 * - 空值选项（「未分组」「顶层」）用 `value: ""` 表达，选中后显示该选项的 `label`，
 *   而不是 `placeholder`；`placeholder` 只用于「尚未选择且没有空值选项」的场景。
 *   注意 Reka 的 `SelectItem` 不接受空串（空串被它保留给「未选择」，会在渲染时抛错），
 *   所以这里内部做一次翻译：交给 Reka 的选项值和 `model-value` 都换成
 *   `EMPTY_SELECT_VALUE`，回传时再换回空串；调用方只看到 `""`。
 * - 不向 `SelectRoot` 传 `name` / `required`。Reka 会据此额外渲染一个视觉隐藏的原生
 *   select 用于表单提交与浏览器校验，但本仓库所有表单都是 `@submit.prevent` + JS 校验
 *   （唯一的 `required` 属性写在 `<form>` 之外，本来就不起作用），渲染它只会多出一份
 *   需要同步的 DOM。将来若真的需要原生提交，补 `name` 即可。
 */
import { computed } from "vue"
import type { AcceptableValue } from "reka-ui"
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui"
import {
  fromSelectControlValue,
  toSelectControlOptions,
  toSelectControlValue,
  type SelectOption,
} from "./selectOptions"

const props = withDefaults(
  defineProps<{
    options: readonly SelectOption<T>[]
    modelValue?: T
    /** 未选中且没有空值选项时显示的文字。 */
    placeholder?: string
    disabled?: boolean
    /** 校验失败态；由调用方按自己的校验规则给出。 */
    invalid?: boolean
    /** 无可见标签时的可访问名称。 */
    ariaLabel?: string
    /** 地图浮层上使用玻璃底，与面板内的实底输入框区分。 */
    variant?: "field" | "glass"
  }>(),
  {
    placeholder: "",
    disabled: false,
    invalid: false,
    variant: "field",
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: T]
}>()

/** 交给 Reka 的选项：空值项换成哨兵值，绕开 `SelectItem` 对空串的硬校验。 */
const rekaOptions = computed(() => toSelectControlOptions(props.options))

/** 把 Reka 的宽泛值收敛回调用方的字符串类型；哨兵值还原成空串。 */
function handleUpdate(value: AcceptableValue) {
  emit("update:modelValue", fromSelectControlValue(value) as T)
}
</script>

<template>
  <div class="select-field" :class="`is-${variant}`">
    <SelectRoot
      :model-value="toSelectControlValue(modelValue)"
      :disabled="disabled"
      @update:model-value="handleUpdate"
    >
      <SelectTrigger
        class="select-trigger"
        data-testid="select-trigger"
        :aria-label="ariaLabel"
        :aria-invalid="invalid || undefined"
        :data-disabled="disabled || undefined"
        :data-invalid="invalid || undefined"
      >
        <SelectValue :placeholder="placeholder" />
        <SelectIcon class="select-icon">
          <i class="bi bi-chevron-down" aria-hidden="true"></i>
        </SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent class="select-content" position="popper" :side-offset="4">
          <SelectViewport class="select-viewport">
            <SelectItem
              v-for="option in rekaOptions"
              :key="option.value"
              class="select-item"
              :value="option.value"
              :disabled="option.disabled"
            >
              <SelectItemText>{{ option.label }}</SelectItemText>
              <SelectItemIndicator class="select-indicator">
                <i class="bi bi-check-lg" aria-hidden="true"></i>
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>

<style scoped lang="scss">
@use "../../styles/fields" as fields;

.select-field {
  min-width: 0;
}

/* 盒模型与焦点态全部取自输入框皮肤（src/styles/_fields.scss），下拉与输入框因此永远同档：
   同内边距、同圆角、同底色、同焦点环、同样有 hover 描边。这里只留排版职责 ——
   原生 select 需要 padding-right: 30px 给绝对定位的箭头让位，这里箭头是 flex 兄弟节点，
   用 gap 隔开即可；也不设固定高度，同行里比它矮的输入框会被 grid/flex 拉伸对齐。 */
.select-trigger {
  @include fields.field-control($width: true);

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  text-align: left;
  cursor: pointer;
}

/* 玻璃档用在压着地图的浮层里：半透明底色，并与同排的搜索框、数值输入框对齐到
   统一的控件高度（--control-md）。焦点环同样是内嵌档 —— 这类浮层多带 overflow，
   外扩环会被裁掉。 */
.select-field.is-glass .select-trigger {
  @include fields.glass-control($numeric: false, $width: true);
}

/* 校验失败态要压过 hover / focus 的强调色描边：字段有问题时描边应当始终是危险色。
   玻璃档的选择器多一层 .select-field，单独列一遍才不会被它的 `:focus` 顶掉。 */
.select-trigger[data-invalid],
.select-field.is-glass .select-trigger[data-invalid] {
  border-color: var(--danger);
}

.select-trigger[data-disabled] {
  color: var(--text-muted);
  cursor: not-allowed;
}

.select-trigger[data-state="open"] {
  border-color: var(--accent);
}

/* 未选中且没有对应选项时 Reka 会打上 data-placeholder，用弱化色区分于真实取值。 */
.select-trigger [data-placeholder] {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-trigger > span:not([data-placeholder]) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--text-muted);
  font-size: var(--text-xs);
  transition: transform var(--motion-duration-base) var(--motion-ease-standard);
}

.select-trigger[data-state="open"] .select-icon {
  transform: rotate(180deg);
}

.select-viewport {
  max-height: inherit;
  padding: var(--space-3);
  overflow-y: auto;
}

.select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-size: var(--text-body);
  cursor: pointer;
}

.select-item[data-highlighted] {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--neutral) 24%, transparent);
}

.select-item[data-state="checked"] {
  color: var(--accent);
}

.select-item[data-disabled] {
  color: var(--text-muted);
  cursor: not-allowed;
}

.select-item[data-disabled][data-highlighted] {
  background: transparent;
}

.select-indicator {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: var(--text-xs);
}
</style>

<!-- 弹层卡片必须放在非 scoped 块里，否则样式整体失效。
     Reka 的 Popper 关掉了 attrs 透传（`inheritAttrs: false`），把调用方传入的 class 单独交给
     内层 content 元素；而 Vue 的作用域属性只沿组件根节点链传播，落在它的包装层
     `[data-reka-popper-content-wrapper]` 上。两者错位后 `.select-content[data-v-*]` 永远匹配
     不到，弹层就成了没有背景、边框和阴影的裸文字列表（下拉列表项、触发器不受影响：
     它们是模板里直接写的组件，属性和 class 落在同一个元素上）。
     弹层又是 teleport 到 body 的，拿不到组件内祖先的作用域，所以这里只能不参与作用域化；
     块内的 `.select-content` / `select-content-in` 由本组件独占，不会与其它组件冲突。
     换用 `position="item-aligned"` 之类的改动也要一并检查这里是否仍然成立。 -->
<style lang="scss">
/* 弹层被传送到 body，因此不依赖调用方的层叠上下文；用独立令牌压过弹窗遮罩。 */
.select-content {
  z-index: var(--z-popover);
  min-width: var(--reka-select-trigger-width);
  max-height: min(280px, var(--reka-select-content-available-height));
  overflow: hidden;
  border: 1px solid var(--panel-line-strong);
  border-radius: var(--radius-input);
  background: var(--surface-2);
  box-shadow: var(--panel-shadow-elevated);
  backdrop-filter: blur(var(--blur-panel));
  -webkit-backdrop-filter: blur(var(--blur-panel));
}

.select-content[data-state="open"] {
  animation: select-content-in var(--motion-duration-fast) var(--motion-ease-emphasized);
}

@keyframes select-content-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
