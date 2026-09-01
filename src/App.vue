<script setup lang="ts">
import { computed, ref } from "vue"
import CesiumMap from "./components/CesiumMap.vue"

type LeftPanelId = "overview" | "distribution"
type RightPanelId = "alerts" | "resources"

const activeLeftPanel = ref<LeftPanelId | null>(null)
const activeRightPanel = ref<RightPanelId | null>(null)
const expandedLeftMenu = ref<LeftPanelId | null>(null)
const expandedRightMenu = ref<RightPanelId | null>(null)

const leftActions = [
  { id: "overview", label: "态势总览", icon: "bi-speedometer2" },
  { id: "distribution", label: "区域分布", icon: "bi-bar-chart-line" },
] satisfies Array<{ id: LeftPanelId; label: string; icon: string }>

const rightActions = [
  { id: "alerts", label: "实时告警", icon: "bi-bell" },
  { id: "resources", label: "资源负载", icon: "bi-cpu" },
] satisfies Array<{ id: RightPanelId; label: string; icon: string }>

const expandedLeftAction = computed(
  () => leftActions.find((action) => action.id === expandedLeftMenu.value) ?? null,
)

const expandedRightAction = computed(
  () => rightActions.find((action) => action.id === expandedRightMenu.value) ?? null,
)

function toggleLeftPanel(panel: LeftPanelId) {
  if (activeLeftPanel.value === panel) {
    closeLeftPanel()
    return
  }

  if (expandedLeftMenu.value === panel) {
    openLeftPanel(panel)
    return
  }

  expandedLeftMenu.value = panel
  activeLeftPanel.value = null
}

function toggleRightPanel(panel: RightPanelId) {
  if (activeRightPanel.value === panel) {
    closeRightPanel()
    return
  }

  if (expandedRightMenu.value === panel) {
    openRightPanel(panel)
    return
  }

  expandedRightMenu.value = panel
  activeRightPanel.value = null
}

function openLeftPanel(panel: LeftPanelId) {
  expandedLeftMenu.value = null
  activeLeftPanel.value = panel
}

function openRightPanel(panel: RightPanelId) {
  expandedRightMenu.value = null
  activeRightPanel.value = panel
}

function closeLeftPanel() {
  expandedLeftMenu.value = null
  activeLeftPanel.value = null
}

function closeRightPanel() {
  expandedRightMenu.value = null
  activeRightPanel.value = null
}

const overviewMetrics = [
  { label: "监测目标", value: "1,286", trend: "+24" },
  { label: "在线设备", value: "1,092", trend: "96.4%" },
  { label: "今日事件", value: "38", trend: "-6" },
  { label: "覆盖区域", value: "36", trend: "省份" },
]

const areaDistribution = [
  { name: "华东区域", value: 86 },
  { name: "华南区域", value: 72 },
  { name: "华北区域", value: 64 },
  { name: "西南区域", value: 48 },
  { name: "东北区域", value: 35 },
]

const alerts = [
  { level: "critical", title: "边界区域越限", location: "A-07 监测网格" },
  { level: "warning", title: "设备信号波动", location: "B-15 前置站点" },
  { level: "info", title: "图层加载完成", location: "基础影像服务" },
  { level: "warning", title: "资源负载升高", location: "渲染节点 03" },
]

const resourceLoads = [
  { name: "渲染节点", value: 68, state: "正常" },
  { name: "影像服务", value: 46, state: "稳定" },
  { name: "数据链路", value: 81, state: "繁忙" },
]
</script>

