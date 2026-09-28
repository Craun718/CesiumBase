import { isProxy, toRaw } from "vue"

/** ???? Vue Proxy ???????? */
export function cloneCatalogValue<T>(value: T): T {
  return structuredClone(unwrapProxy(value)) as T
}

/** ??????????? Vue Proxy? */
function unwrapProxy(value: unknown): unknown {
  const raw = isProxy(value) ? toRaw(value) : value
  if (Array.isArray(raw)) return raw.map((item) => unwrapProxy(item))
  if (raw && typeof raw === "object") {
    const result: Record<PropertyKey, unknown> = {}
    for (const key of Reflect.ownKeys(raw)) {
      result[key] = unwrapProxy((raw as Record<PropertyKey, unknown>)[key])
    }
    return result
  }
  return raw
}
