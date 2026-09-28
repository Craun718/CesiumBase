/**
 * 地图侧的唯一颜色来源。
 *
 * Cesium 读不到 CSS 变量，所以引擎颜色只能写成 TS 常量；但常量必须只有一处定义，
 * 否则「同一个强调色出现四种青」这种漂移会重演——本次重构前，
 * `#48e5ff` / `#22d3ee` / `#38bdf8` / `#37a9ff` 四者并存且无任何门禁能发现。
 *
 * 放在引擎无关的 `src/map` 而不是引擎目录里，是因为界面侧的图层缺省样式
 * （图层方案默认值、区域高亮）也要用同一套色；否则那些 `src/features` 下的
 * 默认值只能各自写死，再次分叉。
 *
 * 取值与 `src/styles/global.css` 的对应令牌保持同值，并由
 * `scripts/checkDesignTokens.mjs` 校验：
 *
 *   ACCENT       ↔ --color-accent
 *   DEEP_BACK    ↔ --shadow-base
 *   FOREGROUND   ↔ --color-text-primary
 *   WARNING      ↔ --color-accent-amber
 *
 * 后两项是地图数据自身的外观，不属于界面令牌体系，因此不参与上述同步校验：
 *   WATER        水体缺省色（水就应该是蓝的，即使界面是无彩色方案）
 *   TERRAIN_MASK 广西以外区域的压暗蒙版
 */

/** 主题强调色：绘制、测量、飞行与图层缺省样式共用。 */
export const ACCENT = "#4aee86"

/** 强调色标签背后的深色衬托，保证浅色文字压在任意影像上都能读。 */
export const DEEP_BACK = "#020617"

/** 地图上文字的缺省前景色。 */
export const FOREGROUND = "#f8fafc"

/** 进行中的测量预览色；与已完成的 ACCENT 区分，表示「尚未落定」。 */
export const WARNING = "#ffb648"

/** 水体缺省色。 */
export const WATER = "#2e7bb5"

/** 广西以外区域的压暗蒙版色。 */
export const TERRAIN_MASK = "#0f172a"
