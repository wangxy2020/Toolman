import type { MouseEvent as ReactMouseEvent } from 'react'
import { useRef, useState } from 'react'
import type { PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  EMPTY_TASK_COST_ASSIGNMENT,
  groupCostCatalogBySectionalWork,
  isEmptyCostAssignment,
  readCostAssignmentAtFilteredSlot,
  readTaskCostAssignments,
  resolveCostAssignSourceIndex,
  resolveCostAssignmentAgainstCatalog,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  resolveResourceAssignSourceIndex,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment'
import type { GanttUiPrefs } from './pm-gantt-prefs'
import type {
  CostAssignPopupState,
  CostNamePickerState,
  Props,
  ResourceAssignPopupState,
  ResourceCellPickerState,
} from './pm-gantt-task-grid-utils'
import { useProjectGanttTaskGridPopupLayout } from './useProjectGanttTaskGridPopupLayout'

export function useProjectGanttTaskGridAssignPopups(args: {
  rows: Props['rows']
  prefs: GanttUiPrefs
  costCatalog: Props['costCatalog']
  onAssignResource: Props['onAssignResource']
  onReplaceResourceAssignments: Props['onReplaceResourceAssignments']
  onAssignCost: Props['onAssignCost']
  onReplaceCostAssignments: Props['onReplaceCostAssignments']
}) {
  const {
    rows,
    prefs,
    costCatalog = [],
    onAssignResource,
    onReplaceResourceAssignments,
    onAssignCost,
    onReplaceCostAssignments,
  } = args

  const [resourceAssignPopup, setResourceAssignPopup] = useState<ResourceAssignPopupState | null>(null)
  const [resourceAssignSelectedSlot, setResourceAssignSelectedSlot] = useState<number | null>(null)
  const resourceAssignPopupRef = useRef<HTMLDivElement | null>(null)
  const [costAssignPopup, setCostAssignPopup] = useState<CostAssignPopupState | null>(null)
  const [costAssignSelectedSlot, setCostAssignSelectedSlot] = useState<number | null>(null)
  const costAssignPopupRef = useRef<HTMLDivElement | null>(null)
  const [costAssignDraftTypes, setCostAssignDraftTypes] = useState<Record<number, PmCostType>>({})
  const [resourceCellPicker, setResourceCellPicker] = useState<ResourceCellPickerState | null>(null)
  const resourceCellPickerMenuRef = useRef<HTMLDivElement | null>(null)
  const [costNamePicker, setCostNamePicker] = useState<CostNamePickerState | null>(null)
  const costNamePickerMenuRef = useRef<HTMLDivElement | null>(null)
  const [resourceAssignDraftTypes, setResourceAssignDraftTypes] = useState<
    Record<number, PmResourceType>
  >({})

  useProjectGanttTaskGridPopupLayout({
    resourceCellPicker,
    resourceCellPickerMenuRef,
    costNamePicker,
    costNamePickerMenuRef,
    resourceAssignPopup,
    resourceAssignPopupRef,
    costAssignPopup,
    costAssignPopupRef,
  })

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

  return {
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
    writeOrderedResourceSlot,
    writeOrderedCostSlot,
    openCostNamePicker,
  }
}
