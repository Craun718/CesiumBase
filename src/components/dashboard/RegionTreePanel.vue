<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import RailPanel from "./RailPanel.vue"
import {
  buildRegionTree,
  createDefaultExpandedRegionCodes,
  filterRegionTree,
  flattenRegionTree,
  flattenRegionTreeForDisplay,
  type RegionTreeNode,
} from "../../features/regions/regionTree"
import { loadStaticRegionCollection } from "@/features/regions/staticRegionSource"
import { createRegionLocator, type RegionLocatorStatus } from "../../features/regions/regionLocator"
import { useMapController } from "../../map"

const props = defineProps<{
  placement: "left" | "left-third"
}>()

const emit = defineEmits<{
  close: []
}>()

const mapController = useMapController()
const searchKeyword = ref("")
const regions = ref<readonly RegionTreeNode[]>([])
const expandedCodes = ref<ReadonlySet<string>>(new Set())
const loading = ref(false)
const errorMessage = ref("")
const locatorStatus = ref<RegionLocatorStatus>({
  selectedCode: "",
  locatingCode: "",
  actionError: "",
})
const selectedCode = computed(() => locatorStatus.value.selectedCode)
const locatingCode = computed(() => locatorStatus.value.locatingCode)
const actionError = computed(() => locatorStatus.value.actionError)

const visibleRows = computed(() =>
  flattenRegionTreeForDisplay(
    filterRegionTree(regions.value, searchKeyword.value),
    expandedCodes.value,
    searchKeyword.value,
  ),
)
const regionCount = computed(() => flattenRegionTree(regions.value).length)
const hasChildren = (children: readonly RegionTreeNode[]) => children.length > 0

let loadGeneration = 0
const regionLocator = createRegionLocator(mapController, (status) => {
  locatorStatus.value = status
})

onMounted(() => {
  void loadRegions()
})

onBeforeUnmount(() => {
  loadGeneration += 1
  regionLocator.cancel()
})

