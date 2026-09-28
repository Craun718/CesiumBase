<script setup lang="ts">
/**
 * 对话框基座。
 *
 * 用 Reka UI 的 Dialog 原语承载，而不是自己写遮罩 + `keydown.esc`：
 * 焦点陷阱、Esc 关闭、`aria-modal`、背景滚动锁定、关闭后焦点归还触发元素，
 * 这些都是一致性极高的行为，手写实现每漏一项就是一处无障碍缺口
 * （迁移前仓里有 5 个手写弹窗，其中 2 个既没有 Esc 也没有焦点管理）。
 *
 * 使用约定：
 * - `open` 必须是受控状态（配合 `v-model:open`），**不要**在调用处再套 `v-if`，
 *   否则组件被直接卸载，Presence 收不到退场动画，弹窗会瞬间消失。
 * - 不要再写 `@keydown.esc`：Reka 已经在内部处理，叠加会触发两次关闭。
 * - 标题由 `DialogTitle` 渲染，不可省略（缺失时 Reka 会警告且读屏拿不到名称）。
 *   需要标题只给读屏用时，用 `titleHidden`。
 */
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui"

withDefaults(
  defineProps<{
    /** 受控开关状态 */
    open: boolean
    /** 对话框标题，同时作为无障碍名称 */
    title: string
    /** 可选的一句话说明，与标题一起被读屏播报 */
    description?: string
    /** 卡片宽度档位 */
    size?: "sm" | "md" | "lg"
    /** 标题只给读屏用（视觉上由内容自行表达标题时） */
    titleHidden?: boolean
  }>(),
  { description: undefined, size: "md", titleHidden: false },
)

const emit = defineEmits<{
  "update:open": [value: boolean]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-card" :class="`is-${size}`">
        <header class="modal-head">
          <DialogTitle class="modal-title" :class="{ 'sr-only': titleHidden }">
            {{ title }}
          </DialogTitle>
          <DialogClose as-child>
            <button type="button" class="modal-close" title="关闭">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </DialogClose>
        </header>

        <DialogDescription v-if="description" class="modal-description">
          {{ description }}
        </DialogDescription>

        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
/* 遮罩只负责压暗背景、挡住下层的指针事件。
   ⚠ Reka 的 DialogOverlay 与 DialogContent 在 portal 里是**兄弟节点**，卡片不是它的子元素：
   照搬「遮罩铺满 + flex 居中 + 卡片作子元素」的老写法，遮罩就成了一个没有子元素可排的空全屏层，
   卡片则退化为静态流元素被它整个盖住——整个弹窗只剩一层暗底。
   居中与层级因此必须由卡片自己承担，这里不再承担任何容器职责。 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--surface-overlay);
}

/* Presence 靠 animationName 判断退场是否结束——这里只能用 animation，
   换成 transition 会让关闭变成瞬时的。 */
.modal-overlay[data-state="open"] {
  animation: modal-overlay-in var(--motion-duration-base) var(--motion-ease-standard);
}

.modal-overlay[data-state="closed"] {
  animation: modal-overlay-out var(--motion-duration-fast) var(--motion-ease-standard);
}

/* 卡片自己定位、自己居中：它和遮罩同级，上面没有父级可依托。
   居中走「inset 撑开 + margin: auto + height: fit-content」，不用 left/top 50% + translate(-50%,-50%)：
   下面的入场动画本身要改 transform（位移 + 缩放），而动画会覆盖基础 transform，
   那样卡片会在动画期间先跳到左上角、再弹回中心。
   `height: fit-content` 不能省——inset 四边都不为 auto 时 height: auto 会被拉伸到满高，
   auto 外边距分不到剩余空间，纵向居中就不会发生。
   max-width / max-height 用同一份内边距算，窄视口下卡片不会顶破这圈留白。 */
.modal-card {
  position: fixed;
  inset: var(--space-7);
  z-index: calc(var(--z-modal) + 1);
  display: grid;
  align-content: start;
  gap: var(--space-stack-md);
  width: min(420px, 100%);
  max-width: calc(100% - 2 * var(--space-7));
  height: fit-content;
  max-height: calc(100vh - 2 * var(--space-7));
  margin: auto;
  padding: var(--space-panel-elevated);
  overflow: auto;
  border: 1px solid var(--panel-line-strong);
  border-radius: var(--radius-modal);
  color: var(--text-secondary);
  background: var(--surface-1);
  box-shadow: var(--panel-shadow-elevated);
  outline: none;
  backdrop-filter: blur(var(--blur-panel));
  -webkit-backdrop-filter: blur(var(--blur-panel));
}

.modal-card.is-sm {
  width: min(360px, 100%);
}

.modal-card.is-lg {
  width: min(560px, 100%);
}

.modal-card[data-state="open"] {
  animation: modal-card-in var(--motion-duration-medium) var(--motion-ease-emphasized);
}

.modal-card[data-state="closed"] {
  animation: modal-card-out var(--motion-duration-fast) var(--motion-ease-standard);
}

.modal-head {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  font-size: var(--text-lg);
}

.modal-title {
  min-width: 0;
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-snug);
  overflow-wrap: anywhere;
}

.modal-close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control-md);
  height: var(--control-md);
  border: 1px solid var(--panel-line-strong);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
}

.modal-close:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.modal-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-body);
  line-height: var(--leading-relaxed);
}

@keyframes modal-overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes modal-overlay-out {
  to {
    opacity: 0;
  }
}

@keyframes modal-card-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

@keyframes modal-card-out {
  to {
    opacity: 0;
    transform: translateY(4px) scale(0.99);
  }
}
</style>
