#!/usr/bin/env node
/**
 * 设计令牌对比度检查。
 *
 * 从 `src/styles/global.css` 解析令牌（递归展开 `var()` 与 `color-mix()`），
 * 按「合成后结果」计算 WCAG 对比度，而不是拿令牌字面值直接比。
 *
 * 为什么必须合成后再算：大屏上所有文字都叠在半透明玻璃面板上，玻璃面板
 * 又叠在 3D 地图之上。只比令牌字面值的做法会得出与屏幕实际观感无关的结论。
 * 合成公式（自外向内逐层套用）：
 *
 *     C = α · C_layer + (1 − α) · C_backdrop
 *
 * `color-mix(in srgb, X p%, transparent)` 在预乘 alpha 空间下等价于
 * 「保留 X 的色相通道、把 alpha 缩放到 α_X · p/100」，脚本按该语义实现。
 *
 * 底图样本取五个，其中纯白 `#ffffff` 是比真实影像更严格的上界
 * （`backdrop-filter: blur()` 会对底图做局部低通），因此判定取全部样本中的最小值。
 *
 * 令牌缺失、颜色无法解析、表面底衬不可用，一律**硬失败**而不是跳过该行。
 * 跳过会让门禁在令牌改名后打印「通过」却根本没测过那些令牌——检查器的可信度
 * 就是这么丢掉的，所以宁可吵也不要静默。
 *
 * 用法：node scripts/checkContrast.mjs
 * 退出码：0 全部达标（或已登记豁免）；1 存在未登记的未达标项、令牌缺失或登记失效。
 */
import { readFileSync } from "node:fs"

const TOKEN_SOURCE = "src/styles/global.css"

/** 底图样本：纯白（最严上界）、亮影像、中等影像、暗影像、大屏底色。 */
const BACKDROPS = [
  { name: "纯白", color: "#ffffff" },
  { name: "亮影像", color: "#8caabe" },
  { name: "中影像", color: "#506478" },
  { name: "暗影像", color: "#0a1a2e" },
  { name: "大屏底", color: "#0f172a" },
]

/**
 * 表面栈：从「最贴近底图的一层」列到「文字实际所在的一层」。
 * `TOKEN@NN` 表示 `color-mix(in srgb, TOKEN NN%, transparent)`，即再乘一次 alpha。
 * `layers: []` 表示该表面上没有任何底衬，直接压在底图上。
 *
 * `tokens` 声明该表面上**实际渲染**的令牌。省略表示「全部令牌」。
 * 必须如实声明：给一个表面挂上它并不承载的令牌，会产出屏幕上不存在的失败行，
 * 而失败行一多，人就会开始忽略整个检查——检查器的可信度就是这么丢掉的。
 */
const SURFACES = [
  // 裸地图不在这里登记：焦点环会落到它上面，但焦点环是**双色**的（描边 + 衬托），
  // 单色校验必然得出「不达标」的假结论。它由 main() 里的 checkFocusRing 成对校验。
  // 指北针是两块底衬不同的元素，不是一个表面：
  // .compass-dial 88%（承载刻度字母与 N 字）、.compass-heading 78%（方位角读数）。
  {
    name: "地图 + --color-panel@88（指北针表盘）",
    layers: ["--color-panel@88"],
    tokens: ["--color-text-primary", "--color-text-secondary"],
  },
  {
    name: "地图 + --color-panel@78（指北针读数）",
    layers: ["--color-panel@78"],
    tokens: ["--color-text-secondary"],
  },
  { name: "面板 --surface-1", layers: ["--surface-1"] },
  { name: "面板 · 次级 --surface-2", layers: ["--surface-1", "--surface-2"] },
  { name: "面板 · 输入 --surface-3", layers: ["--surface-1", "--surface-3"] },
  { name: "遮罩 + 卡片", layers: ["--surface-overlay", "--surface-2"] },
  { name: "Toast", layers: ["--glass-bg-toast"] },
  { name: "外壳（顶栏 / 底栏）", layers: ["--surface-chrome"] },
  { name: "表格粘性列", layers: ["--row-sticky-bg"] },
]

