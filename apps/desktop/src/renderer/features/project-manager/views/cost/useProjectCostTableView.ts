import { useCallback, useLayoutEffect, useMemo, type RefObject } from 'react'

import type { PmProject } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import {
  buildBaselinePriceIndex,
  buildCostChildrenIndex,
  buildCostSectionalDisplayEntries,
  isCostSectionSummaryFilter,
  isPmCostPracticeQuotaType,
  isPmCostResourceType,
  readSharedCostCatalog,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'
import { buildCostSectionalRollupDisplayEntries, type CostSummaryRow } from './pm-cost-summary'
import { syncFeatureDescriptionHeight } from './pm-cost-panel-utils'
import type { CostPracticeQuotaView } from '../files/ProjectFeaturesMenuBar'
import type { CostViewFilter } from './ProjectCostMenuBar'
import type { CostColumnVisibility } from './pm-cost-column-prefs'

export function useProjectCostTableView(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  dirty: boolean
  rows: PmCostRow[]
  selectedId: string | null
  setSelectedId: (id: string | null | ((current: string | null) => string | null)) => void
  setCheckedIds: import('react').Dispatch<import('react').SetStateAction<Set<string>>>
  setSelectionMode: (v: boolean) => void
  costQuotaView: CostPracticeQuotaView
  viewFilter: CostViewFilter
  setViewFilter: (v: CostViewFilter) => void
  sectionFilter: string
  setSectionFilter: (v: string) => void
  setMeteringViewActive: (v: boolean) => void
  summaryRows: CostSummaryRow[]
  editingProject: PmProject | null
  columnVisibility: CostColumnVisibility
  tableScrollRef: RefObject<HTMLDivElement | null>
  rowsRef: { current: PmCostRow[] }
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, dirty, rows, selectedId, setSelectedId, setCheckedIds,
    setSelectionMode, costQuotaView, viewFilter, setViewFilter, sectionFilter, setSectionFilter,
    setMeteringViewActive, summaryRows, editingProject, columnVisibility, tableScrollRef, rowsRef, t,
  } = args

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const childrenByParentId = useMemo(() => buildCostChildrenIndex(rows), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmCostType = isPractice
    ? isPmCostPracticeQuotaType(selectedRow?.type)
      ? selectedRow.type
      : costQuotaView
    : (selectedRow?.type ?? 'other')
  const sectionalOptions = useMemo(() => {
    const keys: string[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      const key = row.sectionalWork?.trim() ?? ''
      if (seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
    return keys
  }, [rows])
  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (isPractice) {
        // Match resource practice: view menu filters the type column set.
        if (row.type !== costQuotaView) return false
      } else if (viewFilter !== 'all' && row.type !== viewFilter) {
        return false
      }
      if (
        sectionFilter !== 'all' &&
        !isCostSectionSummaryFilter(sectionFilter) &&
        (row.sectionalWork?.trim() ?? '') !== sectionFilter
      ) {
        return false
      }
      return true
    })
  }, [costQuotaView, isPractice, rows, sectionFilter, viewFilter])

  const displayEntries = useMemo(
    () =>
      isCostSectionSummaryFilter(sectionFilter)
        ? buildCostSectionalRollupDisplayEntries(visibleRows, {
            metadata: editingProject?.metadata,
            projectCode: editingProject?.code,
            summaryRows,
            summaryLabel: t('projectManagerPage.costTable.views.sectionSummary'),
            summaryLabelWithCurrency: (currency) =>
              t('projectManagerPage.costTable.views.sectionSummaryWithCurrency', {
                currency,
              }),
          })
        : buildCostSectionalDisplayEntries(visibleRows),
    [
      editingProject?.code,
      editingProject?.metadata,
      sectionFilter,
      summaryRows,
      t,
      visibleRows,
    ],
  )

  useLayoutEffect(() => {
    if (!columnVisibility.featureDescription) return
    const root = tableScrollRef.current
    if (!root) return
    const syncAll = () => {
      root
        .querySelectorAll<HTMLTextAreaElement>('textarea.tm-pm-resource-table-input--feature')
        .forEach(syncFeatureDescriptionHeight)
    }
    syncAll()
    const observer = new ResizeObserver(syncAll)
    observer.observe(root)
    return () => observer.disconnect()
  }, [visibleRows, columnVisibility.featureDescription])

  const addType: PmCostType = isPractice
    ? costQuotaView
    : viewFilter === 'all'
      ? selectedType
      : viewFilter

  const handleViewFilterChange = useCallback((filter: CostViewFilter) => {
    // Resource-cost types are not available in the View menu.
    if (filter !== 'all' && isPmCostResourceType(filter)) {
      setViewFilter('all')
      return
    }
    setMeteringViewActive(false)
    setViewFilter(filter)
    if (filter === 'all') return
    setSelectedId((prev) => {
      if (!prev) return prev
      const row = rowsRef.current.find((entry) => entry.id === prev)
      return row && row.type === filter ? prev : null
    })
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const id of prev) {
        const row = rowsRef.current.find((entry) => entry.id === id)
        if (row?.type === filter) next.add(id)
      }
      return next
    })
  }, [])

  const handleSectionFilterChange = useCallback((filter: string) => {
    setMeteringViewActive(false)
    setSectionFilter(filter)
    if (filter === 'all' || isCostSectionSummaryFilter(filter)) {
      if (isCostSectionSummaryFilter(filter)) {
        setSelectedId(null)
        setCheckedIds(new Set())
        setSelectionMode(false)
      }
      return
    }
    setSelectedId((prev) => {
      if (!prev) return prev
      const row = rowsRef.current.find((entry) => entry.id === prev)
      return row && (row.sectionalWork?.trim() ?? '') === filter ? prev : null
    })
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const id of prev) {
        const row = rowsRef.current.find((entry) => entry.id === id)
        if (row && (row.sectionalWork?.trim() ?? '') === filter) next.add(id)
      }
      return next
    })
  }, [])

  const baselinePriceIndex = useMemo(() => {
    if (isAllScope) return null
    return buildBaselinePriceIndex(readSharedCostCatalog(workspaceId).rows)
  }, [isAllScope, workspaceId, dirty])

  return {
    byId, childrenByParentId, selectedRow, selectedType, sectionalOptions, visibleRows,
    displayEntries, addType, handleViewFilterChange, handleSectionFilterChange, baselinePriceIndex,
  }
}
