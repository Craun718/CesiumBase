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
