<script setup lang="ts">
import DeckMap from './components/DeckMap.vue'

const overviewMetrics = [
  { label: '监测目标', value: '1,286', trend: '+24' },
  { label: '在线设备', value: '1,092', trend: '96.4%' },
  { label: '今日事件', value: '38', trend: '-6' },
  { label: '覆盖区域', value: '36', trend: '省份' },
]

const areaDistribution = [
  { name: '华东区域', value: 86 },
  { name: '华南区域', value: 72 },
  { name: '华北区域', value: 64 },
  { name: '西南区域', value: 48 },
  { name: '东北区域', value: 35 },
]

const alerts = [
  { level: 'critical', title: '边界区域越限', location: 'A-07 监测网格' },
  { level: 'warning', title: '设备信号波动', location: 'B-15 前置站点' },
  { level: 'info', title: '图层加载完成', location: '基础影像服务' },
  { level: 'warning', title: '资源负载升高', location: '渲染节点 03' },
]

const resourceLoads = [
  { name: '渲染节点', value: 68, state: '正常' },
  { name: '影像服务', value: 46, state: '稳定' },
  { name: '数据链路', value: 81, state: '繁忙' },
]
</script>

<template>
  <div class="screen-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p>DECK.GL BASE</p>
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
        <aside class="side-rail rail-left" aria-label="态势总览">
          <section class="floating-panel">
            <div class="panel-head">
              <h2>态势总览</h2>
              <span class="panel-tag">TOTAL</span>
            </div>
            <div class="metric-grid">
              <article v-for="metric in overviewMetrics" :key="metric.label">
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
                <small>{{ metric.trend }}</small>
              </article>
            </div>
          </section>

          <section class="floating-panel">
            <div class="panel-head">
              <h2>区域分布</h2>
              <span class="panel-tag">REGION</span>
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
          <DeckMap />
          <span class="stage-corner top-left"></span>
          <span class="stage-corner top-right"></span>
          <span class="stage-label" aria-hidden="true">三维态势视图</span>
          <span class="stage-corner bottom-left"></span>
          <span class="stage-corner bottom-right"></span>
        </div>

        <aside class="side-rail rail-right" aria-label="实时告警与资源负载">
          <section class="floating-panel">
            <div class="panel-head">
              <h2>实时告警</h2>
              <span class="panel-tag is-alert">ALERT</span>
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

          <section class="floating-panel">
            <div class="panel-head">
              <h2>资源负载</h2>
              <span class="panel-tag">LOAD</span>
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
        <span>WEBGL 2</span>
        <span>3D TERRAIN</span>
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
@import 'tailwindcss';

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

  --font-interface:
    Inter, 'HarmonyOS Sans SC', 'Microsoft YaHei', system-ui, sans-serif;
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
  gap: 14px;
  padding: 18px;
  overflow: hidden;
  background: #030913;
}

.dashboard-body {
  min-width: 0;
  min-height: 0;
  display: flex;
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
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 74px;
  padding: 0 4px;
}

.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.brand-mark {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(72, 229, 255, 0.72);
  border-radius: 4px;
}

.brand-mark::before,
.brand-mark::after {
  position: absolute;
  content: '';
}

.brand-mark::before {
  top: 7px;
  left: 9px;
  width: 18px;
  height: 10px;
  border: 1px solid var(--cyan);
  border-radius: 50%;
}

.brand-mark::after {
  top: 15px;
  left: 8px;
  width: 20px;
  height: 10px;
  border: 1px solid rgba(87, 164, 255, 0.86);
  border-radius: 50%;
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
  content: '';
}

.content-grid {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(252px, 328px) minmax(0, 1fr) minmax(252px, 328px);
  gap: 14px;
  min-height: 0;
  align-items: stretch;
}

.side-rail {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  display: grid;
  max-height: 100%;
  gap: 14px;
}

.rail-left {
  grid-column: 1;
  grid-row: 1;
}

.rail-right {
  grid-column: 3;
  grid-row: 1;
}

.floating-panel {
  position: relative;
  min-width: 0;
  padding: 15px;
  overflow: hidden;
  border-radius: 6px;
}

.floating-panel::before,
.floating-panel::after {
  position: absolute;
  width: 14px;
  height: 14px;
  pointer-events: none;
  content: '';
  border-color: var(--cyan);
}

.floating-panel::before {
  top: -1px;
  right: -1px;
  border-top: 2px solid;
  border-right: 2px solid;
}

.floating-panel::after {
  bottom: -1px;
  left: -1px;
  border-bottom: 2px solid;
  border-left: 2px solid;
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

.panel-tag {
  color: var(--text-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
}

.panel-tag.is-alert {
  color: var(--rose);
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

.stage-corner {
  position: absolute;
  width: 38px;
  height: 38px;
  border-color: rgba(72, 229, 255, 0.58);
}

.stage-corner.top-left {
  top: 2px;
  left: 4px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.stage-corner.top-right {
  top: 2px;
  right: 4px;
  border-top: 2px solid;
  border-right: 2px solid;
}

.stage-corner.bottom-left {
  bottom: 2px;
  left: 4px;
  border-bottom: 2px solid;
  border-left: 2px solid;
}

.stage-corner.bottom-right {
  bottom: 2px;
  right: 4px;
  border-bottom: 2px solid;
  border-right: 2px solid;
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
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 4px;
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
  .content-grid {
    grid-template-columns:
      minmax(238px, 276px) minmax(0, 1fr) minmax(238px, 276px);
  }
}

@media (max-width: 1023px) {
  .screen-shell {
    gap: 10px;
    padding: 12px;
  }

  .dashboard-body {
    overflow: hidden;
  }

  .topbar {
    min-height: 62px;
    padding: 0;
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
    max-width: 100%;
    padding: 2px;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(72, 229, 255, 0.45) transparent;
    pointer-events: auto;
  }

  .side-rail::-webkit-scrollbar {
    height: 4px;
  }

  .side-rail::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background: rgba(72, 229, 255, 0.45);
  }

  .floating-panel {
    flex: 0 0 272px;
  }

  .statusbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px 10px;
  }

  .status-group {
    gap: 10px;
  }

}

@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .brand h1 {
    white-space: normal;
  }

  .status-group:last-child {
    display: none;
  }

  .floating-panel {
    flex-basis: 248px;
  }
}
</style>