/** 加载 public/vector 下的静态政区数据。 */
async function loadRegions() {
  const generation = ++loadGeneration

  loading.value = true
  errorMessage.value = ""
  try {
    const collection = await loadStaticRegionCollection()
    if (generation !== loadGeneration) return

    const nextRegions = buildRegionTree(collection)
    regions.value = nextRegions
    expandedCodes.value = new Set(createDefaultExpandedRegionCodes(nextRegions))
  } catch (error) {
    if (generation !== loadGeneration) return

    regions.value = []
    expandedCodes.value = new Set()
    errorMessage.value = error instanceof Error ? error.message : "政区数据加载失败"
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

/** 切换政区节点展开状态。 */
function toggleRegion(code: string) {
  const next = new Set(expandedCodes.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)

  expandedCodes.value = next
}

/** 先定位到政区范围，飞行完成后再显示短暂高亮。 */
function locateRegion(node: RegionTreeNode) {
  void regionLocator.locate(node)
}

/**
 * 读取政区行缩进。
 *
 * 这里保持内联缩进，没有跟着 `LayerSchemeNavigator` 一起换成 Reka 的 `TreeRoot`：
 * 本面板的行是「展开按钮 + 定位按钮」两条操作并排，
 * 而 `TreeItem` 要求整行是一个可选中、可展开的元素，并把点击语义合并到行上，
 * 展开与定位会互相抢手势。两个按钮都是原生按钮，Tab 与 Enter 本来就能走通，
 * 因此这里只当普通列表用，`<ul>` / `<li>` 不带 `role="tree"`。
 */
function getRowDepth(depth: number) {
  return { paddingLeft: `${6 + depth * 14}px` }
}
</script>

<template>
  <RailPanel
    id="left-region-tree-panel"
    class="region-tree-window"
    :placement="props.placement"
    title="政区树"
    tag="REGION"
    close-label="关闭政区树"
    @close="emit('close')"
  >
    <div class="region-tree-body">
      <div class="tree-search">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input
          v-model="searchKeyword"
          type="search"
          placeholder="搜索政区名称"
          aria-label="搜索政区名称"
        />
      </div>

      <p v-if="loading" class="tree-state">政区数据加载中</p>
      <div v-else-if="errorMessage" class="panel-error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadRegions">重试</button>
      </div>
      <p v-else-if="visibleRows.length === 0" class="tree-state">未匹配到政区</p>
      <ul v-else class="region-tree" aria-label="广西行政区划树">
        <li v-for="row in visibleRows" :key="row.node.code">
          <div
            class="tree-row"
            :class="{ 'is-selected': selectedCode === row.node.code }"
            :style="getRowDepth(row.depth)"
          >
            <button
              v-if="hasChildren(row.node.children)"
              class="expand-action"
              type="button"
              :aria-expanded="expandedCodes.has(row.node.code) || searchKeyword.trim().length > 0"
              :title="expandedCodes.has(row.node.code) ? '收起子政区' : '展开子政区'"
              :aria-label="`展开或收起 ${row.node.name}`"
              @click="toggleRegion(row.node.code)"
            >
              <i
                class="bi"
                :class="
                  expandedCodes.has(row.node.code) || searchKeyword.trim().length > 0
                    ? 'bi-chevron-down'
                    : 'bi-chevron-right'
                "
                aria-hidden="true"
              ></i>
            </button>
            <i v-else class="leaf-icon bi bi-geo" aria-hidden="true"></i>

            <button
              class="region-action"
              type="button"
              :disabled="locatingCode === row.node.code"
              :aria-label="`定位到 ${row.node.name}`"
              @click="locateRegion(row.node)"
            >
              <span>{{ row.node.name }}</span>
              <small>{{ row.node.code }}</small>
            </button>
          </div>
        </li>
      </ul>

      <p v-if="actionError" class="panel-error">{{ actionError }}</p>
      <p v-if="!loading && !errorMessage" class="tree-count">共 {{ regionCount }} 个政区</p>
    </div>
  </RailPanel>
</template>

<style scoped lang="scss">
@use "../../styles/fields" as fields;

.region-tree-window {
  --window-padding: var(--space-panel-compact);
  --window-head-padding: var(--space-4);
  --window-title-size: var(--text-body);
  --window-tag-size: var(--text-2xs);
  --window-close-size: var(--control-sm);
  --rail-panel-width: min(390px, calc(100vw - 150px));
  display: flex;
  flex-direction: column;
  max-height: min(72vh, calc(100vh - 180px));
  min-width: 0;
}

.region-tree-body {
  display: grid;
  flex: 1;
  min-height: 0;
  align-content: start;
  gap: 9px;
  margin-top: 10px;
  overflow: auto;
  padding-right: 2px;
}

/* 外壳（图标定位、让位内边距、定高）与图层树、资源分类树共用一处定义，
   输入框自带整块玻璃档皮肤，焦点态不再需要在外壳上单独处理。 */
.tree-search {
  @include fields.search-shell($tier: glass);
}

.expand-action:focus-visible,
.region-action:focus-visible,
.panel-error button:focus-visible {
  outline-offset: var(--ring-offset-tight);
}

.region-tree {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tree-row {
  display: grid;
  grid-template-columns: var(--control-md) minmax(0, 1fr);
  gap: 5px;
  align-items: center;
  min-height: var(--control-md);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-1) 42%, transparent);
}

.tree-row.is-selected {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.expand-action,
.region-action {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.expand-action {
  display: grid;
  place-items: center;
  width: var(--control-md);
  height: var(--control-md);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.leaf-icon {
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-align: center;
}

.region-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 6px 8px 6px 0;
  color: var(--text-primary);
  text-align: left;
}

.region-action span {
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.region-action small {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.region-action:disabled {
  color: var(--warning);
  cursor: wait;
}

.tree-state,
.tree-count {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.panel-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--danger-deep) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 7px 8px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger-deep) 8%, transparent);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
}

.panel-error span {
  min-width: 0;
}

.panel-error button {
  flex: none;
  min-height: var(--control-sm);
  border: 1px solid color-mix(in srgb, var(--danger-soft) 90%, transparent);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-4);
  color: var(--danger);
  background: transparent;
  font-size: var(--text-sm);
  cursor: pointer;
}
</style>