<template>
  <div class="screen-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <i class="bi bi-globe2"></i>
        </span>
        <div>
          <p>CESIUM BASE</p>
          <h1>数字态势监控中心</h1>
        </div>
      </div>

      <div class="system-status">
        <span class="status-pill is-online">运行正常</span>
        <span class="status-pill">演示数据</span>
      </div>
    </header>

    <main class="dashboard-body">
      <div class="content-grid">
        <aside class="side-rail rail-left" aria-label="左侧操作">
          <div class="rail-actions">
            <button
              v-for="action in leftActions"
              :key="action.id"
              class="rail-button"
              :class="{
                'is-active': expandedLeftMenu === action.id || activeLeftPanel === action.id,
              }"
              type="button"
              :aria-expanded="expandedLeftMenu === action.id || activeLeftPanel === action.id"
              :aria-controls="
                expandedLeftMenu === action.id ? 'left-secondary-menu' : `left-${action.id}-panel`
              "
              :data-tip="action.label"
              @click="toggleLeftPanel(action.id)"
            >
              <i class="bi" :class="action.icon" aria-hidden="true"></i>
            </button>
          </div>

          <section
            v-if="expandedLeftAction && activeLeftPanel === null"
            id="left-secondary-menu"
            class="floating-panel rail-panel panel-left rail-submenu"
            role="region"
            :aria-label="`${expandedLeftAction.label}二级菜单`"
            @keydown.escape="expandedLeftMenu = null"
          >
            <div class="submenu-head">
              <span>SECONDARY</span>
              <strong>{{ expandedLeftAction.label }}</strong>
            </div>
            <button
              class="submenu-option"
              type="button"
              @click="openLeftPanel(expandedLeftAction.id)"
            >
              <i class="bi" :class="expandedLeftAction.icon" aria-hidden="true"></i>
              <span>{{ expandedLeftAction.label }}</span>
              <i class="bi bi-chevron-right submenu-chevron" aria-hidden="true"></i>
            </button>
          </section>

          <section
            v-if="activeLeftPanel === 'overview'"
            id="left-overview-panel"
            class="floating-panel rail-panel panel-left"
            role="region"
            aria-label="态势总览"
            @keydown.escape="activeLeftPanel = null"
          >
            <div class="panel-head">
              <div class="panel-heading">
                <h2>态势总览</h2>
                <span class="panel-tag">TOTAL</span>
              </div>
              <button
                class="panel-close"
                type="button"
                aria-label="关闭态势总览"
                @click="closeLeftPanel"
              >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <div class="metric-grid">
              <article v-for="metric in overviewMetrics" :key="metric.label">
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
                <small>{{ metric.trend }}</small>
              </article>
            </div>
          </section>

          <section
            v-if="activeLeftPanel === 'distribution'"
            id="left-distribution-panel"
            class="floating-panel rail-panel panel-left"
            role="region"
            aria-label="区域分布"
            @keydown.escape="closeLeftPanel"
          >
            <div class="panel-head">
              <div class="panel-heading">
                <h2>区域分布</h2>
                <span class="panel-tag">REGION</span>
              </div>
              <button
                class="panel-close"
                type="button"
                aria-label="关闭区域分布"
                @click="closeLeftPanel"
              >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <div class="distribution-list">
              <div v-for="area in areaDistribution" :key="area.name" class="distribution-row">
                <span>{{ area.name }}</span>
                <div class="distribution-track" aria-hidden="true">
                  <i :style="{ width: `${area.value}%` }"></i>
                </div>
                <strong>{{ area.value }}</strong>
              </div>
            </div>
          </section>
        </aside>

        <div class="map-stage">
          <CesiumMap />
          <span class="stage-label" aria-hidden="true">三维态势视图</span>
        </div>

        <aside class="side-rail rail-right" aria-label="右侧操作">
          <div class="rail-actions">
            <button
              v-for="action in rightActions"
              :key="action.id"
              class="rail-button"
              :class="{
                'is-active': expandedRightMenu === action.id || activeRightPanel === action.id,
              }"
              type="button"
              :aria-expanded="expandedRightMenu === action.id || activeRightPanel === action.id"
              :aria-controls="
                expandedRightMenu === action.id
                  ? 'right-secondary-menu'
                  : `right-${action.id}-panel`
              "
              :data-tip="action.label"
              @click="toggleRightPanel(action.id)"
            >
              <i class="bi" :class="action.icon" aria-hidden="true"></i>
            </button>
          </div>

          <section
            v-if="expandedRightAction && activeRightPanel === null"
            id="right-secondary-menu"
            class="floating-panel rail-panel panel-right rail-submenu"
            role="region"
            :aria-label="`${expandedRightAction.label}二级菜单`"
            @keydown.escape="expandedRightMenu = null"
          >
            <div class="submenu-head">
              <span>SECONDARY</span>
              <strong>{{ expandedRightAction.label }}</strong>
            </div>
            <button
              class="submenu-option"
              type="button"
              @click="openRightPanel(expandedRightAction.id)"
            >
              <i class="bi" :class="expandedRightAction.icon" aria-hidden="true"></i>
              <span>{{ expandedRightAction.label }}</span>
              <i class="bi bi-chevron-right submenu-chevron" aria-hidden="true"></i>
            </button>
          </section>

          <section
            v-if="activeRightPanel === 'alerts'"
            id="right-alerts-panel"
            class="floating-panel rail-panel panel-right"
            role="region"
            aria-label="实时告警"
            @keydown.escape="activeRightPanel = null"
          >
            <div class="panel-head">
              <div class="panel-heading">
                <h2>实时告警</h2>
                <span class="panel-tag is-alert">ALERT</span>
              </div>
              <button
                class="panel-close"
                type="button"
                aria-label="关闭实时告警"
                @click="closeRightPanel"
              >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <ul class="alert-list">
              <li v-for="alert in alerts" :key="alert.title" :class="alert.level">
                <span class="alert-dot" aria-hidden="true"></span>
                <div>
                  <strong>{{ alert.title }}</strong>
                  <small>{{ alert.location }}</small>
                </div>
              </li>
            </ul>
          </section>

          <section
            v-if="activeRightPanel === 'resources'"
            id="right-resources-panel"
            class="floating-panel rail-panel panel-right"
            role="region"
            aria-label="资源负载"
            @keydown.escape="closeRightPanel"
          >
            <div class="panel-head">
              <div class="panel-heading">
                <h2>资源负载</h2>
                <span class="panel-tag">LOAD</span>
              </div>
              <button
                class="panel-close"
                type="button"
                aria-label="关闭资源负载"
                @click="closeRightPanel"
              >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
            <div class="resource-list">
              <div v-for="resource in resourceLoads" :key="resource.name">
                <div class="resource-row">
                  <span>{{ resource.name }}</span>
                  <strong>{{ resource.value }}%</strong>
                </div>
                <div class="resource-track" aria-hidden="true">
                  <i :style="{ width: `${resource.value}%` }"></i>
                </div>
                <small>{{ resource.state }}</small>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>

    <footer class="statusbar">
      <div class="status-group">
        <span>3D MODE</span>
        <span>WGS 84</span>
        <span>OSM TILE</span>
      </div>
      <div class="status-group">
        <span>静态演示页面</span>
        <span>无业务数据接入</span>
      </div>
    </footer>
  </div>
