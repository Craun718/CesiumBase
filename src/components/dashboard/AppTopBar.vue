<template>
  <header class="topbar">
    <div class="brand">
      <img class="brand-logo" src="/cesium-logo.png" alt="" aria-hidden="true" />
      <h1>数字孪生三维可视化平台</h1>
    </div>
  </header>
</template>

<style scoped lang="scss">
.topbar {
  position: relative;
  border: 0;
  border-bottom: 1px solid var(--panel-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 46%),
    linear-gradient(
      180deg,
      var(--surface-chrome-soft),
      color-mix(in srgb, var(--surface-0) 98%, transparent)
    );
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 74px;
  padding: 0 var(--edge-gutter, 18px);
  overflow: hidden;
}

.topbar::after {
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--accent) 78%, transparent) 50%,
    transparent 100%
  );
  content: "";
}

.brand {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: center;
  max-width: calc(100% - 36px);
  min-width: 0;
}

.brand-logo {
  position: absolute;
  top: 50%;
  left: calc(var(--edge-gutter, 18px) * -1);
  display: block;
  width: 118px;
  height: 30px;
  object-fit: contain;
  transform: translateY(-50%);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 45%, transparent));
}

.brand h1 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  white-space: nowrap;
  background: var(--brand-text-gradient);
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--accent) 38%, transparent));
}

@media (max-width: 1023px) {
  .topbar {
    min-height: 62px;
    padding: 0 var(--edge-gutter, 12px);
  }

  .brand h1 {
    font-size: var(--text-xl);
  }

  .brand-logo {
    width: 82px;
    height: 21px;
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
    text-align: left;
  }

  .brand {
    display: flex;
    align-items: center;
    max-width: 100%;
    gap: 10px;
    text-align: left;
  }

  .brand-logo {
    position: static;
    transform: none;
  }
}
</style>
