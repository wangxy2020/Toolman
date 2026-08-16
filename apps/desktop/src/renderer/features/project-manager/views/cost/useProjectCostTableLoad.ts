import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { PmProject } from '@toolman/shared'
import { PM_COST_CONTENT_FINGERPRINT_KEY } from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { useI18n } from '../../../../i18n/useI18n'
import {
  PM_COST_CATALOG_KEY,
  buildBaselinePriceIndex,
  fingerprintCostCatalog,
  hydrateSharedCostCatalogFromMain,
  isPmCostPracticeQuotaType,
  readSharedCostCatalog,
  reindexCostRows,
  resolveProjectCostCatalog,
  sortCostRowsByTypeMenu,
  sortCostRowsLikeSharedCatalog,
  withDerivedCostApplicable,
  writeSharedCostCatalog,
  type PmCostRow,
} from './pm-cost-catalog'
import { readCostPracticeCatalog } from './pm-cost-practice-catalog'
import { cloneCostRows, type CostHistoryStack } from './pm-cost-history'
import {
  COST_SUMMARY_ROWS_META_KEY,
  normalizeCostSummaryRows,
  readCostSummaryRows,
  type CostSummaryRow,
} from './pm-cost-summary'
import type { CostViewFilter } from './ProjectCostMenuBar'
import type { MeteringRollupMode } from './pm-metering-baselines'

