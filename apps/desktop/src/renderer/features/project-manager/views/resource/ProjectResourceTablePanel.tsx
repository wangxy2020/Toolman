import type { FC, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'

import type { PmProject } from '@toolman/shared'
import {
  buildMetadataForResourceVersionSwitch,
  buildResourceSaveMetadata,
  IpcChannel,
  readResourceSaveHistory,
  readResourceVersion,
  readResourceVersionCatalog,
} from '@toolman/shared'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
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
  ensureDefaultResourcesInCatalog,
  fingerprintResourceCatalog,
  formatResourceBaselineRatio,
  isPmResourceType,
  isResourceBaselineRatioOff,
  lookupBaselineUnitPrice,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_CATALOG_KEY,
  PM_RESOURCE_TYPES,
  readSharedResourceCatalog,
  readSharedResourceSaveHistory,
  readSharedResourceSaveMeta,
  readSharedResourceVersion,
  recordSharedResourceSaveMeta,
  reindexResourceRows,
  resolveProjectResourceCatalog,
  sortResourceRowsByTypeMenu,
  sortResourceRowsLikeSharedCatalog,
  resourceRowDepth,
  toResourceCatalogSnapshot,
  upsertSharedResourceCatalog,
  withDerivedResourceApplicable,
  writeSharedResourceCatalog,
  writeSharedResourceSaveMeta,
  hydrateSharedResourceCatalogFromMain,
  normalizeResourceCatalogRows,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'
import { cloneResourceRows, ResourceHistoryStack } from './pm-resource-history'

interface Props {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
}

type ContextMenuState = {
  left: number
  top: number
  /** Row under the cursor — menu target when nothing is multi-selected. */
  rowId: string
}

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
}) => {
  const { t } = useI18n()

  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const viewApplicable = isAllScope
    ? PM_RESOURCE_APPLICABLE_ALL
    : (editingProject?.id ?? PM_RESOURCE_APPLICABLE_ALL)

  const canEdit = isAllScope || editingProject != null

  const [rows, setRows] = useState<PmResourceRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [viewFilter, setViewFilter] = useState<ResourceViewFilter>('all')
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new ResourceHistoryStack())
  const historyApplyingRef = useRef(false)
  const rowsRef = useRef<PmResourceRow[]>([])
  const cleanFingerprintRef = useRef('')
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const hTrackRef = useRef<HTMLDivElement | null>(null)
  const [hScrollMetrics, setHScrollMetrics] = useState({
    overflowing: false,
    thumbSize: 0,
    thumbOffset: 0,
  })
  const [hScrollDragging, setHScrollDragging] = useState(false)

  const syncHScrollMetrics = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) return
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
  }, [])

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

  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setProjectInfoOpen(false)
    setPendingRestoreVersion(null)
    setViewFilter('all')
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
    cleanFingerprintRef.current = ''
    rowsRef.current = []
  }, [scopeKey])

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo

  const versionSwitchEntries = useMemo((): ResourceVersionSwitchEntry[] => {
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
  }, [editingProject?.metadata, isAllScope, t, workspaceId, dirty, rows])

  useEffect(() => {
    if (dirty) return

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
          metadata: { [PM_RESOURCE_CATALOG_KEY]: ordered },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [applyCatalogRows, dirty, editingProject, isAllScope, onProjectsChange, scopeKey, workspaceId])

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmResourceType = selectedRow?.type ?? 'labor'
  const visibleRows = useMemo(
    () => (viewFilter === 'all' ? rows : rows.filter((row) => row.type === viewFilter)),
    [rows, viewFilter],
  )
  const addType: PmResourceType = viewFilter === 'all' ? selectedType : viewFilter

  const handleViewFilterChange = useCallback(
    (filter: ResourceViewFilter) => {
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
      const prev = rowsRef.current
      const next = reindexResourceRows(updater(prev))
      if (fingerprintResourceCatalog(next) === fingerprintResourceCatalog(prev)) {
        return
      }
      if (!historyApplyingRef.current) {
        historyStackRef.current.pushBeforeChange(cloneResourceRows(prev), {
          coalesceMs: options?.coalesceMs,
        })
        setHistoryEpoch((value) => value + 1)
      }
      rowsRef.current = next
      setRows(next)
      setDirty(true)
    },
    [],
  )

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
      if (projectInfoOpen || pendingDelete || pendingRestoreVersion != null) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }
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
  }, [handleRedo, handleUndo, pendingDelete, pendingRestoreVersion, projectInfoOpen])

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmResourceRow[],
      options?: { recordSaveVersion?: boolean },
    ) => {
      const metadata: Record<string, unknown> = options?.recordSaveVersion
        ? {
            ...buildResourceSaveMetadata(project.metadata ?? {}, {
              resourceCount: catalog.length,
              contentFingerprint: fingerprintResourceCatalog(catalog),
              catalog: toResourceCatalogSnapshot(catalog),
            }),
            [PM_RESOURCE_CATALOG_KEY]: catalog,
          }
        : { [PM_RESOURCE_CATALOG_KEY]: catalog }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
    },
    [],
  )

  // Projects without a saved catalog use「全部项目」live — do not auto-seed copies.

  const handleSave = useCallback(async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      if (isAllScope) {
        const payload = sortResourceRowsByTypeMenu(
          rows.map((row) => ({
            ...row,
            applicable: PM_RESOURCE_APPLICABLE_ALL,
          })),
        )
        await writeSharedResourceCatalog(workspaceId, payload)
        recordSharedResourceSaveMeta(workspaceId, payload)
        applyCatalogRows(payload, { dirty: false })
        await onProjectsChange?.()
        window.alert(t('projectManagerPage.resourceTable.saveSuccess'))
        return
      }
      if (!editingProject) return

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

      const sharedCandidates = payload.filter(
        (row) => row.applicable === PM_RESOURCE_APPLICABLE_ALL && row.name.trim(),
      )
      if (sharedCandidates.length > 0) {
        const shared = readSharedResourceCatalog(workspaceId)
        const upserted = upsertSharedResourceCatalog(shared.rows, sharedCandidates)
        if (upserted.changed || shared.isDefault) {
          await writeSharedResourceCatalog(workspaceId, upserted.rows)
          recordSharedResourceSaveMeta(workspaceId, upserted.rows)
        }
      }

      await persistProjectCatalog(editingProject, payload, { recordSaveVersion: true })
      applyCatalogRows(payload, { dirty: false })
      await onProjectsChange?.()
      window.alert(t('projectManagerPage.resourceTable.saveSuccess'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    applyCatalogRows,
    canEdit,
    editingProject,
    isAllScope,
    onProjectsChange,
    persistProjectCatalog,
    rows,
    t,
    workspaceId,
  ])

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
      const next = createEmptyResourceRow(prev.length, addType, null, viewApplicable)
      setSelectedId(next.id)
      return [...prev, next]
    })
  }, [addType, canEdit, updateRows, viewApplicable])

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const next = createEmptyResourceRow(index, addType, parentId, viewApplicable)
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [addType, canEdit, selectedId, updateRows, viewApplicable])

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
    (type: PmResourceType) => {
      if (!selectedId) return
      updateRows((prev) =>
        prev.map((row) => (row.id === selectedId ? { ...row, type } : row)),
      )
    },
    [selectedId, updateRows],
  )

  const snapshotToRows = useCallback((snapshot: NonNullable<ReturnType<typeof readResourceVersionCatalog>>): PmResourceRow[] => {
    return snapshot
      .filter((row) => isPmResourceType(row.type))
      .map((row) => ({
        id: row.id,
        type: row.type as PmResourceType,
        name: row.name,
        spec: row.spec ?? '',
        unit: row.unit,
        pricingUnit: row.pricingUnit?.trim() ? row.pricingUnit : row.unit,
        unitPrice: row.unitPrice,
        applicable: row.applicable,
        note: row.note ?? '',
        sortOrder: row.sortOrder,
        parentId: row.parentId,
      }))
  }, [])

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
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
    onProjectsChange,
    pendingRestoreVersion,
    snapshotToRows,
    t,
    workspaceId,
  ])

  const handleRestoreVersion = useCallback(
    (version: number) => {
      const currentVersion = isAllScope
        ? readSharedResourceVersion(workspaceId)
        : readResourceVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, workspaceId],
  )

  const handleMenuAction = useCallback(
    (action: ResourceMenuAction) => {
      switch (action) {
        case 'save':
          void handleSave()
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

  const patchRow = useCallback(
    (id: string, patch: Partial<PmResourceRow>) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        { coalesceMs: 500 },
      )
    },
    [updateRows],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, rowId: string) => {
      event.preventDefault()
      setSelectionMode(true)
      setContextMenu({ left: event.clientX, top: event.clientY, rowId })
    },
    [],
  )

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const contextMenuDeleteIds =
    checkedIds.size > 0 ? checkedIds : contextMenu ? new Set([contextMenu.rowId]) : new Set<string>()

  return (
    <div className="tm-pm-gantt-page tm-pm-resource-table-page">
      <ProjectResourceMenuBar
        disabled={saving}
        hasSelection={selectedId != null}
        hasProject
        canEdit={canEdit}
        canUndo={canUndo}
        canRedo={canRedo}
        viewFilter={viewFilter}
        onViewFilterChange={handleViewFilterChange}
        selectedType={selectedType}
        onTypeChange={handleTypeChange}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreVersion={handleRestoreVersion}
        onAction={handleMenuAction}
      />

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
          <div
            ref={tableScrollRef}
            className="tm-pm-resource-table-scroll"
            onScroll={() => syncHScrollMetrics()}
          >
            <div className="tm-pm-resource-table-scroll-inner">
          <table className="tm-pm-resource-table">
            <colgroup>
              <col className="tm-pm-resource-table-col-index" />
              <col className="tm-pm-resource-table-col-type" />
              <col className="tm-pm-resource-table-col-name" />
              <col className="tm-pm-resource-table-col-spec" />
              <col className="tm-pm-resource-table-col-unit" />
              <col className="tm-pm-resource-table-col-pricing-unit" />
              <col className="tm-pm-resource-table-col-price" />
              <col className="tm-pm-resource-table-col-baseline" />
              <col className="tm-pm-resource-table-col-applicable" />
              <col className="tm-pm-resource-table-col-note" />
              <col className="tm-pm-resource-table-col-spacer" />
            </colgroup>
            <thead>
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
                    t('projectManagerPage.resourceTable.columns.index')
                  )}
                </th>
                <th className="tm-pm-resource-table-col-type">
                  {t('projectManagerPage.resourceTable.columns.type')}
                </th>
                <th className="tm-pm-resource-table-col-name">
                  {t('projectManagerPage.resourceTable.columns.name')}
                </th>
                <th className="tm-pm-resource-table-col-spec">
                  {t('projectManagerPage.resourceTable.columns.spec')}
                </th>
                <th className="tm-pm-resource-table-col-unit">
                  {t('projectManagerPage.resourceTable.columns.unit')}
                </th>
                <th className="tm-pm-resource-table-col-pricing-unit">
                  {t('projectManagerPage.resourceTable.columns.pricingUnit')}
                </th>
                <th className="tm-pm-resource-table-col-price">
                  {t('projectManagerPage.resourceTable.columns.unitPrice')}
                </th>
                <th className="tm-pm-resource-table-col-baseline">
                  {t('projectManagerPage.resourceTable.columns.baseline')}
                </th>
                <th className="tm-pm-resource-table-col-applicable">
                  {t('projectManagerPage.resourceTable.columns.applicable')}
                </th>
                <th className="tm-pm-resource-table-col-note">
                  {t('projectManagerPage.resourceTable.columns.note')}
                </th>
                <th className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            </thead>            <tbody>
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
                    <td>
                      <select
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.type}
                        onChange={(event) => {
                          const type = event.target.value as PmResourceType
                          const applicable =
                            editingProject != null
                              ? deriveResourceApplicable(
                                  { ...row, type },
                                  baselinePriceIndex,
                                  editingProject.id,
                                )
                              : row.applicable
                          patchRow(row.id, { type, applicable })
                        }}
                        onClick={(event) => event.stopPropagation()}>
                        {PM_RESOURCE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`projectManagerPage.resourceTable.types.${type}`)}
                          </option>
                        ))}
                      </select>
                    </td>
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
                    <td>
                      <input
                        className="tm-pm-resource-table-input"
                        value={row.spec}
                        placeholder={t('projectManagerPage.resourceTable.specPlaceholder')}
                        onChange={(event) => patchRow(row.id, { spec: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.unit}
                        onChange={(event) => {
                          const unit = event.target.value
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
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                        value={row.pricingUnit}
                        onChange={(event) =>
                          patchRow(row.id, { pricingUnit: event.target.value })
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td className="tm-pm-resource-table-cell--center">
                      <input
                        className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                        type="number"
                        min={0}
                        step="any"
                        value={row.unitPrice ?? ''}
                        onChange={(event) => {
                          const raw = event.target.value.trim()
                          const unitPrice = raw === '' ? null : Number(raw)
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
                    <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-applicable">
                      {isAllScope ? (
                        <span
                          className="tm-pm-resource-table-applicable-text"
                          title={t('projectManagerPage.resourceTable.applicableAll')}>
                          {t('projectManagerPage.resourceTable.applicableAll')}
                        </span>
                      ) : (
                        (() => {
                          const applicableValue = editingProject
                            ? deriveResourceApplicable(
                                row,
                                baselinePriceIndex,
                                editingProject.id,
                              )
                            : row.applicable
                          const applicableLabel =
                            applicableValue === PM_RESOURCE_APPLICABLE_ALL
                              ? t('projectManagerPage.resourceTable.applicableAll')
                              : editingProject
                                ? formatPathProjectLabel(editingProject)
                                : applicableValue
                          return (
                            <span
                              className="tm-pm-resource-table-applicable-text"
                              title={
                                applicableLabel ||
                                t('projectManagerPage.resourceTable.applicableHint')
                              }>
                              {applicableLabel}
                            </span>
                          )
                        })()
                      )}
                    </td>
                    <td>
                      <input
                        className="tm-pm-resource-table-input"
                        value={row.note}
                        placeholder={t('projectManagerPage.resourceTable.notePlaceholder')}
                        onChange={(event) => patchRow(row.id, { note: event.target.value })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
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
            dirty
              ? 'tm-pm-gantt-statusbar-message--info'
              : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}>
          {dirty
            ? t('projectManagerPage.resourceTable.statusDirty', {
                count: String(rows.length),
              })
            : t('projectManagerPage.resourceTable.statusReady', {
                count: String(rows.length),
              })}
          {selectedRow?.name
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
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}>
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

      {projectInfoOpen && editingProject ? (
        <ProjectInfoDialog
          project={editingProject}
          variant="resource"
          resourceRows={rows}
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
