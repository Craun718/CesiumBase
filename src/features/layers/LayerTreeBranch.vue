<script setup lang="ts">
import { computed } from "vue"
import AppCollapsibleGroup from "../../components/base/AppCollapsibleGroup.vue"
import AppSwitch from "../../components/base/AppSwitch.vue"
import type { LayerTreeGroupNode, LayerTreeLayerNode, LayerTreeNode } from "./layerTree"

/**
 * 图层树的一层节点，渲染完后按文件名递归自己（Vue 的 SFC 自引用）。
 *
 * 这里仍然没有跟着 `LayerSchemeNavigator` 一起换成 Reka 的
 * `TreeRoot` / `TreeItem`：本面板的行是横向排列的操作条（显隐开关、定位、重试、删除），
 * 而 `TreeItem` 要求整行是一个可选中、可展开的元素，并把点击语义合并到行上，
 * 行内再放控件就会被它一并接管。分组行改用原生 `<details>` / `<summary>` 拿披露语义，
 * 图层行内全是原生按钮，Tab 与 Enter 本来就能走通，因此 `<ul>` / `<li>` 不带 `role="tree"`。
 *
 * 递归组件的文件名就是它的递归 API：重命名本文件必须同步改模板里的标签。
 */
const props = defineProps<{
  /** 本层的节点，顺序即渲染顺序。 */
  nodes: readonly LayerTreeNode[]
  /** 已收起的分组 id；不在集合里即展开。 */
  collapsedGroupIds: ReadonlySet<string>
  /** 搜索态强制展开所有分组，此时分组不可被收起。 */
  forceExpanded: boolean
  /** 本层层级，从 0 起，用于限制缩进深度。 */
  level: number
}>()

const emit = defineEmits<{
  "toggle-group": [groupId: string, open: boolean]
  "set-visible": [layer: LayerTreeLayerNode, visible: boolean]
  "fly-to": [layer: LayerTreeLayerNode]
  retry: [layer: LayerTreeLayerNode]
  remove: [layer: LayerTreeLayerNode]
}>()

/**
 * 缩进上限（层级从 0 起）。
 *
 * 每层导轨 19px（`--space-4` 8px + `--space-5` 10px + 1px 边框），5 层约 95px，
 * 与改造前 `8 + depth * 14` 在第 6 层的 92px 基本持平；再深就不再累加，
 * 否则右边那簇动作按钮会把图层名一路压到 0 宽，连省略号都没地方放。
 */
const MAX_INDENT_DEPTH = 5

/**
 * 本层节点按类型拆开。
 *
 * `buildLayerTree` 先遍历排好序的分组、再遍历排好序的图层，所以每个 `children` 数组天然是
 * 「先子分组、后图层」——两段分别渲染即与原顺序逐行一致。这个不变量由 `tests/layerTree.test.ts`
 * 守住，且**不要在渲染路径上补排序**：全局按 sortOrder 排会把同组内 sortOrder 很小的图层
 * 顶到子分组前面。
 */
const split = computed(() => ({
  groups: props.nodes.filter((node): node is LayerTreeGroupNode => node.nodeType === "group"),
  layers: props.nodes.filter((node): node is LayerTreeLayerNode => node.nodeType === "layer"),
}))

/** 统计分组直属的图层数（不递归），用于组头计数胶囊。 */
function directLayerCount(group: LayerTreeGroupNode) {
  return group.children.filter((child) => child.nodeType === "layer").length
}
</script>

