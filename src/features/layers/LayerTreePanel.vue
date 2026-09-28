<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import RailPanel from "../../components/dashboard/RailPanel.vue"
import AppSelect from "../../components/base/AppSelect.vue"
import { createLayerForResource } from "../catalog/layerScheme"
import { buildLayerTree, filterLayerTree, type LayerTreeNode } from "./layerTree"
import { parseUploadedLayerFile } from "./upload"
import { useLayerRegistry } from "./useLayerRegistry"
import type { LayerSnapshot } from "./types"
import { useCatalogStore } from "../catalog/store"
import CatalogStateMessage from "./CatalogStateMessage.vue"
import LayerTreeBranch from "./LayerTreeBranch.vue"

type UploadState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string }

const props = defineProps<{
  placement: "left" | "left-third"
}>()

const emit = defineEmits<{
  close: []
}>()

const layerCatalog = useCatalogStore()
const layerRegistry = useLayerRegistry()
const searchKeyword = ref("")
/**
 * 被手动收起的分组 id；不在集合里即为展开。
 *
 * 存收起集合而不是展开集合：新加的分组不在集合里，加入后默认就是展开的，
 * 不需要在数据变化时补写状态（同一约定见 `src/components/base/treeRows.ts`）。
 */
const collapsedGroupIds = ref<ReadonlySet<string>>(new Set())
const snapshots = ref<Readonly<Record<string, LayerSnapshot>>>({})
const actionError = ref("")
const uploadState = ref<UploadState>({ status: "idle" })
const uploadInput = ref<HTMLInputElement>()

const enabledSchemes = computed(() =>
  [...layerCatalog.catalog.layerSchemes]
    .filter((scheme) => scheme.status === "enabled")
    .sort((left, right) => left.sortOrder - right.sortOrder),
)
const schemeOptions = computed(() =>
  enabledSchemes.value.map((scheme) => ({ value: scheme.id, label: scheme.name })),
)

const treeNodes = computed(() =>
  buildLayerTree({
    scheme: layerCatalog.activeScheme,
    resources: [...layerCatalog.catalog.resources, ...layerCatalog.temporaryResources],
    temporaryLayers: layerCatalog.temporaryLayers,
    visibilityOverrides: layerCatalog.visibilityOverrides,
    snapshots: Object.values(snapshots.value),
  }),
)

/** 搜索时保留命中图层的祖先分组；命中分组时保留整棵子树。 */
const filteredNodes = computed(() => filterLayerTree(treeNodes.value, searchKeyword.value))
/** 搜索态强制展开所有分组，此时分组不可被收起。 */
const forceExpanded = computed(() => searchKeyword.value.trim().length > 0)

watch(
  () => layerCatalog.activeScheme?.id,
  (schemeId) => {
    const scheme = layerCatalog.catalog.layerSchemes.find((item) => item.id === schemeId)
    collapsedGroupIds.value = new Set(
      scheme?.groups.filter((group) => !group.defaultExpanded).map((group) => group.id) ?? [],
    )
  },
  { immediate: true },
)

let disposeSnapshots: (() => void) | undefined

onMounted(() => {
  disposeSnapshots = layerRegistry.onLayerSnapshotsChange((nextSnapshots) => {
    snapshots.value = Object.fromEntries(
      nextSnapshots.map((snapshot) => [snapshot.layerId, snapshot]),
    )
  })
})

onBeforeUnmount(() => {
  disposeSnapshots?.()
  disposeSnapshots = undefined
})

/** 切换地图端当前方案，保留临时图层。 */
function handleSchemeChange(schemeId: string) {
  const result = layerCatalog.activateScheme(schemeId)
  if (!result.ok) actionError.value = result.error ?? "图层方案切换失败"
}

/** 展开或收起图层分组。翻转事件的收窄与受控回写都在 AppCollapsibleGroup 里，这里只记账。 */
function setGroupOpen(groupId: string, open: boolean) {
  const next = new Set(collapsedGroupIds.value)
  if (open) next.delete(groupId)
  else next.add(groupId)

  collapsedGroupIds.value = next
}

