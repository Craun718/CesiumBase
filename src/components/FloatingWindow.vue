<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string
    title: string
    tag?: string
    variant?: "panel" | "submenu"
    tagTone?: "default" | "alert"
    closable?: boolean
    closeLabel?: string
  }>(),
  {
    tag: undefined,
    variant: "panel",
    tagTone: "default",
    closable: true,
    closeLabel: undefined,
  },
)

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <section
    :id="id"
    class="floating-window"
    :class="variant === 'submenu' ? 'window-submenu' : 'window-panel'"
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
      <button
        v-if="closable"
        class="panel-close"
        type="button"
        :aria-label="closeLabel ?? `关闭${title}`"
        @click="emit('close')"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>

    <slot></slot>
  </section>
</template>

<style scoped lang="scss">
.floating-window {
  position: relative;
  min-width: 0;
  padding: var(--window-padding, 15px);
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(12px);
}

.window-submenu {
  --window-padding: 13px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: var(--window-head-padding, 11px);
  border-bottom: 1px solid var(--panel-inner-line);
}

.panel-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--window-title-size, 15px);
  font-weight: 650;
  line-height: 1.25;
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
  width: var(--window-close-size, 24px);
  height: var(--window-close-size, 24px);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-muted);
  background: transparent;
}

.panel-close:hover,
.panel-close:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
  background: rgba(31, 62, 104, 0.5);
}

.panel-close:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.panel-tag {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: var(--window-tag-size, 10px);
  line-height: 1;
}

.panel-tag.is-alert {
  color: var(--rose);
}

.submenu-head {
  padding-bottom: 10px;
}

.submenu-tag {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
}

.submenu-head strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
