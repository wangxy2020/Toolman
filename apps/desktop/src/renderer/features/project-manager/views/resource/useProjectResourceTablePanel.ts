import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { PmProject } from '@toolman/shared'
import {
  buildMetadataForResourceVersionSwitch,
  buildResourceSaveMetadata,
  IpcChannel,
  PM_RESOURCE_CONTENT_FINGERPRINT_KEY,
  readMaxResourceVersion,
  readResourceSaveHistory,
  readResourceVersion,
  readResourceVersionCatalog,
} from '@toolman/shared'

import { computeHScrollMetrics, formatPathProjectLabel, scrollLeftFromThumbOffset } from '../../pm-panel-shared'
import { useI18n } from '../../../../i18n/useI18n'
import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { findDemoteParentId } from '../schedule/pm-gantt-tree'
import type { FeaturesMenuAction, FeaturesVersionSwitchEntry, ResourcePracticeQuotaView } from '../files/ProjectFeaturesMenuBar'
import type { ResourceMenuAction, ResourceVersionSwitchEntry, ResourceViewFilter } from './ProjectResourceMenuBar'
import {
  buildBaselinePriceIndex,
  createEmptyResourceRow,
  deriveResourceApplicable,
  encodeCustomResourceViewFilter,
  ensureDefaultResourcesInCatalog,
  fingerprintResourceCatalog,
  isPmResourceCostType,
  isPmResourceType,
  listCustomResourceTypeNames,
  parseCustomTypeSelectValue,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_CATALOG_KEY,
  readSharedResourceCatalog,
  readSharedResourceSaveHistory,
  readSharedResourceSaveMeta,
  readSharedResourceVersion,
  recordSharedResourceSaveMeta,
  reindexResourceRows,
  resolveProjectResourceCatalog,
  resourceRowMatchesViewFilter,
  sortResourceRowsByTypeMenu,
  sortResourceRowsLikeSharedCatalog,
  resourceRowDepth,
  toResourceCatalogSnapshot,
  withDerivedResourceApplicable,
  writeSharedResourceCatalog,
  writeSharedResourceSaveMeta,
  hydrateSharedResourceCatalogFromMain,
  normalizeResourceCatalogRows,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'
import {
  readPracticeCatalog,
  readPracticeSaveHistory,
  readPracticeSaveMeta,
  readPracticeVersion,
  recordPracticeSaveMeta,
  writePracticeCatalog,
  writePracticeSaveMeta,
} from './pm-resource-practice-catalog'
import {
  addCustomTypeNameToCatalog,
  readCustomTypeNameCatalog,
  removeCustomTypeNameFromCatalog,
} from './pm-resource-custom-types'
import {
  RESOURCE_TOGGLE_COLUMNS,
  loadResourceColumnVisibility,
  saveResourceColumnVisibility,
  type ResourceColumnVisibility,
  type ResourceToggleColumn,
} from './pm-resource-column-prefs'
import { cloneResourceRows, ResourceHistoryStack } from './pm-resource-history'
import {
  clampRenderedMenuToViewport,
  computeColumnMenuPosition,
  computeResourceBaselineDisplay,
  computeRowContextMenuPosition,
  expandDeleteIds,
  resolveAddType,
  resolvePracticeQuotaView,
  snapshotToRows,
  typeSelectValueForRow,
  type ResourceBaselineDisplay,
} from './pm-resource-panel-utils'

export interface UseProjectResourceTablePanelProps {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  variant?: 'catalog' | 'practice'
}

type ResourceContextMenuState = {
  left: number
  top: number
  /** Row under the cursor — menu target when nothing is multi-selected. */
  rowId: string
}

type ResourceColumnMenuState = { left: number; top: number }

export function useProjectResourceTablePanel({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
}: UseProjectResourceTablePanelProps) {
  const { t } = useI18n()
  const isPractice = variant === 'practice'

  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const viewApplicable = isAllScope
    ? PM_RESOURCE_APPLICABLE_ALL
    : (editingProject?.id ?? PM_RESOURCE_APPLICABLE_ALL)

  const practiceScopeId = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? '')

  const canEdit = isAllScope || editingProject != null

  const [viewFilter, setViewFilter] = useState<ResourceViewFilter>(
    variant === 'practice' ? 'labor' : 'all',
  )
  const [rows, setRows] = useState<PmResourceRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ResourceContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<ResourceColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState<ResourceColumnVisibility>(() =>
    loadResourceColumnVisibility(),
  )
  const [customTypeCatalog, setCustomTypeCatalog] = useState<string[]>(() =>
    readCustomTypeNameCatalog(workspaceId),
  )
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [pendingDeleteCustomTypeName, setPendingDeleteCustomTypeName] = useState<string | null>(
    null,
  )
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new ResourceHistoryStack())
  const historyApplyingRef = useRef(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<PmResourceRow[]>([])
  const cleanFingerprintRef = useRef('')
  // Keep ref aligned with React state so leave-save / undo never read a stale snapshot.
  rowsRef.current = rows
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const headerPinInnerRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)
  const [hScrollMetrics, setHScrollMetrics] = useState({
    overflowing: false,
    thumbSize: 0,
    thumbOffset: 0,
  })
  const [hScrollDragging, setHScrollDragging] = useState(false)

  const syncHeaderPinScroll = useCallback(() => {
    const el = tableScrollRef.current
    const pin = headerPinInnerRef.current
    if (!el || !pin) return
    pin.style.transform = `translateX(${-el.scrollLeft}px)`
  }, [])

  const syncHScrollMetrics = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) return
    syncHeaderPinScroll()
    const { overflowing, thumbSize, thumbOffset } = computeHScrollMetrics(el, el.clientWidth, 28)
    setHScrollMetrics({ overflowing, thumbSize, thumbOffset })
  }, [syncHeaderPinScroll])

  useLayoutEffect(() => {
    syncHScrollMetrics()
    const el = tableScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => syncHScrollMetrics())
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', syncHScrollMetrics)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncHScrollMetrics)
    }
  }, [rows.length, syncHScrollMetrics, selectionMode])

  const scrollToThumbOffset = useCallback((nextOffsetRatio: number) => {
    const el = tableScrollRef.current
    if (!el) return
    if (el.scrollWidth - el.clientWidth <= 0) return
    const thumbSizeRatio = Math.min(1, el.clientWidth / el.scrollWidth)
    el.scrollLeft = scrollLeftFromThumbOffset(
      { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, thumbSize: thumbSizeRatio },
      1,
      nextOffsetRatio,
    )
  }, [])

  const onHTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const track = hTrackRef.current
      const el = tableScrollRef.current
      if (!track || !el) return
      event.preventDefault()
      setHScrollDragging(true)
      const trackRect = track.getBoundingClientRect()
      const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
      const pointerRatio = (event.clientX - trackRect.left) / trackRect.width
      scrollToThumbOffset(pointerRatio - thumbSize / 2)

      const onMove = (moveEvent: PointerEvent) => {
        const ratio = (moveEvent.clientX - trackRect.left) / trackRect.width
        scrollToThumbOffset(ratio - thumbSize / 2)
        syncHScrollMetrics()
      }
      const onUp = () => {
        setHScrollDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [scrollToThumbOffset, syncHScrollMetrics],
  )

  const scopeKey = isAllScope ? PM_RESOURCE_APPLICABLE_ALL : (editingProject?.id ?? '')

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

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo

  const versionSwitchEntries = useMemo((): ResourceVersionSwitchEntry[] => {
    if (isPractice) {
      if (!practiceScopeId) return []
      const history = readPracticeSaveHistory(workspaceId, practiceScopeId)
      const currentVersion = readPracticeVersion(workspaceId, practiceScopeId)
      return history.map((entry) => ({
        version: entry.version,
        name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
          version: String(entry.version),
        }),
        hasSnapshot: Array.isArray(entry.catalog),
        isCurrent: entry.version === currentVersion,
      }))
    }
    const history = isAllScope
      ? readSharedResourceSaveHistory(workspaceId)
      : readResourceSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedResourceVersion(workspaceId)
      : readResourceVersion(editingProject?.metadata)
    return history.map((entry) => ({
      version: entry.version,
      name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
        version: String(entry.version),
      }),
      hasSnapshot: Array.isArray(entry.catalog),
      isCurrent: entry.version === currentVersion,
    }))
  }, [
    dirty,
    editingProject?.metadata,
    isAllScope,
    isPractice,
    practiceScopeId,
    rows,
    t,
    workspaceId,
  ])

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

  const handleUndo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canUndo) return
    const current = cloneResourceRows(rowsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneResourceRows(previous))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  const handleRedo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canRedo) return
    const current = cloneResourceRows(rowsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneResourceRows(next))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDelete || pendingDeleteCustomTypeName || pendingRestoreVersion != null) return
      if (isPmEditableEventTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRedo, handleUndo, pendingDelete, pendingDeleteCustomTypeName, pendingRestoreVersion, projectInfoOpen])

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmResourceRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readResourceVersion(project.metadata)
      const metadata = {
        ...buildResourceSaveMetadata(project.metadata ?? {}, {
          resourceCount: catalog.length,
          contentFingerprint: fingerprintResourceCatalog(catalog),
          catalog: toResourceCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_RESOURCE_CATALOG_KEY]: catalog,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readResourceVersion(metadata),
      }
    },
    [],
  )

  // Projects without a saved catalog use「全部项目」live — do not auto-seed copies.

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.resourceTable.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        if (isPractice) {
          if (!practiceScopeId) {
            window.alert(t('projectManagerPage.resourceTable.needProject'))
            return false
          }
          const payload = sortResourceRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: viewApplicable,
            })),
          )
          const prevVersion = readPracticeVersion(workspaceId, practiceScopeId)
          writePracticeCatalog(workspaceId, practiceScopeId, payload)
          recordPracticeSaveMeta(workspaceId, practiceScopeId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          const nextVersion = readPracticeVersion(workspaceId, practiceScopeId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccess'),
            })
          }
          return true
        }
        if (isAllScope) {
          const payload = sortResourceRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: PM_RESOURCE_APPLICABLE_ALL,
            })),
          )
          const prevVersion = readSharedResourceVersion(workspaceId)
          await writeSharedResourceCatalog(workspaceId, payload)
          recordSharedResourceSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedResourceVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.resourceTable.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.resourceTable.needProject'))
          return false
        }

        const sharedRows = readSharedResourceCatalog(workspaceId).rows
        const baseline = buildBaselinePriceIndex(sharedRows)
        const payload = sortResourceRowsLikeSharedCatalog(
          withDerivedResourceApplicable(
            rows.map((row) => ({ ...row })),
            baseline,
            editingProject.id,
          ),
          sharedRows,
        )

        // Project save does not sync into「全部项目」shared catalog.
        const { prevVersion, nextVersion } = await persistProjectCatalog(
          editingProject,
          payload,
          { bumpVersion: asNewVersion, note },
        )
        applyCatalogRows(payload, { dirty: false })
        await onProjectsChange?.()
        if (nextVersion > prevVersion) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.resourceTable.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.resourceTable.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.resourceTable.saveSuccess'),
          })
        }
        return true
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setSaving(false)
      }
    },
    [
      applyCatalogRows,
      canEdit,
      editingProject,
      isAllScope,
      isPractice,
      onProjectsChange,
      persistProjectCatalog,
      practiceScopeId,
      rows,
      setStatusFeedback,
      t,
      viewApplicable,
      workspaceId,
    ],
  )

  const flushAutoSave = useCallback(async () => {
    if (!canEdit) return
    const catalog = rowsRef.current
    try {
      if (isPractice) {
        if (!practiceScopeId) return
        const payload = sortResourceRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: viewApplicable,
          })),
        )
        writePracticeCatalog(workspaceId, practiceScopeId, payload)
        recordPracticeSaveMeta(workspaceId, practiceScopeId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
        return
      }
      if (isAllScope) {
        const payload = sortResourceRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: PM_RESOURCE_APPLICABLE_ALL,
          })),
        )
        writeSharedResourceCatalog(workspaceId, payload)
        recordSharedResourceSaveMeta(workspaceId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
        return
      }
      if (!editingProject) return
      const sharedRows = readSharedResourceCatalog(workspaceId).rows
      const baseline = buildBaselinePriceIndex(sharedRows)
      const payload = sortResourceRowsLikeSharedCatalog(
        withDerivedResourceApplicable(
          catalog.map((row) => ({ ...row })),
          baseline,
          editingProject.id,
        ),
        sharedRows,
      )
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      cleanFingerprintRef.current = fingerprintResourceCatalog(payload)
    } catch {
      // Best-effort leave save.
    }
  }, [
    canEdit,
    editingProject,
    isAllScope,
    isPractice,
    persistProjectCatalog,
    practiceScopeId,
    viewApplicable,
    workspaceId,
  ])

  usePmCatalogAutoSave({ scopeKey, dirty, flush: flushAutoSave })

  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.resourceTable.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.resourceTable.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const next = createEmptyResourceRow(
        prev.length,
        addType,
        null,
        viewApplicable,
        addCustomTypeName,
      )
      setSelectedId(next.id)
      return [...prev, next]
    })
  }, [addCustomTypeName, addType, canEdit, updateRows, viewApplicable])

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const next = createEmptyResourceRow(
        index,
        addType,
        parentId,
        viewApplicable,
        addCustomTypeName,
      )
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [addCustomTypeName, addType, canEdit, selectedId, updateRows, viewApplicable])

  const deleteIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
      updateRows((prev) => {
        const remove = expandDeleteIds(prev, ids)
        const next = prev.filter((row) => !remove.has(row.id))
        setSelectedId((current) => (current && remove.has(current) ? null : current))
        setCheckedIds(new Set())
        setSelectionMode(false)
        return next
      })
    },
    [updateRows],
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
        depth: resourceRowDepth(row, byIdMap),
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

  const handleTypeChange = useCallback(
    (type: PmResourceType, customTypeName?: string) => {
      if (!selectedId) return
      updateRows((prev) =>
        prev.map((row) =>
          row.id === selectedId
            ? {
                ...row,
                type,
                customTypeName: type === 'custom' ? (customTypeName ?? row.customTypeName) : '',
              }
            : row,
        ),
      )
    },
    [selectedId, updateRows],
  )

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isPractice) {
        if (!practiceScopeId) return
        const meta = readPracticeSaveMeta(workspaceId, practiceScopeId)
        const catalog = readResourceVersionCatalog(meta, version)
        const nextMeta = buildMetadataForResourceVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
        writePracticeCatalog(workspaceId, practiceScopeId, rowsNext)
        writePracticeSaveMeta(workspaceId, practiceScopeId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        window.alert(
          t('projectManagerPage.resourceTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (isAllScope) {
        const meta = readSharedResourceSaveMeta(workspaceId)
        const catalog = readResourceVersionCatalog(meta, version)
        const nextMeta = buildMetadataForResourceVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
        writeSharedResourceCatalog(workspaceId, rowsNext)
        writeSharedResourceSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.resourceTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readResourceVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForResourceVersionSwitch(
        editingProject.metadata,
        version,
      )
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.resourceTable.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog, isPractice))
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_RESOURCE_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.resourceTable.restoreVersionSuccess', {
          name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
            version: String(version),
          }),
        }),
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    applyCatalogRows,
    editingProject,
    isAllScope,
    isPractice,
    onProjectsChange,
    pendingRestoreVersion,
    practiceScopeId,
    t,
    workspaceId,
  ])

  const handleRestoreVersion = useCallback(
    (version: number) => {
      const currentVersion = isPractice
        ? practiceScopeId
          ? readPracticeVersion(workspaceId, practiceScopeId)
          : 0
        : isAllScope
          ? readSharedResourceVersion(workspaceId)
          : readResourceVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId],
  )

  const handleMenuAction = useCallback(
    (action: ResourceMenuAction) => {
      switch (action) {
        case 'save':
          void handleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          setProjectInfoOpen(true)
          break
        case 'undo':
          handleUndo()
          break
        case 'redo':
          handleRedo()
          break
        case 'add':
          handleAdd()
          break
        case 'insert':
          handleInsert()
          break
        case 'delete':
          handleDelete()
          break
        case 'indent':
          handleIndent()
          break
        case 'outdent':
          handleOutdent()
          break
        case 'moveUp':
          handleMove(-1)
          break
        case 'moveDown':
          handleMove(1)
          break
      }
    },
    [
      handleAdd,
      handleDelete,
      handleIndent,
      handleInsert,
      handleMove,
      handleOutdent,
      handlePrint,
      handleRedo,
      handleSave,
      handleUndo,
    ],
  )

  const handleFeaturesMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
      switch (action) {
        case 'save':
        case 'saveAsNewVersion':
        case 'print':
        case 'projectInfo':
        case 'undo':
        case 'redo':
        case 'add':
        case 'insert':
        case 'delete':
        case 'indent':
        case 'outdent':
        case 'moveUp':
        case 'moveDown':
          handleMenuAction(action)
          break
        default:
          break
      }
    },
    [handleMenuAction],
  )

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

  const practiceVersionEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    return versionSwitchEntries.map((entry) => ({
      version: entry.version,
      name: entry.name,
      hasSnapshot: entry.hasSnapshot,
      isCurrent: entry.isCurrent,
    }))
  }, [versionSwitchEntries])

  const patchRow = useCallback(
    (id: string, patch: Partial<PmResourceRow>) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        { coalesceMs: 500 },
      )
    },
    [updateRows],
  )

  const applyTypeToRow = useCallback(
    (rowId: string, type: PmResourceType, customTypeName = '') => {
      const row = rowsRef.current.find((entry) => entry.id === rowId)
      if (!row) return
      const nextCustomName = type === 'custom' ? customTypeName.trim() : ''
      const applicable =
        editingProject != null
          ? deriveResourceApplicable(
              { ...row, type, customTypeName: nextCustomName },
              baselinePriceIndex,
              editingProject.id,
            )
          : row.applicable
      patchRow(rowId, { type, customTypeName: nextCustomName, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleTypeSelectChange = useCallback(
    (rowId: string, value: string) => {
      const custom = parseCustomTypeSelectValue(value)
      if (custom) {
        applyTypeToRow(rowId, 'custom', custom.kind === 'named' ? custom.name : '')
        return
      }
      if (!isPmResourceType(value) || isPmResourceCostType(value)) return
      applyTypeToRow(rowId, value)
    },
    [applyTypeToRow],
  )

  const handleRowNameChange = useCallback(
    (row: PmResourceRow, name: string) => {
      const applicable =
        editingProject != null
          ? deriveResourceApplicable({ ...row, name }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { name, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleRowSpecChange = useCallback(
    (rowId: string, spec: string) => {
      patchRow(rowId, { spec })
    },
    [patchRow],
  )

  const handleRowUnitChange = useCallback(
    (row: PmResourceRow, unit: string) => {
      if (isPractice) {
        patchRow(row.id, { unit })
        return
      }
      const pricingInSync = row.pricingUnit.trim() === '' || row.pricingUnit === row.unit
      patchRow(row.id, {
        unit,
        ...(pricingInSync ? { pricingUnit: unit } : {}),
      })
    },
    [isPractice, patchRow],
  )

  const handleRowPricingUnitTextChange = useCallback(
    (rowId: string, pricingUnit: string) => {
      patchRow(rowId, { pricingUnit })
    },
    [patchRow],
  )

  const handleRowPricingUnitCommit = useCallback(
    (rowId: string, next: number | null) => {
      patchRow(rowId, { pricingUnit: next == null ? '' : String(next) })
    },
    [patchRow],
  )

  const handleRowUnitPriceCommit = useCallback(
    (row: PmResourceRow, unitPrice: number | null) => {
      const applicable =
        editingProject != null
          ? deriveResourceApplicable({ ...row, unitPrice }, baselinePriceIndex, editingProject.id)
          : row.applicable
      patchRow(row.id, { unitPrice, applicable })
    },
    [baselinePriceIndex, editingProject, patchRow],
  )

  const handleRowNoteChange = useCallback(
    (rowId: string, note: string) => {
      patchRow(rowId, { note })
    },
    [patchRow],
  )

  const handleRowCheckedChange = useCallback((rowId: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }, [])

  const getRowBaselineDisplay = useCallback(
    (row: PmResourceRow): ResourceBaselineDisplay =>
      computeResourceBaselineDisplay(row, baselinePriceIndex, isAllScope),
    [baselinePriceIndex, isAllScope],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, rowId: string) => {
      if (isPmEditableEventTarget(event.target)) return
      event.preventDefault()
      setColumnMenu(null)
      // Right-click opens the menu only — do not enter selection mode or check the row.
      const { left, top } = computeRowContextMenuPosition(event.clientX, event.clientY, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
      setContextMenu({ left, top, rowId })
    },
    [],
  )

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    const { left, top } = computeColumnMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setColumnMenu({ left, top })
  }, [])

  const toggleColumnVisibility = useCallback((column: ResourceToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveResourceColumnVisibility(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!columnMenu) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.tm-pm-gantt-col-menu')) return
      setColumnMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [columnMenu])

  useLayoutEffect(() => {
    if (!contextMenu) return
    const menu = contextMenuRef.current
    if (!menu) return
    const { left, top } = clampRenderedMenuToViewport(
      { left: contextMenu.left, top: contextMenu.top, width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    if (Math.abs(left - contextMenu.left) > 0.5 || Math.abs(top - contextMenu.top) > 0.5) {
      setContextMenu((current) => (current ? { ...current, left, top } : current))
    }
  }, [contextMenu?.rowId, contextMenu?.left, contextMenu?.top])

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const handleEnterSelectionMode = useCallback(() => {
    setSelectionMode(true)
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const contextMenuDeleteIds = checkedIds

  const getSaveAsNewVersionInfo = useCallback((): { currentVersion: number; nextVersion: number } => {
    if (isPractice) {
      const currentVersion = practiceScopeId ? readPracticeVersion(workspaceId, practiceScopeId) : 0
      const maxVersion = practiceScopeId
        ? readMaxResourceVersion(readPracticeSaveMeta(workspaceId, practiceScopeId))
        : 0
      return { currentVersion, nextVersion: maxVersion + 1 }
    }
    if (isAllScope) {
      return {
        currentVersion: readSharedResourceVersion(workspaceId),
        nextVersion: readMaxResourceVersion(readSharedResourceSaveMeta(workspaceId)) + 1,
      }
    }
    return {
      currentVersion: readResourceVersion(editingProject?.metadata),
      nextVersion: readMaxResourceVersion(editingProject?.metadata) + 1,
    }
  }, [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId])

  return {
    t,
    isPractice,
    isAllScope,
    editingProject,
    canEdit,
    workspaceId,
    practiceScopeId,

    viewFilter,
    rows,
    dirty,
    selectedId,
    setSelectedId,
    checkedIds,
    selectionMode,
    contextMenu,
    contextMenuRef,
    columnMenu,
    columnVisibility,
    pendingDelete,
    setPendingDelete,
    pendingDeleteCustomTypeName,
    setPendingDeleteCustomTypeName,
    saving,
    projectInfoOpen,
    setProjectInfoOpen,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    statusFeedback,
    panelRootRef,
    tableScrollRef,
    headerPinInnerRef,
    hTrackRef,
    hScrollMetrics,
    hScrollDragging,
    syncHScrollMetrics,
    onHTrackPointerDown,

    canUndo,
    canRedo,
    versionSwitchEntries,
    practiceVersionEntries,
    byId,
    selectedRow,
    selectedType,
    selectedCustomTypeName,
    customTypeNames,
    visibleRows,

    handleViewFilterChange,
    handleRegisterCustomTypeName,
    handleRequestDeleteCustomTypeName,
    handleConfirmDeleteCustomTypeName,
    handleUndo,
    handleRedo,
    handleSave,
    handlePrint,
    handleAdd,
    handleInsert,
    handleDelete,
    deleteIds,
    handleIndent,
    handleOutdent,
    handleMove,
    handleTypeChange,
    handleConfirmRestoreVersion,
    handleRestoreVersion,
    handleMenuAction,
    handleFeaturesMenuAction,
    practiceQuotaView,
    handleQuotaViewChange,
    practiceColumnLabel,

    patchRow,
    typeSelectValueForRow,
    handleTypeSelectChange,
    handleRowNameChange,
    handleRowSpecChange,
    handleRowUnitChange,
    handleRowPricingUnitTextChange,
    handleRowPricingUnitCommit,
    handleRowUnitPriceCommit,
    handleRowNoteChange,
    handleRowCheckedChange,
    getRowBaselineDisplay,

    handleRowContextMenu,
    openColumnVisibilityMenu,
    toggleColumnVisibility,
    handleSelectAll,
    handleClearSelection,
    handleEnterSelectionMode,
    handleCloseContextMenu,
    contextMenuDeleteIds,
    getSaveAsNewVersionInfo,

    RESOURCE_TOGGLE_COLUMNS,
  }
}

/** Shared bag of state/handlers threaded into the presentational sub-components. */
export type ProjectResourceTablePanelState = ReturnType<typeof useProjectResourceTablePanel>
