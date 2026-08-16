import type { ReactNode } from 'react'

import type { PmResourceType } from './pm-resource-catalog'

/** `all` | built-in / custom enum | `customName:<name>` for a user-named type. */
export type ResourceViewFilter = 'all' | PmResourceType | string

export type ResourceMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'print'
  | 'projectInfo'
  | 'undo'
  | 'redo'
  | 'add'
  | 'insert'
  | 'delete'
  | 'indent'
  | 'outdent'
  | 'moveUp'
  | 'moveDown'

export type ResourceVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

export type ResourceMenuItem = {
  key: ResourceMenuAction
  title: string
  label: ReactNode
  disabled?: boolean
  dividerAfter?: boolean
  icon?: boolean
}

export interface ProjectResourceMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  /** Table type filter; `all` shows every resource type. */
  viewFilter: ResourceViewFilter
  onViewFilterChange: (filter: ResourceViewFilter) => void
  /** Named custom types registered in View (and any still present on rows). */
  customTypeNames: readonly string[]
  /** Register a secondary custom type name from the View flyout. */
  onRegisterCustomTypeName: (name: string) => void
  /** Request deleting a named custom type (View nested list, context menu). */
  onRequestDeleteCustomTypeName: (name: string) => void
  selectedType: PmResourceType
  /** When selected row is custom, its user-defined type name. */
  selectedCustomTypeName?: string
  onTypeChange: (type: PmResourceType, customTypeName?: string) => void
  versionSwitchEntries: ResourceVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  onAction: (action: ResourceMenuAction) => void
}
