export type OperationsSide = "left" | "right"

export type RailCommand<CommandId extends string = string> = {
  id: CommandId
  label: string
  icon: string
}

export type RailAction<ActionId extends string = string> = {
  id: ActionId
  label: string
  icon: string
  /** customMenu 由功能菜单插槽渲染；panel 使用通用二级菜单进入三级面板。 */
  customMenu?: boolean
  /** directPanel 由一级按钮直接通知父级打开外部功能面板。 */
  directPanel?: boolean
  /** 外部三级面板打开时是否高亮一级按钮；自定义二级入口可关闭以避免双级同时高亮。 */
  highlightExternalPanel?: boolean
  disabled?: boolean
  disabledReason?: string
}

export type RailPanelPlacement =
  | "left"
  | "left-third"
  | "left-fourth"
  | "right"
  | "right-third"
  | "right-fourth"

export type ExternalPanelControl = {
  controlId: string
  close: () => void
}

/** 解析一级操作按钮的激活状态，允许自定义二级入口抑制三级面板带来的高亮。 */
export function resolveRailActionActive(options: {
  externalPanelOpen: boolean
  expandedMenuOpen: boolean
  activePanelOpen: boolean
  highlightExternalPanel?: boolean
}): boolean {
  if (options.highlightExternalPanel === false) {
    return options.expandedMenuOpen || options.activePanelOpen
  }

  return options.externalPanelOpen || options.expandedMenuOpen || options.activePanelOpen
}

/** 判断二级菜单变化时是否需要关闭旧入口的外部面板；仅收起菜单不关闭三级面板。 */
export function shouldCloseExternalPanelOnMenuChange(
  previousActionId: string | null,
  nextActionId: string | null,
): boolean {
  return Boolean(previousActionId && nextActionId && previousActionId !== nextActionId)
}

export type OperationKind = "command" | "toggle" | "mode" | "panel"

export type OperationMenuItem<OperationId extends string = string> = {
  id: OperationId
  label: string
  icon: string
  kind: OperationKind
  active?: boolean
  open?: boolean
  disabled?: boolean
  disabledReason?: string
  badge?: string
}
