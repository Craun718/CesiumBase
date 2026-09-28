#!/usr/bin/env node
/**
 * 设计令牌静态检查。
 *
 * 扫描 `src` 下的样式片段（`.css` / `.scss` 全文，以及 `.vue` 的 `<style>` 块），
 * 拦截四类绕过设计令牌的写法：
 *
 *   1. color-literal     —— 颜色字面量（hex / rgb() / rgba() / hsl()）。
 *                           唯一允许出现的位置是 `src/styles/global.css`（令牌源头）。
 *   2. color-mix-literal —— `color-mix()` 的颜色参数里直接写字面量，应改为引用令牌。
 *   3. z-index-literal   —— `z-index` 使用 ≥ 10 的裸数字，应改用 `--z-*` 层级令牌。
 *                           组件内局部层叠的小数值（0~9）属于组件内部结构，不在此列。
 *   4. focus-outline-none —— `:focus` / `:focus-visible` 规则内写 `outline: none`
 *                           且没有给出替代（同块内无 `outline` / `outline-offset`），
 *                           等于把统一焦点环在局部抹掉。
 *   5. undefined-var     —— `var(--x)` 引用了全仓未定义且无回退值的自定义属性。
 *                           这类引用会让整条声明在计算值阶段失效（曾导致阴影令牌全站失效）。
 *   6. engine-color-literal —— `src/map/**` 的 `.ts` 里写颜色字面量。
 *                           地图侧读不到 CSS 变量，颜色只能写成 TS 常量，但常量必须
 *                           只来自 `themeColors.ts`；否则「同一个强调色出现四种青」
 *                           这种漂移会重新长回来，而且样式扫描永远看不见它。
 *   7. engine-token-drift —— `themeColors.ts` 里的常量与 `global.css` 的对应令牌不同值。
 *   8. url-encoded-color —— 数据 URL 里的 `%23rrggbb` 不是 `global.css` 色板中的色值。
 *                          数据 URL 内用不了 `var()`，这类色值只能写字面量；而 `%23` 不是 `#`，
 *                          第 1 条规则看不见它，于是换色板后它会静默留在旧色上
 *                          （本次重构前 `%237ec9e8` 就这样在两处存活了下来）。
 *                          这里改为按色板校验：色值必须能在 `global.css` 里找到，
 *                          换色板时任一未同步的数据 URL 都会失败。
 *
 * 用法：node scripts/checkDesignTokens.mjs
 * 退出码：0 无违规；1 存在违规或存在失效的例外登记。
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const SRC_DIR = "src"
/** 令牌定义源头，唯一允许出现颜色字面量的文件 */
const TOKEN_SOURCE = "src/styles/global.css"
const ENGINE_DIR = "src/map"
/** 地图侧唯一颜色来源；只有它允许出现颜色字面量 */
const ENGINE_COLOR_SOURCE = "src/map/themeColors.ts"

/**
 * 引擎常量 ↔ 界面令牌的同值约束。
 *
 * 只登记界面语义色的对应关系。`WATER` / `TERRAIN_MASK` 是地图数据自身的外观，
 * 不属于界面令牌体系，因此不参与同步校验。
 */
const ENGINE_TOKEN_PAIRS = [
  ["ACCENT", "--color-accent"],
  ["DEEP_BACK", "--shadow-base"],
  ["FOREGROUND", "--color-text-primary"],
  ["WARNING", "--color-accent-amber"],
]

/**
 * 已登记的例外。每条都必须写明原因，且必须仍然命中；
 * 一旦不再命中会被报告为「例外失效」，避免例外清单随代码漂移。
 *
 * 目前为空：仅存的一条是「原生 select 的聚焦表现」，而 17 处 `<select>` 已迁到
 * Reka 的 `AppSelect`，焦点表现改由全局 `:focus-visible` 统一处理，例外随之失效。
 */
const EXCEPTIONS = []

/**
 * 由第三方组件在运行时写进元素内联样式的自定义属性。
 *
 * Reka 的 Popper 定位会在打开时把可用宽高算成 `--reka-*` 注入内容元素，
 * 静态扫描看不到定义，但它们在运行时确实存在。
 * 这里按名字逐个登记而非放行整个 `--reka-` 前缀：前缀放行会连拼错的变量名一起放过。
 */
const RUNTIME_DEFINED_VARS = new Set([
  "--reka-select-trigger-width",
  "--reka-select-trigger-height",
  "--reka-select-content-available-width",
  "--reka-select-content-available-height",
])

