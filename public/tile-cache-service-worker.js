/**
 * 天地图瓦片持久缓存服务。
 * 仅拦截并缓存 Tianditu 域名下的 WMTS / DataServer 瓦片请求。
 */
const TILE_CACHE_NAME = "cesium-tianditu-tiles-v1"
const TILE_CACHE_LIMIT = 4096
const TIANDITU_TILE_HOST = /^t\d+\.tianditu\.gov\.cn$/

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(activateTileCache())
})

self.addEventListener("fetch", (event) => {
  if (!isCacheableTileRequest(event.request)) return

  event.respondWith(loadTileWithCache(event.request))
})

/**
 * 清理旧版本缓存并接管当前客户端。
 */
async function activateTileCache() {
  await Promise.all([caches.delete(TILE_CACHE_NAME), self.clients.claim()])

  const cache = await caches.open(TILE_CACHE_NAME)
  await trimTileCache(cache)
}

/**
 * 判断请求是否为可持久缓存的天地图瓦片。
 */
function isCacheableTileRequest(request) {
  if (request.method !== "GET") return false

  const url = new URL(request.url)
  if (url.protocol !== "https:" || !TIANDITU_TILE_HOST.test(url.hostname)) {
    return false
  }

  const isWmtsTile =
    url.searchParams.get("SERVICE") === "WMTS" && url.searchParams.get("REQUEST") === "GetTile"
  const isDataServerTile = url.pathname === "/DataServer" && url.searchParams.has("T")

  return isWmtsTile || isDataServerTile
}

/**
 * 优先读取持久缓存，未命中时请求网络并写入缓存。
 */
async function loadTileWithCache(request) {
  const cache = await caches.open(TILE_CACHE_NAME)
  const cachedResponse = await cache.match(request, { ignoreVary: true })

  if (cachedResponse) {
    await touchCachedTile(cache, request, cachedResponse)
    return cachedResponse
  }

  const response = await fetch(request)
  if (!response.ok) return response

  await putTileInCache(cache, request, response.clone())
  return response
}

/**
 * 把缓存项删除后重新写回，使缓存键顺序近似记录最近使用情况。
 */
async function touchCachedTile(cache, request, response) {
  await cache.delete(request, { ignoreVary: true })
  await putTileInCache(cache, request, response.clone())
}

/**
 * 写入瓦片缓存，容量或配额不足时不能影响本次地图渲染。
 */
async function putTileInCache(cache, request, response) {
  try {
    await cache.put(request, response)
    await trimTileCache(cache)
  } catch (error) {
    console.warn("[TileCache] 瓦片写入缓存失败", error)
  }
}

/**
 * 控制持久缓存规模，优先移除最久未使用的瓦片。
 */
async function trimTileCache(cache) {
  const requests = await cache.keys()
  const countToRemove = requests.length - TILE_CACHE_LIMIT
  if (countToRemove <= 0) return

  await Promise.all(
    requests.slice(0, countToRemove).map((request) => cache.delete(request, { ignoreVary: true })),
  )
}
