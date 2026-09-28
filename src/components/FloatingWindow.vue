<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    id: string
    title: string
    tag?: string
    variant?: "panel" | "submenu"
    tagTone?: "default" | "alert"
    closable?: boolean
    closeLabel?: string
    minimizable?: boolean
    minimized?: boolean
    minimizeLabel?: string
    restoreLabel?: string
    /** 面板出现方向，用于决定进入动画从哪一侧滑入 */
    align?: "left" | "right" | "center"
  }>(),
  {
    tag: undefined,
    variant: "panel",
    tagTone: "default",
    closable: true,
    closeLabel: undefined,
    minimizable: false,
    minimized: false,
    minimizeLabel: undefined,
    restoreLabel: undefined,
    align: "right",
  },
)

const emit = defineEmits<{
  close: []
  minimize: []
}>()
</script>

<template>
  <section
    :id="id"
    class="floating-window"
    :class="[variant === 'submenu' ? 'window-submenu' : 'window-panel', `window-align-${align}`]"
    role="region"
    :aria-label="title"
    @keydown.escape="closable && emit('close')"
  >
    <header class="panel-head submenu-head" :class="{ 'is-submenu': variant === 'submenu' }">
      <div class="panel-heading" :class="{ 'submenu-heading': variant === 'submenu' }">
        <template v-if="variant === 'submenu'">
          <span class="submenu-tag">{{ tag ?? "SECONDARY" }}</span>
          <strong>{{ title }}</strong>
        </template>
        <template v-else>
          <h2>{{ title }}</h2>
          <span v-if="tag" class="panel-tag" :class="`is-${tagTone}`">{{ tag }}</span>
        </template>
      </div>
      <div class="panel-head-actions">
        <button
          v-if="props.minimizable"
          class="panel-close"
          type="button"
          :aria-label="
            props.minimized
              ? (props.restoreLabel ?? `还原${title}`)
              : (props.minimizeLabel ?? `最小化${title}`)
          "
          :title="
            props.minimized
              ? (props.restoreLabel ?? `还原${title}`)
              : (props.minimizeLabel ?? `最小化${title}`)
          "
          @click="emit('minimize')"
        >
          <i
            :class="props.minimized ? 'bi bi-chevron-down' : 'bi bi-dash-lg'"
            aria-hidden="true"
          ></i>
        </button>
        <button
          v-if="closable"
          class="panel-close"
          type="button"
          :aria-label="closeLabel ?? `关闭${title}`"
          @click="emit('close')"
        >
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>
    </header>

    <div class="floating-window-body" v-show="!props.minimized">
      <slot></slot>
    </div>
  </section>
</template>

<style scoped lang="scss">
.floating-window {
  position: relative;
  min-width: 0;
  padding: var(--window-padding, var(--space-panel-default));
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-panel);
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(var(--blur-panel));
  -webkit-backdrop-filter: blur(var(--blur-panel));
  animation: panel-enter var(--motion-duration-medium) var(--motion-ease-emphasized) both;
  will-change: transform, opacity;
}

.window-submenu {
  --window-padding: var(--space-panel-compact);
}

/* 紧凑型面板：共用紧凑的内边距、标题字号、关闭按钮尺寸 */
.window-compact {
  --window-padding: var(--space-panel-compact);
  --window-head-padding: var(--space-4);
  --window-title-size: var(--text-body);
  --window-tag-size: var(--text-2xs);
  --window-close-size: var(--control-sm);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: var(--window-head-padding, 11px);
  border-bottom: 1px solid var(--panel-inner-line);
}

.panel-head-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

/* 包裹层必须把外壳的剩余高度以 flex 项的身份传下去。
   外壳自己是 flex 列的面板（图层树、区域树：`--window-*` 之外还写了 `display: flex` +
   `max-height` + `overflow: hidden`）依赖插槽里的列表写 `flex: 1` + `min-height: 0` 撑满并内部滚动。
   包裹层若还是默认的块盒，它会按内容长高、又不参与收缩，内层因此拿不到确定高度：
   既缩不下去、也不会出现滚动条，超出部分被外壳的 `overflow: hidden` 直接裁掉。
   外壳不是 flex 的面板不受影响——`flex` 在块级父容器下是空操作，`display: flex` 的纵向堆叠
   与块级排布在这些面板的单根插槽内容上表现一致。 */
.floating-window-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.panel-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--window-title-size, var(--text-lg));
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
}

.panel-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.submenu-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.panel-close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: var(--window-close-size, var(--control-md));
  height: var(--window-close-size, var(--control-md));
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  transition:
    color var(--motion-duration-base) var(--motion-ease-standard),
    background var(--motion-duration-base) var(--motion-ease-standard),
    border-color var(--motion-duration-base) var(--motion-ease-standard);
}

.panel-close:hover {
  border-color: var(--panel-border);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--neutral) 20%, transparent);
}

.panel-close:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

/* 焦点环由 global.css 统一提供；小尺寸按钮通过 .panel-close:focus-visible 规则覆盖 offset */

.panel-tag {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--window-tag-size, var(--text-2xs));
  line-height: 1;
}

.panel-tag.is-alert {
  color: var(--danger);
}

.submenu-head {
  padding-bottom: 10px;
}

.submenu-tag {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  line-height: 1;
}

.submenu-head strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 进入动画方向感：左侧面板从右滑入，右侧面板从左滑入，居中淡入 */
@keyframes panel-enter {
  from {
    opacity: 0;
    transform: translateX(0) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.window-align-left {
  animation-name: panel-enter-from-right;
}

.window-align-right {
  animation-name: panel-enter-from-left;
}

@keyframes panel-enter-from-right {
  from {
    opacity: 0;
    transform: translateX(8px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes panel-enter-from-left {
  from {
    opacity: 0;
    transform: translateX(-8px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
</style>