/** 颜色字面量：3 / 4 / 6 / 8 位 hex，以及 rgb() / rgba() / hsl() / hsla()。 */
const HEX_PATTERN =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g
const FUNCTION_PATTERN = /\b(?:rgba?|hsla?)\(/g
/** 数据 URL 中的 URL 编码颜色，即 `%23rrggbb` 形式的 `%23` + hex。 */
const URL_ENCODED_HEX_PATTERN = /%23([0-9a-fA-F]{3,8})(?![0-9a-zA-Z_-])/g

/**
 * 遍历目录，返回匹配 `pattern` 的文件的仓库相对路径。
 * 跳过 `node_modules`，并忽略断链符号链接（工作区残留物不是源码）。
 */
function listFiles(dir, pattern) {
  const files = []

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue

    const path = join(dir, entry)

    let stats
    try {
      stats = statSync(path)
    } catch {
      continue
    }

    if (stats.isDirectory()) {
      files.push(...listFiles(path, pattern))
      continue
    }

    if (pattern.test(entry)) files.push(path.replace(/\\/g, "/"))
  }

  return files
}

/** 全部样式文件（`.css` / `.scss` / `.vue`）。 */
function listStyleFiles(dir) {
  return listFiles(dir, /\.(?:vue|scss|css)$/)
}

/**
 * 取出文件的样式片段。
 * `.vue` 只取 `<style>` 块；其余文件取全文。
 * 返回值附带行偏移，便于把片段内下标还原成文件行号。
 */
function styleSegments(file) {
  const source = readFileSync(file, "utf8")

  if (!file.endsWith(".vue")) return [{ text: source, lineOffset: 0 }]

  const segments = []
  const pattern = /<style[^>]*>([\s\S]*?)<\/style>/g
  let match

  while ((match = pattern.exec(source)) !== null) {
    const bodyStart = match.index + match[0].indexOf(">") + 1
    const lineOffset = source.slice(0, bodyStart).split("\n").length - 1

    segments.push({ text: match[1], lineOffset })
  }

  return segments
}

/** 返回片段中每个 `color-mix(...)` 调用的下标区间，用于区分「字面量」与「color-mix 参数」。 */
function colorMixSpans(text) {
  const spans = []
  const pattern = /color-mix\(/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    let depth = 1
    let index = pattern.lastIndex

    while (index < text.length && depth > 0) {
      if (text[index] === "(") depth += 1
      else if (text[index] === ")") depth -= 1
      index += 1
    }

    spans.push([match.index, index])
  }

  return spans
}

/** 把片段内下标换算成文件行号（1 起）。 */
function lineAt(text, index) {
  return text.slice(0, index).split("\n").length
}

/** 收集颜色字面量违规。 */
function collectColorLiterals(text, isTokenSource, lineOffset, push) {
  if (isTokenSource) return

  const spans = colorMixSpans(text)
  const inColorMix = (index) => spans.some(([start, end]) => index >= start && index < end)

  for (const pattern of [HEX_PATTERN, FUNCTION_PATTERN]) {
    pattern.lastIndex = 0

    let match
    while ((match = pattern.exec(text)) !== null) {
      const line = lineOffset + lineAt(text, match.index)
      const rule = inColorMix(match.index) ? "color-mix-literal" : "color-literal"

      push(rule, line, `${match[0].replace(/\($/, "()")} —— 应改用设计令牌`)
    }
  }
}

/** 收集 `z-index` 裸数字违规。 */
function collectZIndexLiterals(text, lineOffset, push) {
  const pattern = /z-index\s*:\s*(-?\d+)/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    if (Number(match[1]) < 10) continue

    const line = lineOffset + lineAt(text, match.index)

    push("z-index-literal", line, `z-index: ${match[1]} —— 应改用 --z-* 层级令牌`)
  }
}

/**
 * 解析样式片段中的规则块，返回每条的 `outline: none` 及其选择器栈。
 * 逐字符扫描以跟踪花括号深度，比正则更可靠（嵌套 SCSS / 多行选择器）。
 *
 * 替代判定必须按「规则块」隔离：只有同一个 `{}` 块内出现 `outline` / `outline-offset`
 * 才算给出了替代焦点环。按嵌套深度判定会让兄弟规则的 `outline-offset` 误判为替代。
 */
