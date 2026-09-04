import { ref } from "vue"
import { defineStore } from "pinia"
import type { DataSourceConfig } from "../features/data/types"

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
    // 9 月数据服务简易配置：先只承载 DEM 地形，后续扩展影像/矢量/模型
    const dataServices = ref<DataSourceConfig[]>([])
    const activeTerrainServiceId = ref<string>("")

    function upsertDataService(service: DataSourceConfig) {
      const index = dataServices.value.findIndex((item) => item.id === service.id)

      if (index === -1) {
        dataServices.value.push({ ...service })
        return
      }

      dataServices.value[index] = { ...service }
    }

    function removeDataService(serviceId: string) {
      dataServices.value = dataServices.value.filter((item) => item.id !== serviceId)

      if (activeTerrainServiceId.value === serviceId) {
        activeTerrainServiceId.value = ""
      }
    }

    return {
      lastVisitedAt,
      preferences,
      customBaseMapUrl,
      dataServices,
      activeTerrainServiceId,
      upsertDataService,
      removeDataService,
    }
  },
  {
    persist: {
      key: "local-store",
      storage: localStorage,
    },
  },
)
