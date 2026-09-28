import { createRouter, createWebHistory } from "vue-router"
import DashboardWorkspace from "../components/dashboard/DashboardWorkspace.vue"

/** 创建应用路由；当前仅保留地图大屏入口。 */
export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: "/",
        name: "dashboard",
        component: DashboardWorkspace,
      },
    ],
  })

  router.beforeEach((to) => {
    if (to.path !== "/") {
      return { name: "dashboard", replace: true }
    }
  })

  return router
}
