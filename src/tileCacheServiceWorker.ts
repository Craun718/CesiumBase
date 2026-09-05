const TILE_CACHE_SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}tile-cache-service-worker.js`

/**
 * 注册持久化天地图瓦片缓存服务。
 */
export function registerTileCacheServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return

  if (document.readyState === "complete") {
    void registerServiceWorker()
    return
  }

  window.addEventListener("load", () => {
    void registerServiceWorker()
  })
}

/**
 * 注册 Service Worker，失败时仅提示并不影响地图功能。
 */
async function registerServiceWorker(): Promise<void> {
  try {
    await navigator.serviceWorker.register(TILE_CACHE_SERVICE_WORKER_URL)
  } catch (error) {
    console.warn("[TileCache] Service Worker 注册失败", error)
  }
}
