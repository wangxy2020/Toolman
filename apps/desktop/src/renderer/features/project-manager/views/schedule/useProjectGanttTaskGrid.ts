import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import type { PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  isPmResourceType,
  PM_RESOURCE_TYPES,
  resourceCustomTypeName,
} from '../resource/pm-resource-catalog'
import {
  EMPTY_TASK_COST_ASSIGNMENT,
  formatCostAssignmentsInput,
  groupCostCatalogBySectionalWork,
  isEmptyCostAssignment,
  parseCostColumnId,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignSourceIndex,
  resolveCostAssignmentAgainstCatalog,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  formatResourceAssignmentsInput,
  isEmptyAssignment,
  parseResourceColumnId,
  readResourceAssignmentAtFilteredSlot,
  readTaskResourceAssignments,
  resolveResourceAssignSourceIndex,
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
  insertColumnInCanonicalOrder,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  resolveColumnLabel,
  type GanttResourceColumnBinding,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  formatWorkItemDate,
  formatScheduleVarianceDays,
  computeScheduleVarianceDays,
  shouldCompletePercent,
  workItemDurationDays,
} from './pm-gantt-utils'
import { formatPredecessorsForItem } from './pm-predecessor-utils'
import {
  EMPTY_H_SCROLL,
  type ContextMenuState,
  type CostAssignPopupState,
  type CostNamePickerState,
  type EditTarget,
  type GanttEditableField,
  type HScrollMetrics,
  type Props,
  type ResourceAssignPopupState,
  type ResourceCellPickerState,
  type RowContextMenuState,
} from './pm-gantt-task-grid-utils'