function collectFocusOutlineNone(text, lineOffset, push, reportException) {
  const stack = []
  const blockIssues = []
  const issues = []
  let buffer = ""
  let line = lineOffset + 1

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === "\n") {
      line += 1
    } else if (char === "{") {
      stack.push({ selector: buffer.trim(), line })
      blockIssues.push([])
      buffer = ""
    } else if (char === "}") {
      buffer = ""
      if (blockIssues.length > 0) issues.push(...blockIssues.pop())
      stack.pop()
    } else if (char === ";") {
      const declaration = buffer.trim()
      const current = blockIssues[blockIssues.length - 1]

      if (current) {
        if (/^outline\s*:\s*none/.test(declaration)) {
          current.push({
            line,
            selector: stack.map((entry) => entry.selector).join(" "),
            replaced: false,
          })
        } else if (/^outline(-offset)?\s*:/.test(declaration)) {
          // 同一规则块内已给出替代焦点环
          for (const issue of current) issue.replaced = true
        }
      }

      buffer = ""
    } else {
      buffer += char
    }
  }

  issues.push(...blockIssues.flat())

  for (const issue of issues) {
    if (issue.replaced) continue
    if (!/:focus/.test(issue.selector)) continue

    const exception = EXCEPTIONS.find(
      (entry) =>
        entry.rule === "focus-outline-none" && issue.selector.includes(entry.selectorIncludes),
    )

    if (exception) {
      reportException(exception)
      continue
    }

    push(
      "focus-outline-none",
      issue.line + lineOffset,
      `选择器 ${issue.selector} —— 抹掉了统一焦点环`,
    )
  }
}

/**
 * 收集 `var(--x)` 引用了未定义且无回退值的自定义属性。
 * 这类引用会让整条声明失效，是 `--abyss` 缺陷的同类问题。
 */
function collectUndefinedVars(text, lineOffset, defined, push) {
  const pattern = /var\(\s*(--[\w-]+)\s*(,)?/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    if (match[2]) continue // 有回退值，不会失效
    if (defined.has(match[1])) continue
    if (RUNTIME_DEFINED_VARS.has(match[1])) continue

    const line = lineOffset + lineAt(text, match.index)

    push("undefined-var", line, `var(${match[1]}) —— 全仓未定义且无回退值，该声明会失效`)
  }
}

/**
 * 收集引擎 `.ts` 里绕过 `themeColors.ts` 的颜色字面量。
 *
 * 引擎侧的颜色只能来自 `themeColors.ts` 的导出常量。数据 URL 里的 SVG 用模板串
 * 插值常量即可，不需要写死颜色。
 */
function collectEngineColorLiterals(text, push) {
  for (const pattern of [HEX_PATTERN, FUNCTION_PATTERN]) {
    pattern.lastIndex = 0

    let match
    while ((match = pattern.exec(text)) !== null) {
      push(
        "engine-color-literal",
        lineAt(text, match.index),
        `${match[0].replace(/\($/, "()")} —— 应改用 themeColors.ts 的导出常量`,
      )
    }
  }
}

/**
 * 读取 `global.css` 里出现过的全部 hex 字面量（小写），作为「当前色板」。
 *
 * 取的是文件里所有 hex 而不是只取 `--color-*`，这样 `--brand-text-gradient`
 * 之类的派生令牌也算数；判定的目标是「这个色值还在色板里」，不是「它挂在哪个名字下」。
 */
function readPaletteLiterals() {
  const palette = new Set()
  const source = readFileSync(TOKEN_SOURCE, "utf8")

  HEX_PATTERN.lastIndex = 0
  let match

  while ((match = HEX_PATTERN.exec(source)) !== null) palette.add(match[0].toLowerCase())

  return palette
}

/** 收集数据 URL 中不在色板里的 URL 编码颜色。 */
function collectUrlEncodedColors(text, lineOffset, palette, push) {
  URL_ENCODED_HEX_PATTERN.lastIndex = 0
  let match

  while ((match = URL_ENCODED_HEX_PATTERN.exec(text)) !== null) {
    const literal = `#${match[1]}`.toLowerCase()
    if (palette.has(literal)) continue

    push(
      "url-encoded-color",
      lineOffset + lineAt(text, match.index),
      `%23${match[1]} —— 该色值不在 global.css 色板中，换色板后它不会跟着变`,
    )
  }
}

/** 读取 `global.css` 的自定义属性声明。 */
function readTokenDeclarations() {
  const tokens = new Map()
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g
  const source = readFileSync(TOKEN_SOURCE, "utf8")
  let match

  while ((match = pattern.exec(source)) !== null) tokens.set(match[1], match[2].trim())

  return tokens
}