</template>

<style>
@import "tailwindcss";

@theme {
  --color-abyss: #030913;
  --color-panel: rgba(7, 20, 42, 0.78);
  --color-panel-border: rgba(79, 151, 255, 0.28);
  --color-panel-inner: rgba(79, 151, 255, 0.18);
  --color-text-primary: #e9f5ff;
  --color-text-secondary: #9db8dc;
  --color-text-muted: #6f8bad;
  --color-accent-cyan: #48e5ff;
  --color-accent-blue: #57a4ff;
  --color-accent-amber: #ffb648;
  --color-accent-rose: #ff5f78;

  --font-interface: Inter, "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-data: ui-monospace, Consolas, monospace;
}

:root {
  color-scheme: dark;
  font-family: var(--font-interface);
  font-size: 16px;
  line-height: 1.45;
  letter-spacing: 0;
  color: #dcecff;
  background: #030913;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  --panel-bg: var(--color-panel);
  --panel-border: var(--color-panel-border);
  --panel-inner-line: var(--color-panel-inner);
  --panel-shadow: 0 16px 42px rgba(1, 8, 20, 0.52);
  --text-primary: var(--color-text-primary);
  --text-secondary: var(--color-text-secondary);
  --text-muted: var(--color-text-muted);
  --cyan: var(--color-accent-cyan);
  --blue: var(--color-accent-blue);
  --amber: var(--color-accent-amber);
  --rose: var(--color-accent-rose);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow: hidden;
  background: #030913;
}

