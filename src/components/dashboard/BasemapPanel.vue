<script setup lang="ts">
import { computed } from "vue"
import RailPanel from "./RailPanel.vue"
import type { MapControls } from "./mapControls"

const props = defineProps<{ controls: MapControls }>()

const customUrl = computed({
  get: () => props.controls.customBaseMapUrlInput,
  set: (value: string) => {
    props.controls.customBaseMapUrlInput = value
  },
})
</script>

<template>
  <RailPanel
    id="basemap-window"
    class="basemap-window"
    placement="map-tool"
    title="底图切换"
    tag="BASEMAP"
    close-label="关闭底图切换"
    @close="controls.closeBasemapPanel()"
  >
    <div v-if="controls.basemapSources.length === 0" class="basemap-empty">
      当前引擎暂无可切换的底图
    </div>
    <div v-else class="basemap-options" role="radiogroup" aria-label="底图切换">
      <button
        v-for="source in controls.basemapSources"
        :key="source.id"
        class="basemap-option"
        :class="{ 'is-active': source.id === controls.activeBasemapId }"
        type="button"
        role="radio"
        :aria-checked="source.id === controls.activeBasemapId"
        :title="source.description"
        @click="controls.selectBasemap(source.id)"
      >
        <span class="basemap-radio" aria-hidden="true"></span>
        <span class="basemap-meta">
          <strong>{{ source.label }}</strong>
          <small v-if="source.description">{{ source.description }}</small>
        </span>
      </button>
    </div>
    <div class="basemap-custom">
      <label for="basemap-custom-url">自定义瓦片 URL</label>
      <input
        id="basemap-custom-url"
        v-model="customUrl"
        type="text"
        spellcheck="false"
        placeholder="https://tile.example.com/{z}/{x}/{y}.png"
      />
      <button
        type="button"
        class="basemap-custom-apply"
        :disabled="!customUrl.trim()"
        @click="controls.applyCustomBasemap()"
      >
        应用自定义底图
      </button>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
.basemap-window {
  --window-padding: 10px;
  --window-head-padding: 8px;
  --window-title-size: 13px;
  --window-tag-size: 9px;
  --window-close-size: 20px;
  min-width: 0;
}

.basemap-empty {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.basemap-options {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.basemap-option {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.55);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.basemap-option:hover,
.basemap-option:focus-visible {
  border-color: var(--panel-border);
  color: var(--text-primary);
}

.basemap-option:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 1px;
}

.basemap-option.is-active {
  border-color: rgba(72, 229, 255, 0.55);
  color: var(--text-primary);
  background: rgba(72, 229, 255, 0.08);
}

.basemap-radio {
  width: 12px;
  height: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  background: transparent;
}

.basemap-option.is-active .basemap-radio {
  border-color: var(--cyan);
  background: var(--cyan);
  box-shadow: inset 0 0 0 2px rgba(7, 20, 42, 0.85);
}

.basemap-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.basemap-meta strong {
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.basemap-meta small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.basemap-custom {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-inner-line);
}

.basemap-custom label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.basemap-custom input {
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  background: rgba(7, 20, 42, 0.55);
  outline: none;
  transition: border-color 140ms ease;
}

.basemap-custom input:focus {
  border-color: rgba(72, 229, 255, 0.55);
}

.basemap-custom-apply {
  padding: 7px 10px;
  border: 1px solid rgba(72, 229, 255, 0.45);
  border-radius: 4px;
  color: var(--cyan);
  font-size: 12px;
  background: rgba(72, 229, 255, 0.06);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.basemap-custom-apply:hover:not(:disabled),
.basemap-custom-apply:focus-visible {
  border-color: var(--cyan);
  color: var(--text-primary);
  background: rgba(72, 229, 255, 0.14);
}

.basemap-custom-apply:disabled {
  border-color: var(--panel-inner-line);
  color: var(--text-muted);
  background: rgba(7, 20, 42, 0.35);
  cursor: not-allowed;
}
</style>