/** 文本类令牌，阈值 4.5:1（WCAG 1.4.3 AA，正文文本）。 */
const TEXT_TOKENS = [
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--accent",
  "--warning",
  "--danger",
]

/**
 * 非文本类令牌，阈值 3:1（WCAG 1.4.11 / 2.4.11）。
 *
 * 只登记「承载状态或构成控件边界」的令牌。`--row-active-border` 名字像描边，
 * 实际全部用作背景填充（开关轨道、选中行底、Tab 激活底），选中态的描边一律是
 * 强调色，因此它不属于 1.4.11 的适用范围；纯装饰性分隔线同理不在列。
 *
 * `--neutral` 是描边 / 分隔 / 状态层的基色，不承载文本（唯一一处把它当文字用的
 * 完成态已改为 --text-secondary），因此归在本表按 3:1 校验。
 *
 * `--ring-color` 在面板表面上按本表校验（环压在面板上时必须看得见）；
 * 它压在裸地图上的情形另行成对校验，见 checkFocusRing。
 */
const NON_TEXT_TOKENS = ["--neutral", "--ring-color"]

/**
 * 已登记的豁免：确实无法在纯白上界下达标，或不适用该准则。
 * 每条都必须写明依据，且必须仍然命中，避免豁免清单随代码漂移。
 */
const EXEMPTIONS = [
  {
    token: "--text-disabled",
    reason: "WCAG 明确豁免禁用态控件的对比度要求（1.4.3 例外）",
  },
  {
    token: "--danger-deep",
    reason: "仅用于填充与描边（如错误图标底），不承载文本",
  },
]

/**
 * 已知缺口：确实未达标，但修复会改变大屏观感（提高底衬不透明度＝更多遮挡地图），
 * 需要单独决策。
 *
 * 缺口不阻断门禁，但每次都会打印出来，不允许静默存在；缺口一旦消失也会被提示清理。
 * 这里登记的是「已知且未修」，不是「已达标」，不要把它当成豁免使用。
 *
 * 省略 `token` 表示该表面上的全部令牌都登记为缺口。
 */
const KNOWN_GAPS = [
  // 理由里不要复述比值：测出来的数在输出里已经有了，写进散文只会与实测漂移。
  {
    surface: "地图 + --color-panel@88（指北针表盘）",
    reason:
      ".compass-dial 的底衬是 --color-panel 再乘 88%，有效 alpha 低于 --surface-1 的档位；" +
      "压在亮影像上时，环上的刻度字母与 N 字对比度不足。" +
      "修复要抬高底衬不透明度，代价是更多地遮挡地图，需与下一项一并决策。",
  },
  {
    surface: "地图 + --color-panel@78（指北针读数）",
    reason:
      ".compass-heading 的底衬是 --color-panel 再乘 78%，有效 alpha 更低。" +
      "两块指北针都属 --glass-bg 同类问题（半透明底衬直接压地图），" +
      "修复需要提高底衬不透明度，会改变大屏观感并轻微增加对地图的遮挡，待单独决策。",
  },
]

/** 读取 global.css 中全部自定义属性声明。 */
function readTokens() {
  const source = readFileSync(TOKEN_SOURCE, "utf8")
  const tokens = new Map()
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match

  while ((match = pattern.exec(source)) !== null) tokens.set(match[1], match[2].trim())

  return tokens
}

/** 递归展开 `var()` 引用，带循环保护。 */
function resolveToken(tokens, name, seen = new Set()) {
  if (seen.has(name)) return undefined
  if (!tokens.has(name)) return undefined

  seen.add(name)

  return tokens
    .get(name)
    .replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (whole, ref, fallback) => {
      const resolved = resolveToken(tokens, ref, seen)

      return resolved ?? fallback?.trim() ?? whole
    })
}

