import assert from "node:assert/strict"
import { test } from "node:test"
import { reactive } from "vue"
import {
  resolveRailActionActive,
  shouldCloseExternalPanelOnMenuChange,
} from "../src/components/dashboard/operations.js"
import { createLayerTreeControls } from "../src/components/dashboard/composables/layerTreeControls.js"

test("自定义二级入口打开三级面板时可不高亮一级按钮", () => {
  assert.equal(
    resolveRailActionActive({
      externalPanelOpen: true,
      expandedMenuOpen: false,
      activePanelOpen: false,
    }),
    true,
  )
  assert.equal(
    resolveRailActionActive({
      externalPanelOpen: true,
      expandedMenuOpen: false,
      activePanelOpen: false,
      highlightExternalPanel: false,
    }),
    false,
  )
  assert.equal(
    resolveRailActionActive({
      externalPanelOpen: false,
      expandedMenuOpen: true,
      activePanelOpen: false,
      highlightExternalPanel: false,
    }),
    true,
  )
})

test("收起二级菜单不关闭三级比对面板", () => {
  assert.equal(shouldCloseExternalPanelOnMenuChange("view", null), false)
  assert.equal(shouldCloseExternalPanelOnMenuChange("view", "measure"), true)
  assert.equal(shouldCloseExternalPanelOnMenuChange(null, "view"), false)
})

test("图层树状态在组合根包装后仍保持响应式", () => {
  const controls = reactive(createLayerTreeControls())

  controls.toggleLayerTree()
  assert.equal(controls.layerTreeOpen, true)

  const closeWithoutReceiver = controls.closeLayerTree
  closeWithoutReceiver()
  assert.equal(controls.layerTreeOpen, false)

  const toggleWithoutReceiver = controls.toggleLayerTree
  toggleWithoutReceiver()
  assert.equal(controls.layerTreeOpen, true)
})
