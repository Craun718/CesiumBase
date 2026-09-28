<script setup lang="ts">
/**
 * 全局提示条视口。
 *
 * 全应用只挂载一次（`App.vue`），并独占三件事：唯一的坐标、唯一的计时器、唯一的队列。
 * 业务侧不再自己 `position: fixed` 和 `setTimeout`，只通过 `useToast()` 描述要显示什么。
 *
 * 计时按「最早到期的那条」排一次 `setTimeout`，而不是每条一个定时器；
 * 队列空或全都只能手动关闭时停表，不留空转的定时器。
 */
import { computed, onBeforeUnmount, provide, ref, watch } from "vue"
import {
  createToast,
  createToastState,
  dismissToast,
  expireToasts,
  getToastIcon,
  nextExpiry,
  showToast,
  type ToastOptions,
  type ToastState,
} from "./toastQueue"
import { toastKey, type ToastApi } from "./useToast"

const state = ref<ToastState>(createToastState())
const items = computed(() => state.value.items)
/* 视口锚在右上角，把最新一条排到最上面最贴近锚点；队列语义不受渲染顺序影响，
   裁剪仍然发生在 showToast 里、仍然丢弃最早的一条。 */
const stackedItems = computed(() => [...items.value].reverse())
let timer: number | undefined

provide<ToastApi>(toastKey, { items, show, dismiss })

/** 加入一条提示；内容为空白时忽略。 */
function show(options: ToastOptions) {
  const toast = createToast(options, Date.now())
  if (!toast) return

  state.value = showToast(state.value, toast)
}

/** 关闭指定提示。 */
function dismiss(id: string) {
  state.value = dismissToast(state.value, id)
}

/** 按最早到期时刻排一次唤醒；没有可自动关闭的条目时停表。 */
function schedule() {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }

  const deadline = nextExpiry(state.value)
  if (deadline === undefined) return

  timer = window.setTimeout(
    () => {
      timer = undefined
      state.value = expireToasts(state.value, Date.now())
    },
    Math.max(0, deadline - Date.now()),
  )
}

watch(() => state.value.items.map((item) => `${item.id}@${item.expiresAt}`).join("|"), schedule, {
  immediate: true,
})

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})
</script>

<template>
  <!-- 默认插槽先出，提示条视口紧随其后：这样调用方把页面内容放进 Provider 内部，
       `provide` 才能沿组件树传到路由视图。两个根节点是并列的兄弟，
       视口本身 `position: fixed`，不会给外层布局多添一个盒子。 -->
  <slot />

  <div class="toast-viewport" role="region" aria-label="操作提示">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div
        v-for="item in stackedItems"
        :key="item.id"
        class="toast-item"
        :class="item.tone"
        :role="item.tone === 'error' ? 'alert' : 'status'"
        aria-live="polite"
      >
        <i :class="['bi', getToastIcon(item.tone)]" aria-hidden="true"></i>
        <div class="toast-body">
          <strong v-if="item.title">{{ item.title }}</strong>
          <span>{{ item.message }}</span>
        </div>
        <button type="button" title="关闭提示" @click="dismiss(item.id)">
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toast-viewport {
  position: fixed;
  top: 76px;
  right: var(--edge-gutter, 24px);
  z-index: var(--z-toast);
  /* 视口本身不拦指针，只有提示条拦——否则它会挡住右上角的地图操作。 */
  pointer-events: none;
}

.toast-stack {
  display: grid;
  width: min(420px, calc(100vw - 48px));
  gap: var(--space-4);
}

.toast-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: start;
  padding: var(--space-5) var(--space-6);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: var(--radius-button);
  color: var(--text-primary);
  background: var(--glass-bg-toast);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(var(--blur-toast));
  -webkit-backdrop-filter: blur(var(--blur-toast));
  font-size: var(--text-label);
  line-height: var(--leading-snug);
  pointer-events: auto;
}

.toast-item.error {
  border-color: color-mix(in srgb, var(--danger) 55%, transparent);
}

.toast-item.warning {
  border-color: color-mix(in srgb, var(--warning) 55%, transparent);
}

.toast-item.info {
  border-color: color-mix(in srgb, var(--neutral) 45%, transparent);
}

.toast-item > i {
  color: var(--accent);
  line-height: var(--leading-snug);
}

.toast-item.error > i {
  color: var(--danger);
}

.toast-item.warning > i {
  color: var(--warning);
}

.toast-item.info > i {
  color: var(--neutral);
}

.toast-body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.toast-body strong {
  font-weight: var(--weight-semibold);
}

.toast-body span {
  min-width: 0;
  /* 图层名和文件名可能很长且无空格，允许在任意位置断行而非撑破面板。 */
  overflow-wrap: anywhere;
}

.toast-item button {
  display: grid;
  place-items: center;
  width: var(--control-xs);
  height: var(--control-xs);
  border: 1px solid var(--panel-line-strong);
  border-radius: var(--radius-input);
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
}

.toast-item button:hover,
.toast-item button:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-duration-base) var(--motion-ease-standard),
    transform var(--motion-duration-base) var(--motion-ease-emphasized);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

/* 列表重排时给剩余的提示条让位，避免关闭一条时其余瞬间跳位。 */
.toast-move {
  transition: transform var(--motion-duration-base) var(--motion-ease-emphasized);
}
</style>
