import assert from "node:assert/strict"
import { test } from "node:test"
import type { MapController } from "../src/map/mapController.js"
import { buildRegionTree } from "../src/features/regions/regionTree.js"
import { createRegionLocator } from "../src/features/regions/regionLocator.js"
import type { GeoJsonFeatureCollection } from "../src/features/layers/types.js"
import type { SceneVectorLayerDescriptor } from "../src/map/types.js"

type RegionMapController = Pick<
  MapController,
  "flyToBounds" | "addVectorLayer" | "removeVectorLayer"
>

test("cancel 在相机飞行完成前卸载时不追加临时高亮图层", async () => {
  let resolveFly: (completed: boolean) => void = () => {}
  const flyPromise = new Promise<boolean>((resolve) => {
    resolveFly = resolve
  })
  const addedLayers: SceneVectorLayerDescriptor[] = []
  const removedLayerIds: string[] = []
  const mapController: RegionMapController = {
    flyToBounds: () => flyPromise,
    addVectorLayer: async (descriptor) => {
      addedLayers.push(descriptor)
    },
    removeVectorLayer: (id) => {
      removedLayerIds.push(id)
    },
  }
  const tree = buildRegionTree(createRegionCollection())
  const locator = createRegionLocator(mapController)

  const locating = locator.locate(tree[0]!)
  locator.cancel()
  resolveFly(true)
  await locating

  assert.deepEqual(addedLayers, [])
  assert.deepEqual(removedLayerIds, [])
  assert.equal(locator.status.selectedCode, "")
  assert.equal(locator.status.locatingCode, "")
})

function createRegionCollection(): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "450000000000",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [104, 21],
              [112, 21],
              [112, 26],
              [104, 26],
              [104, 21],
            ],
          ],
        },
        properties: {
          code: "450000000000",
          name: "广西壮族自治区",
          level: 1,
          parent_code: null,
        },
      },
    ],
  }
}
