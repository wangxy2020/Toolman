import { useMemo } from 'react'
import type { PmCostType } from '../cost/pm-cost-catalog'
import type { PmResourceType } from '../resource/pm-resource-catalog'
import {
  isPmResourceType,
  PM_RESOURCE_TYPES,
  resourceCustomTypeName,
} from '../resource/pm-resource-catalog'
import { parseCostColumnId } from './pm-gantt-cost-assignment'
import { parseResourceColumnId } from './pm-gantt-resource-assignment'
import {
  buildDefaultResourceColumnBindings,
  createCustomColumnId,
  insertColumnInCanonicalOrder,
  isGanttBuiltinColumn,
  resolveColumnLabel,
  type GanttResourceColumnBinding,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import type { Props } from './pm-gantt-task-grid-utils'

export function useProjectGanttTaskGridColumns(args: {
  prefs: GanttUiPrefs
  builtinLabels: Props['builtinLabels']
  resourceCatalog: Props['resourceCatalog']
  resourceColumnCatalog: Props['resourceColumnCatalog']
  resourceViewMode: boolean
  costViewMode: boolean
  t: (key: string) => string
  onPrefsChange: Props['onPrefsChange']
  setContextMenu: (value: { top: number; right: number } | null) => void
  setRowContextMenu: (value: null) => void
  setResourceAssignPopup: (value: null) => void
  setResourceCellPicker: (value: null) => void
  setCostAssignPopup: (value: null) => void
  setCostAssignSelectedSlot: (value: null) => void
  setCostAssignDraftTypes: (value: Record<number, never>) => void
  setCostNamePicker: (value: null) => void
}) {
  const {
    prefs,
    builtinLabels,
    resourceCatalog = [],
    resourceColumnCatalog,
    resourceViewMode,
    costViewMode,
    t,
    onPrefsChange,
    setContextMenu,
    setRowContextMenu,
    setResourceAssignPopup,
    setResourceCellPicker,
    setCostAssignPopup,
    setCostAssignSelectedSlot,
    setCostAssignDraftTypes,
    setCostNamePicker,
  } = args

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

  return {
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
    openColumnMenu,
    toggleColumnVisible,
    addCustomColumn,
    columnClassSuffix,
  }
}
