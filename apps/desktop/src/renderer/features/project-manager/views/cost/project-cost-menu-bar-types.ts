import type { MouseEvent as ReactMouseEvent } from 'react'
import type { PmCostType } from './pm-cost-catalog'
import type { MeteringBaseline, MeteringRollupMode } from './pm-metering-baselines'
import type { DatabaseRowFilter } from './pm-cost-row-filter'

export const COST_PRACTICE_VIEW_PAGES = [
  'meteringTable',
  'progressPaymentSummary',
  'paymentSummary',
] as const

export type CostPracticeViewPage = (typeof COST_PRACTICE_VIEW_PAGES)[number]

export type CostViewMenuVariant = 'catalog' | 'practice' | 'database'

export type CostViewFilter = 'all' | PmCostType | CostPracticeViewPage

export function isCostPracticeViewPage(value: string): value is CostPracticeViewPage {
  return (COST_PRACTICE_VIEW_PAGES as readonly string[]).includes(value)
}

export type CostMenuAction =
  | 'save'
  | 'saveAsNewVersion'
  | 'fetch'
  | 'fetchMetering'
  | 'import'
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
  | 'metering'
  | 'meteringCaptureBaseline'
  | 'meteringEditBaseline'
  | 'meteringDeleteBaseline'

export type CostVersionSwitchEntry = {
  version: number
  name: string
  hasSnapshot: boolean
  isCurrent: boolean
}

export interface ProjectCostMenuBarProps {
  disabled?: boolean
  hasSelection: boolean
  /** Enables 项目信息 — true for a concrete project or「全部项目」. */
  hasProject?: boolean
  canEdit?: boolean
  canUndo?: boolean
  canRedo?: boolean
  showFetch?: boolean
  fetching?: boolean
  /** Hide the toolbar「计量」dropdown (价格表). */
  showMetering?: boolean
  /** 价格表 keeps type filters; 实务 / 数据 list interim metering and statistics pages. */
  viewMenuVariant?: CostViewMenuVariant
  /** Table type filter; `all` shows every resource type. */
  viewFilter: CostViewFilter
  onViewFilterChange: (filter: CostViewFilter) => void
  /** 分部 filter for the type-slot menu; `all` = 全部分部. */
  sectionFilter: string
  onSectionFilterChange: (filter: string) => void
  databaseRowFilter: DatabaseRowFilter
  onDatabaseRowFilterChange: (filter: DatabaseRowFilter) => void
  subprojectOptions: readonly string[]
  /** Distinct 分部工程 names (trimmed; `''` = uncategorized), price-list order. */
  sectionalOptions: readonly string[]
  versionSwitchEntries: CostVersionSwitchEntry[]
  onRestoreVersion: (version: number) => void
  /** Highlights 计量 when the metering view is active (price-list view). */
  meteringActive?: boolean
  meteringBaselines?: readonly MeteringBaseline[]
  selectedMeteringBaselineId?: string | null
  onSelectMeteringBaseline?: (id: string) => void
  meteringRollupMode?: MeteringRollupMode
  onMeteringRollupModeChange?: (mode: MeteringRollupMode) => void
  onAction: (
    action: CostMenuAction,
    event?: Pick<ReactMouseEvent, 'metaKey' | 'ctrlKey'>,
  ) => void
}
