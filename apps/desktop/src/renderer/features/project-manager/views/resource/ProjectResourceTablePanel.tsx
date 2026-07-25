import type { FC, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import { useI18n } from '../../../../i18n/useI18n'
import { PmDecimalTableInput } from '../../PmDecimalTableInput'
import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { handlePmTableCellNavKeyDown } from '../../pm-table-cell-nav'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import {
  ProjectFeaturesMenuBar,
  type FeaturesMenuAction,
  type FeaturesVersionSwitchEntry,
  type ResourcePracticeQuotaView,
} from '../files/ProjectFeaturesMenuBar'
import {
  ProjectResourceMenuBar,
  type ResourceMenuAction,
  type ResourceVersionSwitchEntry,
  type ResourceViewFilter,
} from './ProjectResourceMenuBar'
import {
  buildBaselinePriceIndex,
  computeResourceBaselineRatio,
  createEmptyResourceRow,
  deriveResourceApplicable,
  encodeCustomResourceViewFilter,
  ensureDefaultResourcesInCatalog,
  fingerprintResourceCatalog,
  formatResourceBaselineRatio,
  encodeCustomTypeSelectValue,
  isPmResourceCostType,
  isPmResourceType,
  isResourceBaselineRatioOff,
  listCustomResourceTypeNames,
  lookupBaselineUnitPrice,
  parseCustomResourceViewFilter,
  parseCustomTypeSelectValue,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_BUILTIN_PRIMARY_TYPES,
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

interface Props {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  /**
   * `catalog` = 资源列表；`practice` = 资源管理-实务（空表起步，独立存储，实务精简菜单）。
   */
  variant?: 'catalog' | 'practice'
  onOpenScheduleView?: (view: import('../files/ProjectFeaturesMenuBar').FeaturesScheduleView) => void
}

type ContextMenuState = {
  left: number
  top: number
  /** Row under the cursor — menu target when nothing is multi-selected. */
  rowId: string
}

type ColumnMenuState = { left: number; top: number }

function formatPathProjectLabel(project: PmProject): string {
  const code = project.code.trim()
  const name = project.name.trim()
  if (code && name) return `${code} · ${name}`
  return code || name || project.id
}

const ProjectResourceTablePanel: FC<Props> = ({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
  onOpenScheduleView: _onOpenScheduleView,
}) => {
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null)
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
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 1) {
      setHScrollMetrics({ overflowing: false, thumbSize: 0, thumbOffset: 0 })
      return
    }
    const thumbSize = Math.max(28, (clientWidth / scrollWidth) * clientWidth)
    const maxOffset = Math.max(0, clientWidth - thumbSize)
    const maxScroll = scrollWidth - clientWidth
    const thumbOffset = maxScroll <= 0 ? 0 : (scrollLeft / maxScroll) * maxOffset
    setHScrollMetrics({ overflowing: true, thumbSize, thumbOffset })
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
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
    const travel = 1 - thumbSize
    const clamped = Math.max(0, Math.min(travel, nextOffsetRatio))
    el.scrollLeft = travel <= 0 ? 0 : (clamped / travel) * maxScroll
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
  const viewCustomName = parseCustomResourceViewFilter(viewFilter)
  const addType: PmResourceType =
    viewFilter === 'all'
      ? selectedType
      : viewCustomName != null
        ? 'custom'
        : isPmResourceType(viewFilter)
          ? viewFilter
          : selectedType
  const addCustomTypeName =
    viewCustomName != null
      ? viewCustomName
      : addType === 'custom'
        ? selectedCustomTypeName
        : ''

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
        const remove = new Set(ids)
        // Also remove descendants whose parent chain is deleted.
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
      const previous = prev[index - 1]
      if (!previous) return prev
      return prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, parentId: previous.id } : row,
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

  const snapshotToRows = useCallback((snapshot: NonNullable<ReturnType<typeof readResourceVersionCatalog>>): PmResourceRow[] => {
    return snapshot
      .filter((row) => isPmResourceType(row.type))
      .map((row) => {
        const rawPricing = row.pricingUnit?.trim() ?? ''
        const pricingUnit = isPractice
          ? rawPricing !== '' && Number.isFinite(Number(rawPricing))
            ? rawPricing
            : ''
          : rawPricing
            ? rawPricing
            : row.unit
        return {
          id: row.id,
          type: row.type as PmResourceType,
          customTypeName: row.customTypeName ?? '',
          name: row.name,
          spec: row.spec ?? '',
          unit: row.unit,
          pricingUnit,
          unitPrice: row.unitPrice,
          applicable: row.applicable,
          note: row.note ?? '',
          sortOrder: row.sortOrder,
          parentId: row.parentId,
        }
      })
  }, [isPractice])

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
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog))
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
        const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog))
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
      const rowsNext = sortResourceRowsByTypeMenu(snapshotToRows(catalog))
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
    snapshotToRows,
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

  const practiceQuotaView: ResourcePracticeQuotaView =
    viewFilter === 'material' || viewFilter === 'equipment' ? viewFilter : 'labor'

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

  const typeSelectValueForRow = useCallback((row: PmResourceRow): string => {
    if (row.type === 'custom') {
      const name = row.customTypeName.trim()
      return name ? encodeCustomTypeSelectValue(name) : 'custom'
    }
    return row.type
  }, [])

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

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, rowId: string) => {
      if (isPmEditableEventTarget(event.target)) return
      event.preventDefault()
      setColumnMenu(null)
      // Right-click opens the menu only — do not enter selection mode or check the row.
      const margin = 8
      const menuWidth = 200
      const menuHeight = 160
      let left = event.clientX
      let top = event.clientY
      if (left + menuWidth > window.innerWidth - margin) {
        left = Math.max(margin, event.clientX - menuWidth)
      }
      if (top + menuHeight > window.innerHeight - margin) {
        top = Math.max(margin, event.clientY - menuHeight)
      }
      setContextMenu({ left, top, rowId })
    },
    [],
  )

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    const menuWidth = 200
    const menuHeight = 280
    const gap = 4
    let left = event.clientX + gap
    let top = event.clientY + gap
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, event.clientX - menuWidth - gap)
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, event.clientY - menuHeight)
    }
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
    const margin = 8
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    let left = contextMenu.left
    let top = contextMenu.top
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, contextMenu.top - height)
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
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

  const contextMenuDeleteIds = checkedIds

  return (
    <div ref={panelRootRef} className="tm-pm-gantt-page tm-pm-resource-table-page">
      {isPractice ? (
        <ProjectFeaturesMenuBar
          disabled={saving}
          hasSelection={selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedType="scheduleAll"
          viewMenuMode="resourceQuota"
          quotaView={practiceQuotaView}
          onQuotaViewChange={handleQuotaViewChange}
          versionSwitchEntries={practiceVersionEntries}
          onRestoreVersion={handleRestoreVersion}
          onAction={handleFeaturesMenuAction}
          showTrailingMenus={false}
        />
      ) : (
        <ProjectResourceMenuBar
          disabled={saving}
          hasSelection={selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          viewFilter={viewFilter}
          onViewFilterChange={handleViewFilterChange}
          customTypeNames={customTypeNames}
          onRegisterCustomTypeName={handleRegisterCustomTypeName}
          onRequestDeleteCustomTypeName={handleRequestDeleteCustomTypeName}
          selectedType={selectedType}
          selectedCustomTypeName={selectedCustomTypeName}
          onTypeChange={handleTypeChange}
          versionSwitchEntries={versionSwitchEntries}
          onRestoreVersion={handleRestoreVersion}
          onAction={handleMenuAction}
        />
      )}

      {!canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.resourceTable.needProject')}</div>
      ) : (
        <div
          className={[
            'tm-pm-resource-table-scroll-wrap',
            hScrollMetrics.overflowing ? 'tm-pm-resource-table-scroll-wrap--h-overflow' : '',
            hScrollDragging ? 'tm-pm-resource-table-scroll-wrap--h-dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="tm-pm-resource-table-header-pin">
            <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
              <div className="tm-pm-resource-table-scroll-inner">
                <table className="tm-pm-resource-table">
                  <colgroup>
                    <col className="tm-pm-resource-table-col-index" />
                    {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
                    {isPractice ? (
                      <>
                        {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                        {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                      </>
                    ) : (
                      <>
                        {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                        {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                      </>
                    )}
                    {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
                    {columnVisibility.pricingUnit ? (
                      <col className="tm-pm-resource-table-col-pricing-unit" />
                    ) : null}
                    {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
                    {columnVisibility.baseline ? (
                      <col className="tm-pm-resource-table-col-baseline" />
                    ) : null}
                    {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
                    <col className="tm-pm-resource-table-col-spacer" />
                  </colgroup>
                  <thead onContextMenu={openColumnVisibilityMenu}>
                    <tr>
                      <th className="tm-pm-resource-table-col-index">
                        {selectionMode ? (
                          <label
                            className="tm-kb-file-card-select"
                            title={t('projectManagerPage.resourceTable.selection.selectAll')}>
                            <input
                              type="checkbox"
                              className="tm-kb-file-card-select-input"
                              checked={
                                visibleRows.length > 0 &&
                                visibleRows.every((row) => checkedIds.has(row.id))
                              }
                              onChange={(event) => {
                                if (event.target.checked) handleSelectAll()
                                else handleClearSelection()
                              }}
                              aria-label={t('projectManagerPage.resourceTable.selection.selectAll')}
                            />
                            <span
                              className={[
                                'tm-kb-file-card-select-box',
                                visibleRows.length > 0 &&
                                visibleRows.every((row) => checkedIds.has(row.id))
                                  ? 'tm-kb-file-card-select-box--checked'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              aria-hidden="true"
                            />
                          </label>
                        ) : (
                          practiceColumnLabel('index')
                        )}
                      </th>
                      {columnVisibility.type ? (
                        <th className="tm-pm-resource-table-col-type">
                          {practiceColumnLabel('type')}
                        </th>
                      ) : null}
                      {isPractice ? (
                        <>
                          {columnVisibility.spec ? (
                            <th className="tm-pm-resource-table-col-spec">
                              {practiceColumnLabel('spec')}
                            </th>
                          ) : null}
                          {columnVisibility.name ? (
                            <th className="tm-pm-resource-table-col-name">
                              {practiceColumnLabel('name')}
                            </th>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {columnVisibility.name ? (
                            <th className="tm-pm-resource-table-col-name">
                              {practiceColumnLabel('name')}
                            </th>
                          ) : null}
                          {columnVisibility.spec ? (
                            <th className="tm-pm-resource-table-col-spec">
                              {practiceColumnLabel('spec')}
                            </th>
                          ) : null}
                        </>
                      )}
                      {columnVisibility.unit ? (
                        <th className="tm-pm-resource-table-col-unit">
                          {practiceColumnLabel('unit')}
                        </th>
                      ) : null}
                      {columnVisibility.pricingUnit ? (
                        <th className="tm-pm-resource-table-col-pricing-unit">
                          {practiceColumnLabel('pricingUnit')}
                        </th>
                      ) : null}
                      {columnVisibility.unitPrice ? (
                        <th className="tm-pm-resource-table-col-price">
                          {practiceColumnLabel('unitPrice')}
                        </th>
                      ) : null}
                      {columnVisibility.baseline ? (
                        <th className="tm-pm-resource-table-col-baseline">
                          {practiceColumnLabel('baseline')}
                        </th>
                      ) : null}
                      {columnVisibility.note ? (
                        <th className="tm-pm-resource-table-col-note">
                          {practiceColumnLabel('note')}
                        </th>
                      ) : null}
                      <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          </div>
          <div
            ref={tableScrollRef}
            className="tm-pm-resource-table-scroll"
            onScroll={() => syncHScrollMetrics()}
            onWheel={(event) => {
              // overflow-x is hidden (no native H bar), so route trackpad deltaX manually.
              if (event.deltaX !== 0 && tableScrollRef.current) {
                tableScrollRef.current.scrollLeft += event.deltaX
              }
            }}
          >
            <div className="tm-pm-resource-table-scroll-inner">
          <table
            className="tm-pm-resource-table"
            onKeyDown={(event) => {
              handlePmTableCellNavKeyDown(event)
            }}
          >
            <colgroup>
              <col className="tm-pm-resource-table-col-index" />
              {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
              {isPractice ? (
                <>
                  {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                  {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                </>
              ) : (
                <>
                  {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
                  {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
                </>
              )}
              {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
              {columnVisibility.pricingUnit ? (
                <col className="tm-pm-resource-table-col-pricing-unit" />
              ) : null}
              {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
              {columnVisibility.baseline ? (
                <col className="tm-pm-resource-table-col-baseline" />
              ) : null}
              {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
              <col className="tm-pm-resource-table-col-spacer" />
            </colgroup>
            <tbody>
              {visibleRows.map((row, index) => {
                const depth = resourceRowDepth(row, byId)
                const isSelected = selectedId === row.id
                const isChecked = checkedIds.has(row.id)
                return (
                  <tr
                    key={row.id}
                    className={[
                      isSelected ? 'tm-pm-resource-table-row--selected' : '',
                      isChecked ? 'tm-pm-resource-table-row--checked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedId(row.id)}
                    onContextMenu={(event) => handleRowContextMenu(event, row.id)}>
                    <td className="tm-pm-resource-table-index">
                      {selectionMode ? (
                        <label
                          className="tm-kb-file-card-select"
                          title={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                          onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="tm-kb-file-card-select-input"
                            checked={isChecked}
                            aria-label={`${t('projectManagerPage.resourceTable.selection.checkboxColumn')} ${index + 1}`}
                            onChange={(event) => {
                              setCheckedIds((prev) => {
                                const next = new Set(prev)
                                if (event.target.checked) next.add(row.id)
                                else next.delete(row.id)
                                return next
                              })
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span
                            className={[
                              'tm-kb-file-card-select-box',
                              isChecked ? 'tm-kb-file-card-select-box--checked' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-hidden="true"
                          />
                        </label>
                      ) : (
                        <span className="tm-pm-resource-table-index-text">{index + 1}</span>
                      )}
                    </td>
                    {columnVisibility.type ? (
                      <td className="tm-pm-resource-table-col-type">
                        <select
                          className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                          value={typeSelectValueForRow(row)}
                          onChange={(event) =>
                            handleTypeSelectChange(row.id, event.target.value)
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          {isPractice
                            ? (['labor', 'material', 'equipment'] as const).map((type) => (
                                <option key={type} value={type}>
                                  {t(`projectManagerPage.resourcePractice.views.${type}`)}
                                </option>
                              ))
                            : (
                              <>
                                {PM_RESOURCE_BUILTIN_PRIMARY_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {t(`projectManagerPage.resourceTable.types.${type}`)}
                                  </option>
                                ))}
                                <option value="custom">
                                  {t('projectManagerPage.resourceTable.types.custom')}
                                </option>
                                {customTypeNames.map((name) => (
                                  <option key={`type:${name}`} value={encodeCustomTypeSelectValue(name)}>
                                    {name}
                                  </option>
                                ))}
                                <option
                                  value="__pm_resource_cost_group__"
                                  disabled
                                  title={t(
                                    'projectManagerPage.resourceTable.views.costResourcesReserved',
                                  )}
                                >
                                  {t('projectManagerPage.resourceTable.views.costResources')}
                                </option>
                              </>
                            )}
                        </select>
                      </td>
                    ) : null}
                    {isPractice ? (
                      <>
                        {columnVisibility.spec ? (
                          <td>
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.spec}
                              placeholder={t('projectManagerPage.resourcePractice.specPlaceholder')}
                              onChange={(event) => patchRow(row.id, { spec: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.name ? (
                          <td>
                            <input
                              className="tm-pm-resource-table-input"
                              style={{ paddingLeft: `${8 + depth * 16}px` }}
                              value={row.name}
                              placeholder={t('projectManagerPage.resourcePractice.namePlaceholder')}
                              onChange={(event) => {
                                const name = event.target.value
                                const applicable =
                                  editingProject != null
                                    ? deriveResourceApplicable(
                                        { ...row, name },
                                        baselinePriceIndex,
                                        editingProject.id,
                                      )
                                    : row.applicable
                                patchRow(row.id, { name, applicable })
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {columnVisibility.name ? (
                          <td>
                            <input
                              className="tm-pm-resource-table-input"
                              style={{ paddingLeft: `${8 + depth * 16}px` }}
                              value={row.name}
                              placeholder={t('projectManagerPage.resourceTable.namePlaceholder')}
                              onChange={(event) => {
                                const name = event.target.value
                                const applicable =
                                  editingProject != null
                                    ? deriveResourceApplicable(
                                        { ...row, name },
                                        baselinePriceIndex,
                                        editingProject.id,
                                      )
                                    : row.applicable
                                patchRow(row.id, { name, applicable })
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.spec ? (
                          <td>
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.spec}
                              placeholder={t('projectManagerPage.resourceTable.specPlaceholder')}
                              onChange={(event) => patchRow(row.id, { spec: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                      </>
                    )}
                    {columnVisibility.unit ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <input
                          className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                          value={row.unit}
                          onChange={(event) => {
                            const unit = event.target.value
                            if (isPractice) {
                              patchRow(row.id, { unit })
                              return
                            }
                            const pricingInSync =
                              row.pricingUnit.trim() === '' || row.pricingUnit === row.unit
                            patchRow(row.id, {
                              unit,
                              ...(pricingInSync ? { pricingUnit: unit } : {}),
                            })
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    {columnVisibility.pricingUnit ? (
                      <td className="tm-pm-resource-table-cell--center">
                        {isPractice ? (
                          <PmDecimalTableInput
                            className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                            value={
                              row.pricingUnit.trim() === '' ||
                              !Number.isFinite(Number(row.pricingUnit))
                                ? null
                                : Number(row.pricingUnit)
                            }
                            onCommit={(next) =>
                              patchRow(row.id, {
                                pricingUnit: next == null ? '' : String(next),
                              })
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <input
                            className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                            value={row.pricingUnit}
                            onChange={(event) =>
                              patchRow(row.id, { pricingUnit: event.target.value })
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                      </td>
                    ) : null}
                    {columnVisibility.unitPrice ? (
                      <td className="tm-pm-resource-table-cell--center">
                        <PmDecimalTableInput
                          className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                          value={row.unitPrice}
                          onCommit={(unitPrice) => {
                            const applicable =
                              editingProject != null
                                ? deriveResourceApplicable(
                                    { ...row, unitPrice },
                                    baselinePriceIndex,
                                    editingProject.id,
                                  )
                                : row.applicable
                            patchRow(row.id, { unitPrice, applicable })
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    {columnVisibility.baseline ? (
                      <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                        {(() => {
                          const ratio = isAllScope
                            ? 1
                            : computeResourceBaselineRatio(
                                row.unitPrice,
                                baselinePriceIndex
                                  ? lookupBaselineUnitPrice(row, baselinePriceIndex)
                                  : null,
                              )
                          const label = ratio == null ? '—' : formatResourceBaselineRatio(ratio)
                          const off = !isAllScope && isResourceBaselineRatioOff(ratio)
                          return (
                            <span
                              className={[
                                'tm-pm-resource-table-baseline-text',
                                off ? 'tm-pm-resource-table-baseline-text--off' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              title={
                                ratio == null
                                  ? undefined
                                  : t('projectManagerPage.resourceTable.baselineHint', {
                                      ratio: label,
                                    })
                              }>
                              {label}
                            </span>
                          )
                        })()}
                      </td>
                    ) : null}
                    {columnVisibility.note ? (
                      <td>
                        <input
                          className="tm-pm-resource-table-input"
                          value={row.note}
                          placeholder={t('projectManagerPage.resourceTable.notePlaceholder')}
                          onChange={(event) => patchRow(row.id, { note: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    ) : null}
                    <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          </div>
          {hScrollMetrics.overflowing ? (
            <div
              ref={hTrackRef}
              className="tm-pm-gantt-grid-custom-hscroll"
              onPointerDown={onHTrackPointerDown}
              role="scrollbar"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (hScrollMetrics.thumbOffset /
                  Math.max(
                    1,
                    (tableScrollRef.current?.clientWidth ?? 1) - hScrollMetrics.thumbSize,
                  )) *
                  100,
              )}
            >
              <div
                className="tm-pm-gantt-grid-custom-hscroll-thumb"
                style={{
                  width: `${hScrollMetrics.thumbSize}px`,
                  left: `${hScrollMetrics.thumbOffset}px`,
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <div
          className={[
            'tm-pm-gantt-statusbar-message',
            statusFeedback
              ? `tm-pm-gantt-statusbar-message--${statusFeedback.tone}`
              : dirty
                ? 'tm-pm-gantt-statusbar-message--info'
                : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}>
          {statusFeedback
            ? statusFeedback.text
            : dirty
              ? t('projectManagerPage.resourceTable.statusDirty', {
                  count: String(rows.length),
                })
              : t('projectManagerPage.resourceTable.statusReady', {
                  count: String(rows.length),
                })}
          {!statusFeedback && selectedRow?.name
            ? ` · ${t('projectManagerPage.resourceTable.statusSelected', {
                name: selectedRow.name,
              })}`
            : null}
        </div>
      </footer>

      {contextMenu
        ? createPortal(
            <>
              <button
                type="button"
                className="tm-group-context-menu-backdrop"
                aria-label={t('projectManagerPage.resourceTable.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                ref={contextMenuRef}
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSelectionMode(true)
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.enterSelection')}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.selectAll')}
                </button>
                <button
                  type="button"
                  className={[
                    'tm-group-context-menu-item',
                    'tm-group-context-menu-item--danger',
                    contextMenuDeleteIds.size === 0
                      ? 'tm-group-context-menu-item--disabled'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="menuitem"
                  disabled={contextMenuDeleteIds.size === 0}
                  onClick={() => {
                    if (contextMenuDeleteIds.size === 0) return
                    setPendingDelete(new Set(contextMenuDeleteIds))
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.deleteSelected')}
                  {contextMenuDeleteIds.size > 0 ? ` (${contextMenuDeleteIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    setContextMenu(null)
                  }}>
                  {t('projectManagerPage.resourceTable.selection.cancel')}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}

      {columnMenu
        ? createPortal(
            <div
              className="tm-pm-gantt-col-menu"
              style={{ left: columnMenu.left, top: columnMenu.top, right: 'auto' }}
              onMouseDown={(event) => event.stopPropagation()}
              role="menu"
            >
              <div className="tm-pm-gantt-col-menu-title">
                {t('projectManagerPage.resourceTable.columnVisibility')}
              </div>
              {RESOURCE_TOGGLE_COLUMNS.map((column) => (
                <label key={column} className="tm-pm-gantt-col-menu-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column]}
                    disabled={column === 'name'}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  <span>{practiceColumnLabel(column)}</span>
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}

      {pendingDelete && pendingDelete.size > 0 ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.resourceTable.selection.deleteSelectedConfirm', {
            count: String(pendingDelete.size),
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteIds(pendingDelete)
            setPendingDelete(null)
          }}
        />
      ) : null}

      {pendingDeleteCustomTypeName ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.deleteCustomTypeTitle')}
          message={t('projectManagerPage.resourceTable.deleteCustomTypeConfirm', {
            name: pendingDeleteCustomTypeName,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDeleteCustomTypeName(null)}
          onConfirm={handleConfirmDeleteCustomTypeName}
        />
      ) : null}

      {pendingRestoreVersion != null ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.restoreVersionTitle')}
          message={t('projectManagerPage.resourceTable.restoreVersionConfirm', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(pendingRestoreVersion),
            }),
          })}
          confirmLabel={t('projectManagerPage.resourceTable.restoreVersionConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingRestoreVersion(null)}
          onConfirm={() => void handleConfirmRestoreVersion()}
        />
      ) : null}

      {pendingSaveAsNewVersion ? (
        <SaveAsNewVersionDialog
          currentVersion={
            isPractice
              ? practiceScopeId
                ? readPracticeVersion(workspaceId, practiceScopeId)
                : 0
              : isAllScope
                ? readSharedResourceVersion(workspaceId)
                : readResourceVersion(editingProject?.metadata)
          }
          nextVersion={
            (isPractice
              ? practiceScopeId
                ? readMaxResourceVersion(readPracticeSaveMeta(workspaceId, practiceScopeId))
                : 0
              : isAllScope
                ? readMaxResourceVersion(readSharedResourceSaveMeta(workspaceId))
                : readMaxResourceVersion(editingProject?.metadata)) + 1
          }
          onCancel={() => setPendingSaveAsNewVersion(false)}
          onConfirm={(note) => {
            setPendingSaveAsNewVersion(false)
            void handleSave({ asNewVersion: true, note })
          }}
        />
      ) : null}

      {projectInfoOpen && editingProject ? (
        <ProjectInfoDialog
          project={editingProject}
          variant="resource"
          resourceRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveResources={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceResource"
          workspaceId={workspaceId}
          resourceRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveResources={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}
    </div>
  )
}

export default ProjectResourceTablePanel
