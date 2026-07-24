import type { FC, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'

import type { PmProject } from '@toolman/shared'
import {
  buildCostSaveMetadata,
  buildMetadataForCostVersionSwitch,
  DialogSelectFilesOutputSchema,
  FileReadBinaryOutputSchema,
  IpcChannel,
  PM_COST_CONTENT_FINGERPRINT_KEY,
  readCostSaveHistory,
  readCostVersion,
  readCostVersionCatalog,
  readMaxCostVersion,
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
  ProjectCostMenuBar,
  type CostMenuAction,
  type CostVersionSwitchEntry,
  type CostViewFilter,
} from './ProjectCostMenuBar'
import {
  PM_COST_APPLICABLE_ALL,
  PM_COST_CATALOG_KEY,
  PM_COST_PRIMARY_TYPES,
  buildBaselinePriceIndex,
  computeCostBaselineRatio,
  computeCostTotalPrice,
  createEmptyCostRow,
  deriveCostApplicable,
  fingerprintCostCatalog,
  formatCostBaselineRatio,
  formatCostTotalPrice,
  buildCostSectionalDisplayEntries,
  buildCostSectionalRollupDisplayEntries,
  isCostSectionSummaryFilter,
  patchCostSectionMeta,
  isCostBaselineRatioOff,
  hydrateSharedCostCatalogFromMain,
  isPmCostResourceType,
  isPmCostType,
  lookupBaselineUnitPrice,
  readSharedCostCatalog,
  readSharedCostSaveHistory,
  readSharedCostSaveMeta,
  readSharedCostVersion,
  recordSharedCostSaveMeta,
  reindexCostRows,
  resolveProjectCostCatalog,
  sortCostRowsByTypeMenu,
  sortCostRowsLikeSharedCatalog,
  costRowDepth,
  toCostCatalogSnapshot,
  withDerivedCostApplicable,
  writeSharedCostCatalog,
  writeSharedCostSaveMeta,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'
import {
  COST_TOGGLE_COLUMNS,
  loadCostColumnVisibility,
  saveCostColumnVisibility,
  type CostColumnVisibility,
  type CostToggleColumn,
} from './pm-cost-column-prefs'
import { cloneCostRows, CostHistoryStack } from './pm-cost-history'
import {
  COST_IMPORT_DIALOG_FILTERS,
  importCostCatalogFromFile,
} from './pm-cost-import'

/** Grow feature-description textareas to fit wrapped content (Excel-like row height). */
function syncFeatureDescriptionHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`
}

interface Props {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
}

type ContextMenuState = {
  left: number
  top: number
  rowId: string
}

type ColumnMenuState = {
  left: number
  top: number
}

function formatPathProjectLabel(project: PmProject): string {
  const code = project.code.trim()
  const name = project.name.trim()
  if (code && name) return `${code} · ${name}`
  return code || name || project.id
}

const ProjectCostTablePanel: FC<Props> = ({
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
    ? PM_COST_APPLICABLE_ALL
    : (editingProject?.id ?? PM_COST_APPLICABLE_ALL)

  const canEdit = isAllScope || editingProject != null

  const [rows, setRows] = useState<PmCostRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState<CostColumnVisibility>(() =>
    loadCostColumnVisibility(),
  )
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingImportRows, setPendingImportRows] = useState<{
    rows: PmCostRow[]
    sourceName: string
  } | null>(null)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [viewFilter, setViewFilter] = useState<CostViewFilter>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new CostHistoryStack())
  const historyApplyingRef = useRef(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<PmCostRow[]>([])
  const cleanFingerprintRef = useRef('')
  // Keep ref aligned with React state so leave-save / undo never read a stale snapshot.
  rowsRef.current = rows
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

  const scopeKey = isAllScope ? PM_COST_APPLICABLE_ALL : (editingProject?.id ?? '')

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

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo

  const versionSwitchEntries = useMemo((): CostVersionSwitchEntry[] => {
    const history = isAllScope
      ? readSharedCostSaveHistory(workspaceId)
      : readCostSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedCostVersion(workspaceId)
      : readCostVersion(editingProject?.metadata)
    return history.map((entry) => ({
      version: entry.version,
      name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
        version: String(entry.version),
      }),
      hasSnapshot: Array.isArray(entry.catalog),
      isCurrent: entry.version === currentVersion,
    }))
  }, [dirty, editingProject?.metadata, isAllScope, rows, t, workspaceId])

  const snapshotToRows = useCallback(
    (snapshot: NonNullable<ReturnType<typeof readCostVersionCatalog>>): PmCostRow[] => {
      return snapshot
        .filter((row) => isPmCostType(row.type))
        .map((row) => ({
          id: row.id,
          type: row.type as PmCostType,
          code: row.code ?? '',
          name: row.name,
          featureDescription: row.featureDescription ?? '',
          unit: row.unit,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          applicable: row.applicable,
          note: row.note ?? '',
          sectionalWork: row.sectionalWork ?? '',
          sectionCode: row.sectionCode ?? '',
          sectionNote: row.sectionNote ?? '',
          sortOrder: row.sortOrder,
          parentId: row.parentId,
        }))
    },
    [],
  )

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isAllScope) {
        const meta = readSharedCostSaveMeta(workspaceId)
        const catalog = readCostVersionCatalog(meta, version)
        const nextMeta = buildMetadataForCostVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
        writeSharedCostCatalog(workspaceId, rowsNext)
        writeSharedCostSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.costTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readCostVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForCostVersionSwitch(editingProject.metadata, version)
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_COST_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.costTable.restoreVersionSuccess', {
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
        ? readSharedCostVersion(workspaceId)
        : readCostVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, workspaceId],
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
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
    cleanFingerprintRef.current = ''
    rowsRef.current = []
    setRows([])
  }, [scopeKey])

  useEffect(() => {
    if (dirty) return

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
  }, [applyCatalogRows, dirty, editingProject, isAllScope, onProjectsChange, scopeKey, workspaceId])

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmCostType = selectedRow?.type ?? 'other'
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
      if (viewFilter !== 'all' && row.type !== viewFilter) return false
      if (
        sectionFilter !== 'all' &&
        !isCostSectionSummaryFilter(sectionFilter) &&
        (row.sectionalWork?.trim() ?? '') !== sectionFilter
      ) {
        return false
      }
      return true
    })
  }, [rows, sectionFilter, viewFilter])

  const displayEntries = useMemo(
    () =>
      isCostSectionSummaryFilter(sectionFilter)
        ? buildCostSectionalRollupDisplayEntries(visibleRows)
        : buildCostSectionalDisplayEntries(visibleRows),
    [sectionFilter, visibleRows],
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

  const addType: PmCostType = viewFilter === 'all' ? selectedType : viewFilter

  const handleViewFilterChange = useCallback((filter: CostViewFilter) => {
    // Resource-cost types are not available in the View menu.
    if (filter !== 'all' && isPmCostResourceType(filter)) {
      setViewFilter('all')
      return
    }
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

  const handleUndo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canUndo) return
    const current = cloneCostRows(rowsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneCostRows(previous))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  const handleRedo = useCallback(() => {
    if (!canEdit || !historyStackRef.current.canRedo) return
    const current = cloneCostRows(rowsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    historyApplyingRef.current = true
    applyCatalogRows(cloneCostRows(next))
    setHistoryEpoch((value) => value + 1)
    historyApplyingRef.current = false
  }, [applyCatalogRows, canEdit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDelete) return
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
  }, [handleRedo, handleUndo, pendingDelete, projectInfoOpen])

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmCostRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readCostVersion(project.metadata)
      const metadata = {
        ...buildCostSaveMetadata(project.metadata ?? {}, {
          costCount: catalog.length,
          contentFingerprint: fingerprintCostCatalog(catalog),
          catalog: toCostCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_COST_CATALOG_KEY]: catalog,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readCostVersion(metadata),
      }
    },
    [],
  )

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.costTable.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        if (isAllScope) {
          const payload = sortCostRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: PM_COST_APPLICABLE_ALL,
            })),
          )
          const prevVersion = readSharedCostVersion(workspaceId)
          writeSharedCostCatalog(workspaceId, payload)
          recordSharedCostSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedCostVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.costTable.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.costTable.needProject'))
          return false
        }

        const sharedRows = readSharedCostCatalog(workspaceId).rows
        const baseline = buildBaselinePriceIndex(sharedRows)
        const payload = sortCostRowsLikeSharedCatalog(
          withDerivedCostApplicable(rows.map((row) => ({ ...row })), baseline, editingProject.id),
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
            text: t('projectManagerPage.costTable.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.costTable.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.costTable.saveSuccess'),
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
      onProjectsChange,
      persistProjectCatalog,
      rows,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const flushAutoSave = useCallback(async () => {
    if (!canEdit) return
    const catalog = rowsRef.current
    try {
      if (isAllScope) {
        const payload = sortCostRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: PM_COST_APPLICABLE_ALL,
          })),
        )
        writeSharedCostCatalog(workspaceId, payload)
        recordSharedCostSaveMeta(workspaceId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintCostCatalog(payload)
        return
      }
      if (!editingProject) return
      const sharedRows = readSharedCostCatalog(workspaceId).rows
      const baseline = buildBaselinePriceIndex(sharedRows)
      const payload = sortCostRowsLikeSharedCatalog(
        withDerivedCostApplicable(
          catalog.map((row) => ({ ...row })),
          baseline,
          editingProject.id,
        ),
        sharedRows,
      )
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      cleanFingerprintRef.current = fingerprintCostCatalog(payload)
    } catch {
      // Best-effort leave save.
    }
  }, [canEdit, editingProject, isAllScope, persistProjectCatalog, workspaceId])

  usePmCatalogAutoSave({ scopeKey, dirty, flush: flushAutoSave })

  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.costTable.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.costTable.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const typeAbove =
        viewFilter !== 'all'
          ? addType
          : (prev[prev.length - 1]?.type ?? addType)
      const next = createEmptyCostRow(prev.length, typeAbove, null, viewApplicable)
      if (sectionFilter !== 'all' && !isCostSectionSummaryFilter(sectionFilter)) {
        next.sectionalWork = sectionFilter
      } else if (prev[prev.length - 1]) {
        next.sectionalWork = prev[prev.length - 1]!.sectionalWork ?? ''
      }
      const sectionPeer = prev.find(
        (row) =>
          (row.sectionalWork?.trim() ?? '') === (next.sectionalWork?.trim() ?? ''),
      )
      if (sectionPeer) {
        next.sectionCode = sectionPeer.sectionCode ?? ''
        next.sectionNote = sectionPeer.sectionNote ?? ''
      }
      setSelectedId(next.id)
      return [...prev, next]
    })
  }, [addType, canEdit, sectionFilter, updateRows, viewApplicable, viewFilter])

  const handleInsert = useCallback(() => {
    if (!canEdit || !selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index < 0) return prev
      const parentId = prev[index]?.parentId ?? null
      const typeAbove =
        viewFilter !== 'all'
          ? addType
          : (prev[index - 1]?.type ?? prev[index]?.type ?? addType)
      const next = createEmptyCostRow(index, typeAbove, parentId, viewApplicable)
      if (sectionFilter !== 'all' && !isCostSectionSummaryFilter(sectionFilter)) {
        next.sectionalWork = sectionFilter
      } else {
        next.sectionalWork =
          prev[index - 1]?.sectionalWork ?? prev[index]?.sectionalWork ?? ''
      }
      const sectionPeer =
        prev[index - 1] &&
        (prev[index - 1]!.sectionalWork?.trim() ?? '') ===
          (next.sectionalWork?.trim() ?? '')
          ? prev[index - 1]
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
      }
      setSelectedId(next.id)
      const copy = [...prev]
      copy.splice(index, 0, next)
      return copy
    })
  }, [addType, canEdit, sectionFilter, selectedId, updateRows, viewApplicable, viewFilter])

  const deleteIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
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

  const applyImportedRows = useCallback(
    (imported: PmCostRow[]) => {
      updateRows(() => imported)
      setSelectedId(null)
      setCheckedIds(new Set())
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.importSuccess', {
          count: String(imported.length),
        }),
      })
    },
    [setStatusFeedback, t, updateRows],
  )

  const handleImport = useCallback(async () => {
    if (!canEdit) return
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: false,
      title: t('projectManagerPage.costTable.importTitle'),
      buttonLabel: t('projectManagerPage.costTable.menu.import'),
      filters: [...COST_IMPORT_DIALOG_FILTERS],
    })
    if (!pickResult.ok) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: pickResult.error.message,
        }),
      })
      return
    }
    const { paths } = DialogSelectFilesOutputSchema.parse(pickResult.data)
    const filePath = paths[0]
    if (!filePath) return

    const readResult = await window.api.invoke(IpcChannel.FileReadBinary, {
      path: filePath,
    })
    if (!readResult.ok) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: readResult.error.message,
        }),
      })
      return
    }
    const binary = FileReadBinaryOutputSchema.parse(readResult.data)
    try {
      const imported = await importCostCatalogFromFile({
        fileName: binary.fileName,
        base64: binary.base64,
        applicable: viewApplicable,
        fallbackType: addType,
      })
      const hasExisting = rowsRef.current.some(
        (row) => row.name.trim() || row.code.trim(),
      )
      if (hasExisting) {
        setPendingImportRows({
          rows: imported.rows,
          sourceName: imported.sourceName,
        })
        return
      }
      applyImportedRows(imported.rows)
    } catch (error) {
      setStatusFeedback({
        tone: 'error',
        text: t('projectManagerPage.costTable.importFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      })
    }
  }, [
    addType,
    applyImportedRows,
    canEdit,
    setStatusFeedback,
    t,
    viewApplicable,
  ])

  const handleMenuAction = useCallback(
    (action: CostMenuAction) => {
      switch (action) {
        case 'save':
          void handleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'import':
          void handleImport()
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
      handleImport,
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
    (id: string, patch: Partial<PmCostRow>) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        { coalesceMs: 500 },
      )
    },
    [updateRows],
  )

  const patchSectionMeta = useCallback(
    (sectionKey: string, patch: Partial<Pick<PmCostRow, 'sectionCode' | 'sectionNote'>>) => {
      updateRows((prev) => patchCostSectionMeta(prev, sectionKey, patch), { coalesceMs: 500 })
    },
    [updateRows],
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

  const toggleColumnVisibility = useCallback((column: CostToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveCostColumnVisibility(next)
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

  const handleRowContextMenu = useCallback((event: ReactMouseEvent, rowId: string) => {
    // Keep native cut/copy/paste on editable cells.
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
  }, [])

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
    <div
      ref={panelRootRef}
      className="tm-pm-gantt-page tm-pm-resource-table-page tm-pm-cost-table-page"
    >
      <ProjectCostMenuBar
        disabled={saving}
        hasSelection={selectedId != null}
        hasProject
        canEdit={canEdit}
        canUndo={canUndo}
        canRedo={canRedo}
        viewFilter={viewFilter}
        onViewFilterChange={handleViewFilterChange}
        sectionFilter={sectionFilter}
        onSectionFilterChange={handleSectionFilterChange}
        sectionalOptions={sectionalOptions}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreVersion={handleRestoreVersion}
        onAction={handleMenuAction}
      />

      {!canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.costTable.needProject')}</div>
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
              <table
                className="tm-pm-resource-table"
                onKeyDown={(event) => {
                  handlePmTableCellNavKeyDown(event)
                }}
              >
                <colgroup>
                  <col className="tm-pm-resource-table-col-index" />
                  {columnVisibility.type ? (
                    <col className="tm-pm-resource-table-col-type" />
                  ) : null}
                  {columnVisibility.sectionalWork ? (
                    <col className="tm-pm-resource-table-col-sectional" />
                  ) : null}
                  {columnVisibility.code ? (
                    <col className="tm-pm-resource-table-col-code" />
                  ) : null}
                  {columnVisibility.name ? (
                    <col className="tm-pm-resource-table-col-name" />
                  ) : null}
                  {columnVisibility.featureDescription ? (
                    <col className="tm-pm-resource-table-col-feature" />
                  ) : null}
                  {columnVisibility.unit ? (
                    <col className="tm-pm-resource-table-col-unit" />
                  ) : null}
                  {columnVisibility.quantity ? (
                    <col className="tm-pm-resource-table-col-spec" />
                  ) : null}
                  {columnVisibility.unitPrice ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {columnVisibility.totalPrice ? (
                    <col className="tm-pm-resource-table-col-price" />
                  ) : null}
                  {columnVisibility.baseline ? (
                    <col className="tm-pm-resource-table-col-baseline" />
                  ) : null}
                  {columnVisibility.note ? (
                    <col className="tm-pm-resource-table-col-note" />
                  ) : null}
                  <col className="tm-pm-resource-table-col-spacer" />
                </colgroup>
                <thead onContextMenu={openColumnVisibilityMenu}>
                  <tr>
                    <th className="tm-pm-resource-table-col-index">
                      {selectionMode ? (
                        <label
                          className="tm-kb-file-card-select"
                          title={t('projectManagerPage.costTable.selection.selectAll')}
                        >
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
                            aria-label={t('projectManagerPage.costTable.selection.selectAll')}
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
                        t('projectManagerPage.costTable.columns.index')
                      )}
                    </th>
                    {columnVisibility.type ? (
                      <th className="tm-pm-resource-table-col-type">
                        {t('projectManagerPage.costTable.columns.type')}
                      </th>
                    ) : null}
                    {columnVisibility.sectionalWork ? (
                      <th className="tm-pm-resource-table-col-sectional">
                        {t('projectManagerPage.costTable.columns.sectionalWork')}
                      </th>
                    ) : null}
                    {columnVisibility.code ? (
                      <th className="tm-pm-resource-table-col-code">
                        {t('projectManagerPage.costTable.columns.code')}
                      </th>
                    ) : null}
                    {columnVisibility.name ? (
                      <th className="tm-pm-resource-table-col-name">
                        {t('projectManagerPage.costTable.columns.name')}
                      </th>
                    ) : null}
                    {columnVisibility.featureDescription ? (
                      <th className="tm-pm-resource-table-col-feature">
                        {t('projectManagerPage.costTable.columns.featureDescription')}
                      </th>
                    ) : null}
                    {columnVisibility.unit ? (
                      <th className="tm-pm-resource-table-col-unit">
                        {t('projectManagerPage.costTable.columns.unit')}
                      </th>
                    ) : null}
                    {columnVisibility.quantity ? (
                      <th className="tm-pm-resource-table-col-spec">
                        {t('projectManagerPage.costTable.columns.quantity')}
                      </th>
                    ) : null}
                    {columnVisibility.unitPrice ? (
                      <th className="tm-pm-resource-table-col-price">
                        {t('projectManagerPage.costTable.columns.unitPrice')}
                      </th>
                    ) : null}
                    {columnVisibility.totalPrice ? (
                      <th className="tm-pm-resource-table-col-price">
                        {t('projectManagerPage.costTable.columns.totalPrice')}
                      </th>
                    ) : null}
                    {columnVisibility.baseline ? (
                      <th className="tm-pm-resource-table-col-baseline">
                        {t('projectManagerPage.costTable.columns.baseline')}
                      </th>
                    ) : null}
                    {columnVisibility.note ? (
                      <th className="tm-pm-resource-table-col-note">
                        {t('projectManagerPage.costTable.columns.note')}
                      </th>
                    ) : null}
                    <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.map((entry) => {
                    if (entry.kind === 'grand' || entry.kind === 'section') {
                      const isGrand = entry.kind === 'grand'
                      const sectionLabel = isGrand
                        ? t('projectManagerPage.costTable.views.sectionSummary')
                        : entry.summary.key
                          ? entry.summary.key
                          : t('projectManagerPage.costTable.views.sectionEmpty')
                      return (
                        <tr
                          key={
                            isGrand
                              ? 'grand-summary'
                              : `section:${entry.summary.key || '__empty__'}:${entry.summary.rowCount}`
                          }
                          className={[
                            'tm-pm-cost-table-section-summary',
                            isGrand ? 'tm-pm-cost-table-section-summary--grand' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td className="tm-pm-resource-table-index">
                            <span className="tm-pm-resource-table-index-text" aria-hidden>
                              {' '}
                            </span>
                          </td>
                          {columnVisibility.type ? <td /> : null}
                          {columnVisibility.sectionalWork ? (
                            <td className="tm-pm-resource-table-col-sectional">
                              <span className="tm-pm-cost-table-section-summary-label">
                                {sectionLabel}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.code ? (
                            <td className="tm-pm-resource-table-col-code">
                              {isGrand ? null : (
                                <input
                                  className="tm-pm-resource-table-input tm-pm-resource-table-input--center tm-pm-cost-table-section-summary-input"
                                  value={entry.summary.code}
                                  placeholder={t('projectManagerPage.costTable.codePlaceholder')}
                                  onChange={(event) =>
                                    patchSectionMeta(entry.summary.key, {
                                      sectionCode: event.target.value,
                                    })
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                />
                              )}
                            </td>
                          ) : null}
                          {columnVisibility.name ? (
                            <td>
                              <span className="tm-pm-cost-table-section-summary-label">
                                {sectionLabel}
                                {!columnVisibility.totalPrice
                                  ? ` ${formatCostTotalPrice(entry.summary.total)}`
                                  : ''}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.featureDescription ? <td /> : null}
                          {columnVisibility.unit ? <td /> : null}
                          {columnVisibility.quantity ? <td /> : null}
                          {columnVisibility.unitPrice ? <td /> : null}
                          {columnVisibility.totalPrice ? (
                            <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                              <span className="tm-pm-cost-table-section-summary-total">
                                {formatCostTotalPrice(entry.summary.total)}
                              </span>
                            </td>
                          ) : null}
                          {columnVisibility.baseline ? <td /> : null}
                          {columnVisibility.note ? (
                            <td>
                              {isGrand ? null : (
                                <input
                                  className="tm-pm-resource-table-input tm-pm-cost-table-section-summary-input"
                                  value={entry.summary.note}
                                  placeholder={t('projectManagerPage.costTable.notePlaceholder')}
                                  onChange={(event) =>
                                    patchSectionMeta(entry.summary.key, {
                                      sectionNote: event.target.value,
                                    })
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                />
                              )}
                            </td>
                          ) : null}
                          <td className="tm-pm-resource-table-col-spacer" aria-hidden />
                        </tr>
                      )
                    }

                    const { row, index } = entry
                    const depth = costRowDepth(row, byId)
                    const isSelected = selectedId === row.id
                    const isChecked = checkedIds.has(row.id)
                    const totalPrice = computeCostTotalPrice(row.quantity, row.unitPrice)
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
                        onContextMenu={(event) => handleRowContextMenu(event, row.id)}
                      >
                        <td className="tm-pm-resource-table-index">
                          {selectionMode ? (
                            <label
                              className="tm-kb-file-card-select"
                              title={`${t('projectManagerPage.costTable.selection.checkboxColumn')} ${index + 1}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="tm-kb-file-card-select-input"
                                checked={isChecked}
                                aria-label={`${t('projectManagerPage.costTable.selection.checkboxColumn')} ${index + 1}`}
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
                          <td>
                            <select
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.type}
                              onChange={(event) => {
                                const type = event.target.value as PmCostType
                                if (!isPmCostType(type) || isPmCostResourceType(type)) return
                                const applicable =
                                  editingProject != null
                                    ? deriveCostApplicable(
                                        { ...row, type },
                                        baselinePriceIndex,
                                        editingProject.id,
                                      )
                                    : row.applicable
                                patchRow(row.id, { type, applicable })
                              }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {PM_COST_PRIMARY_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {t(`projectManagerPage.costTable.types.${type}`)}
                                </option>
                              ))}
                              <option
                                value="__pm_cost_resource_group__"
                                disabled
                                title={t('projectManagerPage.costTable.views.resourceCostsReserved')}
                              >
                                {t('projectManagerPage.costTable.views.resourceCosts')}
                              </option>
                            </select>
                          </td>
                        ) : null}
                        {columnVisibility.sectionalWork ? (
                          <td className="tm-pm-resource-table-col-sectional">
                            <input
                              className="tm-pm-resource-table-input"
                              value={row.sectionalWork ?? ''}
                              placeholder={t(
                                'projectManagerPage.costTable.sectionalWorkPlaceholder',
                              )}
                              onChange={(event) =>
                                patchRow(row.id, { sectionalWork: event.target.value })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.code ? (
                          <td className="tm-pm-resource-table-col-code">
                            <input
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.code ?? ''}
                              placeholder={t('projectManagerPage.costTable.codePlaceholder')}
                              onChange={(event) => patchRow(row.id, { code: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.name ? (
                          <td>
                            <input
                              className="tm-pm-resource-table-input"
                              style={{ paddingLeft: `${8 + depth * 16}px` }}
                              value={row.name ?? ''}
                              placeholder={t('projectManagerPage.costTable.namePlaceholder')}
                              onChange={(event) => {
                                const name = event.target.value
                                const applicable =
                                  editingProject != null
                                    ? deriveCostApplicable(
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
                        {columnVisibility.featureDescription ? (
                          <td className="tm-pm-resource-table-col-feature">
                            <textarea
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--feature"
                              rows={1}
                              value={row.featureDescription ?? ''}
                              title={
                                row.featureDescription?.trim()
                                  ? row.featureDescription
                                  : undefined
                              }
                              placeholder={t(
                                'projectManagerPage.costTable.featureDescriptionPlaceholder',
                              )}
                              onChange={(event) => {
                                syncFeatureDescriptionHeight(event.currentTarget)
                                patchRow(row.id, {
                                  featureDescription: event.target.value,
                                })
                              }}
                              onInput={(event) =>
                                syncFeatureDescriptionHeight(event.currentTarget)
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.unit ? (
                          <td className="tm-pm-resource-table-cell--center">
                            <input
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--center"
                              value={row.unit}
                              onChange={(event) => patchRow(row.id, { unit: event.target.value })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.quantity ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-spec">
                            <PmDecimalTableInput
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                              value={row.quantity}
                              onCommit={(quantity) => patchRow(row.id, { quantity })}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        ) : null}
                        {columnVisibility.unitPrice ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <PmDecimalTableInput
                              className="tm-pm-resource-table-input tm-pm-resource-table-input--number"
                              value={row.unitPrice}
                              onCommit={(unitPrice) => {
                                const applicable =
                                  editingProject != null
                                    ? deriveCostApplicable(
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
                        {columnVisibility.totalPrice ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
                            <span className="tm-pm-resource-table-baseline-text">
                              {formatCostTotalPrice(totalPrice)}
                            </span>
                          </td>
                        ) : null}
                        {columnVisibility.baseline ? (
                          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-baseline">
                            {(() => {
                              const ratio = isAllScope
                                ? 1
                                : computeCostBaselineRatio(
                                    row.unitPrice,
                                    baselinePriceIndex
                                      ? lookupBaselineUnitPrice(row, baselinePriceIndex)
                                      : null,
                                  )
                              const label = ratio == null ? '—' : formatCostBaselineRatio(ratio)
                              const off = !isAllScope && isCostBaselineRatioOff(ratio)
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
                                      : t('projectManagerPage.costTable.baselineHint', {
                                          ratio: label,
                                        })
                                  }
                                >
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
                              value={row.note ?? ''}
                              placeholder={t('projectManagerPage.costTable.notePlaceholder')}
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
          ].join(' ')}
        >
          {statusFeedback
            ? statusFeedback.text
            : dirty
              ? t('projectManagerPage.costTable.statusDirty', {
                  count: String(rows.length),
                })
              : t('projectManagerPage.costTable.statusReady', {
                  count: String(rows.length),
                })}
          {!statusFeedback && selectedRow?.name
            ? ` · ${t('projectManagerPage.costTable.statusSelected', {
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
                aria-label={t('projectManagerPage.costTable.selection.cancel')}
                onClick={() => setContextMenu(null)}
              />
              <div
                ref={contextMenuRef}
                className="tm-group-context-menu"
                style={{ left: contextMenu.left, top: contextMenu.top }}
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSelectionMode(true)
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.costTable.selection.enterSelection')}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleSelectAll()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.costTable.selection.selectAll')}
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
                  }}
                >
                  {t('projectManagerPage.costTable.selection.deleteSelected')}
                  {contextMenuDeleteIds.size > 0 ? ` (${contextMenuDeleteIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="tm-group-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    handleClearSelection()
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.costTable.selection.cancel')}
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
                {t('projectManagerPage.costTable.columnVisibility')}
              </div>
              {COST_TOGGLE_COLUMNS.map((column) => (
                <label key={column} className="tm-pm-gantt-col-menu-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column]}
                    disabled={column === 'name'}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  <span>{t(`projectManagerPage.costTable.columns.${column}`)}</span>
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}

      {pendingImportRows ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.importTitle')}
          message={t('projectManagerPage.costTable.importReplaceConfirm', {
            name: pendingImportRows.sourceName,
            count: String(pendingImportRows.rows.length),
          })}
          confirmLabel={t('projectManagerPage.costTable.importReplaceConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingImportRows(null)}
          onConfirm={() => {
            applyImportedRows(pendingImportRows.rows)
            setPendingImportRows(null)
          }}
        />
      ) : null}

      {pendingDelete && pendingDelete.size > 0 ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.costTable.selection.deleteSelectedConfirm', {
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
          title={t('projectManagerPage.costTable.restoreVersionTitle')}
          message={t('projectManagerPage.costTable.restoreVersionConfirm', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(pendingRestoreVersion),
            }),
          })}
          confirmLabel={t('projectManagerPage.costTable.restoreVersionConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingRestoreVersion(null)}
          onConfirm={() => void handleConfirmRestoreVersion()}
        />
      ) : null}

      {pendingSaveAsNewVersion ? (
        <SaveAsNewVersionDialog
          currentVersion={
            isAllScope
              ? readSharedCostVersion(workspaceId)
              : readCostVersion(editingProject?.metadata)
          }
          nextVersion={
            (isAllScope
              ? readMaxCostVersion(readSharedCostSaveMeta(workspaceId))
              : readMaxCostVersion(editingProject?.metadata)) + 1
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
          variant="cost"
          costRows={rows}
          onSaveCosts={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceCost"
          workspaceId={workspaceId}
          costRows={rows}
          onSaveCosts={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}
    </div>
  )
}

export default ProjectCostTablePanel
