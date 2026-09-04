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
}

export type RailPanelPlacement = "left" | "left-third" | "right" | "right-third"

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
