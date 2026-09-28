<script setup lang="ts">
import { nextTick } from "vue"

/**
 * 可折叠分组：组头卡片 + 左侧竖向导轨缩进的组体。
 *
 * 这里保留原生 `<details>`：折叠展开的语义、键盘操作（Tab 到组头、Enter / Space 翻转）和读屏
 * 提示都是浏览器自带的，换成 Reka 的 Collapsible 反而要用 button + aria-expanded + aria-controls
 * 重新搭一遍。展开态改成受控绑定 `:open`，`<details>` 自行翻转后由 `toggle` 事件回传，
 * 过滤、重排都不会再把它丢掉。
 *
 * 组头与组内条目共用同一套卡片外壳（描边 + 实底 + 圆角），字号也同为 `--text-md`——
 * 组头的字号不得低于它所含的条目，层级由卡片外壳、文本色、计数胶囊和导轨表达。
 * 字重不参与分层：组头与组内条目同为常规字重，同一列里不出现两种粗细。
 * 因此这里不把字号暴露成 prop，避免调用方再次把层级写反。
 */
const props = withDefaults(
  defineProps<{
    /** 组名。 */
    label: string
    /** 受控展开态，`true` 为展开。 */
    open: boolean
    /** 组头行尾的计数胶囊；不传则不渲染。 */
    count?: number
    /** 计数的读屏句子后半段，如「个服务」；与 `count` 同传才会念出来。 */
    countLabel?: string
    /** 组体是否带左侧竖向导轨缩进；嵌套触顶时关掉，避免把内容一路挤没。 */
    rail?: boolean
  }>(),
  { count: undefined, countLabel: undefined, rail: true },
)

const emit = defineEmits<{
  "update:open": [open: boolean]
}>()

/**
 * 归一化原生 `<details>` 的 toggle。
 *
 * 挂载时和任何程序化写 `open` 都会触发 toggle，所以先比对受控值，状态没变就不上报。
 * 上报之后还要把 DOM 拉回受控值：调用方可以不接受这次翻转（图层树搜索态强制展开就是），
 * 那种情况下新旧 vnode 的 `open` 都是 `true`，Vue 判定值未变、不会去写 DOM，
 * 于是浏览器已把组体收起、组件却以为它开着，箭头与内容会永久失配。
 * 这次回写同样会触发 toggle，被上面的相等判断挡掉，不会递归。
 *
 * `currentTarget` 而不是 `target`：toggle 不冒泡，但用 currentTarget 能保证拿到的
 * 始终是挂载了监听器的那个 `<details>`。
 */
function handleToggle(event: Event) {
  const element = event.currentTarget
  if (!(element instanceof HTMLDetailsElement)) return
  if (element.open === props.open) return

  emit("update:open", element.open)
  void nextTick(() => {
    if (element.open !== props.open) element.open = props.open
  })
}
</script>

<template>
  <details class="collapsible-group" :open="props.open" @toggle="handleToggle">
    <summary>
      <i class="bi bi-chevron-right group-chevron" aria-hidden="true"></i>
      <span class="group-label">{{ props.label }}</span>
      <!-- 计数只作视觉标记，条目数由后面的 sr-only 句子完整念出，
           读屏不会把它拼成「3D Tiles 3」这种歧义串 -->
      <span class="group-meta">
        <slot name="trailing" />
        <span v-if="props.count !== undefined" class="group-count" aria-hidden="true">
          {{ props.count }}
        </span>
      </span>
      <span v-if="props.count !== undefined && props.countLabel" class="sr-only">
        共 {{ props.count }} {{ props.countLabel }}
      </span>
    </summary>
    <div class="group-body" :class="{ 'is-flat': !props.rail }">
      <slot />
    </div>
  </details>
</template>

<style scoped lang="scss">
/* 组头与组体的几何由调用方按所在面板的密度覆盖，默认值就是图层树的紧凑档。
   只暴露这三个尺度：字号与皮肤仍留在组件内（见上方说明），调用方拿不到把层级写反的入口。

   兜底值必须写在下面几处的 var() 第二参里，不能按常规做法集中声明成
   `.collapsible-group { --group-head-padding: … }`——组件根元素正是要继承调用方值的那一环，
   而元素自身的声明永远压过继承值，调用方写在列表容器上的覆盖会停在这一层，一个都进不来。
   早先就是这么写的，四个覆盖全部静默失效：服务面板把列表加高、把组间距收紧，
   页面上一点变化都没有，而且没有任何报错可循。 */
.collapsible-group {
  min-width: 0;
}