/** 展开单层 `var()`，返回令牌的小写字面值；无法解析时返回 undefined。 */
function resolveTokenLiteral(tokens, name) {
  let value = tokens.get(name)
  if (value === undefined) return undefined

  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
  if (reference) value = tokens.get(reference[1])

  return value?.toLowerCase()
}

/**
 * 校验引擎常量与界面令牌同值。
 *
 * 引擎常量一旦与令牌分叉，界面换了色而地图元素没换，只有肉眼能发现；
 * 两边任一取值变化都会在这里失败。
 */
function collectEngineTokenDrift(tokens, push) {
  const source = readFileSync(ENGINE_COLOR_SOURCE, "utf8")

  for (const [constant, token] of ENGINE_TOKEN_PAIRS) {
    const declaration = new RegExp("export\\s+const\\s+" + constant + '\\s*=\\s*"([^"]*)"')
    const match = declaration.exec(source)
    const engineValue = match?.[1]?.toLowerCase()
    const tokenValue = resolveTokenLiteral(tokens, token)
    const line = match === null ? 1 : lineAt(source, match.index)

    if (engineValue === undefined) {
      push(
        "engine-token-drift",
        line,
        `${constant} —— 未在 themeColors.ts 中找到该常量的字符串声明`,
      )
      continue
    }

    if (tokenValue === undefined) {
      push(
        "engine-token-drift",
        line,
        `${constant} —— 对应令牌 ${token} 在 global.css 中不存在或不是字面值`,
      )
      continue
    }

    if (engineValue !== tokenValue) {
      push(
        "engine-token-drift",
        line,
        `${constant} = ${engineValue} 与 ${token} = ${tokenValue} 不同值，引擎与界面已分叉`,
      )
    }
  }
}

/** 收集片段中定义的自定义属性名。 */
function collectDefinitions(text, defined) {
  const pattern = /(--[\w-]+)\s*:/g
  let match

  while ((match = pattern.exec(text)) !== null) defined.add(match[1])
}

/** 主流程。 */
function main() {
  const files = listStyleFiles(SRC_DIR)
  const segments = files.flatMap((file) =>
    styleSegments(file).map((segment) => ({ file, ...segment })),
  )

  const defined = new Set()
  for (const segment of segments) collectDefinitions(segment.text, defined)

  const violations = []
  const usedExceptions = new Set()
  const palette = readPaletteLiterals()

  for (const { file, text, lineOffset } of segments) {
    const push = (rule, line, detail) => violations.push({ rule, file, line, detail })

    collectColorLiterals(text, file === TOKEN_SOURCE, lineOffset, push)
    collectZIndexLiterals(text, lineOffset, push)
    collectFocusOutlineNone(text, lineOffset, push, (exception) => usedExceptions.add(exception))
    collectUndefinedVars(text, lineOffset, defined, push)
    collectUrlEncodedColors(text, lineOffset, palette, push)
  }

  const engineFiles = listFiles(ENGINE_DIR, /\.ts$/).filter((file) => file !== ENGINE_COLOR_SOURCE)

  for (const file of engineFiles) {
    const text = readFileSync(file, "utf8")

    collectEngineColorLiterals(text, (rule, line, detail) =>
      violations.push({ rule, file, line, detail }),
    )
    collectUrlEncodedColors(text, 0, palette, (rule, line, detail) =>
      violations.push({ rule, file, line, detail }),
    )
  }

  collectEngineTokenDrift(readTokenDeclarations(), (rule, line, detail) =>
    violations.push({ rule, file: ENGINE_COLOR_SOURCE, line, detail }),
  )

  const staleExceptions = EXCEPTIONS.filter((entry) => !usedExceptions.has(entry))

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}  [${violation.rule}] ${violation.detail}`)
  }

  for (const exception of staleExceptions) {
    console.error(
      `[stale-exception] ${exception.file} 的例外「${exception.selectorIncludes}」已不再命中，请从脚本中移除`,
    )
  }

  if (violations.length === 0 && staleExceptions.length === 0) {
    console.log(`设计令牌检查通过：扫描 ${segments.length} 个样式片段，无违规。`)

    return
  }

  console.error(
    `\n设计令牌检查失败：${violations.length} 处违规，${staleExceptions.length} 条例外失效。`,
  )
  process.exitCode = 1
}

main()