body,
#app {
  width: 100%;
  height: 100%;
}

#app {
  min-height: 100vh;
}

@media (max-width: 1023px) {
  body {
    overflow: auto;
  }
}
</style>

<style scoped lang="scss">
.screen-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  padding: 0;
  --edge-gutter: 18px;
  overflow: hidden;
  background: #030913;
}

.dashboard-body {
  min-width: 0;
  min-height: 0;
  display: flex;
  margin: 14px var(--edge-gutter);
  pointer-events: none;
}

.floating-panel {
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(12px);
}

.topbar {
  border: 0;
  border-bottom: 1px solid var(--panel-border);
  background: #0a2540;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 74px;
  padding: 0 var(--edge-gutter);
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.brand-mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(72, 229, 255, 0.72);
  border-radius: 4px;
}

.brand-mark > .bi {
  color: var(--cyan);
  font-size: 22px;
  line-height: 1;
}

.brand p {
  margin: 0;
  color: var(--cyan);
  font-size: 10px;
  line-height: 1.2;
}

.brand h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.system-status {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.status-pill.is-online {
  color: var(--cyan);
}

.status-pill::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.content-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px;
  gap: 14px;
  min-height: 0;
  align-items: stretch;
}

.side-rail {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  min-width: 0;
  max-height: 100%;
}

.rail-left {
  grid-column: 1;
  grid-row: 1;
}

.rail-right {
  grid-column: 3;
  grid-row: 1;
}

.rail-actions {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.rail-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgba(79, 151, 255, 0.32);
  border-radius: 5px;
  color: var(--text-secondary);
  background: rgba(7, 20, 42, 0.86);
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.rail-button > .bi {
  font-size: 19px;
  line-height: 1;
}

.rail-button:hover,
.rail-button:focus-visible,
.rail-button.is-active {
  border-color: rgba(72, 229, 255, 0.76);
  color: var(--cyan);
  background: rgba(16, 47, 83, 0.94);
}

.rail-button:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.rail-button::after {
  position: absolute;
  z-index: 5;
  padding: 5px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 3px;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  content: attr(data-tip);
  background: rgba(7, 20, 42, 0.96);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 120ms ease;
}

.rail-left .rail-button::after {
  left: calc(100% + 10px);
}

.rail-right .rail-button::after {
  right: calc(100% + 10px);
}

.rail-button:hover::after,
.rail-button:focus-visible::after {
  opacity: 1;
}

.floating-panel {
  position: relative;
  min-width: 0;
  padding: 15px;
  overflow: hidden;
  border-radius: 6px;
}

.rail-panel {
  position: absolute;
  top: 0;
  z-index: 3;
  width: min(302px, calc(100vw - 168px));
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
}

.rail-panel::-webkit-scrollbar {
  width: 4px;
}

.rail-panel::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(72, 229, 255, 0.45);
}

.panel-left {
  left: calc(100% + 12px);
}

.panel-right {
  right: calc(100% + 12px);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--panel-inner-line);
}

.panel-head h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
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

.panel-close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 24px;
  height: 24px;
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
  font-size: 10px;
  line-height: 1;
}

.panel-tag.is-alert {
  color: var(--rose);
}

.rail-submenu {
  padding: 13px;
}

.submenu-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--panel-inner-line);
}

