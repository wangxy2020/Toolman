import type {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  UIEvent,
  WheelEvent,
} from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PmWorkItem, PmWorkItemRelation } from '@toolman/shared'

import { IconCheck, IconChevronDown, IconChevronRight, IconChevronUp } from '../../../../components/icons'
import { useI18n } from '../../../../i18n/useI18n'
import type { PmResourceRow, PmResourceType } from '../resource/pm-resource-catalog'
import { isPmResourceType, PM_RESOURCE_TYPES } from '../resource/pm-resource-catalog'
import type { GanttTreeRow } from './pm-gantt-tree'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import {
  formatCostAssignmentsInput,
  makeCostColumnId,
  parseCostAssignmentsInput,
  parseCostColumnId,
  readTaskCostAssignmentAt,
  readTaskCostAssignments,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import {
  catalogRowsForType,
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  formatResourceAssignmentInput,
  formatResourceAssignmentsInput,
  isEmptyAssignment,
  moveTaskResourceAssignment,
  parseResourceAssignmentInput,
  parseResourceColumnId,
  readTaskResourceAssignments,
  resolveAssignmentAgainstCatalog,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  buildDefaultResourceColumnBindings,
  buildGridTemplateColumns,
  createCustomColumnId,
  customColumnMetaKey,
  GANTT_BUILTIN_COLUMNS,
  insertColumnInCanonicalOrder,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  GANTT_COST_VIEW_MAX_SLOTS,
  resolveColumnLabel,
  SWITCHABLE_RESOURCE_COLUMN_TYPES,
  type GanttBuiltinColumn,
  type GanttResourceColumnBinding,
  type GanttResourceColumnType,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  formatWorkItemDate,
  GANTT_ROW_HEIGHT,
  isGanttProjectRootId,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'

export type GanttColumnKey = GanttBuiltinColumn
export type GanttEditableField = Exclude<GanttColumnKey, 'index'> | string

export type GanttColumnLabels = Record<GanttBuiltinColumn, string>

type EditTarget =
  | { kind: 'header'; columnId: string }
  | { kind: 'cell'; itemId: string; field: string }

type ContextMenuState = {
  top: number
  /** Distance from viewport right edge — anchors menu to open leftward. */
  right: number
}

type RowContextMenuState = {
  top: number
  left: number
  itemId: string
}

/** Resource-allocation view: popup table for one task's assignments. */
type ResourceAssignPopupState = {
  top: number
  left: number
  /** Cursor Y used for flip-up when measured height exceeds space below. */
  anchorY: number
  itemId: string
  /** Editable slot count (can grow via「添加行」). */
  rowCount: number
}

const RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS = 10
const RESOURCE_ASSIGN_POPUP_ROW_PX = 32

/**
 * Native-like resource cell menu. Native <select> can only check one option; this menu
 * checks both the active resource type and the assigned resource name with the same style.
 * `anchorTop` / `anchorBottom` drive flip-up when the row is near the viewport bottom.
 */
type ResourceCellPickerState = {
  itemId: string
  slot: number
  type: GanttResourceColumnType
  anchorTop: number
  anchorBottom: number
  left: number
  minWidth: number
}

type HScrollMetrics = {
  overflowing: boolean
  thumbSize: number
  thumbOffset: number
}

const EMPTY_H_SCROLL: HScrollMetrics = {
  overflowing: false,
  thumbSize: 1,
  thumbOffset: 0,
}

/** Even slots (1st, 3rd, …) get a shaded band so adjacent resource/cost groups stay distinct. */
function resourceSlotBandClass(slot: number): string {
  return slot % 2 === 0 ? 'tm-pm-gantt-resource-group--band' : ''
}

/** Compact closed-cell label: show first 3 graphemes; overflow is clipped in CSS. */
function shortResourceCellLabel(label: string, maxChars = 3): string {
  return Array.from(label.trim()).slice(0, maxChars).join('')
}

interface Props {
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
}

export const ProjectGanttTaskGrid: FC<Props> = ({
  rows,
  relations,
  indexById,
  criticalIds,
  prefs,
  builtinLabels,
  headerHeight,
  selectedId,
  checkedIds,
  listView = false,
  resourceViewMode = false,
  costViewMode = false,
  printLayout = false,
  gridScrollRef,
  onScroll,
  onWheelScroll,
  onSelect,
  onToggleChecked,
  onSelectAllRows,
  onClearRowSelection,
  onDeleteSelectedRows,
  onToggleCollapse,
  onPrefsChange,
  onCommitCell,
  resourceCatalog = [],
  resourceColumnCatalog,
  onAssignResource,
  onReplaceResourceAssignments,
  onAssignCost,
  onReplaceCostAssignments,
  selectionResetKey = null,
}) => {
  const { t } = useI18n()
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null)
  const [resourceAssignPopup, setResourceAssignPopup] = useState<ResourceAssignPopupState | null>(
    null,
  )
  const [resourceAssignSelectedSlot, setResourceAssignSelectedSlot] = useState<number | null>(null)
  const resourceAssignPopupRef = useRef<HTMLDivElement | null>(null)
  const [resourceCellPicker, setResourceCellPicker] = useState<ResourceCellPickerState | null>(
    null,
  )
  const resourceCellPickerMenuRef = useRef<HTMLDivElement | null>(null)
  /** Popup-only type drafts for empty rows (not persisted until a name is chosen). */
  const [resourceAssignDraftTypes, setResourceAssignDraftTypes] = useState<
    Record<number, PmResourceType>
  >({})
  /** Index shows numbers until the user opens the row context menu (multi-select). */
  const [selectionMode, setSelectionMode] = useState(false)
  const [hScrollMetrics, setHScrollMetrics] = useState<HScrollMetrics>(EMPTY_H_SCROLL)
  const [hScrollDragging, setHScrollDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hScrollRef = useRef<HTMLDivElement>(null)
  const hTrackRef = useRef<HTMLDivElement>(null)
  const headerPinInnerRef = useRef<HTMLDivElement>(null)

  const gridTemplate = useMemo(
    () =>
      buildGridTemplateColumns(prefs.columnOrder, {
        fullWidthList: listView,
        printLayout,
      }),
    [prefs.columnOrder, listView, printLayout],
  )

  const syncHeaderPinScroll = () => {
    const el = hScrollRef.current
    const pin = headerPinInnerRef.current
    if (!el || !pin) return
    pin.style.transform = `translateX(${-el.scrollLeft}px)`
  }

  const syncHScrollMetrics = () => {
    const el = hScrollRef.current
    if (!el) return
    syncHeaderPinScroll()
    const { scrollWidth, clientWidth, scrollLeft } = el
    const overflowing = scrollWidth > clientWidth + 1
    if (!overflowing) {
      setHScrollMetrics(EMPTY_H_SCROLL)
      return
    }
    const thumbSize = Math.min(1, clientWidth / scrollWidth)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * (1 - thumbSize)
    setHScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
  }

  useEffect(() => {
    const el = hScrollRef.current
    if (!el) return
    syncHScrollMetrics()
    const ro = new ResizeObserver(() => syncHScrollMetrics())
    ro.observe(el)
    const inner = el.firstElementChild
    if (inner) ro.observe(inner)
    window.addEventListener('resize', syncHScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHScrollMetrics)
    }
  }, [gridTemplate, listView, rows.length])

  useEffect(() => {
    setSelectionMode(false)
    setRowContextMenu(null)
    setResourceAssignPopup(null)
    setResourceCellPicker(null)
    setResourceAssignDraftTypes({})
  }, [selectionResetKey])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!contextMenu && !rowContextMenu && !resourceAssignPopup && !resourceCellPicker) return
    const onDoc = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest(
          [
            '.tm-pm-gantt-resource-select-menu',
            '.tm-pm-gantt-resource-cell-trigger',
            '.tm-pm-gantt-resource-assign-popup',
            '.tm-pm-gantt-col-menu',
          ].join(', '),
        )
      ) {
        return
      }
      setContextMenu(null)
      setRowContextMenu(null)
      setResourceAssignPopup(null)
      setResourceCellPicker(null)
      setResourceAssignDraftTypes({})
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setContextMenu(null)
      setRowContextMenu(null)
      setResourceAssignPopup(null)
      setResourceCellPicker(null)
      setResourceAssignDraftTypes({})
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu, rowContextMenu, resourceAssignPopup, resourceCellPicker])

  useLayoutEffect(() => {
    const menu = resourceCellPickerMenuRef.current
    if (!resourceCellPicker || !menu) return

    const margin = 8
    const gap = 2
    const spaceBelow = window.innerHeight - resourceCellPicker.anchorBottom - margin
    const spaceAbove = resourceCellPicker.anchorTop - margin

    // Measure with the larger side first, then flip if the menu cannot fit below.
    menu.style.maxHeight = `${Math.min(320, Math.max(120, spaceBelow, spaceAbove))}px`
    let height = menu.offsetHeight
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow
    menu.style.maxHeight = `${Math.min(320, Math.max(120, openAbove ? spaceAbove : spaceBelow))}px`
    height = menu.offsetHeight

    const width = Math.max(menu.offsetWidth, resourceCellPicker.minWidth)
    let top = openAbove
      ? resourceCellPicker.anchorTop - height - gap
      : resourceCellPicker.anchorBottom + gap
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = resourceCellPicker.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
  }, [resourceCellPicker])

  useLayoutEffect(() => {
    const popup = resourceAssignPopupRef.current
    if (!resourceAssignPopup || !popup) return

    const margin = 8
    const maxViewportHeight = Math.max(160, window.innerHeight - margin * 2)
    popup.style.maxHeight = `${maxViewportHeight}px`

    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const spaceBelow = window.innerHeight - resourceAssignPopup.anchorY - margin
    const spaceAbove = resourceAssignPopup.anchorY - margin
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow

    let top = openAbove
      ? resourceAssignPopup.anchorY - height
      : resourceAssignPopup.anchorY
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = resourceAssignPopup.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    popup.style.top = `${top}px`
    popup.style.left = `${left}px`
  }, [resourceAssignPopup])

  const writeOrderedResourceSlot = (
    itemId: string,
    currentOrdered: TaskResourceAssignment[],
    slotIndex: number,
    patch: Partial<TaskResourceAssignment>,
  ) => {
    const list = currentOrdered.map((entry) => ({ ...entry }))
    const base = list[slotIndex] ?? { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }
    const merged: TaskResourceAssignment = {
      resourceId: patch.resourceId !== undefined ? patch.resourceId : base.resourceId,
      type: patch.type !== undefined ? patch.type : base.type,
      name: patch.name !== undefined ? patch.name : base.name,
      quantity: patch.quantity !== undefined ? patch.quantity : base.quantity,
      note: patch.note !== undefined ? patch.note : base.note,
    }
    if (slotIndex < list.length) list[slotIndex] = merged
    else {
      while (list.length < slotIndex) list.push({ ...EMPTY_TASK_RESOURCE_ASSIGNMENT })
      list.push(merged)
    }
    if (onReplaceResourceAssignments) {
      void onReplaceResourceAssignments(itemId, list)
      return
    }
    if (onAssignResource) void onAssignResource(itemId, patch, slotIndex)
  }

  const labelOf = (id: string) => {
    const resourceCol = parseResourceColumnId(id)
    if (resourceCol?.field === 'input') {
      return t('projectManagerPage.schedule.columns.resourceGroup')
    }
    const costCol = parseCostColumnId(id)
    if (costCol?.field === 'input') {
      return t('projectManagerPage.schedule.columns.costGroup')
    }
    if (costCol?.field === 'name') {
      return t('projectManagerPage.schedule.columns.costName')
    }
    if (costCol?.field === 'amount') {
      return t('projectManagerPage.schedule.columns.costAmount')
    }
    return resolveColumnLabel(id, prefs, builtinLabels)
  }
  const menuLabelOf = (id: string) => labelOf(id).replace(/\n/g, '')
  const resourceInputMode = resourceViewMode && prefs.resourceView.inputMode
  const costInputMode = costViewMode && prefs.costView.inputMode
  const columnCatalog = useMemo(() => {
    // Prefer the project resource list so shared defaults (e.g. 技术工人) cannot be assigned
    // when they are not in the current project catalog.
    if (resourceCatalog.length > 0) return resourceCatalog
    if (resourceColumnCatalog && resourceColumnCatalog.length > 0) return resourceColumnCatalog
    return []
  }, [resourceCatalog, resourceColumnCatalog])
  const columnBindings = useMemo((): GanttResourceColumnBinding[] => {
    const bindings = prefs.resourceView.columnBindings
    if (bindings && bindings.length >= prefs.resourceView.slotCount) {
      return bindings.slice(0, prefs.resourceView.slotCount)
    }
    return buildDefaultResourceColumnBindings(prefs.resourceView.slotCount)
  }, [prefs.resourceView.columnBindings, prefs.resourceView.slotCount])

  const resolveResourceTypeLabel = (label: string): PmResourceType | null => {
    const trimmed = label.trim()
    if (!trimmed) return null
    if (isPmResourceType(trimmed)) return trimmed
    for (const type of PM_RESOURCE_TYPES) {
      if (t(`projectManagerPage.resourceTable.types.${type}`) === trimmed) return type
    }
    return null
  }

  const typeLabelOf = (type: PmResourceType) =>
    t(`projectManagerPage.resourceTable.types.${type}`)

  const patchPrefs = (patch: Partial<GanttUiPrefs> | ((current: GanttUiPrefs) => GanttUiPrefs)) => {
    const next = typeof patch === 'function' ? patch(prefs) : { ...prefs, ...patch }
    onPrefsChange(next)
  }

  const openColumnMenu = (anchorLeft: number, anchorBottom: number) => {
    const menuMinWidth = 180
    const gap = 4
    // Open to the left of the anchor (from bottom-left toward left).
    const right = Math.max(8, window.innerWidth - anchorLeft + gap)
    const maxRight = window.innerWidth - menuMinWidth - 8
    const clampedRight = Math.min(right, maxRight)
    const estimatedHeight = 320
    let top = anchorBottom + gap
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, anchorBottom - estimatedHeight)
    }
    setContextMenu({ top, right: clampedRight })
    setRowContextMenu(null)
    setResourceAssignPopup(null)
  }

  const startEdit = (target: EditTarget, value: string) => {
    if (target.kind === 'header' && (target.columnId === 'index' || target.columnId === 'spacer')) {
      return
    }
    if (target.kind === 'header' && (resourceViewMode || costViewMode)) return
    setEditing(target)
    setDraft(value)
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
  }

  const commitEdit = () => {
    if (!editing) return
    if (editing.kind === 'header') {
      const next = draft.trim()
      if (next) {
        patchPrefs({
          columnLabels: { ...prefs.columnLabels, [editing.columnId]: next },
          customColumns: prefs.customColumns.map((col) =>
            col.id === editing.columnId ? { ...col, label: next } : col,
          ),
        })
      }
    } else {
      void onCommitCell(editing.itemId, editing.field, draft)
    }
    cancelEdit()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const toggleColumnVisible = (id: string) => {
    if (id === 'name') return
    patchPrefs((current) => {
      if (current.columnOrder.includes(id)) {
        return {
          ...current,
          columnOrder: current.columnOrder.filter((entry) => entry !== id),
        }
      }
      return {
        ...current,
        columnOrder: insertColumnInCanonicalOrder(
          current.columnOrder,
          id,
          current.customColumns,
        ),
      }
    })
  }

  const addCustomColumn = () => {
    const label = window.prompt(t('projectManagerPage.schedule.addCustomColumnPrompt'))?.trim()
    if (!label) return
    const id = createCustomColumnId()
    patchPrefs({
      customColumns: [...prefs.customColumns, { id, label }],
      columnOrder: [...prefs.columnOrder, id],
      columnLabels: { ...prefs.columnLabels, [id]: label },
    })
    setContextMenu(null)
  }

  const cellValue = (item: PmWorkItem, field: string): string => {
    if (field === 'spacer') return ''
    const resourceCol = parseResourceColumnId(field)
    if (resourceCol) {
      const catalogForCell = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
      if (resourceCol.field === 'input') {
        const list = readTaskResourceAssignments(item.metadata).map((entry) =>
          resolveAssignmentAgainstCatalog(entry, catalogForCell),
        )
        return formatResourceAssignmentsInput(list, typeLabelOf)
      }
      const slotList = readTaskResourceAssignments(item.metadata)
      const assignment = resolveAssignmentAgainstCatalog(
        slotList[resourceCol.slot] ?? EMPTY_TASK_RESOURCE_ASSIGNMENT,
        catalogForCell,
      )
      if (assignment.quantity == null) return ''
      return String(assignment.quantity)
    }
    const costCol = parseCostColumnId(field)
    if (costCol) {
      const assignment = readTaskCostAssignmentAt(item.metadata, costCol.slot)
      if (costCol.field === 'name') return assignment.name
      if (costCol.field === 'input') {
        return formatCostAssignmentsInput(readTaskCostAssignments(item.metadata))
      }
      if (assignment.amount == null) return ''
      return String(assignment.amount)
    }
    if (isGanttCustomColumnId(field) || (!isGanttBuiltinColumn(field) && field !== 'index')) {
      const raw = item.metadata?.[customColumnMetaKey(field)]
      return raw == null ? '' : String(raw)
    }
    switch (field as GanttEditableField) {
      case 'name':
        return item.title
      case 'duration':
        return `${workItemDurationDays(item)}${t('projectManagerPage.schedule.dayUnit')}`
      case 'start':
        return formatWorkItemDate(item.startDate)
      case 'finish':
        return formatWorkItemDate(item.dueDate)
      case 'predecessors':
        return formatPredecessorsForItem(relations, item.id, indexById)
      case 'actualStart': {
        const raw = item.metadata?.[ACTUAL_START_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'actualFinish': {
        const raw = item.metadata?.[ACTUAL_FINISH_META_KEY]
        const ms = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
        return ms != null && Number.isFinite(ms) ? formatWorkItemDate(ms) : ''
      }
      case 'shouldPercentComplete':
        return `${shouldCompletePercent(item)}%`
      case 'percentComplete':
        return `${item.progressPercent}%`
      default:
        return ''
    }
  }

  const columnClassSuffix = (columnId: string): string => {
    const resourceCol = parseResourceColumnId(columnId)
    if (resourceCol) {
      if (resourceCol.field === 'type') return 'resourceType'
      if (resourceCol.field === 'name') return 'resourceName'
      if (resourceCol.field === 'input') return 'resourceInput'
      return 'resourceQty'
    }
    const costCol = parseCostColumnId(columnId)
    if (costCol) {
      if (costCol.field === 'name') return 'costName'
      if (costCol.field === 'amount') return 'costAmount'
      return 'costInput'
    }
    if (columnId === 'spacer' || isGanttBuiltinColumn(columnId)) {
      return columnId
    }
    return 'custom'
  }

  const openHeaderMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    openColumnMenu(event.clientX, event.clientY)
  }

  const renderPlainHeaderCell = (columnId: string, options?: { rowSpan2?: boolean }) => {
    const isEditing = editing?.kind === 'header' && editing.columnId === columnId
    const editable =
      columnId !== 'index' &&
      columnId !== 'spacer' &&
      !resourceViewMode &&
      !costViewMode
    return (
      <span
        key={columnId}
        className={[
          'tm-pm-gantt-col',
          `tm-pm-gantt-col--${columnClassSuffix(columnId)}`,
          options?.rowSpan2 ? 'tm-pm-gantt-col--rowspan2' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDoubleClick={
          editable ? () => startEdit({ kind: 'header', columnId }, labelOf(columnId)) : undefined
        }
        onContextMenu={columnId === 'spacer' ? undefined : openHeaderMenu}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ) : labelOf(columnId).includes('\n') ? (
          <span className="tm-pm-gantt-col-label-wrap">
            {labelOf(columnId)
              .split('\n')
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </span>
        ) : (
          labelOf(columnId)
        )}
      </span>
    )
  }

  const renderResourceViewHeader = () => {
    const order = prefs.columnOrder
    const nodes: ReactNode[] = []
    let index = 0
    while (index < order.length) {
      const columnId = order[index]!
      if (columnId === 'spacer') {
        nodes.push(
          <span
            key="spacer"
            className="tm-pm-gantt-col tm-pm-gantt-col--spacer"
            aria-hidden
            onContextMenu={openHeaderMenu}
          />,
        )
        index += 1
        continue
      }
      const parsed = parseResourceColumnId(columnId)
      if (parsed?.field === 'input') {
        // Legacy combined input column — treat like a single indexed resource group.
        nodes.push(
          <div
            key={columnId}
            className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
            style={{ gridColumn: 'span 1' }}
            onContextMenu={openHeaderMenu}
          >
            <div className="tm-pm-gantt-resource-header-group-title">
              {t('projectManagerPage.schedule.columns.resourceGroup')}
            </div>
            <div
              className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
              style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
            >
              <span className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index">
                1
              </span>
            </div>
          </div>,
        )
        index += 1
        continue
      }
      if (parsed?.field === 'qty') {
        const qtyIds: string[] = []
        let cursor = index
        while (cursor < order.length) {
          const nextId = order[cursor]!
          const nextParsed = parseResourceColumnId(nextId)
          if (nextParsed?.field !== 'qty') break
          qtyIds.push(nextId)
          cursor += 1
        }
        const colCount = Math.max(1, qtyIds.length)
        nodes.push(
          <div
            key="resource-named-group"
            className="tm-pm-gantt-resource-header-group tm-pm-gantt-resource-header-group--indexed"
            style={{ gridColumn: `span ${colCount}` }}
            onContextMenu={openHeaderMenu}
          >
            <div className="tm-pm-gantt-resource-header-group-title">
              {t('projectManagerPage.schedule.columns.resourceGroup')}
            </div>
            <div
              className="tm-pm-gantt-resource-header-group-subs tm-pm-gantt-resource-header-group-subs--index"
              style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
            >
              {qtyIds.map((qtyId, slotIndex) => (
                <span
                  key={qtyId}
                  className="tm-pm-gantt-col tm-pm-gantt-col--sub tm-pm-gantt-col--resource-index"
                >
                  {slotIndex + 1}
                </span>
              ))}
            </div>
          </div>,
        )
        index = cursor
        continue
      }
      nodes.push(renderPlainHeaderCell(columnId, { rowSpan2: true }))
      index += 1
    }
    return nodes
  }

  const renderCostViewHeader = () => {
    const order = prefs.columnOrder
    const nodes: ReactNode[] = []
    let index = 0
    while (index < order.length) {
      const columnId = order[index]!
      if (columnId === 'spacer') {
        nodes.push(
          <span
            key="spacer"
            className={[
              'tm-pm-gantt-col',
              'tm-pm-gantt-col--spacer',
              costInputMode ? '' : 'tm-pm-gantt-col--rowspan2',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
            onContextMenu={openHeaderMenu}
          />,
        )
        index += 1
        continue
      }
      const parsed = parseCostColumnId(columnId)
      if (parsed?.field === 'input') {
        const bandClass = resourceSlotBandClass(parsed.slot)
        nodes.push(
          <span
            key={columnId}
            className={[
              'tm-pm-gantt-col',
              'tm-pm-gantt-col--costInput',
              costInputMode ? '' : 'tm-pm-gantt-col--rowspan2',
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
            onContextMenu={openHeaderMenu}
          >
            {t('projectManagerPage.schedule.columns.costGroup')}
          </span>,
        )
        index += 1
        continue
      }
      if (
        !costInputMode &&
        parsed?.field === 'name' &&
        order[index + 1] === makeCostColumnId(parsed.slot, 'amount')
      ) {
        const slot = parsed.slot
        const bandClass = resourceSlotBandClass(slot)
        nodes.push(
          <div
            key={`cost-group-${slot}`}
            className={[
              'tm-pm-gantt-resource-header-group',
              'tm-pm-gantt-cost-header-group',
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
            onContextMenu={openHeaderMenu}
          >
            <div className="tm-pm-gantt-resource-header-group-title">
              {t('projectManagerPage.schedule.columns.costGroup')}
            </div>
            <div className="tm-pm-gantt-cost-header-group-subs">
              <span className="tm-pm-gantt-col tm-pm-gantt-col--costName tm-pm-gantt-col--sub">
                {t('projectManagerPage.schedule.columns.costName')}
              </span>
              <span className="tm-pm-gantt-col tm-pm-gantt-col--costAmount tm-pm-gantt-col--sub">
                {t('projectManagerPage.schedule.columns.costAmount')}
              </span>
            </div>
          </div>,
        )
        index += 2
        continue
      }
      nodes.push(renderPlainHeaderCell(columnId, { rowSpan2: !costInputMode }))
      index += 1
    }
    return nodes
  }

  const renderHeaderCell = (columnId: string) => renderPlainHeaderCell(columnId)

  const renderBodyCell = (row: GanttTreeRow, field: string) => {
    const { item, depth, hasChildren, expanded } = row
    const isEditing =
      editing?.kind === 'cell' && editing.itemId === item.id && editing.field === field
    const value = cellValue(item, field)
    const onCritical = criticalIds?.has(item.id) ?? false
    const kind = resolveGanttTaskKind(item, hasChildren, onCritical)

    if (field === 'index') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      const checked = checkedIds.has(item.id)
      const checkboxTitle = `${t('projectManagerPage.schedule.selection.checkboxColumn')} ${row.rowNumber}`
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--index"
          onClick={(event) => event.stopPropagation()}>
          {printLayout || !selectionMode || isProjectRoot ? (
            row.rowNumber > 0 ? row.rowNumber : ''
          ) : (
            <label className="tm-kb-file-card-select" title={checkboxTitle}>
              <input
                type="checkbox"
                className="tm-kb-file-card-select-input"
                checked={checked}
                aria-label={checkboxTitle}
                onChange={() => onToggleChecked(item.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <span
                className={[
                  'tm-kb-file-card-select-box',
                  checked ? 'tm-kb-file-card-select-box--checked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            </label>
          )}
        </span>
      )
    }

    if (field === 'name') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--name"
          style={{ paddingLeft: `${4 + depth * 14}px` }}
          onDoubleClick={
            isProjectRoot
              ? undefined
              : () => startEdit({ kind: 'cell', itemId: item.id, field }, value)
          }>
          {hasChildren ? (
            <button
              type="button"
              className="tm-pm-gantt-fold-btn"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse(item.id)
              }}>
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          ) : (
            <span className="tm-pm-gantt-fold-placeholder" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={[
                'tm-pm-gantt-cell-text',
                kind === 'summary' || isProjectRoot ? 'tm-pm-gantt-cell-text--summary' : '',
                onCritical ? 'tm-pm-gantt-cell-text--critical' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={item.title}>
              {item.title}
            </span>
          )}
        </span>
      )
    }

    if (field === 'spacer') {
      return <span key={field} className="tm-pm-gantt-col tm-pm-gantt-col--spacer" aria-hidden />
    }

    const resourceCol = parseResourceColumnId(field)
    if (resourceCol) {
      const { slot, field: resourceField } = resourceCol
      const bandClass = resourceSlotBandClass(slot)
      const isProjectRoot = isGanttProjectRootId(item.id)
      /** Summary / milestone / project-root rows cannot hold resource assignments. */
      if (hasChildren || isProjectRoot || item.type === 'milestone') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            -
          </span>
        )
      }
      if (resourceField === 'type' || resourceField === 'name') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            —
          </span>
        )
      }

      const binding = columnBindings[slot]
      const catalogForCell = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
      const slotAssignments = readTaskResourceAssignments(item.metadata)
      const assignment = resolveAssignmentAgainstCatalog(
        slotAssignments[slot] ?? EMPTY_TASK_RESOURCE_ASSIGNMENT,
        catalogForCell,
      )

      // Input mode: one text field per column — `类型，名称，数量`.
      if (resourceInputMode) {
        const display = formatResourceAssignmentInput(assignment, typeLabelOf)
        const canEditInput = Boolean(onReplaceResourceAssignments || onAssignResource)
        if (!canEditInput) {
          return (
            <span
              key={field}
              className={['tm-pm-gantt-col', 'tm-pm-gantt-col--resourceQty', bandClass]
                .filter(Boolean)
                .join(' ')}
            >
              {display || '—'}
            </span>
          )
        }
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              'tm-pm-gantt-col--resourceQty',
              'tm-pm-gantt-col--resource-cell',
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${item.id}:slot-input:${slot}:${display}`}
              className={[
                'tm-pm-gantt-cell-input',
                'tm-pm-gantt-cell-input--resource-combo',
                !display ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              defaultValue={display}
              placeholder={t('projectManagerPage.schedule.resourceAssign.inputPlaceholder')}
              aria-label={t('projectManagerPage.schedule.columns.resourceGroup')}
              title={display || t('projectManagerPage.schedule.resourceAssign.inputPlaceholder')}
              onBlur={(event) => {
                const raw = event.target.value.trim()
                if (!raw) {
                  if (isEmptyAssignment(assignment)) return
                  const next = slotAssignments.filter((_, index) => index !== slot)
                  if (onReplaceResourceAssignments) {
                    void onReplaceResourceAssignments(item.id, next)
                  } else {
                    writeOrderedResourceSlot(item.id, slotAssignments, slot, {
                      ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
                    })
                  }
                  return
                }
                const parsed = parseResourceAssignmentInput(
                  raw,
                  catalogForCell,
                  resolveResourceTypeLabel,
                )
                const resolved = resolveAssignmentAgainstCatalog(parsed, catalogForCell)
                const same =
                  resolved.resourceId === assignment.resourceId &&
                  resolved.type === assignment.type &&
                  resolved.name === assignment.name &&
                  resolved.quantity === assignment.quantity
                if (same) return
                writeOrderedResourceSlot(item.id, slotAssignments, slot, {
                  resourceId: resolved.resourceId,
                  type: resolved.type,
                  name: resolved.name,
                  quantity: resolved.quantity,
                  note: assignment.note,
                })
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      // Normal mode: type/name picker + quantity.
      // Prefer the assignment's own type so empty fallbacks don't use a mismatched column binding.
      const assignmentType: GanttResourceColumnType =
        (assignment.type &&
        SWITCHABLE_RESOURCE_COLUMN_TYPES.includes(assignment.type as GanttResourceColumnType)
          ? (assignment.type as GanttResourceColumnType)
          : null) ??
        binding?.type ??
        'labor'
      const menuOpen =
        resourceCellPicker?.itemId === item.id && resourceCellPicker.slot === slot
      const type = menuOpen && resourceCellPicker ? resourceCellPicker.type : assignmentType
      const typeLabel = t(`projectManagerPage.resourceTable.types.${type}`)
      const selectedId = assignment.resourceId ?? ''
      const canEdit = Boolean(onAssignResource || onReplaceResourceAssignments)
      const assignmentName = assignment.name.trim()
      const fullTriggerLabel = assignmentName
        ? assignmentName
        : selectedId
          ? selectedId
          : typeLabel
      const triggerLabel = shortResourceCellLabel(fullTriggerLabel)

      const commitQuantity = (rawValue: string) => {
        if (!canEdit || (!selectedId && !assignmentName)) return
        const raw = rawValue.trim()
        const next = raw === '' ? null : Number(raw)
        if (next != null && !Number.isFinite(next)) return
        if (next === assignment.quantity) return
        writeOrderedResourceSlot(item.id, slotAssignments, slot, { quantity: next })
      }

      return (
        <span
          key={field}
          className={[
            'tm-pm-gantt-col',
            'tm-pm-gantt-col--resourceQty',
            'tm-pm-gantt-col--resource-cell',
            bandClass,
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={[
              'tm-pm-gantt-cell-select',
              'tm-pm-gantt-resource-header-select',
              'tm-pm-gantt-resource-cell-trigger',
              !selectedId && !assignmentName ? 'tm-pm-gantt-cell-select--empty' : '',
              menuOpen ? 'tm-pm-gantt-resource-cell-trigger--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={typeLabel}
            title={fullTriggerLabel}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            disabled={!canEdit}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (!canEdit) return
              if (menuOpen) {
                setResourceCellPicker(null)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              setResourceCellPicker({
                itemId: item.id,
                slot,
                type: assignmentType,
                anchorTop: rect.top,
                anchorBottom: rect.bottom,
                left: rect.left,
                minWidth: Math.max(rect.width, 168),
              })
            }}
          >
            <span className="tm-pm-gantt-resource-cell-trigger-label">{triggerLabel}</span>
            <IconChevronDown size={12} className="tm-pm-gantt-resource-cell-trigger-chevron" />
          </button>
          <input
            key={`${item.id}:${slot}:${selectedId}:${assignmentName}:${assignment.quantity ?? ''}`}
            className={[
              'tm-pm-gantt-cell-input',
              'tm-pm-gantt-cell-input--number',
              'tm-pm-gantt-resource-cell-qty',
              assignment.quantity == null ? 'tm-pm-gantt-cell-input--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="text"
            inputMode="decimal"
            defaultValue={assignment.quantity ?? ''}
            aria-label={t('projectManagerPage.schedule.columns.resourceQty')}
            placeholder=""
            disabled={!canEdit || (!selectedId && !assignmentName)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitQuantity(event.currentTarget.value)
              event.currentTarget.blur()
            }}
            onBlur={(event) => {
              commitQuantity(event.currentTarget.value)
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          />
        </span>
      )
    }

    const costCol = parseCostColumnId(field)
    if (costCol) {
      const { slot, field: costField } = costCol
      const bandClass = resourceSlotBandClass(slot)
      const isProjectRoot = isGanttProjectRootId(item.id)
      if (hasChildren || isProjectRoot || item.type === 'milestone') {
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            -
          </span>
        )
      }
      const assignment = readTaskCostAssignmentAt(item.metadata, slot)

      if (costField === 'input') {
        const list = readTaskCostAssignments(item.metadata)
        const display = formatCostAssignmentsInput(list)
        if (!onReplaceCostAssignments) {
          return (
            <span
              key={field}
              className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costInput', bandClass]
                .filter(Boolean)
                .join(' ')}
            >
              {display || '—'}
            </span>
          )
        }
        return (
          <span
            key={field}
            className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costInput', bandClass]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${item.id}:cost-input:${display}`}
              className={[
                'tm-pm-gantt-cell-input',
                'tm-pm-gantt-cell-input--resource-combo',
                !display ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              defaultValue={display}
              placeholder={t('projectManagerPage.schedule.costAssign.inputPlaceholder')}
              aria-label={t('projectManagerPage.schedule.columns.costGroup')}
              onBlur={(event) => {
                const next = parseCostAssignmentsInput(event.target.value).slice(
                  0,
                  GANTT_COST_VIEW_MAX_SLOTS,
                )
                const same =
                  next.length === list.length &&
                  next.every((entry, index) => {
                    const prev = list[index]!
                    return entry.name === prev.name && entry.amount === prev.amount
                  })
                if (same) return
                void onReplaceCostAssignments(item.id, next)
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      if (!onAssignCost) {
        const display =
          costField === 'name'
            ? assignment.name
            : assignment.amount != null
              ? String(assignment.amount)
              : ''
        return (
          <span
            key={field}
            className={[
              'tm-pm-gantt-col',
              `tm-pm-gantt-col--${columnClassSuffix(field)}`,
              bandClass,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {display || '—'}
          </span>
        )
      }

      if (costField === 'name') {
        return (
          <span
            key={field}
            className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costName', bandClass]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${item.id}:${slot}:name:${assignment.name}`}
              className={[
                'tm-pm-gantt-cell-input',
                !assignment.name.trim() ? 'tm-pm-gantt-cell-input--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              defaultValue={assignment.name}
              placeholder={t('projectManagerPage.schedule.costAssign.namePlaceholder')}
              aria-label={t('projectManagerPage.schedule.columns.costName')}
              onBlur={(event) => {
                const next = event.target.value.trim()
                if (next === assignment.name.trim()) return
                void onAssignCost(item.id, { name: next }, slot)
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </span>
        )
      }

      return (
        <span
          key={field}
          className={['tm-pm-gantt-col', 'tm-pm-gantt-col--costAmount', bandClass]
            .filter(Boolean)
            .join(' ')}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            key={`${item.id}:${slot}:amount:${assignment.amount ?? ''}`}
            className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--number"
            type="number"
            min={0}
            step="any"
            defaultValue={assignment.amount ?? ''}
            aria-label={t('projectManagerPage.schedule.columns.costAmount')}
            placeholder={assignment.name.trim() ? '0' : ''}
            onBlur={(event) => {
              const raw = event.target.value.trim()
              const next = raw === '' ? null : Number(raw)
              if (next != null && !Number.isFinite(next)) return
              if (next === assignment.amount) return
              void onAssignCost(item.id, { amount: next }, slot)
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </span>
      )
    }

    const isProjectRoot = isGanttProjectRootId(item.id)
    return (
      <span
        key={field}
        className={`tm-pm-gantt-col tm-pm-gantt-col--${columnClassSuffix(field)}`}
        onDoubleClick={(event) => {
          if (isProjectRoot) return
          event.stopPropagation()
          startEdit({ kind: 'cell', itemId: item.id, field }, value)
        }}>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          value || '—'
        )}
      </span>
    )
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (listView || !onWheelScroll) return
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
    event.preventDefault()
    onWheelScroll(event.deltaY)
  }

  const scrollToThumbOffset = (nextOffset: number) => {
    const el = hScrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffset))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
  }

  const onHTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = hTrackRef.current
    const el = hScrollRef.current
    if (!track || !el) return
    event.preventDefault()
    setHScrollDragging(true)
    const trackRect = track.getBoundingClientRect()
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
    scrollToThumbOffset(pointerRatio - thumbSize / 2)

    const onMove = (moveEvent: PointerEvent) => {
      const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(ratio - thumbSize / 2)
    }
    const onUp = () => {
      setHScrollDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={[
        'tm-pm-gantt-grid-pane',
        hScrollMetrics.overflowing ? 'tm-pm-gantt-grid-pane--h-overflow' : '',
        hScrollDragging ? 'tm-pm-gantt-grid-pane--h-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}>
      {/*
        Full-list: headers pinned above V scroll; H position synced via transform.
        Native H stays hidden (custom track only).
      */}
      {listView ? (
        <div className="tm-pm-gantt-grid-header-pin">
          <div ref={headerPinInnerRef} className="tm-pm-gantt-grid-header-pin-inner">
            <div
              className={[
                'tm-pm-gantt-grid-header',
                resourceViewMode || (costViewMode && !costInputMode)
                  ? 'tm-pm-gantt-grid-header--resource'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ height: headerHeight, gridTemplateColumns: gridTemplate }}>
              {resourceViewMode
                ? renderResourceViewHeader()
                : costViewMode
                  ? renderCostViewHeader()
                  : prefs.columnOrder.map((columnId) => renderHeaderCell(columnId))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="tm-pm-gantt-grid-vscroll">
        <div
          ref={hScrollRef}
          className="tm-pm-gantt-grid-hscroll"
          onScroll={() => syncHScrollMetrics()}>
          <div className="tm-pm-gantt-grid-inner">
            {listView ? null : (
            <div
            className={[
              'tm-pm-gantt-grid-header',
              resourceViewMode || (costViewMode && !costInputMode)
                ? 'tm-pm-gantt-grid-header--resource'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ height: headerHeight, gridTemplateColumns: gridTemplate }}>
              {resourceViewMode
                ? renderResourceViewHeader()
                : costViewMode
                  ? renderCostViewHeader()
                  : prefs.columnOrder.map((columnId) => renderHeaderCell(columnId))}
            </div>
            )}
            <div
              ref={gridScrollRef}
              className="tm-pm-gantt-grid-body"
              onScroll={onScroll}
              onWheel={handleWheel}>
              {rows.map((row) => {
                const active = row.item.id === selectedId
                const checked = checkedIds.has(row.item.id)
                const isProjectRoot = isGanttProjectRootId(row.item.id)
                return (
                  <div
                    key={row.item.id}
                    role="row"
                    tabIndex={0}
                    className={[
                      'tm-pm-gantt-grid-row',
                      active ? 'tm-pm-gantt-grid-row--active' : '',
                      checked ? 'tm-pm-gantt-grid-row--checked' : '',
                      isProjectRoot ? 'tm-pm-gantt-grid-row--project-root' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ height: GANTT_ROW_HEIGHT, gridTemplateColumns: gridTemplate }}
                    onClick={() => onSelect(row.item.id)}
                    onContextMenu={(event) => {
                      if (isProjectRoot) {
                        event.preventDefault()
                        onSelect(row.item.id)
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                      onSelect(row.item.id)
                      setContextMenu(null)

                      if (resourceViewMode) {
                        const menuWidth = 480
                        const chromeHeight = 120
                        const estimatedHeight =
                          chromeHeight +
                          RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS * RESOURCE_ASSIGN_POPUP_ROW_PX
                        const margin = 8
                        const left = Math.min(
                          event.clientX,
                          Math.max(margin, window.innerWidth - menuWidth - margin),
                        )
                        const spaceBelow = window.innerHeight - event.clientY - margin
                        const spaceAbove = event.clientY - margin
                        const openAbove =
                          estimatedHeight > spaceBelow && spaceAbove > spaceBelow
                        const top = openAbove
                          ? Math.max(margin, event.clientY - estimatedHeight)
                          : Math.min(
                              event.clientY,
                              Math.max(margin, window.innerHeight - estimatedHeight - margin),
                            )
                        const existingCount = readTaskResourceAssignments(row.item.metadata).filter(
                          (entry) => !isEmptyAssignment(entry),
                        ).length
                        setRowContextMenu(null)
                        setResourceAssignDraftTypes({})
                        setResourceAssignSelectedSlot(null)
                        setResourceAssignPopup({
                          top,
                          left,
                          anchorY: event.clientY,
                          itemId: row.item.id,
                          rowCount: Math.max(RESOURCE_ASSIGN_POPUP_VISIBLE_ROWS, existingCount),
                        })
                        return
                      }

                      setSelectionMode(true)
                      if (!checkedIds.has(row.item.id)) {
                        onToggleChecked(row.item.id)
                      }
                      const menuWidth = 160
                      const left = Math.min(
                        event.clientX,
                        Math.max(8, window.innerWidth - menuWidth - 8),
                      )
                      const top = Math.min(
                        event.clientY,
                        Math.max(8, window.innerHeight - 140),
                      )
                      setResourceAssignPopup(null)
                      setRowContextMenu({ top, left, itemId: row.item.id })
                    }}>
                  {prefs.columnOrder.map((columnId) => renderBodyCell(row, columnId))}
                </div>
              )
            })}
            </div>
          </div>
        </div>
      </div>

      {hScrollMetrics.overflowing ? (
        <div
          ref={hTrackRef}
          className="tm-pm-gantt-grid-custom-hscroll"
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hScrollMetrics.thumbOffset * 100)}
          onPointerDown={onHTrackPointerDown}>
          <div
            className="tm-pm-gantt-grid-custom-hscroll-thumb"
            style={{
              width: `${hScrollMetrics.thumbSize * 100}%`,
              left: `${hScrollMetrics.thumbOffset * 100}%`,
            }}
          />
        </div>
      ) : null}

      {contextMenu
        ? createPortal(
            <div
              className="tm-pm-gantt-col-menu"
              style={{ right: contextMenu.right, top: contextMenu.top }}
              onMouseDown={(event) => event.stopPropagation()}>
              {resourceViewMode ? (
                <>
                  <div className="tm-pm-gantt-col-menu-title">
                    {t('projectManagerPage.schedule.columnVisibility')}
                  </div>
                  {(
                    [
                      ['duration', 'showDuration'],
                      ['start', 'showStart'],
                      ['finish', 'showFinish'],
                    ] as const
                  ).map(([key, prefKey]) => (
                    <label key={key} className="tm-pm-gantt-col-menu-item">
                      <input
                        type="checkbox"
                        checked={prefs.resourceView[prefKey]}
                        onChange={() => {
                          patchPrefs({
                            resourceView: {
                              ...prefs.resourceView,
                              [prefKey]: !prefs.resourceView[prefKey],
                            },
                          })
                        }}
                      />
                      <span>{menuLabelOf(key)}</span>
                    </label>
                  ))}
                  <label className="tm-pm-gantt-col-menu-item">
                    <input
                      type="checkbox"
                      checked={prefs.resourceView.inputMode}
                      onChange={() => {
                        patchPrefs({
                          resourceView: {
                            ...prefs.resourceView,
                            inputMode: !prefs.resourceView.inputMode,
                          },
                        })
                      }}
                    />
                    <span>{t('projectManagerPage.schedule.resourceInputMode')}</span>
                  </label>
                  <button
                    type="button"
                    className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                    onClick={() => {
                      const nextCount = prefs.resourceView.slotCount + 1
                      const nextBindings = buildDefaultResourceColumnBindings(nextCount).map(
                        (binding, index) => columnBindings[index] ?? binding,
                      )
                      patchPrefs({
                        resourceView: {
                          ...prefs.resourceView,
                          slotCount: nextCount,
                          columnBindings: nextBindings,
                        },
                      })
                      setContextMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.addResourceColumns')}
                  </button>
                  <button
                    type="button"
                    className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                    disabled={prefs.resourceView.slotCount <= 1}
                    onClick={() => {
                      if (prefs.resourceView.slotCount <= 1) return
                      const nextCount = Math.max(1, prefs.resourceView.slotCount - 1)
                      patchPrefs({
                        resourceView: {
                          ...prefs.resourceView,
                          slotCount: nextCount,
                          columnBindings: columnBindings.slice(0, nextCount),
                        },
                      })
                      setContextMenu(null)
                    }}
                  >
                    {t('projectManagerPage.schedule.removeResourceColumns')}
                  </button>
                </>
              ) : costViewMode ? (
                <>
                  <div className="tm-pm-gantt-col-menu-title">
                    {t('projectManagerPage.schedule.columnVisibility')}
                  </div>
                  {(
                    [
                      ['duration', 'showDuration'],
                      ['start', 'showStart'],
                      ['finish', 'showFinish'],
                    ] as const
                  ).map(([key, prefKey]) => (
                    <label key={key} className="tm-pm-gantt-col-menu-item">
                      <input
                        type="checkbox"
                        checked={prefs.costView[prefKey]}
                        onChange={() => {
                          patchPrefs({
                            costView: {
                              ...prefs.costView,
                              [prefKey]: !prefs.costView[prefKey],
                            },
                          })
                        }}
                      />
                      <span>{menuLabelOf(key)}</span>
                    </label>
                  ))}
                  <label className="tm-pm-gantt-col-menu-item">
                    <input
                      type="checkbox"
                      checked={prefs.costView.inputMode}
                      onChange={() => {
                        patchPrefs({
                          costView: {
                            ...prefs.costView,
                            inputMode: !prefs.costView.inputMode,
                          },
                        })
                      }}
                    />
                    <span>{t('projectManagerPage.schedule.costInputMode')}</span>
                  </label>
                  {!prefs.costView.inputMode ? (
                    <>
                      <button
                        type="button"
                        className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                        disabled={prefs.costView.slotCount >= GANTT_COST_VIEW_MAX_SLOTS}
                        onClick={() => {
                          if (prefs.costView.slotCount >= GANTT_COST_VIEW_MAX_SLOTS) return
                          patchPrefs({
                            costView: {
                              ...prefs.costView,
                              slotCount: prefs.costView.slotCount + 1,
                            },
                          })
                          setContextMenu(null)
                        }}
                      >
                        {t('projectManagerPage.schedule.addCostColumns')}
                      </button>
                      {prefs.costView.slotCount > 1 ? (
                        <button
                          type="button"
                          className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                          onClick={() => {
                            patchPrefs({
                              costView: {
                                ...prefs.costView,
                                slotCount: Math.max(1, prefs.costView.slotCount - 1),
                              },
                            })
                            setContextMenu(null)
                          }}
                        >
                          {t('projectManagerPage.schedule.removeCostColumns')}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="tm-pm-gantt-col-menu-title">
                    {t('projectManagerPage.schedule.columnVisibility')}
                  </div>
                  {GANTT_BUILTIN_COLUMNS.map((key) => {
                    const checked = prefs.columnOrder.includes(key)
                    const locked = key === 'name'
                    return (
                      <label key={key} className="tm-pm-gantt-col-menu-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleColumnVisible(key)}
                        />
                        <span>{menuLabelOf(key)}</span>
                      </label>
                    )
                  })}
                  {prefs.customColumns.map((col) => {
                    const checked = prefs.columnOrder.includes(col.id)
                    return (
                      <label key={col.id} className="tm-pm-gantt-col-menu-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumnVisible(col.id)}
                        />
                        <span>{menuLabelOf(col.id)}</span>
                      </label>
                    )
                  })}
                  <button
                    type="button"
                    className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                    onClick={addCustomColumn}>
                    {t('projectManagerPage.schedule.addCustomColumn')}
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}

      {rowContextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.schedule.selection.cancel')}
                onClick={() => setRowContextMenu(null)}
              />
              <div
                className="tm-group-context-menu"
                style={{ left: rowContextMenu.left, top: rowContextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onSelectAllRows()
                    setSelectionMode(true)
                    setRowContextMenu(null)
                  }}>
                  {t('projectManagerPage.schedule.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    checkedIds.size === 0 ? 'tm-group-context-menu-item--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={checkedIds.size === 0}
                  onClick={() => {
                    if (checkedIds.size === 0) return
                    setRowContextMenu(null)
                    onDeleteSelectedRows()
                  }}>
                  {t('projectManagerPage.schedule.selection.deleteSelected')}
                  {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onClearRowSelection()
                    setSelectionMode(false)
                    setRowContextMenu(null)
                  }}>
                  {t('projectManagerPage.schedule.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}

      {resourceAssignPopup
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.schedule.selection.cancel')}
                onClick={() => {
                  setResourceAssignPopup(null)
                  setResourceAssignSelectedSlot(null)
                  setResourceAssignDraftTypes({})
                }}
              />
              <div
                ref={resourceAssignPopupRef}
                className="tm-pm-gantt-resource-assign-popup"
                style={{ left: resourceAssignPopup.left, top: resourceAssignPopup.top }}
                role="dialog"
                aria-label={t('projectManagerPage.schedule.resourceAssign.popupTitle')}
                onMouseDown={(event) => event.stopPropagation()}>
                {(() => {
                  const popupRow = rows.find(
                    (entry) => entry.item.id === resourceAssignPopup.itemId,
                  )
                  const popupItem = popupRow?.item
                  const catalog =
                    columnCatalog.length > 0 ? columnCatalog : resourceCatalog
                  const canEdit = Boolean(
                    popupItem && (onAssignResource || onReplaceResourceAssignments),
                  )
                  const slotAssignments = popupItem
                    ? readTaskResourceAssignments(popupItem.metadata)
                    : []
                  const slots = Array.from(
                    { length: resourceAssignPopup.rowCount },
                    (_, slot) => slot,
                  )
                  const selectedSlot = resourceAssignSelectedSlot
                  const canMoveSelected =
                    canEdit &&
                    selectedSlot != null &&
                    selectedSlot >= 0 &&
                    selectedSlot < slotAssignments.length
                  const moveSelected = (direction: -1 | 1) => {
                    if (!popupItem || selectedSlot == null) return
                    const target = selectedSlot + direction
                    if (target < 0 || target >= slotAssignments.length) return
                    const next = moveTaskResourceAssignment(
                      slotAssignments,
                      selectedSlot,
                      target,
                    )
                    void onReplaceResourceAssignments?.(popupItem.id, next)
                    setResourceAssignSelectedSlot(target)
                  }
                  return (
                    <>
                      <header className="tm-pm-gantt-resource-assign-popup-header">
                        <div className="tm-pm-gantt-resource-assign-popup-title">
                          {t('projectManagerPage.schedule.resourceAssign.popupTitle')}
                        </div>
                        {popupItem?.title ? (
                          <div
                            className="tm-pm-gantt-resource-assign-popup-subtitle"
                            title={popupItem.title}
                          >
                            {popupItem.title}
                          </div>
                        ) : null}
                      </header>
                      <div className="tm-pm-gantt-resource-assign-popup-scroll">
                        <table className="tm-pm-gantt-resource-assign-popup-table">
                          <thead>
                            <tr>
                              <th className="tm-pm-gantt-resource-assign-popup-col--index">
                                {t('projectManagerPage.schedule.columns.index')}
                              </th>
                              <th>{t('projectManagerPage.schedule.columns.resourceType')}</th>
                              <th>{t('projectManagerPage.schedule.columns.resourceName')}</th>
                              <th>{t('projectManagerPage.schedule.columns.resourceQty')}</th>
                              <th>{t('projectManagerPage.schedule.columns.resourceNote')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slots.map((slot) => {
                              const assignment = resolveAssignmentAgainstCatalog(
                                slotAssignments[slot] ?? EMPTY_TASK_RESOURCE_ASSIGNMENT,
                                catalog,
                              )
                              const selectedId = assignment.resourceId ?? ''
                              const type: PmResourceType =
                                (assignment.type && isPmResourceType(assignment.type)
                                  ? assignment.type
                                  : null) ??
                                resourceAssignDraftTypes[slot] ??
                                'labor'
                              const nameOptions = catalogRowsForType(catalog, type)
                              const selectedInOptions = nameOptions.some(
                                (entry) => entry.id === selectedId,
                              )
                              const qtyDisabled = !canEdit || !selectedId
                              const rowSelected = selectedSlot === slot
                              const rowHasAssignment = !isEmptyAssignment(assignment)
                              return (
                                <tr
                                  key={`${resourceAssignPopup.itemId}:${slot}`}
                                  className={
                                    rowSelected
                                      ? 'tm-pm-gantt-resource-assign-popup-row--selected'
                                      : undefined
                                  }
                                  onClick={() => {
                                    if (!rowHasAssignment) {
                                      setResourceAssignSelectedSlot(null)
                                      return
                                    }
                                    setResourceAssignSelectedSlot(slot)
                                  }}
                                >
                                  <td className="tm-pm-gantt-resource-assign-popup-col--index">
                                    {slot + 1}
                                  </td>
                                  <td>
                                    <select
                                      className="tm-pm-gantt-resource-assign-popup-select"
                                      value={type}
                                      disabled={!canEdit}
                                      aria-label={t(
                                        'projectManagerPage.schedule.columns.resourceType',
                                      )}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) => {
                                        if (!popupItem || !canEdit) return
                                        const nextType = event.target.value as PmResourceType
                                        if (!isPmResourceType(nextType)) return
                                        if (selectedId) {
                                          writeOrderedResourceSlot(
                                            popupItem.id,
                                            slotAssignments,
                                            slot,
                                            {
                                              type: nextType,
                                              resourceId: null,
                                              name: '',
                                              quantity: null,
                                            },
                                          )
                                          setResourceAssignDraftTypes((current) => ({
                                            ...current,
                                            [slot]: nextType,
                                          }))
                                          return
                                        }
                                        setResourceAssignDraftTypes((current) => ({
                                          ...current,
                                          [slot]: nextType,
                                        }))
                                      }}
                                    >
                                      {PM_RESOURCE_TYPES.map((entry) => (
                                        <option key={entry} value={entry}>
                                          {t(`projectManagerPage.resourceTable.types.${entry}`)}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <select
                                      className="tm-pm-gantt-resource-assign-popup-select"
                                      value={selectedId}
                                      disabled={!canEdit}
                                      aria-label={t(
                                        'projectManagerPage.schedule.columns.resourceName',
                                      )}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) => {
                                        if (!popupItem || !canEdit) return
                                        const nextId = event.target.value
                                        if (!nextId) {
                                          writeOrderedResourceSlot(
                                            popupItem.id,
                                            slotAssignments,
                                            slot,
                                            {
                                              type,
                                              resourceId: null,
                                              name: '',
                                              quantity: null,
                                            },
                                          )
                                          return
                                        }
                                        const row = nameOptions.find((entry) => entry.id === nextId)
                                        if (!row) return
                                        writeOrderedResourceSlot(
                                          popupItem.id,
                                          slotAssignments,
                                          slot,
                                          {
                                            resourceId: row.id,
                                            type: row.type,
                                            name: row.name,
                                            quantity: assignment.quantity,
                                          },
                                        )
                                        setResourceAssignDraftTypes((current) => {
                                          const next = { ...current }
                                          delete next[slot]
                                          return next
                                        })
                                      }}
                                    >
                                      <option value="">
                                        {t('projectManagerPage.schedule.resourceAssign.selectName')}
                                      </option>
                                      {selectedId && !selectedInOptions ? (
                                        <option value={selectedId}>
                                          {assignment.name.trim() || selectedId}
                                        </option>
                                      ) : null}
                                      {nameOptions.map((row) => (
                                        <option key={row.id} value={row.id}>
                                          {row.name}
                                          {row.unit ? ` (${row.unit})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <input
                                      key={`${resourceAssignPopup.itemId}:${slot}:qty:${selectedId}:${assignment.quantity ?? ''}`}
                                      className="tm-pm-gantt-resource-assign-popup-qty"
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={assignment.quantity ?? ''}
                                      placeholder=""
                                      disabled={qtyDisabled}
                                      aria-label={t(
                                        'projectManagerPage.schedule.columns.resourceQty',
                                      )}
                                      onClick={(event) => event.stopPropagation()}
                                      onKeyDown={(event) => {
                                        if (event.key !== 'Enter' || !popupItem || !canEdit) {
                                          return
                                        }
                                        event.preventDefault()
                                        const raw = event.currentTarget.value.trim()
                                        const next = raw === '' ? null : Number(raw)
                                        if (next != null && !Number.isFinite(next)) return
                                        if (next === assignment.quantity) {
                                          event.currentTarget.blur()
                                          return
                                        }
                                        writeOrderedResourceSlot(
                                          popupItem.id,
                                          slotAssignments,
                                          slot,
                                          { quantity: next },
                                        )
                                        event.currentTarget.blur()
                                      }}
                                      onBlur={(event) => {
                                        if (!popupItem || !canEdit || !selectedId) return
                                        const raw = event.currentTarget.value.trim()
                                        const next = raw === '' ? null : Number(raw)
                                        if (next != null && !Number.isFinite(next)) return
                                        if (next === assignment.quantity) return
                                        writeOrderedResourceSlot(
                                          popupItem.id,
                                          slotAssignments,
                                          slot,
                                          { quantity: next },
                                        )
                                      }}
                                    />
                                  </td>
                                  <td>
                                    {canEdit && popupItem ? (
                                      <input
                                        className="tm-pm-gantt-resource-assign-popup-note"
                                        defaultValue={assignment.note}
                                        placeholder={t(
                                          'projectManagerPage.schedule.resourceAssign.notePlaceholder',
                                        )}
                                        aria-label={t(
                                          'projectManagerPage.schedule.columns.resourceNote',
                                        )}
                                        disabled={!selectedId}
                                        onBlur={(event) => {
                                          const nextNote = event.target.value
                                          if (nextNote === assignment.note) return
                                          writeOrderedResourceSlot(
                                            popupItem.id,
                                            slotAssignments,
                                            slot,
                                            { note: nextNote },
                                          )
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    ) : (
                                      assignment.note.trim() || '—'
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {canEdit ? (
                        <div className="tm-pm-gantt-resource-assign-popup-footer">
                          <div className="tm-pm-gantt-resource-assign-popup-move">
                            <button
                              type="button"
                              className="tm-pm-gantt-resource-assign-popup-move-btn"
                              aria-label={t(
                                'projectManagerPage.schedule.resourceAssign.moveUp',
                              )}
                              title={t('projectManagerPage.schedule.resourceAssign.moveUp')}
                              disabled={
                                !canMoveSelected ||
                                selectedSlot == null ||
                                selectedSlot <= 0
                              }
                              onClick={() => moveSelected(-1)}
                            >
                              <IconChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              className="tm-pm-gantt-resource-assign-popup-move-btn"
                              aria-label={t(
                                'projectManagerPage.schedule.resourceAssign.moveDown',
                              )}
                              title={t('projectManagerPage.schedule.resourceAssign.moveDown')}
                              disabled={
                                !canMoveSelected ||
                                selectedSlot == null ||
                                selectedSlot >= slotAssignments.length - 1
                              }
                              onClick={() => moveSelected(1)}
                            >
                              <IconChevronDown size={16} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="tm-pm-gantt-resource-assign-popup-add"
                            onClick={() => {
                              setResourceAssignPopup((current) =>
                                current
                                  ? {
                                      ...current,
                                      rowCount: current.rowCount + 1,
                                    }
                                  : current,
                              )
                            }}
                          >
                            <span aria-hidden>+</span>
                            {t('projectManagerPage.schedule.resourceAssign.addRow')}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )
                })()}
              </div>
            </>,
            document.body,
          )
        : null}

      {resourceCellPicker
        ? createPortal(
            <div
              ref={resourceCellPickerMenuRef}
              className="tm-pm-gantt-resource-select-menu"
              style={{
                top: resourceCellPicker.anchorBottom + 2,
                left: resourceCellPicker.left,
                minWidth: resourceCellPicker.minWidth,
              }}
              role="listbox"
              aria-label={t('projectManagerPage.schedule.columns.resourceName')}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {(() => {
                const menuCatalog =
                  columnCatalog.length > 0 ? columnCatalog : resourceCatalog
                const menuType = resourceCellPicker.type
                const menuOptions = catalogRowsForType(menuCatalog, menuType)
                const menuItem = rows.find(
                  (entry) => entry.item.id === resourceCellPicker.itemId,
                )?.item
                // Same fixed slot indexes as the cells (no auto-reorder).
                const menuSlots = menuItem
                  ? readTaskResourceAssignments(menuItem.metadata)
                  : []
                const menuAssignment = resolveAssignmentAgainstCatalog(
                  menuSlots[resourceCellPicker.slot] ?? EMPTY_TASK_RESOURCE_ASSIGNMENT,
                  menuCatalog,
                )
                const selectedResourceId = menuAssignment.resourceId ?? ''
                const selectedName = menuAssignment.name.trim()
                const isNameChecked = (row: PmResourceRow) =>
                  row.id === selectedResourceId ||
                  (selectedName !== '' && row.name.trim() === selectedName)
                return (
                  <>
                    <div className="tm-pm-gantt-resource-select-menu-label">
                      {t('projectManagerPage.schedule.columns.resourceType')}
                    </div>
                    {SWITCHABLE_RESOURCE_COLUMN_TYPES.map((entry) => {
                      const label = t(`projectManagerPage.resourceTable.types.${entry}`)
                      const checked = entry === menuType
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="option"
                          aria-selected={checked}
                          className={[
                            'tm-pm-gantt-resource-select-menu-item',
                            checked ? 'tm-pm-gantt-resource-select-menu-item--checked' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={label}
                          onClick={() => {
                            if (checked) return
                            setResourceCellPicker((current) =>
                              current ? { ...current, type: entry } : current,
                            )
                          }}
                        >
                          <span className="tm-pm-gantt-resource-select-menu-check" aria-hidden>
                            {checked ? <IconCheck size={14} /> : null}
                          </span>
                          <span className="tm-pm-gantt-resource-select-menu-text">{label}</span>
                        </button>
                      )
                    })}
                    <div className="tm-pm-gantt-resource-select-menu-sep" role="separator" />
                    <div className="tm-pm-gantt-resource-select-menu-label">
                      {t('projectManagerPage.schedule.columns.resourceName')}
                    </div>
                    {menuOptions.length === 0 ? (
                      <div className="tm-pm-gantt-resource-select-menu-empty">—</div>
                    ) : (
                      menuOptions.map((row) => {
                        const checked = isNameChecked(row)
                        return (
                          <button
                            key={row.id}
                            type="button"
                            role="option"
                            aria-selected={checked}
                            className={[
                              'tm-pm-gantt-resource-select-menu-item',
                              checked
                                ? 'tm-pm-gantt-resource-select-menu-item--checked'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              if (!onAssignResource && !onReplaceResourceAssignments) return
                              writeOrderedResourceSlot(
                                resourceCellPicker.itemId,
                                menuSlots,
                                resourceCellPicker.slot,
                                {
                                  resourceId: row.id,
                                  type: row.type,
                                  name: row.name,
                                  quantity: menuAssignment.quantity ?? null,
                                },
                              )
                              setResourceCellPicker(null)
                            }}
                          >
                            <span
                              className="tm-pm-gantt-resource-select-menu-check"
                              aria-hidden
                            >
                              {checked ? <IconCheck size={14} /> : null}
                            </span>
                            <span className="tm-pm-gantt-resource-select-menu-text">
                              {row.name}
                              {row.unit ? ` (${row.unit})` : ''}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </>
                )
              })()}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