/** 按顶层逗号切分（忽略括号内的逗号）。 */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let buffer = ""

  for (const char of text) {
    if (char === "(") depth += 1
    else if (char === ")") depth -= 1

    if (char === "," && depth === 0) {
      parts.push(buffer.trim())
      buffer = ""
      continue
    }

    buffer += char
  }

  parts.push(buffer.trim())

  return parts.filter((part) => part.length > 0)
}

/** 会出现在令牌里的具名颜色。`transparent` 必须支持：全部半透明令牌都经它与 `color-mix()` 组合。 */
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
}

/** 解析颜色字面量为 { r, g, b, a }。支持 hex / rgb() / rgba() / 具名颜色。 */
function parseColorLiteral(value) {
  const text = value.trim().toLowerCase()

  if (text in NAMED_COLORS) return { ...NAMED_COLORS[text] }

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(text)
  if (hex) {
    let digits = hex[1]

    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("")

    const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1

    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: alpha,
    }
  }

  const fn = /^rgba?\(([^)]*)\)$/i.exec(text)
  if (fn) {
    const parts = splitTopLevel(fn[1]).map((part) => Number.parseFloat(part))

    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }

  return undefined
}

/** 预乘 alpha 的 sRGB 插值，与 CSS `color-mix(in srgb, ...)` 语义一致。 */
function mixColors(colorA, colorB, weightA) {
  const weightB = 1 - weightA
  const alpha = colorA.a * weightA + colorB.a * weightB

  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }

  return {
    r: (colorA.r * colorA.a * weightA + colorB.r * colorB.a * weightB) / alpha,
    g: (colorA.g * colorA.a * weightA + colorB.g * colorB.a * weightB) / alpha,
    b: (colorA.b * colorA.a * weightA + colorB.b * colorB.a * weightB) / alpha,
    a: alpha,
  }
}

/** 把表达式里的 `var()` 就地替换成被引用令牌的定义文本。 */
function expandVars(tokens, expression, depth = 0) {
  if (depth > 10) return expression

  return expression.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (whole, reference, fallback) => {
      const raw = tokens.get(reference)

      if (raw === undefined) return fallback?.trim() ?? whole

      return expandVars(tokens, raw, depth + 1)
    },
  )
}

/** 解析颜色表达式：字面量或 color-mix() 调用（`var()` 先展开）。 */
function parseColor(tokens, expression) {
  const value = expandVars(tokens, String(expression)).trim()

  if (!/^color-mix\(/i.test(value)) return parseColorLiteral(value)

  const args = splitTopLevel(value.slice(value.indexOf("(") + 1, value.lastIndexOf(")")))
  const stopArgs = args.filter((arg) => !/^in\s/i.test(arg))

  if (stopArgs.length === 0) return undefined

  const stops = stopArgs.map((arg) => {
    const percent = /\s([\d.]+)%\s*$/.exec(arg)

    return {
      color: parseColor(tokens, percent ? arg.slice(0, percent.index) : arg),
      percent: percent ? Number.parseFloat(percent[1]) : undefined,
    }
  })

  if (stops.some((stop) => stop.color === undefined)) return undefined
  if (stops.length === 1) return stops[0].color

  const [first, second] = stops
  const share = first.percent ?? (second.percent === undefined ? 50 : 100 - second.percent)

  return mixColors(first.color, second.color, share / 100)
}

/** 把颜色按 alpha 合成到底背之上。 */
function composite(color, backdrop) {
  if (color.a >= 1) return { ...color, a: 1 }

  return {
    r: color.a * color.r + (1 - color.a) * backdrop.r,
    g: color.a * color.g + (1 - color.a) * backdrop.g,
    b: color.a * color.b + (1 - color.a) * backdrop.b,
    a: 1,
  }
}

/** WCAG 相对亮度。 */
function luminance({ r, g, b }) {
  const channel = (value) => {
    const scaled = value / 255

    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 对比度。 */
function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))

  return (light + 0.05) / (dark + 0.05)
}

