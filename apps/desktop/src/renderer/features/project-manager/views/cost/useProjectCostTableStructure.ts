import { useCallback } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { findDemoteParentId } from '../schedule/pm-gantt-tree'
import {
  costRowDepth,
  isCostSectionSummaryFilter,
  type PmCostRow,
} from './pm-cost-catalog'
import { DEFAULT_COST_CURRENCY } from './pm-cost-currency'
import { createEmptyCostSummaryRow, type CostSummaryRow } from './pm-cost-summary'

export function useProjectCostTableStructure(args: {
  selectedId: string | null
  checkedIds: Set<string>
  sectionFilter: string
  setSelectedId: (id: string | null | ((current: string | null) => string | null)) => void
  setCheckedIds: (ids: Set<string>) => void
  setSelectionMode: (v: boolean) => void
  setPendingDelete: (ids: Set<string> | null) => void
  setDirty: (v: boolean) => void
  setSummaryRows: (fn: (prev: CostSummaryRow[]) => CostSummaryRow[]) => void
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[]) => void
  resolveEditableSummaryRows: () => CostSummaryRow[]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    selectedId, checkedIds, sectionFilter, setSelectedId, setCheckedIds, setSelectionMode,
    setPendingDelete, setDirty, setSummaryRows, updateRows, resolveEditableSummaryRows, t,
  } = args

  const deleteIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return

      if (isCostSectionSummaryFilter(sectionFilter)) {
        setSummaryRows((prev) => {
          const base = prev.length > 0 ? prev : resolveEditableSummaryRows()
          const summaryIdSet = new Set(base.map((row) => row.id))
          // Only top-level summary rows are deletable; ignore 分部汇总 selection ids.
          const remove = new Set([...ids].filter((id) => summaryIdSet.has(id)))
          if (remove.size === 0) {
            setSelectedId(null)
            return prev.length > 0 ? prev : base
          }
          const next = base.filter((row) => !remove.has(row.id))
          // Keep at least one summary row.
          const ensured =
            next.length > 0
              ? next
              : [
                  {
                    ...createEmptyCostSummaryRow(0, DEFAULT_COST_CURRENCY, 'cost-summary:default'),
                    name: t('projectManagerPage.costTable.views.sectionSummary'),
                  },
                ]
          setSelectedId((current) => (current && remove.has(current) ? null : current))
          setCheckedIds(new Set())
          setSelectionMode(false)
          return ensured.map((row, index) => ({ ...row, sortOrder: index }))
        })
        setDirty(true)
        return
      }

      updateRows((prev) => {
        const remove = new Set(ids)
        let changed = true
        while (changed) {
          changed = false
          for (const row of prev) {
            if (remove.has(row.id)) continue
            if (row.parentId && remove.has(row.parentId)) {
              remove.add(row.id)
              changed = true
            }
          }
        }
        const next = prev.filter((row) => !remove.has(row.id))
        setSelectedId((current) => (current && remove.has(current) ? null : current))
        setCheckedIds(new Set())
        setSelectionMode(false)
        return next
      })
    },
    [resolveEditableSummaryRows, sectionFilter, t, updateRows],
  )

  const handleDelete = useCallback(() => {
    const ids: Set<string> =
      checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set()
    if (ids.size === 0) return
    setPendingDelete(ids)
  }, [checkedIds, selectedId])

  const handleIndent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index <= 0) return prev
      const byIdMap = new Map(prev.map((row) => [row.id, row]))
      const depthRows = prev.map((row) => ({
        item: { id: row.id, parentId: row.parentId },
        depth: costRowDepth(row, byIdMap),
      }))
      const parentId = findDemoteParentId(depthRows, index)
      if (!parentId) return prev
      return prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, parentId } : row,
      )
    })
  }, [selectedId, updateRows])

  const handleOutdent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const current = prev.find((row) => row.id === selectedId)
      if (!current?.parentId) return prev
      const parent = prev.find((row) => row.id === current.parentId)
      return prev.map((row) =>
        row.id === selectedId ? { ...row, parentId: parent?.parentId ?? null } : row,
      )
    })
  }, [selectedId, updateRows])

  const handleMove = useCallback(
    (direction: -1 | 1) => {
      if (!selectedId) return
      updateRows((prev) => {
        const index = prev.findIndex((row) => row.id === selectedId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= prev.length) return prev
        const copy = [...prev]
        const [item] = copy.splice(index, 1)
        if (!item) return prev
        copy.splice(target, 0, item)
        return copy
      })
    },
    [selectedId, updateRows],
  )

  return { deleteIds, handleDelete, handleIndent, handleOutdent, handleMove }
}
