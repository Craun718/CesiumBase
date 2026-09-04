import { ref } from "vue"
import { defineStore } from "pinia"

// 会话 store：数据持久化到 sessionStorage，会话结束后自动清除
export const useSessionStore = defineStore(
  "session",
  () => {
    // 当前会话标识，用于区分同一浏览器的不同会话
    const sessionId = ref<string>("")
    // 会话级临时状态示例：仅当前标签页会话内有效
    const temporary = ref<Record<string, unknown>>({})

    return { sessionId, temporary }
  },
  {
    persist: {
      key: "session-store",
      storage: sessionStorage,
    },
  },
)
