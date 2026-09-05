import { ref } from "vue"
import { defineStore } from "pinia"
import type { FlightRoute, ViewFavorite } from "../map"

// 本地 store：数据持久化到 localStorage，跨标签页与会话保留
export const useLocalStore = defineStore(
  "local",
  () => {
    // 最近一次访问时间（ISO 字符串），用于跨会话恢复
    const lastVisitedAt = ref<string>("")
    // 用户偏好设置示例：持久化到 localStorage
    const preferences = ref<Record<string, unknown>>({})
    // 自定义底图瓦片 URL：持久化保存，重新打开页面后自动恢复
    const customBaseMapUrl = ref<string>("")
    // 收藏视角：相机参数与压缩截图一起保存在本机
    const viewFavorites = ref<ViewFavorite[]>([])
    // 飞行漫游航线：航点与播放参数一起保存在本机
    const flightRoutes = ref<FlightRoute[]>([])

    return {
      lastVisitedAt,
      preferences,
      customBaseMapUrl,
      viewFavorites,
      flightRoutes,
    }
  },
  {
    persist: {
      key: "local-store",
      storage: localStorage,
    },
  },
)