/** 更新会话显隐并同步运行时图层。 */
async function setLayerVisible(
  node: Extract<LayerTreeNode, { nodeType: "layer" }>,
  visible: boolean,
) {
  const previous = node.visible
  actionError.value = ""
  layerCatalog.setLayerVisible(node.id, visible)

  try {
    await layerRegistry.setLayerVisible(node.id, visible)
  } catch (error) {
    layerCatalog.setLayerVisible(node.id, previous)
    actionError.value = error instanceof Error ? error.message : "图层显隐更新失败"
  }
}

/** 飞行到当前图层的资源范围。 */
async function flyToLayer(node: Extract<LayerTreeNode, { nodeType: "layer" }>) {
  actionError.value = ""
  const flown = await layerRegistry.flyToLayer(node.id)
  if (!flown) actionError.value = "该图层没有可定位的范围"
}

/** 重试加载失败图层。 */
async function retryLayer(node: Extract<LayerTreeNode, { nodeType: "layer" }>) {
  actionError.value = ""
  try {
    const snapshot = await layerRegistry.retryLayer(node.id)
    if (snapshot?.status === "error") actionError.value = snapshot.errorMessage ?? "图层重试失败"
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "图层重试失败"
  }
}

/** 删除用户上传的临时图层及其资源。 */
async function removeTemporaryLayer(node: Extract<LayerTreeNode, { nodeType: "layer" }>) {
  actionError.value = ""
  try {
    await layerRegistry.removeLayer(node.id)
    layerCatalog.removeTemporaryLayer(node.id)
    uploadState.value = { status: "idle" }
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "临时图层删除失败"
  }
}

/** 触发隐藏的文件选择框。 */
function triggerUpload() {
  uploadInput.value?.click()
}

/** 解析上传文件并注册为临时图层。 */
async function handleUploadChange(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return

  const file = input.files?.[0]
  input.value = ""
  if (!file) return

  actionError.value = ""
  uploadState.value = { status: "loading" }
  try {
    const resource = await parseUploadedLayerFile(file)
    const layer = createLayerForResource(resource, {
      name: resource.name,
      sortOrder: 1000 + layerCatalog.temporaryLayers.length * 10,
      renderOrder: 5000 + layerCatalog.temporaryLayers.length * 10,
    })

    layerCatalog.addTemporaryLayer(resource, layer)
    const snapshot = await layerRegistry.registerLayer({
      definition: layer,
      resource,
      origin: "temporary",
    })

    uploadState.value =
      snapshot.status === "error"
        ? { status: "error", message: snapshot.errorMessage ?? "临时图层加载失败" }
        : { status: "success", message: `已添加：${layer.name}` }
  } catch (error) {
    uploadState.value = {
      status: "error",
      message: error instanceof Error ? error.message : "临时数据上传失败",
    }
  }
}

/* 缩进不再由行上的内联 paddingLeft 计算：分组行改成嵌套渲染后，组内条目落在
   AppCollapsibleGroup 组体的竖向导轨右侧，层级由 DOM 嵌套本身表达。
   行渲染、行样式与「为什么这里不用 Reka TreeRoot」的说明都在 LayerTreeBranch.vue。 */

/** 重新从目录服务拉取方案目录。 */
function retryCatalog() {
  void layerCatalog.loadCatalog()
}
</script>