/** 把表面栈逐层合成到一个底背之上。 */
function buildSurfaces(tokens, backdrop) {
  const result = new Map()

  for (const surface of SURFACES) {
    let color = backdrop
    let failed = false

    for (const layer of surface.layers) {
      const [name, percentText] = layer.split("@")
      const raw = resolveToken(tokens, name)

      if (raw === undefined) {
        failed = true
        break
      }

      let parsed = parseColor(tokens, raw)
      if (parsed === undefined) {
        failed = true
        break
      }

      if (percentText !== undefined) {
        parsed = {
          ...parsed,
          a: parsed.a * (Number.parseFloat(percentText) / 100),
        }
      }

      color = composite(parsed, color)
    }

    result.set(surface.name, failed ? undefined : color)
  }

  return result
}

/**
 * 双色焦点环的成对校验。
 *
 * 焦点环压在裸地图上（MapCompass 的 .compass-dial 用 outline-offset 外扩，环落在裸地图上），
 * 而单一颜色压不住全部底图：实测最亮的纯白底图上，任何强调色都只有约 1.4~1.6:1。
 * 因此焦点环由两层构成——强调色描边 + 深色衬托——校验也必须成对：
 *
 *   1. 描边 vs 衬托 ≥ 3：保证强调色描边能从深色衬托里分辨出来；
 *   2. 每张底图上，描边与衬托**至少有一方** vs 底图 ≥ 3：
 *      亮底图上深色衬托负责可见，暗底图上强调描边负责可见。
 *      要求两者都达标是错的——那等于要求一个颜色同时压住黑白两端。
 *
 * 只测单色的 --ring-color 会得出永远不达标的结论，那测的不是用户看到的东西。
 */
function checkFocusRing(tokens, failures) {
  const ringColor = parseColor(tokens, tokens.get("--ring-color") ?? "")
  const contrastColor = parseColor(tokens, tokens.get("--ring-contrast") ?? "")

  console.log("\n双色焦点环（裸地图上的最差比值）")

  for (const [label, color] of [
    ["--ring-color", ringColor],
    ["--ring-contrast", contrastColor],
  ]) {
    if (color === undefined) {
      console.log(`  ${label} —— 令牌缺失或无法解析  未达标`)
      failures.push({ surface: "双色焦点环", token: label, threshold: 3 })

      return
    }
  }

  const adjacent = contrast(ringColor, contrastColor)
  const adjacentPass = adjacent >= 3

  console.log(
    `  --ring-color / --ring-contrast 相邻对比 ${adjacent.toFixed(2)} ≥ 3  ${adjacentPass ? "达标" : "未达标"}`,
  )

  if (!adjacentPass) {
    failures.push({
      surface: "双色焦点环",
      token: "--ring-color / --ring-contrast",
      ratio: adjacent,
      threshold: 3,
    })
  }

  // 环的外沿与内沿都是衬托，描边夹在中间。看的是「整圈环」在每张底图上
  // 是否至少有一层跳得出来，而不是某一层自己能否通吃。
  let worst = Number.POSITIVE_INFINITY
  let worstBackdrop = ""

  for (const backdrop of BACKDROPS) {
    const behind = parseColorLiteral(backdrop.color)
    const best = Math.max(
      contrast(composite(ringColor, behind), behind),
      contrast(composite(contrastColor, behind), behind),
    )

    if (best < worst) {
      worst = best
      worstBackdrop = backdrop.name
    }
  }

  const backdropPass = worst >= 3

  console.log(
    `  描边或衬托 vs 底图（取较优者）  ${worst.toFixed(2)} ≥ 3  最差底图 ${worstBackdrop}  ${backdropPass ? "达标" : "未达标"}`,
  )

  if (!backdropPass) {
    failures.push({
      surface: "双色焦点环",
      token: "--ring-color / --ring-contrast",
      ratio: worst,
      backdrop: worstBackdrop,
      threshold: 3,
    })
  }
}

