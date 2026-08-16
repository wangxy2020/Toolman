import type { MouseEvent as ReactMouseEvent } from 'react'
import { useMemo, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import { buildGridTemplateColumns } from './pm-gantt-prefs'
import {
  type ContextMenuState,
  type Props,
  type RowContextMenuState,
} from './pm-gantt-task-grid-utils'
import { useProjectGanttTaskGridAssignPopups } from './useProjectGanttTaskGridAssignPopups'
import { useProjectGanttTaskGridCellEdit } from './useProjectGanttTaskGridCellEdit'
import { useProjectGanttTaskGridChrome } from './useProjectGanttTaskGridChrome'
import { useProjectGanttTaskGridColumns } from './useProjectGanttTaskGridColumns'

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)

  const assign = useProjectGanttTaskGridAssignPopups({
    rows,
    prefs,
    costCatalog,
    onAssignResource,
    onReplaceResourceAssignments,
    onAssignCost,
    onReplaceCostAssignments,
  })

  const columns = useProjectGanttTaskGridColumns({
    prefs,
    builtinLabels,
    resourceCatalog,
    resourceColumnCatalog,
    resourceViewMode,
    costViewMode,
    t,
    onPrefsChange,
    setContextMenu,
    setRowContextMenu,
    setResourceAssignPopup: assign.setResourceAssignPopup,
    setResourceCellPicker: assign.setResourceCellPicker,
    setCostAssignPopup: assign.setCostAssignPopup,
    setCostAssignSelectedSlot: assign.setCostAssignSelectedSlot,
    setCostAssignDraftTypes: assign.setCostAssignDraftTypes,
    setCostNamePicker: assign.setCostNamePicker,
  })

  const cellEdit = useProjectGanttTaskGridCellEdit({
    prefs,
    relations,
    indexById,
    resourceViewMode,
    costViewMode,
    resourceCatalog,
    costCatalog,
    progressPercentById,
    baselinePlanByItemId,
    shouldPercentAsOfMs,
    onCommitCell,
    t,
    columnCatalog: columns.columnCatalog,
    typeLabelOf: columns.typeLabelOf,
    costTypeLabelOf: columns.costTypeLabelOf,
    resolveAssignmentCustomTypeName: columns.resolveAssignmentCustomTypeName,
    patchPrefs: columns.patchPrefs,
  })

  const gridTemplate = useMemo(
    () =>
      buildGridTemplateColumns(prefs.columnOrder, {
        fullWidthList: listView,
        printLayout,
      }),
    [prefs.columnOrder, listView, printLayout],
  )

  const chrome = useProjectGanttTaskGridChrome({
    gridTemplate,
    listView,
    rowsLength: rows.length,
    selectionResetKey,
    contextMenu,
    rowContextMenu,
    resourceAssignPopup: assign.resourceAssignPopup,
    costAssignPopup: assign.costAssignPopup,
    resourceCellPicker: assign.resourceCellPicker,
    costNamePicker: assign.costNamePicker,
    setContextMenu,
    setRowContextMenu,
    setSelectionMode,
    setResourceAssignPopup: assign.setResourceAssignPopup,
    setResourceCellPicker: assign.setResourceCellPicker,
    setResourceAssignDraftTypes: assign.setResourceAssignDraftTypes,
    setCostAssignPopup: assign.setCostAssignPopup,
    setCostAssignSelectedSlot: assign.setCostAssignSelectedSlot,
    setCostAssignDraftTypes: assign.setCostAssignDraftTypes,
    setCostNamePicker: assign.setCostNamePicker,
    onWheelScroll,
  })

  const openHeaderMenu = (event: ReactMouseEvent) => {
    if (isPmEditableEventTarget(event.target)) return
    event.preventDefault()
    columns.openColumnMenu(event.clientX, event.clientY)
  }

  return {
    t,
    editing: cellEdit.editing,
    draft: cellEdit.draft,
    setDraft: cellEdit.setDraft,
    contextMenu,
    setContextMenu,
    rowContextMenu,
    setRowContextMenu,
    resourceAssignPopup: assign.resourceAssignPopup,
    setResourceAssignPopup: assign.setResourceAssignPopup,
    resourceAssignSelectedSlot: assign.resourceAssignSelectedSlot,
    setResourceAssignSelectedSlot: assign.setResourceAssignSelectedSlot,
    resourceAssignPopupRef: assign.resourceAssignPopupRef,
    costAssignPopup: assign.costAssignPopup,
    setCostAssignPopup: assign.setCostAssignPopup,
    costAssignSelectedSlot: assign.costAssignSelectedSlot,
    setCostAssignSelectedSlot: assign.setCostAssignSelectedSlot,
    costAssignPopupRef: assign.costAssignPopupRef,
    costAssignDraftTypes: assign.costAssignDraftTypes,
    setCostAssignDraftTypes: assign.setCostAssignDraftTypes,
    resourceCellPicker: assign.resourceCellPicker,
    setResourceCellPicker: assign.setResourceCellPicker,
    resourceCellPickerMenuRef: assign.resourceCellPickerMenuRef,
    costNamePicker: assign.costNamePicker,
    setCostNamePicker: assign.setCostNamePicker,
    costNamePickerMenuRef: assign.costNamePickerMenuRef,
    resourceAssignDraftTypes: assign.resourceAssignDraftTypes,
    setResourceAssignDraftTypes: assign.setResourceAssignDraftTypes,
    selectionMode,
    setSelectionMode,
    hScrollMetrics: chrome.hScrollMetrics,
    hScrollDragging: chrome.hScrollDragging,
    inputRef: cellEdit.inputRef,
    hScrollRef: chrome.hScrollRef,
    hTrackRef: chrome.hTrackRef,
    headerPinInnerRef: chrome.headerPinInnerRef,
    gridTemplate,
    syncHScrollMetrics: chrome.syncHScrollMetrics,
    writeOrderedResourceSlot: assign.writeOrderedResourceSlot,
    writeOrderedCostSlot: assign.writeOrderedCostSlot,
    labelOf: columns.labelOf,
    menuLabelOf: columns.menuLabelOf,
    resourceInputMode: columns.resourceInputMode,
    costInputMode: columns.costInputMode,
    columnCatalog: columns.columnCatalog,
    columnBindings: columns.columnBindings,
    resolveResourceTypeLabel: columns.resolveResourceTypeLabel,
    resolveCostTypeLabel: columns.resolveCostTypeLabel,
    typeLabelOf: columns.typeLabelOf,
    resolveAssignmentCustomTypeName: columns.resolveAssignmentCustomTypeName,
    costTypeLabelOf: columns.costTypeLabelOf,
    patchPrefs: columns.patchPrefs,
    openCostNamePicker: assign.openCostNamePicker,
    startEdit: cellEdit.startEdit,
    commitEdit: cellEdit.commitEdit,
    handleKeyDown: cellEdit.handleKeyDown,
    toggleColumnVisible: columns.toggleColumnVisible,
    addCustomColumn: columns.addCustomColumn,
    cellValue: cellEdit.cellValue,
    columnClassSuffix: columns.columnClassSuffix,
    openHeaderMenu,
    handleWheel: chrome.handleWheel,
    onHTrackPointerDown: chrome.onHTrackPointerDown,
  }
}

/** Shared bag of state/handlers threaded into the presentational sub-components. */
export type GanttTaskGridState = ReturnType<typeof useProjectGanttTaskGrid>
