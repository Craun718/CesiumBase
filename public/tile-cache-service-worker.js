// @ts-check
/// <reference lib="webworker" />

/**
 * 天地图瓦片持久缓存服务。
 * 仅拦截并缓存 Tianditu 域名下的 WMTS / DataServer 瓦片请求。
 */
/**
 * @typedef {object} TileUsageRecord
 * @property {string} cacheKey
 * @property {number} lastUsedAt
 */

const TILE_CACHE_NAME = "cesium-tianditu-tiles-v2"
const LEGACY_TILE_CACHE_NAME = "cesium-tianditu-tiles-v1"
const TILE_CACHE_HIGH_WATER_MARK = 16384
const TILE_CACHE_LOW_WATER_MARK = 12288
const TILE_CACHE_DELETE_BATCH_SIZE = 128
const TILE_USAGE_DATABASE_NAME = "cesium-tile-cache-v2"
const TILE_USAGE_STORE_NAME = "tile-usage"
const TIANDITU_TILE_HOST = /^t\d+\.tianditu\.gov\.cn$/

/** 当前瓦片缓存实例，避免每个瓦片请求重复打开同一个 Cache。 */
/** @type {Promise<Cache> | null} */
let tileCachePromise = null

/** 最近使用时间数据库实例，缺失时保持为解析为 null 的 Promise。 */
/** @type {Promise<IDBDatabase | null> | null} */
let tileUsageDatabasePromise = null

/** Service Worker 生命周期内的缓存条目数量，避免写入路径频繁执行 cache.keys。 */
/** @type {number | null} */
let cachedTileCount = null

/** 防止并发写入同时触发多轮批量清理。 */
let isTrimmingTileCache = false

/** Service Worker 全局对象，用于获得 fetch / activate 等专用事件类型。 */
/** @type {ServiceWorkerGlobalScope} */
const serviceWorkerScope = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self))

serviceWorkerScope.addEventListener("install", () => {
  serviceWorkerScope.skipWaiting()
})

serviceWorkerScope.addEventListener("activate", (event) => {
  event.waitUntil(activateTileCache())
})

serviceWorkerScope.addEventListener("fetch", (event) => {
  if (!isCacheableTileRequest(event.request)) return

  event.respondWith(loadTileWithCache(event))
})

/**
 * 清理旧版本缓存、初始化缓存计数并接管当前客户端。
 * @returns {Promise<void>}
 */
async function activateTileCache() {
  const cache = await openTileCache()
  await caches.delete(LEGACY_TILE_CACHE_NAME)
  cachedTileCount = (await cache.keys()).length
  await serviceWorkerScope.clients.claim()
  await trimTileCache()
}

/**
 * 判断请求是否为可持久缓存的天地图瓦片。
 * @param {Request} request
 * @returns {boolean}
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
 * 生成忽略子域名和访问令牌的稳定缓存键。
 * @param {Request} request
 * @returns {string}
 */
function createCanonicalTileKey(request) {
  const url = new URL(request.url)
  const parameters = Array.from(url.searchParams.entries())
    .filter(([name]) => name.toLowerCase() !== "tk")
    .sort(([left], [right]) => left.localeCompare(right))

  url.hostname = "t0.tianditu.gov.cn"
  url.username = ""
  url.password = ""
  url.hash = ""
  url.search = new URLSearchParams(parameters).toString()

  return url.toString()
}

/**
 * 打开当前版本的瓦片缓存。
 * @returns {Promise<Cache>}
 */
function openTileCache() {
  if (!tileCachePromise) {
    tileCachePromise = caches.open(TILE_CACHE_NAME).catch((error) => {
      tileCachePromise = null
      throw error
    })
  }

  return tileCachePromise
}

/**
 * 优先读取持久缓存，未命中时请求网络并异步写入缓存。
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
async function loadTileWithCache(event) {
  const cacheKey = createCanonicalTileKey(event.request)
  const cache = await openTileCache()
  const cachedResponse = await cache.match(cacheKey, { ignoreVary: true })

  if (cachedResponse) {
    event.waitUntil(touchTileUsage(cacheKey))
    return cachedResponse
  }

  const response = await fetch(event.request)
  if (response.ok) {
    event.waitUntil(putTileInCache(cache, cacheKey, response.clone()))
  }

  return response
}

/**
 * 写入瓦片缓存，容量或配额不足时不能影响本次地图渲染。
 * @param {Cache} cache
 * @param {string} cacheKey
 * @param {Response} response
 * @returns {Promise<void>}
 */
async function putTileInCache(cache, cacheKey, response) {
  try {
    if (cachedTileCount === null) {
      cachedTileCount = (await cache.keys()).length
    }

    await cache.put(cacheKey, response)
    cachedTileCount += 1
    const shouldTrimTileCache =
      cachedTileCount >= TILE_CACHE_HIGH_WATER_MARK && !isTrimmingTileCache
    if (shouldTrimTileCache) {
      isTrimmingTileCache = true
    }

    await touchTileUsage(cacheKey)
    if (shouldTrimTileCache) {
      try {
        await trimTileCache()
      } finally {
        isTrimmingTileCache = false
      }
    }
  } catch (error) {
    console.warn("[TileCache] 瓦片写入缓存失败", error)
  }
}

/**
 * 打开最近使用时间数据库；不可用时返回 null 并退回近似 FIFO 淘汰。
 * @returns {Promise<IDBDatabase | null>}
 */
function openTileUsageDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  if (tileUsageDatabasePromise) return tileUsageDatabasePromise

  tileUsageDatabasePromise = new Promise((resolve, reject) => {
    const databaseRequest = indexedDB.open(TILE_USAGE_DATABASE_NAME, 1)

    databaseRequest.onupgradeneeded = () => {
      const database = databaseRequest.result
      if (!database.objectStoreNames.contains(TILE_USAGE_STORE_NAME)) {
        const store = database.createObjectStore(TILE_USAGE_STORE_NAME, {
          keyPath: "cacheKey",
        })
        store.createIndex("lastUsedAt", "lastUsedAt")
      }
    }

    databaseRequest.onsuccess = () => resolve(databaseRequest.result)
    databaseRequest.onerror = () => reject(databaseRequest.error)
  }).catch((error) => {
    console.warn("[TileCache] 瓦片使用记录数据库打开失败", error)
    return null
  })

  return tileUsageDatabasePromise
}

/**
 * 异步记录瓦片最近使用时间。
 * @param {string} cacheKey
 * @returns {Promise<void>}
 */
async function touchTileUsage(cacheKey) {
  const database = await openTileUsageDatabase()
  if (!database) return

  try {
    await createIndexedDBPromise((resolve, reject) => {
      const transaction = database.transaction(TILE_USAGE_STORE_NAME, "readwrite")
      transaction.oncomplete = () => resolve(undefined)
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(TILE_USAGE_STORE_NAME).put({ cacheKey, lastUsedAt: Date.now() })
    })
  } catch (error) {
    console.warn("[TileCache] 瓦片使用记录更新失败", error)
  }
}

/**
 * 读取全部瓦片使用记录。
 * @returns {Promise<TileUsageRecord[]>}
 */
async function readTileUsageRecords() {
  const database = await openTileUsageDatabase()
  if (!database) return []

  try {
    return await createIndexedDBPromise((resolve, reject) => {
      const transaction = database.transaction(TILE_USAGE_STORE_NAME, "readonly")
      const request = transaction.objectStore(TILE_USAGE_STORE_NAME).getAll()
      request.onsuccess = () => resolve(/** @type {TileUsageRecord[]} */ (request.result))
      request.onerror = () => reject(request.error)
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  } catch (error) {
    console.warn("[TileCache] 瓦片使用记录读取失败", error)
    return []
  }
}

/**
 * 删除不再对应缓存项的使用记录。
 * @param {Set<string>} cacheKeys
 * @returns {Promise<void>}
 */
async function deleteTileUsageRecords(cacheKeys) {
  if (cacheKeys.size === 0) return

  const database = await openTileUsageDatabase()
  if (!database) return

  try {
    await createIndexedDBPromise((resolve, reject) => {
      const transaction = database.transaction(TILE_USAGE_STORE_NAME, "readwrite")
      const store = transaction.objectStore(TILE_USAGE_STORE_NAME)

      for (const cacheKey of cacheKeys) {
        store.delete(cacheKey)
      }

      transaction.oncomplete = () => resolve(undefined)
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  } catch (error) {
    console.warn("[TileCache] 瓦片使用记录清理失败", error)
  }
}

/**
 * 为 IndexedDB 事务封装 Promise，统一处理完成与失败。
 * @template T
 * @param {(resolve: (value: T) => void, reject: (reason?: unknown) => void) => void} createRequest
 * @returns {Promise<T>}
 */
function createIndexedDBPromise(createRequest) {
  return new Promise((resolve, reject) => {
    createRequest(resolve, reject)
  })
}

/**
 * 达到高水位后批量移除较久未使用的瓦片，并回落到低水位。
 * @returns {Promise<void>}
 */
async function trimTileCache() {
  const cache = await openTileCache()
  const requests = await cache.keys()
  cachedTileCount = requests.length

  if (requests.length < TILE_CACHE_HIGH_WATER_MARK) return

  const countToRemove = requests.length - TILE_CACHE_LOW_WATER_MARK

  const usageRecords = await readTileUsageRecords()
  const lastUsedAtByKey = new Map(
    usageRecords.map((record) => [record.cacheKey, Number(record.lastUsedAt) || 0]),
  )
  const activeCacheKeys = new Set(requests.map((request) => request.url))
  const requestsToRemove = [...requests]
    .sort(
      (left, right) => (lastUsedAtByKey.get(left.url) ?? 0) - (lastUsedAtByKey.get(right.url) ?? 0),
    )
    .slice(0, countToRemove)

  let deletedCount = 0
  for (let index = 0; index < requestsToRemove.length; index += TILE_CACHE_DELETE_BATCH_SIZE) {
    const batch = requestsToRemove.slice(index, index + TILE_CACHE_DELETE_BATCH_SIZE)
    const deleteResults = await Promise.all(
      batch.map((request) => cache.delete(request, { ignoreVary: true })),
    )
    deletedCount += deleteResults.filter(Boolean).length
  }

  cachedTileCount = requests.length - deletedCount

  const obsoleteUsageKeys = new Set(
    usageRecords
      .map((record) => record.cacheKey)
      .filter((cacheKey) => !activeCacheKeys.has(cacheKey)),
  )
  for (const request of requestsToRemove) {
    obsoleteUsageKeys.add(request.url)
  }
  await deleteTileUsageRecords(obsoleteUsageKeys)
}