/** 主流程。 */
function main() {
  const tokens = readTokens()
  const failures = []
  const rows = []

  for (const surface of SURFACES) {
    const perBackdrop = new Map()

    for (const backdrop of BACKDROPS) {
      const built = buildSurfaces(tokens, parseColorLiteral(backdrop.color))
      perBackdrop.set(backdrop.name, built.get(surface.name))
    }

    const evaluate = (tokenName, threshold) => {
      const raw = tokens.get(tokenName)

      // 缺失即失败。返回 undefined 会被调用方 `if (outcome)` 静默跳过，
      // 令牌一旦改名就会得到一份「通过」的假报告。
      if (raw === undefined) return { missing: true, pass: false, backdrop: "" }

      const color = parseColor(tokens, raw)
      if (color === undefined) return { unparsable: true, pass: false, backdrop: "" }

      let worst = Number.POSITIVE_INFINITY
      let worstBackdrop = ""

      for (const [backdropName, background] of perBackdrop) {
        if (background === undefined) continue

        const ratio = contrast(composite(color, background), background)

        if (ratio < worst) {
          worst = ratio
          worstBackdrop = backdropName
        }
      }

      // 全部底图都没算出来，说明该表面的底衬令牌坏了——同样不能放过。
      if (!Number.isFinite(worst)) return { brokenSurface: true, pass: false, backdrop: "" }

      const exempt = EXEMPTIONS.find((entry) => entry.token === tokenName)
      const gap = KNOWN_GAPS.find(
        (entry) =>
          entry.surface === surface.name &&
          (entry.token === undefined || entry.token === tokenName),
      )

      return {
        ratio: worst,
        backdrop: worstBackdrop,
        pass: exempt !== undefined || worst >= threshold,
        exempt,
        gap,
      }
    }

    const declared = surface.tokens

    for (const tokenName of TEXT_TOKENS) {
      if (declared && !declared.includes(tokenName)) continue

      const outcome = evaluate(tokenName, 4.5)
      if (outcome)
        rows.push({ surface: surface.name, token: tokenName, threshold: 4.5, ...outcome })
    }

    for (const tokenName of NON_TEXT_TOKENS) {
      if (declared && !declared.includes(tokenName)) continue

      const outcome = evaluate(tokenName, 3)
      if (outcome) rows.push({ surface: surface.name, token: tokenName, threshold: 3, ...outcome })
    }
  }

  console.log("表面 × 令牌 最低对比度（取全部底图样本中的最小值）\n")

  const usedGaps = new Set()
  const gapRows = []
  let currentSurface = ""

  for (const row of rows) {
    if (row.surface !== currentSurface) {
      currentSurface = row.surface
      console.log(`  ${currentSurface}`)
    }

    const mark = row.pass
      ? "达标"
      : row.missing
        ? "令牌缺失"
        : row.unparsable
          ? "颜色无法解析"
          : row.brokenSurface
            ? "表面底衬不可用"
            : row.gap
              ? "缺口"
              : "未达标"
    const note = row.exempt ? `（已登记豁免：${row.exempt.reason}）` : ""
    const ratioText = row.ratio === undefined ? "—" : row.ratio.toFixed(2)

    console.log(
      `    ${row.token.padEnd(26)} ${ratioText.padStart(6)} ≥ ${row.threshold}  最差底图 ${row.backdrop}  ${mark}${note}`,
    )

    if (row.pass) continue

    if (row.gap) {
      usedGaps.add(row.gap)
      gapRows.push(row)
      continue
    }

    failures.push(row)
  }

  // 三档文本的相邻比值，用于确认层级是等距递减而不是靠手感
  const ladderTokens = ["--color-text-primary", "--color-text-secondary", "--color-text-muted"]
  const ladder = ladderTokens.map((tokenName) => {
    const raw = tokens.get(tokenName)
    const color = raw === undefined ? undefined : parseColor(tokens, raw)

    if (color === undefined) return undefined

    let worst = Number.POSITIVE_INFINITY
    for (const backdrop of BACKDROPS) {
      const built = buildSurfaces(tokens, parseColorLiteral(backdrop.color))
      const background = built.get("面板 --surface-1")

      if (background === undefined) continue

      worst = Math.min(worst, contrast(composite(color, background), background))
    }

    return Number.isFinite(worst) ? worst : undefined
  })

  console.log("\n三档文本阶梯（面板 --surface-1 上的最差比值）")

  for (let index = 0; index < ladder.length; index += 1) {
    if (ladder[index] !== undefined) continue

    console.log(`  ${ladderTokens[index]} —— 令牌缺失或无法解析，未参与阶梯校验  未达标`)
    failures.push({ surface: "文本阶梯", token: ladderTokens[index], threshold: 4.5 })
  }

  for (let index = 0; index + 1 < ladder.length; index += 1) {
    if (ladder[index] === undefined || ladder[index + 1] === undefined) continue

    const step = ladder[index] / ladder[index + 1]
    const pass = step >= 1.25

    console.log(
      `  ${ladderTokens[index]} / ${ladderTokens[index + 1]} = ${step.toFixed(2)}  ${pass ? "达标" : "未达标"}（下限 1.25）`,
    )

    if (!pass)
      failures.push({
        surface: "文本阶梯",
        token: ladderTokens[index],
        ratio: step,
        threshold: 1.25,
      })
  }

  checkFocusRing(tokens, failures)

  console.log("\n已登记豁免")

  for (const exemption of EXEMPTIONS) {
    const present = resolveToken(tokens, exemption.token) !== undefined

    console.log(
      `  ${exemption.token} —— ${exemption.reason}${present ? "" : "【该令牌已不存在，请清理】"}`,
    )

    // 豁免指向一个不存在的令牌，说明登记已随代码漂移，不能再当作有效豁免。
    if (!present) {
      failures.push({ surface: "已登记豁免", token: exemption.token, threshold: 0 })
    }
  }

  if (gapRows.length > 0) {
    // 按表面分组，原因只打印一次——同一段理由重复八遍会把人训练成跳过整段输出。
    const bySurface = new Map()
    for (const row of gapRows) {
      if (!bySurface.has(row.surface)) bySurface.set(row.surface, [])
      bySurface.get(row.surface).push(row)
    }

    console.error("\n已知缺口（未达标，且修复超出第 1 期已批准范围，需单独决策）")

    for (const [surface, surfaceRows] of bySurface) {
      console.error(`\n  ${surface}`)

      for (const row of surfaceRows) {
        console.error(
          `    ${row.token.padEnd(26)} ${row.ratio.toFixed(2).padStart(6)}（下限 ${row.threshold}，最差底图 ${row.backdrop}）`,
        )
      }

      console.error(`    原因：${surfaceRows[0].gap.reason}`)
    }

    console.error("")
  }

  // 失效的缺口登记必须失败，而不是只打印一行提示：登记与代码脱节后，
  // 缺口清单会变成一份没人再看的散文，真实缺口就被它掩盖了。
  const staleGaps = KNOWN_GAPS.filter((entry) => !usedGaps.has(entry))
  for (const gap of staleGaps) {
    console.error(`\n[stale-gap] 缺口已消除或表面名已变，请从脚本中移除登记：${gap.surface}`)
    failures.push({ surface: "缺口登记失效", token: gap.surface, threshold: 0 })
  }

  if (failures.length === 0) {
    console.log(
      gapRows.length === 0
        ? "\n对比度检查通过。"
        : `\n对比度门禁通过，但存在 ${gapRows.length} 项已知缺口（见上）。`,
    )

    return
  }

  console.error(`\n对比度检查失败：${failures.length} 项未达标且未登记。`)
  process.exitCode = 1
}

main()
