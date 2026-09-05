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
    await requestPersistentStorage()
  } catch (error) {
    console.warn("[TileCache] Service Worker 注册失败", error)
  }
}

/**
 * 申请持久化存储，尽量减少浏览器在存储压力下自动清除瓦片缓存。
 */
async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return

  try {
    await navigator.storage.persist()
  } catch (error) {
    console.warn("[TileCache] 持久化存储申请失败", error)
  }
}
