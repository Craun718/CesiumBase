import type { MapController } from "../../map/mapController.js"
import { ACCENT } from "../../map/themeColors.js"
import type { SceneVectorLayerDescriptor } from "../../map/types.js"
import type { RegionTreeNode } from "./regionTree.js"
import { calculateRegionBounds } from "./regionTree.js"

type RegionMapController = Pick<
  MapController,
  "flyToBounds" | "addVectorLayer" | "removeVectorLayer"
>

export interface RegionLocatorStatus {
  readonly selectedCode: string
  readonly locatingCode: string
  readonly actionError: string
}

export interface RegionLocator {
  readonly status: RegionLocatorStatus
  locate(region: RegionTreeNode): Promise<void>
  cancel(): void
}

/** 封装政区定位与短暂高亮的生命周期，避免组件卸载后继续写地图状态。 */
export function createRegionLocator(
  mapController: RegionMapController,
  onStatusChange?: (status: RegionLocatorStatus) => void,
): RegionLocator {
  let generation = 0
  let selectedCode = ""
  let locatingCode = ""
  let actionError = ""
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  return {
    get status() {
      return { selectedCode, locatingCode, actionError }
    },
    async locate(region) {
      const currentGeneration = ++generation
      clearHighlight()
      updateStatus({ actionError: "" })

      const bounds = calculateRegionBounds(region.feature)
      if (!bounds) {
        updateStatus({ actionError: "该政区没有可定位的空间范围" })
        return
      }

      updateStatus({ locatingCode: region.code })
      try {
        const completed = await mapController.flyToBounds(bounds)
        if (currentGeneration !== generation) return

        if (!completed) {
          updateStatus({ actionError: "政区定位已被地图操作中断" })
          return
        }

        await mapController.addVectorLayer(createHighlightDescriptor(region))
        if (currentGeneration !== generation) {
          removeHighlightLayer(region.code)
          return
        }

        updateStatus({ selectedCode: region.code })
        highlightTimer = setTimeout(() => {
          if (currentGeneration === generation) clearHighlight()
        }, 2000)
      } catch (error) {
        if (currentGeneration !== generation) return

        updateStatus({
          actionError: error instanceof Error ? error.message : "政区定位失败",
        })
      } finally {
        if (currentGeneration === generation) updateStatus({ locatingCode: "" })
      }
    },
    cancel() {
      generation += 1
      clearHighlight()
      updateStatus({ locatingCode: "", actionError: "" })
    },
  }

  function updateStatus(patch: Partial<RegionLocatorStatus>) {
    if (patch.selectedCode !== undefined) selectedCode = patch.selectedCode
    if (patch.locatingCode !== undefined) locatingCode = patch.locatingCode
    if (patch.actionError !== undefined) actionError = patch.actionError
    onStatusChange?.({ selectedCode, locatingCode, actionError })
  }

  function clearHighlight() {
    if (highlightTimer !== undefined) {
      clearTimeout(highlightTimer)
      highlightTimer = undefined
    }

    if (selectedCode) removeHighlightLayer(selectedCode)
    updateStatus({ selectedCode: "" })
  }

  function removeHighlightLayer(code: string) {
    mapController.removeVectorLayer(createHighlightLayerId(code))
  }
}

function createHighlightDescriptor(region: RegionTreeNode): SceneVectorLayerDescriptor {
  return {
    id: createHighlightLayerId(region.code),
    source: "inline",
    data: { type: "FeatureCollection", features: [region.feature] },
    visible: true,
    renderOrder: 9000,
    style: {
      fillColor: ACCENT,
      fillOpacity: 0.22,
      strokeColor: ACCENT,
      strokeOpacity: 1,
      strokeWidth: 4,
      outlineAsPolyline: true,
      zIndex: 9000,
    },
  }
}

function createHighlightLayerId(code: string) {
  return `region-highlight-${code}`
}
