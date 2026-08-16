import { useCallback } from 'react'

import type { PmProject } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import {
  createEmptyCostRow,
  isCostSectionSummaryFilter,
  suggestNextCostCode,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'
import { DEFAULT_COST_CURRENCY } from './pm-cost-currency'
import {
  buildCostSectionalRollupDisplayEntries,
  createEmptyCostSummaryRow,
  type CostSummaryRow,
} from './pm-cost-summary'
import type { CostViewFilter } from './ProjectCostMenuBar'

export function useProjectCostTableRows(args: {
  canEdit: boolean
  isPractice: boolean
  addType: PmCostType
  viewFilter: CostViewFilter
  sectionFilter: string
  viewApplicable: string
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  setDirty: (v: boolean) => void
  setSummaryRows: (fn: (prev: CostSummaryRow[]) => CostSummaryRow[]) => void
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[], options?: { coalesceMs?: number }) => void
  editingProject: PmProject | null
  summaryRows: CostSummaryRow[]
  rowsRef: { current: PmCostRow[] }
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    canEdit, isPractice, addType, viewFilter, sectionFilter, viewApplicable, selectedId,
    setSelectedId, setDirty, setSummaryRows, updateRows, editingProject, summaryRows, rowsRef, t,
  } = args

  const resolveEditableSummaryRows = useCallback((): CostSummaryRow[] => {
    if (summaryRows.length > 0) return summaryRows
    return buildCostSectionalRollupDisplayEntries(rowsRef.current, {
      metadata: editingProject?.metadata,
      projectCode: editingProject?.code,
      summaryRows: [],
      summaryLabel: t('projectManagerPage.costTable.views.sectionSummary'),
      summaryLabelWithCurrency: (currency) =>
        t('projectManagerPage.costTable.views.sectionSummaryWithCurrency', {
          currency,
        }),
    })
      .filter(
        (entry): entry is Extract<typeof entry, { kind: 'summary' }> =>
          entry.kind === 'summary',
      )
      .map((entry) => entry.row)
  }, [editingProject?.code, editingProject?.metadata, summaryRows, t])

  const handleAdd = useCallback(
    (count = 1) => {
      if (!canEdit) return
      const addCount = Math.max(1, Math.min(500, Math.floor(count)))

      if (isCostSectionSummaryFilter(sectionFilter)) {
        setSummaryRows((prev) => {
          const base = prev.length > 0 ? prev : resolveEditableSummaryRows()
          const added: CostSummaryRow[] = []
          let previous = base[base.length - 1] ?? null
          for (let i = 0; i < addCount; i += 1) {
            const next = createEmptyCostSummaryRow(
              base.length + i,
              previous?.currency || DEFAULT_COST_CURRENCY,
            )
            const ordinal = base.length + i + 1
            next.name =
              ordinal <= 1
                ? t('projectManagerPage.costTable.views.sectionSummary')
                : t('projectManagerPage.costTable.views.sectionSummaryIndexed', {
                    index: String(ordinal),
                  })
            if (previous?.code) {
              next.code = suggestNextCostCode(previous.code)
            }
            added.push(next)
            previous = next
          }
          const last = added[added.length - 1]
          if (last) setSelectedId(last.id)
          return [...base, ...added].map((row, index) => ({ ...row, sortOrder: index }))
        })
        setDirty(true)
        return
      }

      updateRows((prev) => {
        const typeAbove = isPractice
          ? addType
          : viewFilter !== 'all'
            ? addType
            : (prev[prev.length - 1]?.type ?? addType)
        const added: PmCostRow[] = []
        let previous = prev[prev.length - 1]
        const sectionFromFilter =
          sectionFilter !== 'all' && !isCostSectionSummaryFilter(sectionFilter)
            ? sectionFilter
            : null
        for (let i = 0; i < addCount; i += 1) {
          const next = createEmptyCostRow(
            prev.length + i,
            typeAbove,
            null,
            viewApplicable,
          )
          next.code = suggestNextCostCode(previous?.code ?? '')
          if (sectionFromFilter != null) {
            next.sectionalWork = sectionFromFilter
          } else if (previous) {
            next.sectionalWork = previous.sectionalWork ?? ''
          }
          const sectionPeer =
            [...prev, ...added].find(
              (row) =>
                (row.sectionalWork?.trim() ?? '') ===
                (next.sectionalWork?.trim() ?? ''),
            ) ?? null
          if (sectionPeer) {
            next.sectionCode = sectionPeer.sectionCode ?? ''
            next.sectionNote = sectionPeer.sectionNote ?? ''
            next.sectionName = sectionPeer.sectionName ?? ''
            next.sectionFeatureDescription = sectionPeer.sectionFeatureDescription ?? ''
            next.sectionTotalFormula = sectionPeer.sectionTotalFormula ?? ''
          }
          added.push(next)
          previous = next
        }
        const last = added[added.length - 1]
        if (last) setSelectedId(last.id)
        return [...prev, ...added]
      })
    },
    [
      addType,
      canEdit,
      isPractice,
      resolveEditableSummaryRows,
      sectionFilter,
      t,
      updateRows,
      viewApplicable,
      viewFilter,
    ],
  )

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return

    if (isCostSectionSummaryFilter(sectionFilter)) {
      setSummaryRows((prev) => {
        const base = prev.length > 0 ? prev : resolveEditableSummaryRows()
        let index = base.findIndex((row) => row.id === selectedId)
        // Selecting a 分部汇总 row (section:…) — insert at the end of top summary rows.
        if (index < 0) index = base.length
        const previous = base[index - 1] ?? base[base.length - 1] ?? null
        const next = createEmptyCostSummaryRow(
          index,
          previous?.currency || DEFAULT_COST_CURRENCY,
        )
        next.name = t('projectManagerPage.costTable.views.sectionSummaryIndexed', {
          index: String(base.length + 1),
        })
        next.code = suggestNextCostCode(previous?.code ?? '')
        setSelectedId(next.id)
        const copy = [...base]
        copy.splice(index, 0, next)
        return copy.map((row, order) => ({ ...row, sortOrder: order }))
      })
      setDirty(true)
      return
    }

    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const typeAbove = isPractice
        ? addType
        : viewFilter !== 'all'
          ? addType
          : (prev[index - 1]?.type ?? prev[index]?.type ?? addType)
      const previous = prev[index - 1] ?? null
      const next = createEmptyCostRow(index, typeAbove, parentId, viewApplicable)
      next.code = suggestNextCostCode(previous?.code ?? '')
      if (sectionFilter !== 'all' && !isCostSectionSummaryFilter(sectionFilter)) {
        next.sectionalWork = sectionFilter
      } else {
        // Prefer the selected row (insert-before target) so the new row stays in the
        // same 分部工程 group; falling back to the previous row only when needed.
        next.sectionalWork =
          prev[index]?.sectionalWork ?? previous?.sectionalWork ?? ''
      }
      const sectionPeer =
        previous &&
        (previous.sectionalWork?.trim() ?? '') === (next.sectionalWork?.trim() ?? '')
          ? previous
          : prev[index] &&
              (prev[index]!.sectionalWork?.trim() ?? '') ===
                (next.sectionalWork?.trim() ?? '')
            ? prev[index]
            : prev.find(
                (row) =>
                  (row.sectionalWork?.trim() ?? '') ===
                  (next.sectionalWork?.trim() ?? ''),
              )
      if (sectionPeer) {
        next.sectionCode = sectionPeer.sectionCode ?? ''
        next.sectionNote = sectionPeer.sectionNote ?? ''
        next.sectionName = sectionPeer.sectionName ?? ''
        next.sectionFeatureDescription = sectionPeer.sectionFeatureDescription ?? ''
        next.sectionTotalFormula = sectionPeer.sectionTotalFormula ?? ''
      }
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [
    addType,
    canEdit,
    isPractice,
    resolveEditableSummaryRows,
    sectionFilter,
    selectedId,
    t,
    updateRows,
    viewApplicable,
    viewFilter,
  ])

  return { resolveEditableSummaryRows, handleAdd, handleInsert }
}
