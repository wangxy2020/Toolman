/** Pure helpers, prop/state types shared by ProjectGanttTaskGrid and its hook. */

import type { UIEvent } from 'react'

import type { PmWorkItemRelation } from '@toolman/shared'

import type { PmCostRow, PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import type { GanttTreeRow } from './pm-gantt-tree'
import type { TaskCostAssignment } from './pm-gantt-cost-assignment'
import { resolveCostAssignmentPercent } from './pm-gantt-cost-assignment'
import type { TaskResourceAssignment } from './pm-gantt-resource-assignment'
import type {
  GanttBuiltinColumn,
  GanttResourceColumnType,
  GanttUiPrefs,
} from './pm-gantt-prefs'

export type GanttColumnKey = GanttBuiltinColumn
export type GanttEditableField = Exclude<GanttColumnKey, 'index'> | string

export type GanttColumnLabels = Record<GanttBuiltinColumn, string>

export type EditTarget =
  | { kind: 'header'; columnId: string }
  | { kind: 'cell'; itemId: string; field: string }

export type ContextMenuState = {
  top: number
  /** Distance from viewport right edge — anchors menu to open leftward. */
  right: number
}

export type RowContextMenuState = {
  top: number
  left: number
  itemId: string
}

/** Resource-allocation view: popup table for one task's assignments. */
export type ResourceAssignPopupState = {
  top: number
  left: number
  /** Cursor Y used for flip-up when measured height exceeds space below. */
  anchorY: number
  itemId: string
  /** Editable slot count (can grow via「添加行」). */
  rowCount: number
}

/** Cost-allocation view: popup table for one task's assignments. */
export type CostAssignPopupState = {
  top: number
  left: number
  anchorY: number
  itemId: string
  rowCount: number
}

export const RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS = 10
export const RESOURCE_ASSIGN_POPUP_ROW_PX = 32

/**
 * Native-like resource cell menu. Native <select> can only check one option; this menu
 * checks both the active resource type and the assigned resource name with the same style.
 * `anchorTop` / `anchorBottom` drive flip-up when the row is near the viewport bottom.
 */
export type ResourceCellPickerState = {
  itemId: string
  slot: number
  type: GanttResourceColumnType
  anchorTop: number
  anchorBottom: number
  left: number
  minWidth: number
}

/**
 * Cost name cascade picker: L1 分部工程 → L2 工作名称.
 * Used by cost-view cells and the cost-assign popup name column.
 */
export type CostNamePickerState = {
  itemId: string
  slot: number
  source: 'cell-name' | 'cell-qty' | 'popup'
  typeFilter: PmCostType | null
  anchorTop: number
  anchorBottom: number
  left: number
  minWidth: number
  openSectionKey: string | null
}

export type HScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

export const EMPTY_H_SCROLL: HScrollMetrics = {
  overflowing: false,
  thumbSize: 1,
  thumbOffset: 0,
}

export interface Props {
  rows: GanttTreeRow[]
  relations: PmWorkItemRelation[]
  indexById: Map<string, number>
  criticalIds?: ReadonlySet<string>
  prefs: GanttUiPrefs
  builtinLabels: GanttColumnLabels
  headerHeight: number
  selectedId: string | null
  checkedIds: ReadonlySet<string>
  listView?: boolean
  /** Resource allocation view: two-row resource headers + view-specific column menu. */
  resourceViewMode?: boolean
  /** Cost allocation view: cost columns + view-specific column menu. */
  costViewMode?: boolean
  printLayout?: boolean
  gridScrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onWheelScroll?: (deltaY: number) => void
  onSelect: (itemId: string) => void
  onToggleChecked: (itemId: string) => void
  onSelectAllRows: () => void
  onClearRowSelection: () => void
  onDeleteSelectedRows: () => void
  onToggleCollapse: (itemId: string) => void
  onPrefsChange: (prefs: GanttUiPrefs) => void
  onCommitCell: (itemId: string, field: string, rawValue: string) => void | Promise<void>
  /** Project / assignable resource catalog (dropdowns, input mode, popup). */
  resourceCatalog?: readonly PmResourceRow[]
  /**
   * Ordered「全部项目」resources — used only when the project has no assignable catalog.
   * Assignment pickers prefer `resourceCatalog` (current project list).
   */
  resourceColumnCatalog?: readonly PmResourceRow[]
  /** Project / shared price list for cost-assignment pickers. */
  costCatalog?: readonly PmCostRow[]
  /** Duration-weighted rolled-up actual % (summaries included). */
  progressPercentById?: ReadonlyMap<string, number>
  /** Persist task ↔ catalog assignment (type / name / quantity) for a slot. */
  onAssignResource?: (
    itemId: string,
    patch: Partial<TaskResourceAssignment>,
    slot?: number,
  ) => void | Promise<void>
  /** Replace all resource slots (input-mode / named-column qty edits). */
  onReplaceResourceAssignments?: (
    itemId: string,
    assignments: TaskResourceAssignment[],
  ) => void | Promise<void>
  /** Persist cost name / amount for a slot. */
  onAssignCost?: (
    itemId: string,
    patch: Partial<TaskCostAssignment>,
    slot?: number,
  ) => void | Promise<void>
  /** Replace all cost slots (input-mode combined column). */
  onReplaceCostAssignments?: (
    itemId: string,
    assignments: TaskCostAssignment[],
  ) => void | Promise<void>
  /** Change this (e.g. project id) to exit multi-select mode. */
  selectionResetKey?: string | null
  /** Baseline as-of date: recompute 应完成% from schedule instead of stored metadata. */
  shouldPercentAsOfMs?: number | null
  /** Plan dates / actual % frozen in the selected baseline (Baseline Start/Finish/Progress). */
  baselinePlanByItemId?: ReadonlyMap<
    string,
    { startDate?: number; dueDate?: number; progressPercent?: number }
  >
}

/** Even slots (1st, 3rd, …) get a shaded band so adjacent resource/cost groups stay distinct. */
export function resourceSlotBandClass(slot: number): string {
  return slot % 2 === 0 ? 'tm-pm-gantt-resource-group--band' : ''
}

/** Compact closed-cell label: show first 3 graphemes; overflow is clipped in CSS. */
export function shortResourceCellLabel(label: string, maxChars = 3): string {
  return Array.from(label.trim()).slice(0, maxChars).join('')
}

/**
 * Derive a cost-assignment `percent` from a manually-typed monetary `amount`.
 * Prefer {@link resolveCostPercentFromQuantity} when the edited value is 工程数量.
 */
export function resolveCostPercentFromAmount(
  nextAmount: number | null,
  catalogAmount: number | null,
  fallbackPercent: number | null,
  catalogQuantity?: number | null,
): number | null {
  if (nextAmount == null) return fallbackPercent
  const hasQty =
    catalogQuantity != null && Number.isFinite(catalogQuantity) && catalogQuantity !== 0
  const hasMoney =
    catalogAmount != null && Number.isFinite(catalogAmount) && catalogAmount !== 0
  if (!hasQty && !hasMoney) return fallbackPercent
  return resolveCostAssignmentPercent(
    { percent: null, amount: nextAmount },
    catalogAmount,
    catalogQuantity,
  )
}