/* UA 给 summary 的是 list-item，配合原生三角标记；这里改成 flex 好让标题与行尾内容排在一行，
   并把三角标记去掉换成雪佛龙——原生标记在 Blink / WebKit 两套内核里形状和位置都不一致 */
.collapsible-group > summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--group-head-min-height, auto);
  padding: var(--group-head-padding, var(--space-3) var(--space-4));
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-input);
  color: var(--text-primary);
  background: var(--panel-bg-raised);
  font-size: var(--text-md);
  /* 不写 font-weight：组头与组内条目同为文档默认的常规字重。
     组头与条目的差别已经由实底卡片外壳、`--text-primary` 文本色、计数胶囊和左侧导轨
     四重信号表达，再叠一层 600 只会让这条标题比它包着的条目更抢眼，层级反而读反。
     这里有意不声明而不是声明 400——字重令牌里没有 normal 档，不写就是继承文档默认值，
     与仓库其余不强调字重的元素写法一致。 */
  line-height: var(--leading-snug);
  list-style: none;
  cursor: pointer;
}

.collapsible-group > summary::-webkit-details-marker {
  display: none;
}

/* 悬停只提亮描边：组头文字本来就是主文本色，与组内条目的悬停规则保持一致 */
.collapsible-group > summary:hover {
  border-color: var(--panel-line-strong);
}

.collapsible-group > summary:hover .group-chevron {
  color: var(--accent);
}

/* 列表容器是 overflow:auto 且不留内边距，外扩焦点环的左右两段会被裁掉 */
.collapsible-group > summary:focus-visible {
  outline-offset: var(--ring-inset);
}

/* 展开态只转箭头，不改尺寸、不触发重排 */
.group-chevron {
  flex: none;
  width: var(--icon-sm);
  color: var(--text-muted);
  font-size: var(--icon-xs);
  text-align: center;
  transition: transform var(--motion-duration-base) var(--motion-ease-standard);
}

.collapsible-group[open] .group-chevron {
  transform: rotate(90deg);
}

/* 标题先让位：窄面板下截断组名，而不是把行尾的标记和计数挤出面板 */
.group-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行尾内容包一层再整体推右：两个右对齐元素各写 `margin-left: auto` 会平分空白，
   把标记和计数拉开距离，所以 auto 只给这一层。 */
.group-meta {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  margin-left: auto;
}

/* 计数走等宽数字，与同面板的统计读数一档；推到行尾，各分组的计数对齐在同一列上。
   底衬用面板内嵌档——组头自己已经是实底卡片，软底档压在它上面几乎看不出来。 */
.group-count {
  flex: none;
  min-width: 18px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--panel-inner-line);
  border-radius: var(--radius-badge);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-overline);
  line-height: var(--leading-snug);
  text-align: center;
  background: var(--panel-sunken-bg);
}

/* 组内条目缩进到一条竖导轨右侧，把「同属一组」画出来。
   组头→首条 与 条目之间 共用 `--group-body-gap` 一个旋钮：上外边距取的是同一个值，
   所以「组头 / 首条 / 次条」落在一条等距竖线上，组内只有这一个节奏。

   早先这里分成 `--group-body-gap`（条目之间）与 `--group-body-offset`（组体上下外边距）
   两个旋钮，注释写着「组内节奏统一」，实际每个调用方各调各的，三处调用点全部对不上：
   服务列表 4 vs 8、引用方案明细 8 vs 10、图层树 4 vs 5。差这么点读不出是刻意递进
   还是没对齐，只显得脏——同一组里，组头到首条凭什么比条目之间更挤。
   offset 因此并入 gap，调用方设一个值即定完整组内节奏。

   下外边距**不**跟 gap 走：它是组体收尾，和父容器的 gap 相加才是组间距离。
   若也取 gap，服务列表的组间会从 16px 涨到 20px——那是组间的事，不该被组内节奏牵动。
   固定 --space-2 是因为没有任何调用方需要单独调它：当初 .usage-details 设 offset 的
   8px，要的是把「组头→首条」撑到 8px，收尾那 8px 只是同一个值的副产物。 */
.group-body {
  display: grid;
  align-content: start;
  gap: var(--group-body-gap, var(--space-2));
  margin: var(--group-body-gap, var(--space-2)) 0 var(--space-2) var(--space-4);
  padding-left: var(--space-5);
  border-left: 1px solid var(--panel-inner-line);
}

/* 没有条目的分组不该在组头下留一段空的导轨缩进 */
.group-body:empty {
  display: none;
}

/* 关掉导轨：不再累加缩进，嵌套触顶后各层的组体会精确重合在同一列上 */
.group-body.is-flat {
  margin-left: 0;
  padding-left: 0;
  border-left-color: transparent;
}
</style>
