import { computed, onScopeDispose, reactive, ref } from "vue"
import type { CoordinateReadout, MapController } from "../../../map"

/** 坐标读数域：订阅引擎读数并生成状态栏展示文案。 */
export function useCoordinateReadout(mapController: MapController) {
  const readout = ref<CoordinateReadout | undefined>(mapController.getCoordinateReadout())

  onScopeDispose(
    mapController.onCoordinateReadoutChange((value) => {
      readout.value = value
    }),
  )

  const text = computed(() => {
    if (!readout.value) return "经度 -- · 纬度 -- · 高程 --"

    const { longitude, latitude, height } = readout.value
    return `经度 ${longitude.toFixed(5)}° · 纬度 ${latitude.toFixed(5)}° · 高程 ${Math.round(
      height,
    )}m`
  })

  const title = computed(() =>
    !readout.value
      ? "等待地图读数就绪"
      : readout.value.source === "pointer"
        ? "鼠标位置"
        : "视图中心",
  )

  return reactive({ readout, text, title })
}

export type CoordinateReadoutControls = ReturnType<typeof useCoordinateReadout>
