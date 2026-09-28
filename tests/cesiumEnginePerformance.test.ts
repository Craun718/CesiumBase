import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("分屏辅助视口使用独立降载配置", () => {
  const viewerSource = readFileSync("src/map/engines/cesium/createViewer.ts", "utf8")
  const engineSource = readFileSync("src/map/engines/cesium/CesiumMapEngine.ts", "utf8")

  assert.match(viewerSource, /const SECONDARY_RESOLUTION_SCALE = 0\.85/)
  assert.match(viewerSource, /viewer\.resolutionScale = renderingSettings\.resolutionScale/)
  assert.match(
    viewerSource,
    /if \(renderingProfile === "primary"\) \{\s*loadTerrainResourcesAfterFirstRender\(viewer\)/,
  )
  assert.match(
    engineSource,
    /const supportsInteractiveWorkloads =\s*this\.creationOptions\?\.renderingProfile !== "secondary"/,
  )
  assert.match(
    engineSource,
    /if \(supportsInteractiveWorkloads\) \{\s*this\.measurementController = new CesiumMeasurementController/,
  )
  assert.match(
    engineSource,
    /if \(supportsInteractiveWorkloads\) \{\s*this\.drawingController\.mount\(viewer\)/,
  )
  assert.match(
    engineSource,
    /if \(supportsInteractiveWorkloads\) \{\s*this\.pointerHandler = new Cesium.ScreenSpaceEventHandler/,
  )
})
