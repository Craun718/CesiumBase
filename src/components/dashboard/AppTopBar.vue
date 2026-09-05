<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <i class="bi bi-globe2"></i>
      </span>
      <div>
        <p>MAP ENGINE</p>
        <h1>数字态势监控中心</h1>
      </div>
    </div>

    <div class="system-status">
      <span class="status-pill is-online">运行正常</span>
      <span class="status-pill">演示数据</span>
    </div>
  </header>
</template>

<style scoped lang="scss">
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
  padding: 0 var(--edge-gutter, 18px);
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

@media (max-width: 1023px) {
  .topbar {
    min-height: 62px;
    padding: 0 var(--edge-gutter, 12px);
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
}

@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 12px var(--edge-gutter, 12px);
  }

  .brand h1 {
    white-space: normal;
  }
}
</style>