export function useProjectCostTableLoad(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  scopeKey: string
  editingProject: PmProject | null
  dirty: boolean
  setDirty: Dispatch<SetStateAction<boolean>>
  setRows: Dispatch<SetStateAction<PmCostRow[]>>
  rowsRef: MutableRefObject<PmCostRow[]>
  cleanFingerprintRef: MutableRefObject<string>
  historyStackRef: MutableRefObject<CostHistoryStack>
  historyApplyingRef: MutableRefObject<boolean>
  setHistoryEpoch: Dispatch<SetStateAction<number>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setCheckedIds: Dispatch<SetStateAction<Set<string>>>
  setSelectionMode: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<{ left: number; top: number; rowId: string } | null>>
  setColumnMenu: Dispatch<SetStateAction<{ left: number; top: number } | null>>
  setProjectInfoOpen: Dispatch<SetStateAction<boolean>>
  setViewFilter: Dispatch<SetStateAction<CostViewFilter>>
  setSectionFilter: Dispatch<SetStateAction<string>>
  setSummaryRows: Dispatch<SetStateAction<CostSummaryRow[]>>
  setMeteringViewActive: Dispatch<SetStateAction<boolean>>
  setMeteringBaselines: Dispatch<SetStateAction<import('./pm-metering-baselines').MeteringBaseline[]>>
  setSelectedMeteringBaselineId: Dispatch<SetStateAction<string | null>>
  setMeteringCaptureBaselineOpen: Dispatch<SetStateAction<boolean>>
  setMeteringEditBaselineOpen: Dispatch<SetStateAction<boolean>>
  setPendingMeteringDeleteBaseline: Dispatch<SetStateAction<boolean>>
  setMeteringRollupMode: Dispatch<SetStateAction<MeteringRollupMode>>
  onProjectsChange?: () => void | Promise<void>
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, practiceScopeId, scopeKey, editingProject, dirty,
    setDirty, setRows, rowsRef, cleanFingerprintRef, historyStackRef, historyApplyingRef,
    setHistoryEpoch, setSelectedId, setCheckedIds, setSelectionMode, setContextMenu, setColumnMenu,
    setProjectInfoOpen, setViewFilter, setSectionFilter, setSummaryRows, setMeteringViewActive,
    setMeteringBaselines, setSelectedMeteringBaselineId, setMeteringCaptureBaselineOpen,
    setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline, setMeteringRollupMode,
    onProjectsChange, t,
  } = args
  const markCleanCatalog = useCallback((catalog: PmCostRow[]) => {
    cleanFingerprintRef.current = fingerprintCostCatalog(catalog)
    rowsRef.current = catalog
  }, [])

  const applyCatalogRows = useCallback(
    (catalog: PmCostRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => {
      setRows(catalog)
      rowsRef.current = catalog
      if (options?.clearHistory) {
        historyStackRef.current.clear()
        setHistoryEpoch((value) => value + 1)
      }
      if (options?.dirty === false) {
        markCleanCatalog(catalog)
        setDirty(false)
      } else if (options?.dirty === true) {
        setDirty(true)
      } else {
        setDirty(fingerprintCostCatalog(catalog) !== cleanFingerprintRef.current)
      }
    },
    [markCleanCatalog],
  )
  // Must run before hydrate so a scope switch does not wipe freshly loaded rows.
  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setColumnMenu(null)
    setProjectInfoOpen(false)
    setViewFilter('all')
    setSectionFilter('all')
    setSummaryRows([])
    setMeteringViewActive(false)
    setMeteringBaselines([])
    setSelectedMeteringBaselineId(null)
    setMeteringCaptureBaselineOpen(false)
    setMeteringEditBaselineOpen(false)
    setPendingMeteringDeleteBaseline(false)
    setMeteringRollupMode('none')
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
    cleanFingerprintRef.current = ''
    rowsRef.current = []
    setRows([])
  }, [scopeKey])

  useEffect(() => {
    if (dirty) return

    if (isPractice) {
      if (!practiceScopeId) {
        applyCatalogRows([], { dirty: false, clearHistory: true })
        return
      }
      const source = readCostPracticeCatalog(workspaceId, practiceScopeId)
      const ordered = source.map((row) =>
        isPmCostPracticeQuotaType(row.type)
          ? row
          : { ...row, type: 'constructionQuota' as const },
      )
      const coerced = ordered.some((row, index) => row.type !== source[index]?.type)
      applyCatalogRows(ordered, { dirty: coerced, clearHistory: true })
      return
    }

    if (isAllScope) {
      let cancelled = false
      void hydrateSharedCostCatalogFromMain(workspaceId).then((hydrated) => {
        if (cancelled) return
        const ordered = sortCostRowsByTypeMenu(hydrated)
        const orderedFp = fingerprintCostCatalog(ordered)
        const cleanFp = cleanFingerprintRef.current
        const currentFp = fingerprintCostCatalog(rowsRef.current)
        // After a local save, props/main may still be stale — do not clobber newer in-memory rows.
        if (cleanFp && currentFp === cleanFp && orderedFp !== cleanFp) {
          writeSharedCostCatalog(workspaceId, rowsRef.current)
          return
        }
        applyCatalogRows(ordered, { dirty: false, clearHistory: true })
        const orderChanged = ordered.some((row, index) => row.id !== hydrated[index]?.id)
        if (orderChanged) {
          writeSharedCostCatalog(workspaceId, ordered)
        }
      })
      return () => {
        cancelled = true
      }
    }

    if (!editingProject) {
      applyCatalogRows([], { dirty: false, clearHistory: true })
      return
    }

    const sharedRows = readSharedCostCatalog(workspaceId).rows
    const resolved = resolveProjectCostCatalog(workspaceId, editingProject.metadata)
    const baseline = buildBaselinePriceIndex(sharedRows)
    const normalized = withDerivedCostApplicable(resolved.rows, baseline, editingProject.id)
    const ordered = sortCostRowsLikeSharedCatalog(normalized, sharedRows)
    const orderedFp = fingerprintCostCatalog(ordered)
    const cleanFp = cleanFingerprintRef.current
    const currentFp = fingerprintCostCatalog(rowsRef.current)
    if (cleanFp && currentFp === cleanFp && orderedFp !== cleanFp) {
      return
    }
    applyCatalogRows(ordered, { dirty: false, clearHistory: true })
    const storedSummaryRows = readCostSummaryRows(editingProject.metadata)
    const summaryLabel = t('projectManagerPage.costTable.views.sectionSummary')
    const normalizedSummary = normalizeCostSummaryRows(
      storedSummaryRows,
      [],
      summaryLabel,
      (currency) =>
        t('projectManagerPage.costTable.views.sectionSummaryWithCurrency', {
          currency,
        }),
    )
    setSummaryRows(normalizedSummary.rows)
    if (normalizedSummary.changed && storedSummaryRows.length > 0) {
      // Drop legacy per-currency auto summary rows from project metadata.
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: {
            [COST_SUMMARY_ROWS_META_KEY]: normalizedSummary.rows,
          },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep normalized rows in memory even if persist fails.
        })
    }
    if (resolved.fromShared) return
    const applicableChanged = ordered.some(
      (row, index) => row.applicable !== resolved.rows[index]?.applicable,
    )
    const orderChanged = ordered.some((row, index) => row.id !== resolved.rows[index]?.id)
    if (applicableChanged || orderChanged) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: {
            [PM_COST_CATALOG_KEY]: ordered,
            // Keep save fingerprint aligned with normalized rows (no version bump).
            [PM_COST_CONTENT_FINGERPRINT_KEY]: orderedFp,
          },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [
    applyCatalogRows,
    dirty,
    editingProject,
    isAllScope,
    isPractice,
    onProjectsChange,
    practiceScopeId,
    scopeKey,
    t,
    workspaceId,
  ])
  const updateRows = useCallback(
    (updater: (prev: PmCostRow[]) => PmCostRow[], options?: { coalesceMs?: number }) => {
      let changed = false
      let pushedHistory = false
      setRows((statePrev) => {
        // Always derive from React state inside the updater. Preferring rowsRef here
        // breaks under Strict Mode double-invoke (edits/deletes appear to "snap back").
        const next = reindexCostRows(updater(statePrev))
        if (fingerprintCostCatalog(next) === fingerprintCostCatalog(statePrev)) {
          return statePrev
        }
        changed = true
        if (!historyApplyingRef.current) {
          historyStackRef.current.pushBeforeChange(cloneCostRows(statePrev), {
            coalesceMs: options?.coalesceMs,
          })
          pushedHistory = true
        }
        rowsRef.current = next
        return next
      })
      if (!changed) return
      setDirty(true)
      if (pushedHistory) setHistoryEpoch((value) => value + 1)
    },
    [],
  )

  return { markCleanCatalog, applyCatalogRows, updateRows }
}
