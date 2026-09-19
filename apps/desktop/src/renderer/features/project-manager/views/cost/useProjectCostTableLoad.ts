import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { CostDatabaseConnection, CostDatabaseImportedRow, CostDatabaseViewKey, PmProject } from '@toolman/shared'
import {
  costDatabasePersistScopeId,
  isCostDatabaseConnectionReady,
  isCostDatabaseViewKey,
  listMappedCostDatabaseViews,
  PM_COST_CONTENT_FINGERPRINT_KEY,
  readCostDatabaseConnection,
  resolveCostDatabaseViewBinding,
} from '@toolman/shared'

import { pmApi } from '../../pm-api'
import { useI18n } from '../../../../i18n/useI18n'
import {
  PM_COST_CATALOG_KEY,
  buildBaselinePriceIndex,
  fingerprintCostCatalog,
  hydrateSharedCostCatalogFromMain,
  readSharedCostSaveMeta,
  readSharedCostCatalog,
  reindexCostRows,
  resolveProjectCostCatalog,
  sortCostRowsByTypeMenu,
  sortCostRowsLikeSharedCatalog,
  toPriceListCostType,
  withDerivedCostApplicable,
  writeSharedCostCatalog,
  type PmCostRow,
} from './pm-cost-catalog'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { readCostPracticeCatalog } from './pm-cost-practice-catalog'
import { costDatabaseMetaCacheKey, mergeCostDatabaseMetadata } from './pm-cost-database-meta-cache'
import { costDatabaseRowsToCatalog, mergeMeteringFetchRows } from './pm-cost-database-rows'
import { cloneCostRows, type CostHistoryStack } from './pm-cost-history'
import {
  COST_SUMMARY_ROWS_META_KEY,
  normalizeCostSummaryRows,
  readCostSummaryRows,
  type CostSummaryRow,
} from './pm-cost-summary'
import type { CostViewFilter } from './ProjectCostMenuBar'
import type { MeteringRollupMode } from './pm-metering-baselines'

function readLoadCostDatabaseConnection(
  workspaceId: string,
  isAllScope: boolean,
  editingProject: { id: string; metadata?: Record<string, unknown> | null } | null,
): ReturnType<typeof readCostDatabaseConnection> {
  const scopeKey = costDatabaseMetaCacheKey({
    workspaceId,
    projectId: isAllScope ? null : editingProject?.id,
  })
  const fallback = isAllScope ? readSharedCostSaveMeta(workspaceId) : editingProject?.metadata
  return readCostDatabaseConnection(mergeCostDatabaseMetadata(fallback, scopeKey))
}

function viewsToQuery(
  connection: CostDatabaseConnection,
  viewKey?: string,
): CostDatabaseViewKey[] {
  if (viewKey && isCostDatabaseViewKey(viewKey)) return [viewKey]
  const mapped = listMappedCostDatabaseViews(connection)
  return mapped.length > 0 ? mapped : ['constructionQuota']
}

async function queryCostDatabaseViews(
  connection: CostDatabaseConnection,
  workspaceId: string,
  persistScopeId: string,
  viewKey?: string,
): Promise<Partial<Record<CostDatabaseViewKey, CostDatabaseImportedRow[]>>> {
  const byView: Partial<Record<CostDatabaseViewKey, CostDatabaseImportedRow[]>> = {}
  const results = await Promise.allSettled(
    viewsToQuery(connection, viewKey).map(async (nextView) => {
      const binding = resolveCostDatabaseViewBinding(connection, nextView)
      const result = await pmApi.queryCostDatabase({
        ...connection,
        tableName: binding.tableName || undefined,
        columnMap: binding.columnMap,
        viewKey: nextView,
        workspaceId,
        scopeId: persistScopeId ? costDatabasePersistScopeId(persistScopeId, nextView) : undefined,
      })
      return { viewKey: nextView, rows: result.rows }
    }),
  )
  const errors: Error[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      byView[result.value.viewKey] = result.value.rows
    } else {
      errors.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
    }
  }
  if (Object.keys(byView).length === 0 && errors[0]) throw errors[0]
  return byView
}

