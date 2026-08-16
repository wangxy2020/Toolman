import { useCallback } from 'react'

import type { PmProject } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import {
  deriveCostApplicable,
  isPmCostPracticeQuotaType,
  isPmCostResourceType,
  isPmCostType,
  patchCostSectionMeta,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'
import { buildCostSectionalRollupDisplayEntries, type CostSummaryRow } from './pm-cost-summary'

type BaselineIndex = Parameters<typeof deriveCostApplicable>[1]

export function useProjectCostTableEdit(args: {
  isPractice: boolean
  editingProject: PmProject | null
  baselinePriceIndex: BaselineIndex
  updateRows: (updater: (prev: PmCostRow[]) => PmCostRow[], options?: { coalesceMs?: number }) => void
  setSummaryRows: (fn: (prev: CostSummaryRow[]) => CostSummaryRow[]) => void
  setDirty: (v: boolean) => void
  rowsRef: { current: PmCostRow[] }
  t: ReturnType<typeof useI18n>['t']
}) {
  const { isPractice, editingProject, baselinePriceIndex, updateRows, setSummaryRows, setDirty, rowsRef, t } = args

  const patchRow = useCallback(
    (id: string, patch: Partial<PmCostRow>) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        { coalesceMs: 500 },
      )
    },
    [updateRows],
  )

  const handleRowTypeChange = useCallback(
    (row: PmCostRow, type: PmCostType) => {
      if (isPractice) {
        if (!isPmCostPracticeQuotaType(type)) return
      } else if (!isPmCostType(type) || isPmCostResourceType(type)) {
        return
      }
      const applicable =
        editingProject != null
          ? deriveCostApplicable({ ...row, type }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { type, applicable })
    },
    [baselinePriceIndex, editingProject, isPractice, patchRow],
  )

  const handleRowNameChange = useCallback(
    (row: PmCostRow, name: string) => {
      const applicable =
        editingProject != null
          ? deriveCostApplicable({ ...row, name }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { name, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleRowUnitPriceChange = useCallback(
    (row: PmCostRow, unitPrice: number | null) => {
      const applicable =
        editingProject != null
          ? deriveCostApplicable({ ...row, unitPrice }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { unitPrice, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const patchSectionMeta = useCallback(
    (
      sectionKey: string,
      patch: Partial<
        Pick<
          PmCostRow,
          | 'sectionCode'
          | 'sectionNote'
          | 'sectionName'
          | 'sectionFeatureDescription'
          | 'sectionTotalFormula'
        >
      >,
    ) => {
      updateRows((prev) => patchCostSectionMeta(prev, sectionKey, patch), { coalesceMs: 500 })
    },
    [updateRows],
  )

  const patchSummaryRow = useCallback((id: string, patch: Partial<CostSummaryRow>) => {
    setSummaryRows((prev) => {
      const base =
        prev.length > 0
          ? prev
          : buildCostSectionalRollupDisplayEntries(rowsRef.current, {
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
      return base.map((row, index) =>
        row.id === id ? { ...row, ...patch, sortOrder: index } : { ...row, sortOrder: index },
      )
    })
    setDirty(true)
  }, [editingProject?.code, editingProject?.metadata, t])

  return { patchRow, handleRowTypeChange, handleRowNameChange, handleRowUnitPriceChange, patchSectionMeta, patchSummaryRow }
}
