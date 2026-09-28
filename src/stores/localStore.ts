import { ref } from "vue"
import { defineStore } from "pinia"
import type { FlightRoute, MapDraw3DFeature, MapDrawFeature, ViewFavorite } from "../map"

// 环绕飞行用户偏好：仅保留周期一项；旧数据缺失时由 OrbitFlightPanel 在 onMounted 兜底。
const DEFAULT_ORBIT_DURATION_SECONDS = 20

// 本地 store：数据持久化到 localStorage，跨标签页与会话保留
export const useLocalStore = defineStore(
  "local",
  () => {
    // 最近一次访问时间（ISO 字符串），用于跨会话恢复
    const lastVisitedAt = ref<string>("")
    // 用户偏好设置示例：持久化到 localStorage
    const preferences = ref<Record<string, unknown>>({})
    // 收藏视角：相机参数与压缩截图一起保存在本机
    const viewFavorites = ref<ViewFavorite[]>([])
    // 飞行漫游航线：航点与播放参数一起保存在本机
    const flightRoutes = ref<FlightRoute[]>([])
    // 绘制成果：所有几何类型（点 / 折线 / 多边形 / 矩形 / 圆 / 椭圆 / 走廊带 / 缓冲区）保存在本机
    const drawingFeatures = ref<MapDrawFeature[]>([])
    // 三维绘制成果：标注 / 图标 / 长方体 / 圆柱 / 球体 / 墙体 / 管线 / 水面 / 视频面保存在本机
    const drawing3DFeatures = ref<MapDraw3DFeature[]>([])
    // 环绕飞行偏好：一圈耗时；与航线无关的全局用户偏好
    const orbitPreferences = ref<{ durationSeconds: number }>({
      durationSeconds: DEFAULT_ORBIT_DURATION_SECONDS,
    })

    return {
      lastVisitedAt,
      preferences,
      viewFavorites,
      flightRoutes,
      drawingFeatures,
      drawing3DFeatures,
      orbitPreferences,
    }
  },
  {
    persist: {
      key: "local-store",
      storage: localStorage,
    },
  },
)
