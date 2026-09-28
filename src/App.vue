<template>
  <!-- ToastProvider 必须包住内容：它靠 provide 下发入口，而 provide 只沿组件树向下传递，
       放成 RouterView 的兄弟节点时路由视图注不到 ToastApi。 -->
  <ToastProvider>
    <div class="screen-shell">
      <AppTopBar />
      <RouterView v-slot="{ Component }">
        <KeepAlive include="DashboardWorkspace">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
  </ToastProvider>
</template>

<script setup lang="ts">
import AppTopBar from "./components/dashboard/AppTopBar.vue"
import ToastProvider from "./components/base/ToastProvider.vue"
</script>

<style scoped lang="scss">
.screen-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

@media (max-width: 1023px) {
  .screen-shell {
    --edge-gutter: 10px;
  }
}
</style>
