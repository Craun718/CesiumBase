<script setup lang="ts">
/**
 * 统一的二元开关（Reka Switch 封装）。
 *
 * 迁移前三处开关各自手写 `role="switch"` + `aria-checked`，轨道尺寸（28×15 / 28×14 /
 * 32×16）、选中底色和滑块动画都不一致。这里收敛成一套外观，并补齐两件事：
 * - `role="switch"` 由 Reka 负责，按下 Space / Enter 都会切换；
 * - 裸轨只有 16px 高，直接点太难点中，所以根节点始终留出 `--hit-min` 的命中高度。
 *
 * `variant` 与 `AppSelect` 同义：`bare` 是纯控件本身，`boxed` 是嵌进图标按钮行时的档位。
 * 两者都不画外框——开关的状态由轨道填色表达，一旦在轨道外套上同排按钮那圈描边与方底，
 * 它就会被读成「行里的第 N 个图标按钮」，而不是一枚开关。`boxed` 保留的只是与同排
 * 图标按钮一致的 32×32 命中格，用来维持行内四个控件的宽度与间距。
 * 不向 `SwitchRoot` 传 `name`，理由与 `AppSelect` 相同（本仓库没有原生表单提交）。
 */
import { SwitchRoot, SwitchThumb } from "reka-ui"

withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    /** 无可见文字标签时的可访问名称。 */
    ariaLabel?: string
    /** 原生 tooltip 文案。 */
    title?: string
    variant?: "bare" | "boxed"
  }>(),
  {
    modelValue: false,
    disabled: false,
    variant: "bare",
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

/** 把 Reka 的 `trueValue` / `falseValue` 收敛成布尔值。 */
function handleUpdate(value: unknown) {
  emit("update:modelValue", value === true)
}
</script>

<template>
  <SwitchRoot
    class="switch-root"
    :class="`is-${variant}`"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :title="title"
    @update:model-value="handleUpdate"
  >
    <span class="switch-track">
      <SwitchThumb class="switch-thumb" />
    </span>
    <span v-if="$slots.default" class="switch-label"><slot /></span>
  </SwitchRoot>
</template>

<style scoped lang="scss">
/* 轨道本身只有 16px 高，低于最小指针目标；命中区靠根节点的 min-height 撑到 24px。
   `justify-self: start` 让它在表单/网格里保持内容宽度——开关被拉伸成整列会很怪。 */
.switch-root {
  display: inline-flex;
  min-height: var(--hit-min);
  align-items: center;
  justify-self: start;
  gap: var(--space-5);
  padding: 0;
  border: 0;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-label);
  background: transparent;
  cursor: pointer;
}

.switch-root:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch-track {
  display: inline-flex;
  width: 32px;
  height: 16px;
  flex: none;
  align-items: center;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-muted) 32%, transparent);
  transition: background var(--motion-duration-base) var(--motion-ease-standard);
}

.switch-root[data-state="checked"] .switch-track {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}

/* 轨道内宽 28px、滑块 12px，可移动距离正好 16px。 */
.switch-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform var(--motion-duration-base) var(--motion-ease-standard);
}

.switch-root[data-state="checked"] .switch-thumb {
  transform: translateX(16px);
}

.switch-root[data-state="checked"] .switch-label {
  color: var(--accent);
}

/* 方框档：只取同排 .icon-action 图标按钮的 32×32 命中格与圆角，不画描边、不铺方底。
   槽位尺寸必须留着——行内四个控件等宽，去掉它图层名会横向跳一下；轨道在槽位里居中即可。
   描边与方底一旦加上，开关静止时就与邻座的图标按钮长得一样，「开/关」这个状态反而要靠
   对比才看得出来，所以这里把「框」整件事删掉，状态全部交给轨道填色。 */
.switch-root.is-boxed {
  width: var(--control-md);
  height: var(--control-md);
  min-height: var(--control-md);
  justify-content: center;
  border-radius: var(--radius-sm);
}

/* 无框之后，悬停反馈改由一层极淡底色承担：方底会让静止态和悬停态一样实，
   反馈就没意义了；改回描边则又把开关拉回按钮的观感。圆角由上一档给出，不会溢出成直角。 */
.switch-root.is-boxed:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neutral-mid) 42%, transparent);
}

/* 树行本身是 overflow:auto，外扩焦点环会被裁切 */
.switch-root.is-boxed:focus-visible {
  outline-offset: var(--ring-offset-tight);
}
</style>
