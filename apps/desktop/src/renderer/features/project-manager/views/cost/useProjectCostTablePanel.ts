import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

import { useI18n } from '../../../../i18n/useI18n'
import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { pmApi } from '../../pm-api'
import { computeHScrollMetrics, formatPathProjectLabel } from '../../pm-panel-shared'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { findDemoteParentId } from '../schedule/pm-gantt-tree'
import type {
  CostPracticeQuotaView,
  FeaturesMenuAction,
  FeaturesScheduleView,
  FeaturesVersionSwitchEntry,
} from '../files/ProjectFeaturesMenuBar'
import type { CostMenuAction, CostVersionSwitchEntry, CostViewFilter } from './ProjectCostMenuBar'
import {
  PM_COST_APPLICABLE_ALL,
  PM_COST_CATALOG_KEY,
  buildBaselinePriceIndex,
  buildCostChildrenIndex,
  createEmptyCostRow,
  deriveCostApplicable,
  fingerprintCostCatalog,
  buildCostSectionalDisplayEntries,
  isCostSectionSummaryFilter,
  patchCostSectionMeta,
  suggestNextCostCode,
  hydrateSharedCostCatalogFromMain,
  isPmCostPracticeQuotaType,
  isPmCostResourceType,
  isPmCostType,
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
  readCostPracticeCatalog,
  readCostPracticeSaveHistory,
  readCostPracticeSaveMeta,
  readCostPracticeVersion,
  recordCostPracticeSaveMeta,
  writeCostPracticeCatalog,
  writeCostPracticeSaveMeta,
} from './pm-cost-practice-catalog'
import {
  loadCostColumnLabels,
  loadCostColumnVisibility,
  saveCostColumnLabels,
  saveCostColumnVisibility,
  type CostColumnLabels,
  type CostColumnVisibility,
  type CostLabelColumn,
  type CostToggleColumn,
} from './pm-cost-column-prefs'
import { DEFAULT_COST_CURRENCY, resolveCostTableTotalPriceCurrency } from './pm-cost-currency'
import { cloneCostRows, CostHistoryStack } from './pm-cost-history'
import { COST_IMPORT_DIALOG_FILTERS, importCostCatalogFromFile } from './pm-cost-import'
import {
  appendCostFormulaRef,
  buildCostSectionalRollupDisplayEntries,
  COST_SUMMARY_ROWS_META_KEY,
  createEmptyCostSummaryRow,
  normalizeCostSummaryRows,
  readCostSummaryRows,
  type CostSummaryRow,
} from './pm-cost-summary'
import {
  clampMenuToViewport,
  computeColumnMenuPosition,
  computeRowContextMenuPosition,
  scrollLeftForThumbRatio,
  snapshotToRows,
  syncFeatureDescriptionHeight,
} from './pm-cost-panel-utils'
import {
  addMeteringBaseline,
  deleteMeteringBaseline,
  nextMeteringPeriodIndex,
  nextMeteringPeriodName,
  parseMeteringPeriodNameIndex,
  readMeteringBaselines,
  readMeteringRollupMode,
  updateMeteringBaseline,
  writeMeteringRollupMode,
  type MeteringBaseline,
  type MeteringRollupMode,
} from './pm-metering-baselines'
import { formatWorkItemDate, parseDateInput } from '../schedule/pm-gantt-utils'

export interface ProjectCostTablePanelProps {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  /**
   * `catalog` = 价格表；`practice` = 成本管理-实务（空表起步，独立存储，实务精简菜单）。
   */
  variant?: 'catalog' | 'practice'
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
}

type CostContextMenuState = {
  left: number
  top: number
  rowId: string
}

type CostColumnMenuState = {
  left: number
  top: number
}