<template>
  <!-- 只有根层列表需要标签；嵌套列表的结构由上面的分组组头表达 -->
  <ul class="layer-tree" :aria-label="props.level === 0 ? '地图图层树' : undefined">
    <li v-for="group in split.groups" :key="group.id" class="is-group">
      <AppCollapsibleGroup
        :label="group.name"
        :open="props.forceExpanded || !props.collapsedGroupIds.has(group.id)"
        :count="directLayerCount(group)"
        count-label="个图层"
        :rail="props.level < MAX_INDENT_DEPTH"
        @update:open="(open) => emit('toggle-group', group.id, open)"
      >
        <template #trailing>
          <small v-if="group.disabled" class="group-disabled">停用</small>
        </template>
        <LayerTreeBranch
          v-if="group.children.length > 0"
          :nodes="group.children"
          :collapsed-group-ids="props.collapsedGroupIds"
          :force-expanded="props.forceExpanded"
          :level="props.level + 1"
          @toggle-group="(id, open) => emit('toggle-group', id, open)"
          @set-visible="(layer, visible) => emit('set-visible', layer, visible)"
          @fly-to="(layer) => emit('fly-to', layer)"
          @retry="(layer) => emit('retry', layer)"
          @remove="(layer) => emit('remove', layer)"
        />
      </AppCollapsibleGroup>
    </li>

    <li v-for="layer in split.layers" :key="layer.id" class="is-layer">
      <div class="layer-row" :class="`is-${layer.status}`">
        <div class="layer-info">
          <!-- 名字在窄面板下会截断，挂上 title 才不会把全名彻底丢掉 -->
          <strong :title="layer.name">{{ layer.name }}</strong>
        </div>

        <div class="layer-actions">
          <!-- boxed 档沿用同排 .icon-action 图标按钮的 32×32 命中格以保住行内对齐，
               但不带它们那圈描边与方底——开关靠轨道填色表达状态，套上按钮皮肤会被读成图标按钮 -->
          <AppSwitch
            variant="boxed"
            :model-value="layer.visible"
            :title="layer.visible ? '隐藏图层' : '显示图层'"
            :aria-label="layer.visible ? `隐藏 ${layer.name}` : `显示 ${layer.name}`"
            @update:model-value="emit('set-visible', layer, !layer.visible)"
          />
          <!-- 与显隐、重试、删除同为方图标按钮：行内四个控件同尺寸才不会把图层名挤没，
               代价是这一枚没有可见文字，靠 title 与 aria-label 交代动作 -->
          <button
            class="icon-action"
            type="button"
            :disabled="!layer.canFlyTo"
            title="缩放至图层"
            :aria-label="`缩放至 ${layer.name}`"
            @click="emit('fly-to', layer)"
          >
            <i class="bi bi-crosshair2" aria-hidden="true"></i>
          </button>
          <button
            v-if="layer.status === 'error'"
            class="icon-action"
            type="button"
            title="重试加载"
            :aria-label="`重试加载 ${layer.name}`"
            @click="emit('retry', layer)"
          >
            <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
          </button>
          <button
            v-if="layer.temporary"
            class="icon-action is-danger"
            type="button"
            title="删除临时图层"
            :aria-label="`删除临时图层 ${layer.name}`"
            @click="emit('remove', layer)"
          >
            <i class="bi bi-trash3" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </li>
  </ul>
</template>

<style scoped lang="scss">
/* 行距与组头→首条的间距同源：读的是 AppCollapsibleGroup 的 `--group-body-gap`，
   于是「组头 / 首行 / 次行」落在一条等距的竖线上。
   这里原先写死 5px，而组体那侧用的是默认 4px——组头到首行比行与行还紧 1px，
   1px 读不出是刻意还是没对齐，只显得脏；写死值本身也不该出现在这里，
   仓库其余间距一律走 --space-* 令牌，没人设这个变量时回落到 --space-2(4px)。 */
.layer-tree {
  display: grid;
  gap: var(--group-body-gap, var(--space-2));
  margin: 0;
  padding: 0;
  list-style: none;
}

.group-disabled {
  flex: none;
  color: var(--warning);
  font-size: var(--text-xs);
}

/* 图层行是横向操作条，不是可选中项；底色退到柔底档，让实底的组头读起来是抬起的分组标签。
   圆角与组头同为 --radius-input，嵌套时两列边缘同心。 */
.layer-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: var(--control-xl);
  /* 左右各让 9px：图层名不能贴着 1px 描边，右侧也要给足操作簇到边框的距离。
     缩进由外层组体的竖向导轨表达，行内不再自带走内缩。 */
  padding: 0 9px;
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-input);
  color: var(--text-primary);
  background: var(--panel-soft-bg);
}

.layer-row.is-error {
  border-color: color-mix(in srgb, var(--danger-deep) 34%, transparent);
  background: color-mix(in srgb, var(--danger-deep) 6%, transparent);
}

.layer-row.is-error .layer-info::after {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--danger);
  content: "";
}

.layer-info {
  min-width: 0;
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
}

/* 图层名与组头同档同字重（--text-md + 常规字重）。
   两者本来就不靠粗细分层：组头是 --panel-bg-raised 实底卡片，图层行是 --panel-soft-bg 柔底，
   底色这一档已经把「抬起的分组标签」和「组内的行」分开了。
   再叠一层 600 会让叶子比它所属的组头更粗，父级反而比子级轻。

   `--weight-normal` 不能省：这里是 `<strong>`，preflight 给的是 `font-weight: bolder`，
   删掉声明会解析成 700——比原来的 600 还粗，正好改反。 */
.layer-info strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-md);
  font-weight: var(--weight-normal);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-loading {
  color: var(--warning);
}

.status-loaded {
  color: var(--accent);
}

.layer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.layer-row:focus-visible,
.icon-action:focus-visible {
  outline-offset: var(--ring-offset-tight);
}

.icon-action {
  display: grid;
  place-items: center;
  width: var(--control-md);
  height: var(--control-md);
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-1) 50%, transparent);
  font-size: var(--text-body);
  cursor: pointer;
}

.icon-action:hover:not(:disabled),
.icon-action:focus-visible:not(:disabled) {
  border-color: var(--panel-border);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--neutral-mid) 50%, transparent);
}

.icon-action:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.55;
}

.icon-action.is-danger {
  color: var(--danger);
}
</style>