<template>
  <RailPanel
    id="layer-tree-window"
    class="layer-tree-window"
    :placement="props.placement"
    title="图层树"
    tag="LAYERS"
    close-label="关闭图层树"
    @close="emit('close')"
  >
    <div class="layer-tree-body">
      <label class="scheme-field">
        <span>图层方案</span>
        <!-- 没有可选方案时选项为空，Reka 会回落到 placeholder 显示同一句提示 -->
        <AppSelect
          :model-value="layerCatalog.activeSchemeId"
          :options="schemeOptions"
          :disabled="layerCatalog.loadStatus !== 'ready' || enabledSchemes.length === 0"
          variant="glass"
          placeholder="暂无已发布方案"
          aria-label="选择图层方案"
          @update:model-value="handleSchemeChange"
        />
      </label>

      <CatalogStateMessage
        :status="layerCatalog.loadStatus"
        :error="layerCatalog.loadError"
        @retry="retryCatalog"
      />

      <div class="tree-search">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input
          v-model="searchKeyword"
          type="search"
          placeholder="搜索图层或分组"
          aria-label="搜索图层或分组"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          v-if="searchKeyword.length > 0"
          class="search-clear"
          type="button"
          aria-label="清除搜索关键词"
          title="清除搜索"
          @click="searchKeyword = ''"
        >
          <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
        </button>
      </div>

      <div class="upload-row">
        <input
          ref="uploadInput"
          class="visually-hidden"
          type="file"
          accept=".geojson,.json,.zip"
          aria-label="选择临时数据文件"
          @change="handleUploadChange"
        />
        <button
          type="button"
          :disabled="uploadState.status === 'loading' || layerCatalog.loadStatus !== 'ready'"
          @click="triggerUpload"
        >
          <i class="bi bi-upload" aria-hidden="true"></i>
          <span>上传临时数据</span>
        </button>
        <span
          v-if="uploadState.status !== 'idle'"
          class="upload-state"
          :class="`is-${uploadState.status}`"
        >
          {{ uploadState.status === "loading" ? "解析中" : uploadState.message }}
        </span>
      </div>

      <p v-if="actionError" class="panel-error">{{ actionError }}</p>

      <p v-if="enabledSchemes.length === 0" class="tree-empty">
        <i class="bi bi-layers" aria-hidden="true"></i>
        <span>暂无可用图层方案</span>
      </p>
      <LayerTreeBranch
        v-else
        :nodes="filteredNodes"
        :collapsed-group-ids="collapsedGroupIds"
        :force-expanded="forceExpanded"
        :level="0"
        @toggle-group="setGroupOpen"
        @set-visible="setLayerVisible"
        @fly-to="flyToLayer"
        @retry="retryLayer"
        @remove="removeTemporaryLayer"
      />
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
@use "../../styles/fields" as fields;

/* 本面板只有一个滚动容器，就是下面的 .layer-tree-body：外壳靠 overflow: hidden 关掉
   `.rail-panel` 给的 overflow-y: auto，否则标题行与列表各行其是，面板右侧会出现两条竖滚动条。
   列表一律纵向滚动：横向的溢出由行内自己吸收（图层名省略号 + 操作簇等宽方按钮），
   不让浏览器多画一条横滚动条到面板底部。 */
.layer-tree-window {
  --window-padding: 14px;
  --window-head-padding: 10px;
  --window-title-size: 15px;
  --window-tag-size: 10px;
  --window-close-size: 24px;
  --rail-panel-width: min(420px, calc(100vw - 158px));
  display: flex;
  flex-direction: column;
  max-height: min(72vh, calc(100vh - 180px));
  min-width: 0;
  overflow: hidden;
}

.layer-tree-body {
  display: grid;
  flex: 1;
  min-height: 0;
  gap: 10px;
  margin-top: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}

.scheme-field {
  display: grid;
  gap: 4px;
}

.scheme-field span {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* 外壳（图标定位、让位内边距、定高）与区域树、资源分类树共用一处定义；
   下拉换成 AppSelect 后，同一档外观也由它的 glass 变体提供，这里不再各写一遍。 */
.tree-search {
  @include fields.search-shell($tier: glass, $trailing: true);
}

.upload-row button:focus-visible {
  outline-offset: var(--ring-offset-tight);
}

.search-clear {
  position: absolute;
  right: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-sm);
  height: var(--control-sm);
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.search-clear:hover,
.search-clear:focus-visible {
  color: var(--accent);
}

.search-clear i {
  font-size: var(--text-md);
  line-height: 1;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.upload-row button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  font-size: var(--text-body);
  cursor: pointer;
}

.upload-row button:disabled {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 35%, transparent);
  cursor: not-allowed;
}

.upload-state {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-state.is-success {
  color: var(--accent);
}

.upload-state.is-error,
.panel-error,
.status-error {
  color: var(--danger);
}

.panel-error,
.tree-empty {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--danger-deep) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 7px 8px;
  background: color-mix(in srgb, var(--danger-deep) 8%, transparent);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 14px 8px;
  border: 1px dashed var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--color-panel) 40%, transparent);
  font-size: var(--text-sm);
  text-align: center;
}

.tree-empty i {
  font-size: var(--text-xl);
  line-height: 1;
  opacity: 0.7;
}

/* 图层树的行、缩进与行内操作按钮的样式都跟着渲染组件搬到了 LayerTreeBranch.vue：
   scoped 样式只作用于本组件的元素，留在这里对子组件内部的 <ul> / <li> 不生效。 */

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