.submenu-head span {
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

.submenu-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 42px;
  margin-top: 12px;
  padding: 9px 10px;
  border: 1px solid rgba(79, 151, 255, 0.24);
  border-radius: 4px;
  color: var(--text-secondary);
  background: rgba(19, 40, 72, 0.38);
  text-align: left;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.submenu-option > span {
  overflow: hidden;
  padding: 0 9px;
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.submenu-option > .bi:first-child,
.submenu-chevron {
  font-size: 15px;
  line-height: 1;
}

.submenu-option:hover,
.submenu-option:focus-visible {
  border-color: rgba(72, 229, 255, 0.68);
  color: var(--text-primary);
  background: rgba(16, 47, 83, 0.82);
}

.submenu-option:focus-visible {
  outline: 2px solid rgba(72, 229, 255, 0.42);
  outline-offset: 2px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 4px;
}

.metric-grid article {
  min-height: 86px;
  padding: 14px 4px 6px 12px;
  border-left: 1px solid var(--panel-inner-line);
}

.metric-grid article:nth-child(even) {
  margin-right: -15px;
  padding-right: 16px;
}

.metric-grid span,
.resource-list small,
.distribution-row span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}

.metric-grid strong {
  display: block;
  margin-top: 11px;
  color: var(--cyan);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 25px;
  font-weight: 600;
  line-height: 1;
}

.metric-grid small {
  display: block;
  margin-top: 7px;
  color: var(--amber);
  font-size: 11px;
}

.distribution-list,
.resource-list,
.alert-list {
  margin: 12px 0 0;
  padding: 0;
}

.distribution-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
}

.distribution-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.distribution-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  text-align: right;
}

.distribution-track,
.resource-track {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(31, 62, 104, 0.82);
}

.distribution-track i,
.resource-track i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan);
  transition: width 180ms ease;
}

.map-stage {
  position: relative;
  grid-column: 1 / -1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}

.stage-label {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border: 1px solid rgba(72, 229, 255, 0.28);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  background: rgba(7, 20, 42, 0.62);
}

.alert-list {
  display: grid;
  gap: 9px;
  list-style: none;
}

.alert-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border-left: 2px solid var(--blue);
  background: rgba(19, 40, 72, 0.44);
}

.alert-list .critical {
  border-left-color: var(--rose);
}

.alert-list .warning {
  border-left-color: var(--amber);
}

.alert-list .info {
  border-left-color: var(--cyan);
}

.alert-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--blue);
}

.critical .alert-dot {
  background: var(--rose);
}

.warning .alert-dot {
  background: var(--amber);
}

.info .alert-dot {
  background: var(--cyan);
}

.alert-list strong,
.alert-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-list strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.alert-list small {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 11px;
}

.resource-list {
  display: grid;
  gap: 15px;
}

.resource-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.resource-row span,
.resource-row strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.resource-row strong {
  color: var(--text-primary);
  font-family: ui-monospace, Consolas, monospace;
}

.resource-list > div > small {
  margin-top: 6px;
}

.statusbar {
  border: 0;
  border-top: 1px solid var(--panel-border);
  background: #0a2540;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 var(--edge-gutter);
}

.status-group {
  display: flex;
  align-items: center;
  gap: 18px;
  overflow: hidden;
}

.status-group span {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 1439px) {
  .rail-panel {
    width: min(286px, calc(100vw - 156px));
  }
}

@media (max-width: 1023px) {
  .screen-shell {
    gap: 0;
    padding: 0;
    --edge-gutter: 12px;
  }

  .dashboard-body {
    padding: 10px var(--edge-gutter);
    overflow: hidden;
  }

  .topbar {
    min-height: 62px;
    padding: 0 var(--edge-gutter);
  }

  .brand h1 {
    font-size: 18px;
  }

  .system-status {
    gap: 6px;
  }

  .status-pill {
    font-size: 11px;
  }

  .content-grid {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
  }

  .map-stage {
    display: none;
  }

  .side-rail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    max-width: 100%;
    padding: 2px;
    overflow: visible;
    scrollbar-width: thin;
    scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
    pointer-events: auto;
  }

  .rail-actions {
    flex: 0 0 auto;
    flex-direction: row;
  }

  .rail-button::after {
    display: none;
  }

  .rail-panel {
    position: relative;
    flex-basis: 100%;
    width: 100%;
    max-height: none;
    overflow: visible;
  }

  .panel-left,
  .panel-right {
    left: auto;
    right: auto;
  }

  .statusbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px var(--edge-gutter);
  }

  .status-group {
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 12px var(--edge-gutter);
  }

  .brand h1 {
    white-space: normal;
  }

  .status-group:last-child {
    display: none;
  }

  .rail-button {
    width: 42px;
    height: 42px;
  }
}
</style>
