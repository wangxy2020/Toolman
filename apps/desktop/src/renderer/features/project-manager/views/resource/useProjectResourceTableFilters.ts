import { useCallback, useEffect, useMemo } from 'react'
import {
  addCustomTypeNameToCatalog,
  readCustomTypeNameCatalog,
  removeCustomTypeNameFromCatalog,
} from './pm-resource-custom-types'
import {
  buildBaselinePriceIndex,
  encodeCustomResourceViewFilter,
  isPmResourceCostType,
  isPmResourceType,
  listCustomResourceTypeNames,
  readSharedResourceCatalog,
  resourceRowMatchesViewFilter,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'
import type { ResourceToggleColumn } from './pm-resource-column-prefs'
import { resolveAddType, resolvePracticeQuotaView } from './pm-resource-panel-utils'
import type { ResourceViewFilter } from './ProjectResourceMenuBar'
import type { ResourcePracticeQuotaView } from '../files/ProjectFeaturesMenuBar'
import { useI18n } from '../../../../i18n/useI18n'

export function useProjectResourceTableFilters(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  dirty: boolean
  rows: PmResourceRow[]
  rowsRef: { current: PmResourceRow[] }
  selectedId: string | null
  setSelectedId: import('react').Dispatch<import('react').SetStateAction<string | null>>
  setCheckedIds: import('react').Dispatch<import('react').SetStateAction<Set<string>>>
  viewFilter: ResourceViewFilter
  setViewFilter: import('react').Dispatch<import('react').SetStateAction<ResourceViewFilter>>
  customTypeCatalog: string[]
  setCustomTypeCatalog: (v: string[]) => void
  pendingDeleteCustomTypeName: string | null
  setPendingDeleteCustomTypeName: (v: string | null) => void
  updateRows: (updater: (prev: PmResourceRow[]) => PmResourceRow[]) => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, dirty, rows, rowsRef, selectedId, setSelectedId, setCheckedIds,
    viewFilter, setViewFilter, customTypeCatalog, setCustomTypeCatalog, pendingDeleteCustomTypeName,
    setPendingDeleteCustomTypeName, updateRows, t,
  } = args
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmResourceType = selectedRow?.type ?? 'labor'
  const selectedCustomTypeName = selectedRow?.customTypeName ?? ''

  const customTypeNames = useMemo(
    () => listCustomResourceTypeNames(rows, customTypeCatalog),
    [customTypeCatalog, rows],
  )

  useEffect(() => {
    setCustomTypeCatalog(readCustomTypeNameCatalog(workspaceId))
  }, [workspaceId])

  const handleRegisterCustomTypeName = useCallback(
    (name: string) => {
      setCustomTypeCatalog(addCustomTypeNameToCatalog(workspaceId, name))
    },
    [workspaceId],
  )

  const handleRequestDeleteCustomTypeName = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setPendingDeleteCustomTypeName(trimmed)
  }, [])

  const visibleRows = useMemo(
    () => rows.filter((row) => resourceRowMatchesViewFilter(row, viewFilter)),
    [rows, viewFilter],
  )
  const { addType, addCustomTypeName } = resolveAddType(viewFilter, selectedType, selectedCustomTypeName)

  const handleViewFilterChange = useCallback(
    (filter: ResourceViewFilter) => {
      // Cost-resource types are not available in the View menu.
      if (filter !== 'all' && isPmResourceType(filter) && isPmResourceCostType(filter)) {
        setViewFilter('all')
        return
      }
      setViewFilter(filter)
      if (filter === 'all') return
      setSelectedId((prev) => {
        if (!prev) return prev
        const row = rowsRef.current.find((entry) => entry.id === prev)
        return row && resourceRowMatchesViewFilter(row, filter) ? prev : null
      })
      setCheckedIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set<string>()
        for (const id of prev) {
          const row = rowsRef.current.find((entry) => entry.id === id)
          if (row && resourceRowMatchesViewFilter(row, filter)) next.add(id)
        }
        return next
      })
    },
    [],
  )

  const baselinePriceIndex = useMemo(() => {
    if (isAllScope) return null
    return buildBaselinePriceIndex(readSharedResourceCatalog(workspaceId).rows)
  }, [isAllScope, workspaceId, dirty])
  const handleConfirmDeleteCustomTypeName = useCallback(() => {
    const name = pendingDeleteCustomTypeName?.trim()
    if (!name) {
      setPendingDeleteCustomTypeName(null)
      return
    }
    setCustomTypeCatalog(removeCustomTypeNameFromCatalog(workspaceId, name))
    updateRows((prev) =>
      prev.map((row) =>
        row.type === 'custom' && row.customTypeName.trim() === name
          ? { ...row, customTypeName: '' }
          : row,
      ),
    )
    setViewFilter((current) =>
      current === encodeCustomResourceViewFilter(name) ? 'custom' : current,
    )
    setPendingDeleteCustomTypeName(null)
  }, [pendingDeleteCustomTypeName, updateRows, workspaceId])
  const practiceQuotaView: ResourcePracticeQuotaView = resolvePracticeQuotaView(viewFilter)

  const handleQuotaViewChange = useCallback(
    (view: ResourcePracticeQuotaView) => {
      handleViewFilterChange(view)
    },
    [handleViewFilterChange],
  )

  const practiceColumnLabel = useCallback(
    (column: ResourceToggleColumn | 'index') => {
      if (!isPractice) {
        return t(`projectManagerPage.resourceTable.columns.${column}`)
      }
      if (
        column === 'name' ||
        column === 'spec' ||
        column === 'unit' ||
        column === 'pricingUnit' ||
        column === 'unitPrice'
      ) {
        return t(`projectManagerPage.resourcePractice.columns.${column}`)
      }
      return t(`projectManagerPage.resourceTable.columns.${column}`)
    },
    [isPractice, t],
  )

  return {
    byId, selectedRow, selectedType, selectedCustomTypeName, customTypeNames, visibleRows,
    addType, addCustomTypeName, handleViewFilterChange, baselinePriceIndex,
    handleRegisterCustomTypeName, handleRequestDeleteCustomTypeName, handleConfirmDeleteCustomTypeName,
    practiceQuotaView, handleQuotaViewChange, practiceColumnLabel,
  }
}