export function useProjectGanttTaskGrid({
  rows,
  relations,
  indexById,
  prefs,
  builtinLabels,
  listView = false,
  resourceViewMode = false,
  costViewMode = false,
  printLayout = false,
  onWheelScroll,
  onPrefsChange,
  onCommitCell,
  resourceCatalog = [],
  resourceColumnCatalog,
  costCatalog = [],
  progressPercentById,
  onAssignResource,
  onReplaceResourceAssignments,
  onAssignCost,
  onReplaceCostAssignments,
  selectionResetKey = null,
  shouldPercentAsOfMs = null,
  baselinePlanByItemId,
}: Props) {
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
  const [costAssignPopup, setCostAssignPopup] = useState<CostAssignPopupState | null>(null)
  const [costAssignSelectedSlot, setCostAssignSelectedSlot] = useState<number | null>(null)
  const costAssignPopupRef = useRef<HTMLDivElement | null>(null)
  const [costAssignDraftTypes, setCostAssignDraftTypes] = useState<Record<number, PmCostType>>(
    {},
  )
  const [resourceCellPicker, setResourceCellPicker] = useState<ResourceCellPickerState | null>(
    null,
  )
  const resourceCellPickerMenuRef = useRef<HTMLDivElement | null>(null)
  const [costNamePicker, setCostNamePicker] = useState<CostNamePickerState | null>(null)
  const costNamePickerMenuRef = useRef<HTMLDivElement | null>(null)
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
    setCostAssignPopup(null)
    setCostAssignSelectedSlot(null)
    setCostAssignDraftTypes({})
    setCostNamePicker(null)
  }, [selectionResetKey])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (
      !contextMenu &&
      !rowContextMenu &&
      !resourceAssignPopup &&
      !costAssignPopup &&
      !resourceCellPicker &&
      !costNamePicker
    ) {
      return
    }
    const onDoc = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        setContextMenu(null)
        setRowContextMenu(null)
        setResourceAssignPopup(null)
        setResourceCellPicker(null)
        setResourceAssignDraftTypes({})
        setCostAssignPopup(null)
        setCostAssignSelectedSlot(null)
        setCostAssignDraftTypes({})
        setCostNamePicker(null)
        return
      }
      // Cascade / list menus are portaled; keep them interactive.
      if (target.closest('.tm-pm-gantt-resource-select-menu')) return
      // Cost name cascade: close when clicking outside its trigger (incl. elsewhere in popup).
      if (!target.closest('.tm-pm-gantt-cost-name-trigger')) {
        setCostNamePicker(null)
      }
      if (
        target.closest(
          [
            '.tm-pm-gantt-resource-cell-trigger',
            '.tm-pm-gantt-cost-name-trigger',
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
      setCostAssignPopup(null)
      setCostAssignSelectedSlot(null)
      setCostAssignDraftTypes({})
      setCostNamePicker(null)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setContextMenu(null)
      setRowContextMenu(null)
      setResourceAssignPopup(null)
      setResourceCellPicker(null)
      setResourceAssignDraftTypes({})
      setCostAssignPopup(null)
      setCostAssignSelectedSlot(null)
      setCostAssignDraftTypes({})
      setCostNamePicker(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [
    contextMenu,
    rowContextMenu,
    resourceAssignPopup,
    costAssignPopup,
    resourceCellPicker,
    costNamePicker,
  ])

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
    const menu = costNamePickerMenuRef.current
    if (!costNamePicker || !menu) return

    const margin = 8
    const gap = 2
    const spaceBelow = window.innerHeight - costNamePicker.anchorBottom - margin
    const spaceAbove = costNamePicker.anchorTop - margin

    // L1 scrolls within the available viewport side (same idea as resource picker).
    menu.style.overflowX = 'hidden'
    menu.style.overflowY = 'auto'
    menu.style.maxHeight = `${Math.min(320, Math.max(120, spaceBelow, spaceAbove))}px`
    let height = menu.offsetHeight
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow
    const sideBudget = openAbove ? spaceAbove : spaceBelow
    menu.style.maxHeight = `${Math.min(320, Math.max(120, sideBudget))}px`
    height = menu.offsetHeight

    const width = Math.max(menu.offsetWidth, costNamePicker.minWidth)
    let top = openAbove
      ? costNamePicker.anchorTop - height - gap
      : costNamePicker.anchorBottom + gap
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = costNamePicker.left
    const flyoutPad = 188
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - width - flyoutPad - margin),
    )

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`

    // L2: fixed to the viewport so bottom-of-screen cells keep the flyout fully visible.
    const submenu = menu.querySelector(
      '.tm-pm-gantt-resource-select-submenu',
    ) as HTMLElement | null
    const sectionBtn = menu.querySelector(
      '.tm-pm-gantt-resource-select-menu-item--group[aria-expanded="true"]',
    ) as HTMLElement | null
    if (!submenu || !sectionBtn) return

    const anchor = sectionBtn.getBoundingClientRect()
    submenu.style.position = 'fixed'
    submenu.style.right = 'auto'
    submenu.style.bottom = 'auto'
    submenu.style.maxHeight = `${Math.min(280, window.innerHeight - margin * 2)}px`

    const subWidth = Math.max(submenu.offsetWidth, 168)
    let subLeft = anchor.right - 4
    if (subLeft + subWidth > window.innerWidth - margin) {
      subLeft = Math.max(margin, anchor.left - subWidth + 4)
    }

    let subTop = anchor.top - 4
    const subHeight = Math.min(
      submenu.scrollHeight,
      Math.min(280, window.innerHeight - margin * 2),
    )
    if (subTop + subHeight > window.innerHeight - margin) {
      subTop = Math.max(margin, window.innerHeight - margin - subHeight)
    }
    subTop = Math.max(margin, subTop)

    submenu.style.top = `${subTop}px`
    submenu.style.left = `${subLeft}px`
  }, [costNamePicker])

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

  useLayoutEffect(() => {
    const popup = costAssignPopupRef.current
    if (!costAssignPopup || !popup) return

    const margin = 8
    const maxViewportHeight = Math.max(160, window.innerHeight - margin * 2)
    popup.style.maxHeight = `${maxViewportHeight}px`

    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const spaceBelow = window.innerHeight - costAssignPopup.anchorY - margin
    const spaceAbove = costAssignPopup.anchorY - margin
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow

    let top = openAbove ? costAssignPopup.anchorY - height : costAssignPopup.anchorY
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    let left = costAssignPopup.left
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    popup.style.top = `${top}px`
    popup.style.left = `${left}px`
  }, [costAssignPopup])

  const writeOrderedResourceSlot = (
    itemId: string,
    currentOrdered: TaskResourceAssignment[],
    displaySlot: number,
    patch: Partial<TaskResourceAssignment>,
  ) => {
    const typeFilter = prefs.resourceView.typeFilter ?? 'all'
    const filter = typeFilter === 'all' ? 'all' : typeFilter
    const slotIndex = resolveResourceAssignSourceIndex(currentOrdered, displaySlot, filter)
    const list = currentOrdered.map((entry) => ({ ...entry }))
    const base = list[slotIndex] ?? {
      ...EMPTY_TASK_RESOURCE_ASSIGNMENT,
      type: filter === 'all' ? null : filter,
    }
    const merged: TaskResourceAssignment = {
      resourceId: patch.resourceId !== undefined ? patch.resourceId : base.resourceId,
      type: patch.type !== undefined ? patch.type : base.type,
      name: patch.name !== undefined ? patch.name : base.name,
      quantity: patch.quantity !== undefined ? patch.quantity : base.quantity,
      note: patch.note !== undefined ? patch.note : base.note,
    }
    // Clearing must use slot patch so later columns/rows keep their indices.
    if (isEmptyAssignment(merged)) {
      if (onAssignResource) {
        void onAssignResource(itemId, { ...EMPTY_TASK_RESOURCE_ASSIGNMENT }, slotIndex)
        return
      }
      if (onReplaceResourceAssignments) {
        const next = list
          .map((entry, index) =>
            index === slotIndex ? { ...EMPTY_TASK_RESOURCE_ASSIGNMENT } : entry,
          )
          .filter((entry) => !isEmptyAssignment(entry))
        void onReplaceResourceAssignments(itemId, next)
      }
      return
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

  const writeOrderedCostSlot = (
    itemId: string,
    currentOrdered: TaskCostAssignment[],
    displaySlot: number,
    patch: Partial<TaskCostAssignment>,
  ) => {
    const typeFilter = prefs.costView.typeFilter ?? 'all'
    const filter = typeFilter === 'all' ? 'all' : typeFilter
    const slotIndex = resolveCostAssignSourceIndex(currentOrdered, displaySlot, filter)
    const list = currentOrdered.map((entry) => ({ ...entry }))
    const base = list[slotIndex] ?? {
      ...EMPTY_TASK_COST_ASSIGNMENT,
      type: filter === 'all' ? null : filter,
    }
    const merged: TaskCostAssignment = {
      costId: patch.costId !== undefined ? patch.costId : base.costId,
      type: patch.type !== undefined ? patch.type : base.type,
      name: patch.name !== undefined ? patch.name : base.name,
      percent: patch.percent !== undefined ? patch.percent : base.percent,
      amount: patch.amount !== undefined ? patch.amount : base.amount,
      note: patch.note !== undefined ? patch.note : base.note,
    }
    if (isEmptyCostAssignment(merged)) {
      if (onAssignCost) {
        void onAssignCost(itemId, { ...EMPTY_TASK_COST_ASSIGNMENT }, slotIndex)
        return
      }
      if (onReplaceCostAssignments) {
        const next = list
          .map((entry, index) =>
            index === slotIndex ? { ...EMPTY_TASK_COST_ASSIGNMENT } : entry,
          )
          .filter((entry) => !isEmptyCostAssignment(entry))
        void onReplaceCostAssignments(itemId, next)
      }
      return
    }
    if (slotIndex < list.length) list[slotIndex] = merged
    else {
      while (list.length < slotIndex) list.push({ ...EMPTY_TASK_COST_ASSIGNMENT })
      list.push(merged)
    }
    if (onReplaceCostAssignments) {
      void onReplaceCostAssignments(itemId, list)
      return
    }
    if (onAssignCost) void onAssignCost(itemId, patch, slotIndex)
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
    if (costCol?.field === 'qty') {
      return t('projectManagerPage.schedule.columns.costQty')
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
    const catalog = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
    for (const row of catalog) {
      if (row.type === 'custom' && resourceCustomTypeName(row) === trimmed) return 'custom'
    }
    return null
  }

  const resolveCostTypeLabel = (label: string): PmCostType | null => {
    const trimmed = label.trim()
    if (!trimmed) return null
    const fromResource = resolveResourceTypeLabel(trimmed)
    if (fromResource) return fromResource
    for (const type of PM_RESOURCE_TYPES) {
      if (t(`projectManagerPage.costTable.types.${type}`) === trimmed) return type
    }
    return null
  }

  const typeLabelOf = (type: PmResourceType) =>
    t(`projectManagerPage.resourceTable.types.${type}`)

  const resolveAssignmentCustomTypeName = (assignment: {
    resourceId: string | null
    name: string
    type: PmResourceType | null
  }) => {
    if (assignment.type !== 'custom') return ''
    const catalog = columnCatalog.length > 0 ? columnCatalog : resourceCatalog
    const row =
      (assignment.resourceId
        ? catalog.find((entry) => entry.id === assignment.resourceId)
        : undefined) ??
      catalog.find(
        (entry) =>
          entry.type === 'custom' && entry.name.trim() === assignment.name.trim(),
      )
    return row ? resourceCustomTypeName(row) : ''
  }

  const costTypeLabelOf = (type: PmCostType) =>
    t(`projectManagerPage.costTable.types.${type}`)

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
    setResourceCellPicker(null)
    setCostAssignPopup(null)
    setCostAssignSelectedSlot(null)
    setCostAssignDraftTypes({})
    setCostNamePicker(null)
  }

  const openCostNamePicker = (
    event: ReactMouseEvent<HTMLElement>,
    options: {
      itemId: string
      slot: number
      source: CostNamePickerState['source']
      typeFilter: PmCostType | null
    },
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const menuItem = rows.find((entry) => entry.item.id === options.itemId)?.item
    const costTypeFilter = prefs.costView.typeFilter ?? 'all'
    const costFilter = costTypeFilter === 'all' ? 'all' : costTypeFilter
    const current = menuItem
      ? resolveCostAssignmentAgainstCatalog(
          readCostAssignmentAtFilteredSlot(
            readTaskCostAssignments(menuItem.metadata),
            options.slot,
            costFilter,
          ),
          costCatalog,
        )
      : EMPTY_TASK_COST_ASSIGNMENT
    const sections = groupCostCatalogBySectionalWork(costCatalog, options.typeFilter)
    const selectedCostId = current.costId ?? ''
    const selectedName = current.name.trim()
    const openSectionKey =
      sections.find((section) =>
        section.rows.some((row) =>
          selectedCostId
            ? row.id === selectedCostId
            : selectedName !== '' && row.name.trim() === selectedName,
        ),
      )?.key ?? null
    setResourceCellPicker(null)
    setCostNamePicker({
      itemId: options.itemId,
      slot: options.slot,
      source: options.source,
      typeFilter: options.typeFilter,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      left: rect.left,
      minWidth: Math.max(rect.width, 180),
      openSectionKey,
    })
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
        return formatResourceAssignmentsInput(list, typeLabelOf, {
          resolveCustomTypeName: resolveAssignmentCustomTypeName,
        })
      }
      const slotList = readTaskResourceAssignments(item.metadata)
      const typeFilter = prefs.resourceView.typeFilter ?? 'all'
      const filter = typeFilter === 'all' ? 'all' : typeFilter
      const assignment = resolveAssignmentAgainstCatalog(
        readResourceAssignmentAtFilteredSlot(slotList, resourceCol.slot, filter),
        catalogForCell,
      )
      if (assignment.quantity == null) return ''
      return String(assignment.quantity)
    }
    const costCol = parseCostColumnId(field)
    if (costCol) {
      const typeFilter = prefs.costView.typeFilter ?? 'all'
      const filter = typeFilter === 'all' ? 'all' : typeFilter
      const assignment = resolveCostAssignmentAgainstCatalog(
        readCostAssignmentAtFilteredSlot(
          readTaskCostAssignments(item.metadata),
          costCol.slot,
          filter,
        ),
        costCatalog,
      )
      if (costCol.field === 'name') return assignment.name
      if (costCol.field === 'input') {
        return formatCostAssignmentsInput(
          readTaskCostAssignments(item.metadata).map((entry) =>
            resolveCostAssignmentAgainstCatalog(entry, costCatalog),
          ),
          costTypeLabelOf,
        )
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
      case 'shouldPercentComplete': {
        const plan = baselinePlanByItemId?.get(item.id)
        return `${shouldCompletePercent(
          item,
          plan?.startDate,
          plan?.dueDate,
          shouldPercentAsOfMs,
        )}%`
      }
      case 'percentComplete':
        return `${progressPercentById?.get(item.id) ?? item.progressPercent}%`
      case 'variance': {
        const plan = baselinePlanByItemId?.get(item.id)
        const rolledProgress = progressPercentById?.get(item.id)
        const result = computeScheduleVarianceDays(
          rolledProgress == null ? item : { ...item, progressPercent: rolledProgress },
          {
            planStartMs: plan?.startDate,
            planFinishMs: plan?.dueDate,
            shouldPercentAsOfMs,
          },
        )
        if (!result) return '—'
        return formatScheduleVarianceDays(
          result.days,
          t('projectManagerPage.schedule.dayUnit'),
        )
      }
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
      if (costCol.field === 'qty') return 'costQty'
      return 'costInput'
    }
    if (columnId === 'spacer' || isGanttBuiltinColumn(columnId)) {
      return columnId
    }
    return 'custom'
  }

  const openHeaderMenu = (event: ReactMouseEvent) => {
    if (isPmEditableEventTarget(event.target)) return
    event.preventDefault()
    openColumnMenu(event.clientX, event.clientY)
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

  return {
    t,
    editing,
    draft,
    setDraft,
    contextMenu,
    setContextMenu,
    rowContextMenu,
    setRowContextMenu,
    resourceAssignPopup,
    setResourceAssignPopup,
    resourceAssignSelectedSlot,
    setResourceAssignSelectedSlot,
    resourceAssignPopupRef,
    costAssignPopup,
    setCostAssignPopup,
    costAssignSelectedSlot,
    setCostAssignSelectedSlot,
    costAssignPopupRef,
    costAssignDraftTypes,
    setCostAssignDraftTypes,
    resourceCellPicker,
    setResourceCellPicker,
    resourceCellPickerMenuRef,
    costNamePicker,
    setCostNamePicker,
    costNamePickerMenuRef,
    resourceAssignDraftTypes,
    setResourceAssignDraftTypes,
    selectionMode,
    setSelectionMode,
    hScrollMetrics,
    hScrollDragging,
    inputRef,
    hScrollRef,
    hTrackRef,
    headerPinInnerRef,
    gridTemplate,
    syncHScrollMetrics,
    writeOrderedResourceSlot,
    writeOrderedCostSlot,
    labelOf,
    menuLabelOf,
    resourceInputMode,
    costInputMode,
    columnCatalog,
    columnBindings,
    resolveResourceTypeLabel,
    resolveCostTypeLabel,
    typeLabelOf,
    resolveAssignmentCustomTypeName,
    costTypeLabelOf,
    patchPrefs,
    openCostNamePicker,
    startEdit,
    commitEdit,
    handleKeyDown,
    toggleColumnVisible,
    addCustomColumn,
    cellValue,
    columnClassSuffix,
    openHeaderMenu,
    handleWheel,
    onHTrackPointerDown,
  }
}

/** Shared bag of state/handlers threaded into the presentational sub-components. */
export type GanttTaskGridState = ReturnType<typeof useProjectGanttTaskGrid>
