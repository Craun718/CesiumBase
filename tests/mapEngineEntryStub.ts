import type { MapEngineFactory } from "../src/map/types.js"

export const createMapEngine: MapEngineFactory = () => {
  throw new Error("测试不应加载真实地图引擎")
}
