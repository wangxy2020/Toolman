import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { PmProject } from '@toolman/shared'
import { PM_RESOURCE_CONTENT_FINGERPRINT_KEY } from '@toolman/shared'
import { pmApi } from '../../pm-api'
import {
  PM_RESOURCE_CATALOG_KEY,
  buildBaselinePriceIndex,
  ensureDefaultResourcesInCatalog,
  fingerprintResourceCatalog,
  hydrateSharedResourceCatalogFromMain,
  normalizeResourceCatalogRows,
  readSharedResourceCatalog,
  reindexResourceRows,
  resolveProjectResourceCatalog,
  sortResourceRowsByTypeMenu,
  sortResourceRowsLikeSharedCatalog,
  withDerivedResourceApplicable,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from './pm-resource-catalog'
import { readPracticeCatalog } from './pm-resource-practice-catalog'
import { cloneResourceRows, type ResourceHistoryStack } from './pm-resource-history'
import type { ResourceViewFilter } from './ProjectResourceMenuBar'

export function useProjectResourceTableLoad(args: {
  workspaceId: string
  isPractice: boolean
  isAllScope: boolean
  practiceScopeId: string
  scopeKey: string
  editingProject: PmProject | null
  dirty: boolean
  setDirty: Dispatch<SetStateAction<boolean>>
  setRows: Dispatch<SetStateAction<PmResourceRow[]>>
  rowsRef: MutableRefObject<PmResourceRow[]>
  cleanFingerprintRef: MutableRefObject<string>
  historyStackRef: MutableRefObject<ResourceHistoryStack>
  historyApplyingRef: MutableRefObject<boolean>
  setHistoryEpoch: Dispatch<SetStateAction<number>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setCheckedIds: Dispatch<SetStateAction<Set<string>>>
  setSelectionMode: Dispatch<SetStateAction<boolean>>
  setContextMenu: Dispatch<SetStateAction<{ left: number; top: number; rowId: string } | null>>
  setProjectInfoOpen: Dispatch<SetStateAction<boolean>>
  setPendingRestoreVersion: Dispatch<SetStateAction<number | null>>
  setViewFilter: Dispatch<SetStateAction<ResourceViewFilter>>
  onProjectsChange?: () => void | Promise<void>
}) {
  const {
    workspaceId, isPractice, isAllScope, practiceScopeId, scopeKey, editingProject, dirty,
    setDirty, setRows, rowsRef, cleanFingerprintRef, historyStackRef, historyApplyingRef,
    setHistoryEpoch, setSelectedId, setCheckedIds, setSelectionMode, setContextMenu,
    setProjectInfoOpen, setPendingRestoreVersion, setViewFilter, onProjectsChange,
  } = args

  const markCleanCatalog = useCallback((catalog: PmResourceRow[]) => {
    cleanFingerprintRef.current = fingerprintResourceCatalog(catalog)
    rowsRef.current = catalog
  }, [])

  const applyCatalogRows = useCallback(
    (catalog: PmResourceRow[], options?: { dirty?: boolean; clearHistory?: boolean }) => {
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
        setDirty(fingerprintResourceCatalog(catalog) !== cleanFingerprintRef.current)
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
    setProjectInfoOpen(false)
    setPendingRestoreVersion(null)
    setViewFilter(isPractice ? 'labor' : 'all')
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
    cleanFingerprintRef.current = ''
    rowsRef.current = []
    setRows([])
  }, [isPractice, scopeKey])

  useEffect(() => {
    if (dirty) return

    if (isPractice) {
      if (!practiceScopeId) {
        applyCatalogRows([], { dirty: false, clearHistory: true })
        return
      }
      const ordered = readPracticeCatalog(workspaceId, practiceScopeId).map((row) => {
        const pricing = row.pricingUnit.trim()
        // 时间定额为数字；清除「工日」等历史文本默认填充。
        if (pricing === '' || Number.isFinite(Number(pricing))) return row
        return { ...row, pricingUnit: '' }
      })
      applyCatalogRows(ordered, { dirty: false, clearHistory: true })
      return
    }

    if (isAllScope) {
      let cancelled = false
      void hydrateSharedResourceCatalogFromMain(workspaceId).then((hydrated) => {
        if (cancelled) return
        const ensured = ensureDefaultResourcesInCatalog(hydrated)
        const normalized = normalizeResourceCatalogRows(ensured.rows)
        const ordered = sortResourceRowsByTypeMenu(normalized.rows)
        const orderedFp = fingerprintResourceCatalog(ordered)
        const cleanFp = cleanFingerprintRef.current
        const currentFp = fingerprintResourceCatalog(rowsRef.current)
        // After a local save, props/main may still be stale — do not clobber newer in-memory rows.
        if (cleanFp && currentFp === cleanFp && orderedFp !== cleanFp) {
          writeSharedResourceCatalog(workspaceId, rowsRef.current)
          return
        }
        applyCatalogRows(ordered, { dirty: false, clearHistory: true })
        const orderChanged = ordered.some(
          (row, index) => row.id !== normalized.rows[index]?.id,
        )
        if (ensured.changed || normalized.changed || orderChanged) {
          writeSharedResourceCatalog(workspaceId, ordered)
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

    const sharedRows = readSharedResourceCatalog(workspaceId).rows
    const resolved = resolveProjectResourceCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
      { projectCode: editingProject.code },
    )
    const baseline = buildBaselinePriceIndex(sharedRows)
    const normalized = withDerivedResourceApplicable(
      resolved.rows,
      baseline,
      editingProject.id,
    )
    const ordered = sortResourceRowsLikeSharedCatalog(normalized, sharedRows)
    const orderedFp = fingerprintResourceCatalog(ordered)
    const cleanFp = cleanFingerprintRef.current
    const currentFp = fingerprintResourceCatalog(rowsRef.current)
    if (cleanFp && currentFp === cleanFp && orderedFp !== cleanFp) {
      return
    }
    applyCatalogRows(ordered, { dirty: false, clearHistory: true })
    // Never auto-write a project catalog for shared-fallback projects.
    if (resolved.usesSharedFallback) return
    const applicableChanged = ordered.some(
      (row, index) => row.applicable !== resolved.rows[index]?.applicable,
    )
    const orderChanged = ordered.some((row, index) => row.id !== resolved.rows[index]?.id)
    if (resolved.needsPersist || applicableChanged || orderChanged) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: {
            [PM_RESOURCE_CATALOG_KEY]: ordered,
            // Keep save fingerprint aligned with normalized rows (no version bump).
            [PM_RESOURCE_CONTENT_FINGERPRINT_KEY]: orderedFp,
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
    workspaceId,
  ])
  const updateRows = useCallback(
    (
      updater: (prev: PmResourceRow[]) => PmResourceRow[],
      options?: { coalesceMs?: number },
    ) => {
      let changed = false
      let pushedHistory = false
      setRows((statePrev) => {
        // Always derive from React state inside the updater. Preferring rowsRef here
        // breaks under Strict Mode double-invoke (edits/deletes appear to "snap back").
        const next = reindexResourceRows(updater(statePrev))
        if (fingerprintResourceCatalog(next) === fingerprintResourceCatalog(statePrev)) {
          return statePrev
        }
        changed = true
        if (!historyApplyingRef.current) {
          historyStackRef.current.pushBeforeChange(cloneResourceRows(statePrev), {
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