export function useProjectCostTablePanel({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
  onOpenScheduleView: _onOpenScheduleView,
}: ProjectCostTablePanelProps) {
  const { t } = useI18n()
  const isPractice = variant === 'practice'

  const isAllScope = !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const totalPriceColumnDefaultLabel = useMemo(() => {
    const currency = resolveCostTableTotalPriceCurrency(
      editingProject?.metadata,
      editingProject?.code,
    )
    return t('projectManagerPage.costTable.columns.totalPrice', { currency })
  }, [editingProject?.code, editingProject?.metadata, t])

  const viewApplicable = isAllScope
    ? PM_COST_APPLICABLE_ALL
    : (editingProject?.id ?? PM_COST_APPLICABLE_ALL)

  const practiceScopeId = isAllScope ? PM_COST_APPLICABLE_ALL : (editingProject?.id ?? '')

  const canEdit = isAllScope || editingProject != null

  const [costQuotaView, setCostQuotaView] =
    useState<CostPracticeQuotaView>('constructionQuota')

  /** Catalog-only: metering view on the same price-list page (feature catalog type=metering). */
  const [meteringViewActive, setMeteringViewActive] = useState(false)
  const [meteringBaselines, setMeteringBaselines] = useState<MeteringBaseline[]>([])
  const [selectedMeteringBaselineId, setSelectedMeteringBaselineId] = useState<string | null>(
    null,
  )
  const [meteringCaptureBaselineOpen, setMeteringCaptureBaselineOpen] = useState(false)
  const [meteringEditBaselineOpen, setMeteringEditBaselineOpen] = useState(false)
  const [pendingMeteringDeleteBaseline, setPendingMeteringDeleteBaseline] = useState(false)
  const [meteringRollupMode, setMeteringRollupMode] = useState<MeteringRollupMode>('none')

  const [rows, setRows] = useState<PmCostRow[]>([])
  const [summaryRows, setSummaryRows] = useState<CostSummaryRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [totalFormulaFocusId, setTotalFormulaFocusId] = useState<string | null>(null)
  const totalFormulaFocusIdRef = useRef<string | null>(null)
  const formulaInputRef = useRef<HTMLInputElement | null>(null)
  totalFormulaFocusIdRef.current = totalFormulaFocusId
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<CostContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const [columnMenu, setColumnMenu] = useState<CostColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState<CostColumnVisibility>(() =>
    loadCostColumnVisibility(),
  )
  const [columnLabels, setColumnLabels] = useState<CostColumnLabels>(() => loadCostColumnLabels())
  const [editingHeaderColumn, setEditingHeaderColumn] = useState<CostLabelColumn | null>(null)
  const [headerDraft, setHeaderDraft] = useState('')
  const headerInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Set<string> | null>(null)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingAddMultiple, setPendingAddMultiple] = useState(false)
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
    const metrics = computeHScrollMetrics(el, el.clientWidth, 28)
    setHScrollMetrics({
      overflowing: metrics.overflowing,
      thumbSize: metrics.thumbSize,
      thumbOffset: metrics.thumbOffset,
    })
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
    el.scrollLeft = scrollLeftForThumbRatio(el, nextOffsetRatio)
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
    if (isPractice) {
      if (!practiceScopeId) return []
      const history = readCostPracticeSaveHistory(workspaceId, practiceScopeId)
      const currentVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
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

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isPractice) {
        if (!practiceScopeId) return
        const meta = readCostPracticeSaveMeta(workspaceId, practiceScopeId)
        const catalog = readCostVersionCatalog(meta, version)
        const nextMeta = buildMetadataForCostVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.costTable.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = sortCostRowsByTypeMenu(snapshotToRows(catalog))
        writeCostPracticeCatalog(workspaceId, practiceScopeId, rowsNext)
        writeCostPracticeSaveMeta(workspaceId, practiceScopeId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false, clearHistory: true })
        setSelectedId(null)
        window.alert(
          t('projectManagerPage.costTable.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
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
          ? readCostPracticeVersion(workspaceId, practiceScopeId)
          : 0
        : isAllScope
          ? readSharedCostVersion(workspaceId)
          : readCostVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, isPractice, practiceScopeId, workspaceId],
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
    if (isPractice || !scopeKey) {
      setMeteringBaselines([])
      setSelectedMeteringBaselineId(null)
      setMeteringRollupMode('none')
      return
    }
    const loaded = readMeteringBaselines(workspaceId, scopeKey)
    setMeteringBaselines(loaded)
    setSelectedMeteringBaselineId((prev) =>
      prev && loaded.some((entry) => entry.id === prev) ? prev : null,
    )
    setMeteringRollupMode(readMeteringRollupMode(workspaceId, scopeKey))
  }, [isPractice, scopeKey, workspaceId])

  const handleMeteringRollupModeChange = useCallback(
    (mode: MeteringRollupMode) => {
      setMeteringRollupMode(mode)
      if (!isPractice && scopeKey) {
        writeMeteringRollupMode(workspaceId, scopeKey, mode)
      }
    },
    [isPractice, scopeKey, workspaceId],
  )

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

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const childrenByParentId = useMemo(() => buildCostChildrenIndex(rows), [rows])
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmCostType = isPractice
    ? isPmCostPracticeQuotaType(selectedRow?.type)
      ? selectedRow.type
      : costQuotaView
    : (selectedRow?.type ?? 'other')
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
      if (isPractice) {
        // Match resource practice: view menu filters the type column set.
        if (row.type !== costQuotaView) return false
      } else if (viewFilter !== 'all' && row.type !== viewFilter) {
        return false
      }
      if (
        sectionFilter !== 'all' &&
        !isCostSectionSummaryFilter(sectionFilter) &&
        (row.sectionalWork?.trim() ?? '') !== sectionFilter
      ) {
        return false
      }
      return true
    })
  }, [costQuotaView, isPractice, rows, sectionFilter, viewFilter])

  const displayEntries = useMemo(
    () =>
      isCostSectionSummaryFilter(sectionFilter)
        ? buildCostSectionalRollupDisplayEntries(visibleRows, {
            metadata: editingProject?.metadata,
            projectCode: editingProject?.code,
            summaryRows,
            summaryLabel: t('projectManagerPage.costTable.views.sectionSummary'),
            summaryLabelWithCurrency: (currency) =>
              t('projectManagerPage.costTable.views.sectionSummaryWithCurrency', {
                currency,
              }),
          })
        : buildCostSectionalDisplayEntries(visibleRows),
    [
      editingProject?.code,
      editingProject?.metadata,
      sectionFilter,
      summaryRows,
      t,
      visibleRows,
    ],
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

  const addType: PmCostType = isPractice
    ? costQuotaView
    : viewFilter === 'all'
      ? selectedType
      : viewFilter

  const handleViewFilterChange = useCallback((filter: CostViewFilter) => {
    // Resource-cost types are not available in the View menu.
    if (filter !== 'all' && isPmCostResourceType(filter)) {
      setViewFilter('all')
      return
    }
    setMeteringViewActive(false)
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
    setMeteringViewActive(false)
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
        [COST_SUMMARY_ROWS_META_KEY]: summaryRows,
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
    [summaryRows],
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
        if (isPractice) {
          if (!practiceScopeId) {
            window.alert(t('projectManagerPage.costTable.needProject'))
            return false
          }
          const payload = sortCostRowsByTypeMenu(
            rows.map((row) => ({
              ...row,
              applicable: viewApplicable,
            })),
          )
          const prevVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
          writeCostPracticeCatalog(workspaceId, practiceScopeId, payload)
          recordCostPracticeSaveMeta(workspaceId, practiceScopeId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          applyCatalogRows(payload, { dirty: false })
          const nextVersion = readCostPracticeVersion(workspaceId, practiceScopeId)
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
        const payload = sortCostRowsByTypeMenu(
          catalog.map((row) => ({
            ...row,
            applicable: viewApplicable,
          })),
        )
        writeCostPracticeCatalog(workspaceId, practiceScopeId, payload)
        recordCostPracticeSaveMeta(workspaceId, practiceScopeId, payload, { bumpVersion: false })
        cleanFingerprintRef.current = fingerprintCostCatalog(payload)
        return
      }
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
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.costTable.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.costTable.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

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
    (
      action: CostMenuAction,
      event?: { metaKey?: boolean; ctrlKey?: boolean },
    ) => {
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
          if (event?.metaKey || event?.ctrlKey) {
            setPendingAddMultiple(true)
          } else {
            handleAdd()
          }
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
        case 'metering':
          if (!isPractice) {
            setMeteringViewActive(true)
          }
          break
        case 'meteringCaptureBaseline':
          if (!isPractice) {
            setMeteringViewActive(true)
            setMeteringCaptureBaselineOpen(true)
          }
          break
        case 'meteringEditBaseline':
          if (!isPractice && selectedMeteringBaselineId) {
            setMeteringViewActive(true)
            setMeteringEditBaselineOpen(true)
          }
          break
        case 'meteringDeleteBaseline':
          if (!isPractice && selectedMeteringBaselineId) {
            setMeteringViewActive(true)
            setPendingMeteringDeleteBaseline(true)
          }
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
      isPractice,
      selectedMeteringBaselineId,
    ],
  )

  const selectedMeteringBaseline = useMemo(
    () =>
      selectedMeteringBaselineId
        ? (meteringBaselines.find((entry) => entry.id === selectedMeteringBaselineId) ?? null)
        : null,
    [meteringBaselines, selectedMeteringBaselineId],
  )

  const nextMeteringCaptureBaselineIndex = useMemo(
    () => nextMeteringPeriodIndex(meteringBaselines),
    [meteringBaselines],
  )

  const nextMeteringCaptureAsOfMs = useMemo(() => Date.now(), [meteringCaptureBaselineOpen])

  const nextMeteringCaptureBaselineName = useMemo(
    () =>
      nextMeteringPeriodName(
        meteringBaselines,
        formatWorkItemDate(nextMeteringCaptureAsOfMs),
      ),
    [meteringBaselines, nextMeteringCaptureAsOfMs],
  )

  const editMeteringBaselineNameIndex = selectedMeteringBaseline
    ? (parseMeteringPeriodNameIndex(selectedMeteringBaseline.name) ??
      nextMeteringCaptureBaselineIndex)
    : nextMeteringCaptureBaselineIndex

  const editMeteringBaselineInitialDateMs = selectedMeteringBaseline
    ? (parseDateInput(selectedMeteringBaseline.asOfDate) ?? Date.now())
    : Date.now()

  const handleMeteringCaptureBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setMeteringCaptureBaselineOpen(false)
      if (isPractice || !scopeKey) return
      const created = addMeteringBaseline(workspaceId, scopeKey, { name, asOfDate })
      setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
      setSelectedMeteringBaselineId(created.id)
      setMeteringViewActive(true)
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.meteringBaselineCapture.success', {
          name: created.name,
        }),
      })
    },
    [isPractice, scopeKey, setStatusFeedback, t, workspaceId],
  )

  const handleMeteringEditBaselineConfirm = useCallback(
    ({ name, asOfDate }: { name: string; asOfDate: string }) => {
      setMeteringEditBaselineOpen(false)
      if (isPractice || !scopeKey || !selectedMeteringBaselineId) return
      const updated = updateMeteringBaseline(workspaceId, scopeKey, selectedMeteringBaselineId, {
        name,
        asOfDate,
      })
      if (!updated) return
      setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
      setStatusFeedback({
        tone: 'success',
        text: t('projectManagerPage.costTable.meteringBaselineEdit.success', {
          name: updated.name,
        }),
      })
    },
    [
      isPractice,
      scopeKey,
      selectedMeteringBaselineId,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const handleConfirmMeteringDeleteBaseline = useCallback(() => {
    setPendingMeteringDeleteBaseline(false)
    if (isPractice || !scopeKey || !selectedMeteringBaselineId) return
    const removed = deleteMeteringBaseline(workspaceId, scopeKey, selectedMeteringBaselineId)
    if (!removed) return
    setMeteringBaselines(readMeteringBaselines(workspaceId, scopeKey))
    setSelectedMeteringBaselineId(null)
    setStatusFeedback({
      tone: 'success',
      text: t('projectManagerPage.costTable.meteringBaselineDelete.success', {
        name: removed.name,
      }),
    })
  }, [
    isPractice,
    scopeKey,
    selectedMeteringBaselineId,
    setStatusFeedback,
    t,
    workspaceId,
  ])

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

  const practiceVersionEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    return versionSwitchEntries.map((entry) => ({
      version: entry.version,
      name: entry.name,
      hasSnapshot: entry.hasSnapshot,
      isCurrent: entry.isCurrent,
    }))
  }, [versionSwitchEntries])

  const saveAsNewVersionCurrentVersion = isPractice
    ? practiceScopeId
      ? readCostPracticeVersion(workspaceId, practiceScopeId)
      : 0
    : isAllScope
      ? readSharedCostVersion(workspaceId)
      : readCostVersion(editingProject?.metadata)

  const saveAsNewVersionNextVersion =
    (isPractice
      ? practiceScopeId
        ? readMaxCostVersion(readCostPracticeSaveMeta(workspaceId, practiceScopeId))
        : 0
      : isAllScope
        ? readMaxCostVersion(readSharedCostSaveMeta(workspaceId))
        : readMaxCostVersion(editingProject?.metadata)) + 1

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

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    const position = computeColumnMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setColumnMenu(position)
  }, [])

  const costColumnLabel = useCallback(
    (column: CostLabelColumn | 'index') => {
      if (column === 'index') {
        return t('projectManagerPage.costTable.columns.index')
      }
      const override = columnLabels[column]?.trim()
      if (override) return override
      if (column === 'totalPrice') return totalPriceColumnDefaultLabel
      return t(`projectManagerPage.costTable.columns.${column}`)
    },
    [columnLabels, t, totalPriceColumnDefaultLabel],
  )

  const totalPriceColumnLabel = costColumnLabel('totalPrice')

  const startHeaderEdit = useCallback(
    (column: CostLabelColumn) => {
      setColumnMenu(null)
      setContextMenu(null)
      setEditingHeaderColumn(column)
      setHeaderDraft(costColumnLabel(column))
    },
    [costColumnLabel],
  )

  const cancelHeaderEdit = useCallback(() => {
    setEditingHeaderColumn(null)
    setHeaderDraft('')
  }, [])

  const commitHeaderEdit = useCallback(() => {
    if (!editingHeaderColumn) return
    const next = headerDraft.trim()
    if (next) {
      setColumnLabels((prev) => {
        const updated = { ...prev, [editingHeaderColumn]: next }
        saveCostColumnLabels(updated)
        return updated
      })
    }
    cancelHeaderEdit()
  }, [cancelHeaderEdit, editingHeaderColumn, headerDraft])

  const handleHeaderKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitHeaderEdit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelHeaderEdit()
      }
    },
    [cancelHeaderEdit, commitHeaderEdit],
  )

  useLayoutEffect(() => {
    if (!editingHeaderColumn) return
    const input = headerInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editingHeaderColumn])

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
    const position = computeRowContextMenuPosition(event.clientX, event.clientY, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setContextMenu({ ...position, rowId })
  }, [])

  useLayoutEffect(() => {
    if (!contextMenu) return
    const menu = contextMenuRef.current
    if (!menu) return
    const clamped = clampMenuToViewport(
      { left: contextMenu.left, top: contextMenu.top },
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    if (
      Math.abs(clamped.left - contextMenu.left) > 0.5 ||
      Math.abs(clamped.top - contextMenu.top) > 0.5
    ) {
      setContextMenu((current) => (current ? { ...current, ...clamped } : current))
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
  const isSummaryView = isCostSectionSummaryFilter(sectionFilter)

  const appendSectionRefToActiveFormula = useCallback(
    (refName: string) => {
      const focusKey = totalFormulaFocusIdRef.current
      if (!focusKey) return
      const ref = refName.trim()
      if (!ref) return

      if (focusKey.startsWith('summary:')) {
        const summaryId = focusKey.slice('summary:'.length)
        setSummaryRows((prev) => {
          const base = prev.length > 0 ? prev : resolveEditableSummaryRows()
          return base.map((row, index) =>
            row.id === summaryId
              ? {
                  ...row,
                  totalFormula: appendCostFormulaRef(row.totalFormula, ref),
                  sortOrder: index,
                }
              : { ...row, sortOrder: index },
          )
        })
        setDirty(true)
      } else if (focusKey.startsWith('section:')) {
        const rawKey = focusKey.slice('section:'.length)
        const sectionKey = rawKey === '__empty__' ? '' : rawKey
        if (sectionKey === ref) return
        const peer = rowsRef.current.find(
          (row) => (row.sectionalWork?.trim() ?? '') === sectionKey,
        )
        const current = peer?.sectionTotalFormula ?? ''
        updateRows(
          (prev) =>
            patchCostSectionMeta(prev, sectionKey, {
              sectionTotalFormula: appendCostFormulaRef(current, ref),
            }),
          { coalesceMs: 500 },
        )
      }

      requestAnimationFrame(() => {
        formulaInputRef.current?.focus()
      })
    },
    [resolveEditableSummaryRows, updateRows],
  )

  return {
    // Refs
    panelRootRef,
    tableScrollRef,
    headerPinInnerRef,
    hTrackRef,
    contextMenuRef,
    formulaInputRef,

    // Scope / mode
    isPractice,
    isAllScope,
    editingProject,
    canEdit,
    practiceScopeId,
    totalPriceColumnLabel,
    costColumnLabel,

    // Rows & derived views
    rows,
    dirty,
    byId,
    childrenByParentId,
    selectedRow,
    sectionalOptions,
    visibleRows,
    displayEntries,
    baselinePriceIndex,

    // Selection & UI state
    selectedId,
    setSelectedId,
    checkedIds,
    setCheckedIds,
    selectionMode,
    setSelectionMode,
    contextMenu,
    setContextMenu,
    columnMenu,
    columnVisibility,
    toggleColumnVisibility,
    openColumnVisibilityMenu,
    editingHeaderColumn,
    headerDraft,
    setHeaderDraft,
    headerInputRef,
    startHeaderEdit,
    commitHeaderEdit,
    handleHeaderKeyDown,
    handleRowContextMenu,
    handleSelectAll,
    handleClearSelection,
    contextMenuDeleteIds,

    // Filters / views
    costQuotaView,
    setCostQuotaView,
    viewFilter,
    handleViewFilterChange,
    sectionFilter,
    handleSectionFilterChange,
    isSummaryView,

    // History
    canUndo,
    canRedo,

    // Save / version
    saving,
    statusFeedback,
    versionSwitchEntries,
    practiceVersionEntries,
    handleRestoreVersion,
    handleConfirmRestoreVersion,
    handleSave,
    saveAsNewVersionCurrentVersion,
    saveAsNewVersionNextVersion,

    // Menu actions
    handleMenuAction,
    handleFeaturesMenuAction,
    meteringViewActive,
    meteringBaselines,
    selectedMeteringBaselineId,
    setSelectedMeteringBaselineId,
    meteringRollupMode,
    handleMeteringRollupModeChange,
    meteringCaptureBaselineOpen,
    setMeteringCaptureBaselineOpen,
    meteringEditBaselineOpen,
    setMeteringEditBaselineOpen,
    selectedMeteringBaseline,
    nextMeteringCaptureBaselineIndex,
    nextMeteringCaptureAsOfMs,
    nextMeteringCaptureBaselineName,
    editMeteringBaselineNameIndex,
    editMeteringBaselineInitialDateMs,
    handleMeteringCaptureBaselineConfirm,
    handleMeteringEditBaselineConfirm,
    pendingMeteringDeleteBaseline,
    setPendingMeteringDeleteBaseline,
    handleConfirmMeteringDeleteBaseline,

    // Row & summary editing
    patchRow,
    patchSectionMeta,
    patchSummaryRow,
    handleRowTypeChange,
    handleRowNameChange,
    handleRowUnitPriceChange,
    handleAdd,
    deleteIds,

    // Dialog state
    pendingDelete,
    setPendingDelete,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    pendingAddMultiple,
    setPendingAddMultiple,
    pendingImportRows,
    setPendingImportRows,
    applyImportedRows,
    projectInfoOpen,
    setProjectInfoOpen,

    // Formula cell support
    totalFormulaFocusId,
    setTotalFormulaFocusId,
    appendSectionRefToActiveFormula,

    // Horizontal scroll
    hScrollMetrics,
    hScrollDragging,
    syncHScrollMetrics,
    onHTrackPointerDown,
  }
}

/** Shared shape passed to the sibling presentational components (Header / Body / Menus / Dialogs). */
export type ProjectCostTablePanelState = ReturnType<typeof useProjectCostTablePanel>