export function useProjectCostTableLoad(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  scopeKey: string
  viewApplicable: string
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
  setStatusFeedback: ReturnType<typeof usePmStatusFeedback>[1]
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workspaceId, isPractice, isAllScope, practiceScopeId, scopeKey, viewApplicable,
    editingProject, dirty,
    setDirty, setRows, rowsRef, cleanFingerprintRef, historyStackRef, historyApplyingRef,
    setHistoryEpoch, setSelectedId, setCheckedIds, setSelectionMode, setContextMenu, setColumnMenu,
    setProjectInfoOpen, setViewFilter, setSectionFilter, setSummaryRows, setMeteringViewActive,
    setMeteringBaselines, setSelectedMeteringBaselineId, setMeteringCaptureBaselineOpen,
    setMeteringEditBaselineOpen, setPendingMeteringDeleteBaseline, setMeteringRollupMode,
    onProjectsChange, setStatusFeedback, t,
  } = args
  const [fetching, setFetching] = useState(false)
  const markCleanCatalog = useCallback((catalog: PmCostRow[]) => {
    cleanFingerprintRef.current = fingerprintCostCatalog(catalog)
    rowsRef.current = catalog
  }, [])

  const applyCatalogRows = useCallback(
    (
      catalog: PmCostRow[],
      options?: { dirty?: boolean; clearHistory?: boolean; skipSetRows?: boolean },
    ) => {
      const next = catalog.map((row) => {
        const type = toPriceListCostType(row.type)
        return type === row.type ? row : { ...row, type }
      })
      rowsRef.current = next
      if (!options?.skipSetRows) {
        setRows(next)
      }
      if (options?.clearHistory) {
        historyStackRef.current.clear()
        setHistoryEpoch((value) => value + 1)
      }
      if (options?.dirty === false) {
        markCleanCatalog(next)
        setDirty(false)
      } else if (options?.dirty === true) {
        setDirty(true)
      } else {
        setDirty(fingerprintCostCatalog(next) !== cleanFingerprintRef.current)
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
      const typed = source.map((row) => ({
        ...row,
        type: toPriceListCostType(row.type),
      }))
      const ordered = sortCostRowsByTypeMenu(typed)
      const coerced = ordered.some((row, index) => row.type !== source[index]?.type)
      const normalized =
        editingProject != null
          ? withDerivedCostApplicable(
              ordered,
              buildBaselinePriceIndex(readSharedCostCatalog(workspaceId).rows),
              editingProject.id,
            )
          : ordered
      applyCatalogRows(normalized, { dirty: coerced, clearHistory: true })
      if (editingProject) {
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
      }
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
    t,
    viewApplicable,
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

  const fetchCostDatabase = useCallback(async (viewKey: CostDatabaseViewKey = 'constructionQuota') => {
    if (fetching) return
    const persistScopeId = isAllScope ? 'all' : (editingProject?.id ?? '')
    const connection = readLoadCostDatabaseConnection(workspaceId, isAllScope, editingProject)
    if (!isCostDatabaseConnectionReady(connection)) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.fetchNeedConnection'),
      })
      return
    }
    setFetching(true)
    try {
      const byView = await queryCostDatabaseViews(
        connection,
        workspaceId,
        persistScopeId,
        viewKey,
      )
      const imported = byView[viewKey] ?? []
      const catalog = costDatabaseRowsToCatalog(
        imported,
        viewApplicable,
        viewKey === 'budgetQuota' ? 'budgetQuota' : 'comprehensive',
      )
      if (catalog.length === 0) {
        setStatusFeedback({
          tone: 'success',
          text: t('projectManagerPage.costTable.fetchSuccess', { count: '0' }),
        })
        return
      }
      const next =
        viewKey === 'budgetQuota'
          ? mergeMeteringFetchRows(rowsRef.current, catalog)
          : sortCostRowsByTypeMenu(catalog)
      applyCatalogRows(next, { dirty: true, clearHistory: true })
      if (viewKey === 'budgetQuota') {
        setMeteringViewActive(true)
        if (isPractice) setViewFilter('all')
      }
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.fetchSuccess', { count: String(catalog.length) }),
      })
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
    } catch (error) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.fetchFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      })
    } finally {
      setFetching(false)
    }
  }, [
    applyCatalogRows,
    editingProject,
    fetching,
    isAllScope,
    isPractice,
    setMeteringViewActive,
    setStatusFeedback,
    setViewFilter,
    t,
    viewApplicable,
    workspaceId,
  ])

  return { markCleanCatalog, applyCatalogRows, updateRows, fetchCostDatabase, fetching }
}
