import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { PmProject, PmWorkItem, Workspace } from '@toolman/shared'
import {
  buildFeatureSaveMetadata,
  buildMetadataForFeatureVersionSwitch,
  IpcChannel,
  readFeatureSaveHistory,
  readFeatureVersion,
  readFeatureVersionCatalog,
} from '@toolman/shared'

import type { SystemPaths } from '../../../chat/useSystemPaths'
import { useI18n } from '../../../../i18n/useI18n'
import { isPmEditableEventTarget } from '../../pm-editable-dom'
import { pmApi } from '../../pm-api'
import { usePmCatalogAutoSave } from '../../usePmCatalogAutoSave'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import { formatPathProjectLabel } from '../../pm-panel-shared'
import { findDemoteParentId } from '../schedule/pm-gantt-tree'
import { DEFAULT_COST_CURRENCY } from '../cost/pm-cost-currency'
import {
  loadCostColumnVisibility,
  saveCostColumnVisibility,
  type CostColumnVisibility,
  type CostToggleColumn,
} from '../cost/pm-cost-column-prefs'
import {
  loadGanttUiPrefs,
  saveGanttUiPrefs,
  type GanttScheduleView,
} from '../schedule/pm-gantt-prefs'
import {
  isFeaturesResourceStatFilter,
  type FeaturesMenuAction,
  type FeaturesScheduleView,
  type FeaturesVersionSwitchEntry,
} from './ProjectFeaturesMenuBar'
import {
  buildCostCatalogOrderIndex,
  buildFundsDisplayEntries,
  buildFundsSectionMetaByRowId,
  buildLiveFundsFeatureRows,
  buildLiveNodeFeatureRows,
  buildLiveProcurementFeatureRows,
  buildLiveScheduleFeatureRows,
  buildResourceUnitLookup,
  collectGanttCostSeeds,
  collectGanttFeatureSeeds,
  collectGanttNodeSeeds,
  collectGanttProcurementSeeds,
  collectRollupMonthKeys,
  computeFeatureCostRollups,
  computeFeatureGanttRollups,
  computeFeatureNodeRollups,
  excludeProcurementRowsCoveredByLive,
  groupMonthKeysByYear,
  usesPeakConcurrentRollup,
  usesNonStackingPeakRollup,
} from './pm-feature-gantt-rollup'
import {
  createEmptyFeatureRow,
  featureRowDepth,
  fingerprintFeatureCatalog,
  isPmFeatureCostPrimaryType,
  isPmFeatureType,
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  readSharedFeatureCatalog,
  readSharedFeatureSaveHistory,
  readSharedFeatureSaveMeta,
  readSharedFeatureVersion,
  recordSharedFeatureSaveMeta,
  reindexFeatureRows,
  resolveProjectFeatureCatalog,
  stripLiveFeatureRows,
  persistFeatureCatalogRows,
  toFeatureCatalogSnapshot,
  writeSharedFeatureCatalog,
  writeSharedFeatureSaveMeta,
  type PmFeatureRow,
  type PmFeatureType,
  type PmFeatureViewFilter,
} from './pm-features-catalog'
import {
  loadFeaturesColumnVisibility,
  saveFeaturesColumnVisibility,
  type FeaturesColumnVisibility,
  type FeaturesToggleColumn,
} from './pm-features-column-prefs'
import { resolveProjectCostCatalog } from '../cost/pm-cost-catalog'
import { resolveAssignableResourceCatalog } from '../resource/pm-resource-catalog'
import {
  collectCascadeDeleteIds,
  computeColumnMenuPosition,
  computeContextMenuPosition,
  computeFundsTotals,
  computeResourceStatTotals,
  computeVisibleRows,
  snapshotToRows,
} from './pm-features-panel-utils'

export interface ProjectManagementFilesPanelProps {
  workspaceId: string
  workspace: Workspace | null
  systemPaths: SystemPaths | null
  projects: PmProject[]
  selectedProjectId: string | null
  /** Switch to the Gantt panel with the chosen schedule sub-view. */
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
  onProjectsChange?: () => void
  /**
   * Lock the panel to one type filter (e.g. cost · 价格表 → 计量).
   * Hides trailing type menus and keeps `viewFilter` fixed.
   */
  lockedViewFilter?: PmFeatureViewFilter
  /**
   * Embed inside another page (e.g. cost · 价格表 metering view): no outer page shell.
   * Parent owns the page chrome / primary menubar.
   */
  embedded?: boolean
  /** When embedded, notify parent whether a row is selected (for menubar enablement). */
  onEmbeddedSelectionChange?: (hasSelection: boolean) => void
}

type ContextMenuState = {
  left: number
  top: number
}

type ColumnMenuState = {
  left: number
  top: number
}

/** Full state/handlers surface shared with the sibling presentational components. */
export type ProjectManagementFilesPanelState = ReturnType<typeof useProjectManagementFilesPanel>

/**
 * Practice (实务) view — table chrome aligned with Resource list
 * (`tm-pm-resource-table-*` + Gantt page shell / Features menubar).
 */
export function useProjectManagementFilesPanel({
  workspaceId,
  projects,
  selectedProjectId,
  onOpenScheduleView,
  onProjectsChange,
  lockedViewFilter,
  embedded = false,
  onEmbeddedSelectionChange,
}: ProjectManagementFilesPanelProps) {
  const { t } = useI18n()
  const [scheduleView, setScheduleView] = useState<FeaturesScheduleView>(() => {
    const prefs = loadGanttUiPrefs()
    return prefs.scheduleView
  })

  const isAllScope =
    !selectedProjectId || !projects.some((project) => project.id === selectedProjectId)

  const editingProject = useMemo(() => {
    if (isAllScope) return null
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [isAllScope, projects, selectedProjectId])

  const viewApplicable = isAllScope
    ? PM_FEATURE_APPLICABLE_ALL
    : (editingProject?.id ?? PM_FEATURE_APPLICABLE_ALL)

  const canEdit = isAllScope || editingProject != null

  const [rows, setRows] = useState<PmFeatureRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState<FeaturesColumnVisibility>(() =>
    loadFeaturesColumnVisibility(),
  )
  /** Shared with 价格表 · 全部类型 so metering column menu matches. */
  const [meteringColumnVisibility, setMeteringColumnVisibility] = useState<CostColumnVisibility>(
    () => loadCostColumnVisibility(),
  )
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<number | null>(null)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const [saving, setSaving] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [, setDraftType] = useState<PmFeatureType>('labor')
  /** Menu filter: 人力…仪器 / 「全部」. */
  const [viewFilter, setViewFilter] = useState<PmFeatureViewFilter>(
    () => lockedViewFilter ?? 'scheduleAll',
  )
  /** horizontal = resources as rows; vertical = months as rows. */
  const [matrixLayout, setMatrixLayout] = useState<'horizontal' | 'vertical'>('horizontal')
  const [workItems, setWorkItems] = useState<PmWorkItem[]>([])
  const rowsRef = useRef<PmFeatureRow[]>([])

  const scopeKey = isAllScope ? PM_FEATURE_APPLICABLE_ALL : (editingProject?.id ?? '')
  const showTrailingMenus = lockedViewFilter == null

  rowsRef.current = rows

  useEffect(() => {
    if (lockedViewFilter == null) return
    setViewFilter(lockedViewFilter)
    if (lockedViewFilter !== 'scheduleAll' && isPmFeatureType(lockedViewFilter)) {
      setDraftType(lockedViewFilter)
    }
  }, [lockedViewFilter])

  useEffect(() => {
    if (!embedded) return
    onEmbeddedSelectionChange?.(selectedId != null || checkedIds.size > 0)
  }, [checkedIds.size, embedded, onEmbeddedSelectionChange, selectedId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (isAllScope) {
          const batches = await Promise.all(
            projects.map((project) =>
              pmApi.listWorkItems({
                workspaceId,
                projectId: project.id,
                domain: 'progress_management',
                limit: 1000,
              }),
            ),
          )
          if (cancelled) return
          setWorkItems(batches.flatMap((batch) => batch.items))
          return
        }
        if (!editingProject) {
          if (!cancelled) setWorkItems([])
          return
        }
        const result = await pmApi.listWorkItems({
          workspaceId,
          projectId: editingProject.id,
          domain: 'progress_management',
          limit: 1000,
        })
        if (!cancelled) setWorkItems(result.items)
      } catch {
        if (!cancelled) setWorkItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editingProject, isAllScope, projects, scopeKey, workspaceId])

  const assignableResourceCatalog = useMemo(() => {
    if (isAllScope) {
      return projects.flatMap((project) =>
        resolveAssignableResourceCatalog(workspaceId, project.id, project.metadata),
      )
    }
    if (!editingProject) return []
    return resolveAssignableResourceCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
  }, [editingProject, isAllScope, projects, workspaceId])

  const unitLookup = useMemo(
    () => buildResourceUnitLookup(assignableResourceCatalog),
    [assignableResourceCatalog],
  )

  const costCatalog = useMemo(() => {
    if (isAllScope) {
      return resolveProjectCostCatalog(workspaceId, null).rows
    }
    if (!editingProject) return []
    return resolveProjectCostCatalog(workspaceId, editingProject.metadata).rows
  }, [editingProject, isAllScope, workspaceId])

  const ganttSeeds = useMemo(
    () => collectGanttFeatureSeeds(workItems, unitLookup, assignableResourceCatalog),
    [assignableResourceCatalog, unitLookup, workItems],
  )

  const costSeeds = useMemo(
    () => collectGanttCostSeeds(workItems, costCatalog),
    [costCatalog, workItems],
  )

  const procurementSeeds = useMemo(
    () => collectGanttProcurementSeeds(workItems, assignableResourceCatalog),
    [assignableResourceCatalog, workItems],
  )

  const nodeSeeds = useMemo(() => collectGanttNodeSeeds(workItems), [workItems])

  useEffect(() => {
    if (dirty) return

    if (isAllScope) {
      const shared = readSharedFeatureCatalog(workspaceId)
      const stripped = stripLiveFeatureRows(shared.rows)
      if (shared.isDefault || stripped.changed) {
        writeSharedFeatureCatalog(workspaceId, stripped.rows)
      }
      const liveProcurement = buildLiveProcurementFeatureRows(
        procurementSeeds,
        assignableResourceCatalog,
        stripped.rows,
        PM_FEATURE_APPLICABLE_ALL,
      )
      const liveNodes = buildLiveNodeFeatureRows(nodeSeeds, null, PM_FEATURE_APPLICABLE_ALL)
      setRows(
        reindexFeatureRows([
          ...buildLiveScheduleFeatureRows(
            ganttSeeds,
            assignableResourceCatalog,
            [],
            PM_FEATURE_APPLICABLE_ALL,
          ),
          ...buildLiveFundsFeatureRows(costSeeds, [], PM_FEATURE_APPLICABLE_ALL),
          ...liveProcurement,
          ...liveNodes,
          ...excludeProcurementRowsCoveredByLive(stripped.rows, liveProcurement),
        ]),
      )
      return
    }

    if (!editingProject) {
      setRows([])
      return
    }

    const resolved = resolveProjectFeatureCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
    const stripped = stripLiveFeatureRows(resolved.rows)
    const liveProcurement = buildLiveProcurementFeatureRows(
      procurementSeeds,
      assignableResourceCatalog,
      stripped.rows,
      PM_FEATURE_APPLICABLE_ALL,
    )
    const liveNodes = buildLiveNodeFeatureRows(
      nodeSeeds,
      { name: editingProject.name, code: editingProject.code },
      PM_FEATURE_APPLICABLE_ALL,
    )
    setRows(
      reindexFeatureRows([
        ...buildLiveScheduleFeatureRows(
          ganttSeeds,
          assignableResourceCatalog,
          [],
          PM_FEATURE_APPLICABLE_ALL,
        ),
        ...buildLiveFundsFeatureRows(costSeeds, [], PM_FEATURE_APPLICABLE_ALL),
        ...liveProcurement,
        ...liveNodes,
        ...excludeProcurementRowsCoveredByLive(stripped.rows, liveProcurement),
      ]),
    )
    if (resolved.needsPersist || stripped.changed) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: { [PM_FEATURE_CATALOG_KEY]: stripped.rows },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [
    assignableResourceCatalog,
    costSeeds,
    dirty,
    editingProject,
    ganttSeeds,
    isAllScope,
    nodeSeeds,
    onProjectsChange,
    procurementSeeds,
    scopeKey,
    workspaceId,
  ])

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const isFundsView = viewFilter === 'funds'
  const isProcurementView = viewFilter === 'procurement'
  const isNodeView = viewFilter === 'node'
  const isResourceStatView = isFeaturesResourceStatFilter(viewFilter)
  const costCatalogOrder = useMemo(
    () => buildCostCatalogOrderIndex(costCatalog),
    [costCatalog],
  )
  const visibleRows = useMemo(
    () => computeVisibleRows(rows, viewFilter, costCatalogOrder),
    [costCatalogOrder, rows, viewFilter],
  )
  const selectedRow = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedType: PmFeatureViewFilter = viewFilter
  const addType: PmFeatureType =
    viewFilter === 'scheduleAll'
      ? (selectedRow?.type ?? 'labor')
      : viewFilter === 'funds'
        ? selectedRow && isPmFeatureCostPrimaryType(selectedRow.type)
          ? selectedRow.type
          : 'comprehensive'
        : viewFilter
  const quantityFromGanttHint = isFundsView
    ? t('projectManagerPage.files.table.quantityFromCostHint')
    : viewFilter === 'scheduleAll'
      ? t('projectManagerPage.files.table.quantityFromGanttHint')
      : usesNonStackingPeakRollup(viewFilter)
        ? t('projectManagerPage.files.table.quantityFromGanttHintMachinery')
        : usesPeakConcurrentRollup(viewFilter)
          ? t('projectManagerPage.files.table.quantityFromGanttHintPeak')
          : t('projectManagerPage.files.table.quantityFromGanttHint')
  const monthFromGanttHint = isFundsView
    ? t('projectManagerPage.files.table.monthFromCostHint')
    : viewFilter === 'scheduleAll'
      ? t('projectManagerPage.files.table.monthFromGanttHint')
      : usesNonStackingPeakRollup(viewFilter)
        ? t('projectManagerPage.files.table.monthFromGanttHintMachinery')
        : usesPeakConcurrentRollup(viewFilter)
          ? t('projectManagerPage.files.table.monthFromGanttHintPeak')
          : t('projectManagerPage.files.table.monthFromGanttHint')

  const isMeteringCostView = lockedViewFilter === 'metering' || embedded
  const unitColumnLabel = isFundsView
    ? t('projectManagerPage.costTable.columns.unit')
    : isMeteringCostView
      ? t('projectManagerPage.costTable.columns.unit')
      : t('projectManagerPage.files.table.columns.unit')
  const fundsEngineeringQuantityLabel = t(
    'projectManagerPage.files.table.columns.engineeringQuantity',
  )
  const meteringTotalPriceLabel = t('projectManagerPage.costTable.columns.totalPrice', {
    currency: DEFAULT_COST_CURRENCY,
  })
  const fundsTotalPriceLabel = t('projectManagerPage.files.table.columns.totalPrice')
  /** Column header labels: metering (cost · 价格表) uses price-list naming. */
  const featureColumnLabel = useCallback(
    (
      column:
        | 'index'
        | 'type'
        | 'name'
        | 'quantity'
        | 'start'
        | 'finish'
        | 'remark'
        | 'sectionalWork'
        | 'code'
        | 'featureDescription'
        | 'unitPrice'
        | 'totalPrice',
    ) => {
      if (isMeteringCostView) {
        switch (column) {
          case 'index':
            return t('projectManagerPage.costTable.columns.index')
          case 'type':
            return t('projectManagerPage.costTable.columns.type')
          case 'name':
            return t('projectManagerPage.costTable.columns.name')
          case 'quantity':
            return t('projectManagerPage.costTable.columns.quantity')
          case 'remark':
            return t('projectManagerPage.costTable.columns.note')
          case 'sectionalWork':
            return t('projectManagerPage.costTable.columns.sectionalWork')
          case 'code':
            return t('projectManagerPage.costTable.columns.code')
          case 'featureDescription':
            return t('projectManagerPage.costTable.columns.featureDescription')
          case 'unitPrice':
            return t('projectManagerPage.costTable.columns.unitPrice')
          case 'totalPrice':
            return meteringTotalPriceLabel
          default:
            return t(`projectManagerPage.files.table.columns.${column}`)
        }
      }
      if (isNodeView && column === 'name') {
        return t('projectManagerPage.files.table.columns.milestoneName')
      }
      if (isFundsView && (column === 'unitPrice' || column === 'totalPrice')) {
        return column === 'totalPrice'
          ? fundsTotalPriceLabel
          : t('projectManagerPage.files.table.columns.unitPrice')
      }
      return t(`projectManagerPage.files.table.columns.${column}`)
    },
    [fundsTotalPriceLabel, isFundsView, isMeteringCostView, isNodeView, meteringTotalPriceLabel, t],
  )
  /** Funds shows 工程数量 in its own column; hide the generic quantity column. */
  const showQuantityColumn = columnVisibility.quantity && !isFundsView && !isNodeView
  const showPricingUnitColumn =
    (isProcurementView || isResourceStatView) &&
    columnVisibility.pricingUnit &&
    !isMeteringCostView
  const showUnitPriceColumn =
    (isResourceStatView || isFundsView) &&
    columnVisibility.unitPrice &&
    !isMeteringCostView
  const showTotalPriceColumn =
    (isResourceStatView || isFundsView) &&
    columnVisibility.totalPrice &&
    !isMeteringCostView
  const showMeteringMethodColumn =
    isResourceStatView && columnVisibility.meteringMethod && !isMeteringCostView
  const showPricingQuantityColumn =
    isResourceStatView && columnVisibility.pricingQuantity && !isMeteringCostView
  const showPurchaseCycleColumn =
    isProcurementView && columnVisibility.purchaseCycle && !isMeteringCostView
  const showTransportCycleColumn =
    isProcurementView && columnVisibility.transportCycle && !isMeteringCostView
  /** Metering under 价格表 matches the price-list column set (no schedule date/month cols). */
  const showUnitColumn =
    !isNodeView && (isMeteringCostView ? meteringColumnVisibility.unit : columnVisibility.unit)
  /** 资金: 工程数量 after 单位 (name → unit → engineering quantity → …). */
  const showFundsEngineeringQuantityColumn = isFundsView
  const showTypeColumn = isMeteringCostView
    ? meteringColumnVisibility.type
    : isNodeView
      ? false
      : columnVisibility.type
  const showNameColumn = isMeteringCostView
    ? meteringColumnVisibility.name
    : isNodeView
      ? true
      : columnVisibility.name
  const showDurationColumn = isNodeView && columnVisibility.duration
  const showStartColumn = !isMeteringCostView && !isNodeView && columnVisibility.start
  const showFinishColumn = !isMeteringCostView && columnVisibility.finish
  const showPlannedPercentColumn = isNodeView && columnVisibility.plannedPercent
  const showRemarkColumn =
    !isNodeView &&
    (isMeteringCostView ? meteringColumnVisibility.note : columnVisibility.remark)

  const resourceRollups = useMemo(
    () => computeFeatureGanttRollups(workItems, rows),
    [rows, workItems],
  )
  const costRollups = useMemo(
    () => computeFeatureCostRollups(workItems, rows, costCatalog),
    [costCatalog, rows, workItems],
  )
  const nodeRollups = useMemo(
    () => computeFeatureNodeRollups(nodeSeeds, rows, workItems),
    [nodeSeeds, rows, workItems],
  )
  const rollups = isFundsView ? costRollups : resourceRollups
  const fundsSectionMetaByRowId = useMemo(
    () => buildFundsSectionMetaByRowId(costSeeds),
    [costSeeds],
  )
  const fundsDisplayEntries = useMemo(() => {
    if (!isFundsView) return null
    return buildFundsDisplayEntries(
      visibleRows,
      fundsSectionMetaByRowId,
      rollups,
      t('projectManagerPage.costTable.views.sectionEmpty'),
    )
  }, [fundsSectionMetaByRowId, isFundsView, rollups, t, visibleRows])
  const fundsTotals = useMemo(() => {
    if (!isFundsView) return null
    return computeFundsTotals(visibleRows, rollups)
  }, [isFundsView, rollups, visibleRows])
  const resourceStatTotals = useMemo(() => {
    if (!isResourceStatView || visibleRows.length === 0) return null
    return computeResourceStatTotals(visibleRows, rollups, {
      sumQuantities: viewFilter !== 'scheduleAll',
    })
  }, [isResourceStatView, rollups, viewFilter, visibleRows])
  const monthKeys = useMemo(() => {
    const scoped = new Map(
      visibleRows.map((row) => {
        const rollup = rollups.get(row.id)
        return [
          row.id,
          rollup ?? {
            quantity: 0,
            pricingQuantity: 0,
            startDate: null,
            finishDate: null,
            monthly: {},
          },
        ] as const
      }),
    )
    return collectRollupMonthKeys(scoped)
  }, [rollups, visibleRows])
  const yearBands = useMemo(() => groupMonthKeysByYear(monthKeys), [monthKeys])
  const showMonths =
    columnVisibility.months && monthKeys.length > 0 && !isMeteringCostView && !isNodeView
  const visibleYearBands = useMemo(
    () => (showMonths ? yearBands : []),
    [showMonths, yearBands],
  )
  const visibleMonthKeys = useMemo(
    () => (showMonths ? monthKeys : []),
    [monthKeys, showMonths],
  )
  const headerRowSpan = visibleMonthKeys.length > 0 ? 2 : 1

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
  }, [
    isMeteringCostView,
    matrixLayout,
    meteringColumnVisibility,
    monthKeys.length,
    syncHScrollMetrics,
    visibleRows.length,
  ])

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

  const updateRows = useCallback((updater: (prev: PmFeatureRow[]) => PmFeatureRow[]) => {
    setRows((prev) => reindexFeatureRows(updater(prev)))
    setDirty(true)
  }, [])

  const applyCatalogRows = useCallback(
    (persisted: PmFeatureRow[], options?: { dirty?: boolean }) => {
      const liveProcurement = buildLiveProcurementFeatureRows(
        procurementSeeds,
        assignableResourceCatalog,
        persisted,
        viewApplicable,
      )
      const liveNodes = buildLiveNodeFeatureRows(
        nodeSeeds,
        editingProject
          ? { name: editingProject.name, code: editingProject.code }
          : null,
        viewApplicable,
      )
      const live = [
        ...buildLiveScheduleFeatureRows(
          ganttSeeds,
          assignableResourceCatalog,
          [],
          viewApplicable,
        ),
        ...buildLiveFundsFeatureRows(costSeeds, [], viewApplicable),
        ...liveProcurement,
        ...liveNodes,
      ]
      setRows(
        reindexFeatureRows([
          ...live,
          ...excludeProcurementRowsCoveredByLive(persisted, liveProcurement),
        ]),
      )
      setDirty(options?.dirty ?? false)
    },
    [
      assignableResourceCatalog,
      costSeeds,
      editingProject,
      ganttSeeds,
      nodeSeeds,
      procurementSeeds,
      viewApplicable,
    ],
  )

  const versionSwitchEntries = useMemo((): FeaturesVersionSwitchEntry[] => {
    const history = isAllScope
      ? readSharedFeatureSaveHistory(workspaceId)
      : readFeatureSaveHistory(editingProject?.metadata)
    const currentVersion = isAllScope
      ? readSharedFeatureVersion(workspaceId)
      : readFeatureVersion(editingProject?.metadata)
    return history.map((entry) => ({
      version: entry.version,
      name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
        version: String(entry.version),
      }),
      hasSnapshot: Array.isArray(entry.catalog),
      isCurrent: entry.version === currentVersion,
    }))
  }, [dirty, editingProject?.metadata, isAllScope, rows, t, workspaceId])

  const handleConfirmRestoreVersion = useCallback(async () => {
    if (pendingRestoreVersion == null) return
    const version = pendingRestoreVersion
    setPendingRestoreVersion(null)
    setSaving(true)
    try {
      if (isAllScope) {
        const meta = readSharedFeatureSaveMeta(workspaceId)
        const catalog = readFeatureVersionCatalog(meta, version)
        const nextMeta = buildMetadataForFeatureVersionSwitch(meta, version)
        if (!catalog || !nextMeta) {
          window.alert(t('projectManagerPage.files.versionSwitchNoSnapshot'))
          return
        }
        const rowsNext = snapshotToRows(catalog)
        writeSharedFeatureCatalog(workspaceId, rowsNext)
        writeSharedFeatureSaveMeta(workspaceId, nextMeta)
        applyCatalogRows(rowsNext, { dirty: false })
        setSelectedId(null)
        await onProjectsChange?.()
        window.alert(
          t('projectManagerPage.files.restoreVersionSuccess', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(version),
            }),
          }),
        )
        return
      }
      if (!editingProject) return
      const catalog = readFeatureVersionCatalog(editingProject.metadata, version)
      const nextMeta = buildMetadataForFeatureVersionSwitch(editingProject.metadata, version)
      if (!catalog || !nextMeta) {
        window.alert(t('projectManagerPage.files.versionSwitchNoSnapshot'))
        return
      }
      const rowsNext = snapshotToRows(catalog)
      await pmApi.updateProject({
        id: editingProject.id,
        metadata: {
          ...nextMeta,
          [PM_FEATURE_CATALOG_KEY]: rowsNext,
        },
      })
      applyCatalogRows(rowsNext, { dirty: false })
      setSelectedId(null)
      await onProjectsChange?.()
      window.alert(
        t('projectManagerPage.files.restoreVersionSuccess', {
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
    t,
    workspaceId,
  ])

  const handleRestoreVersion = useCallback(
    (version: number) => {
      const currentVersion = isAllScope
        ? readSharedFeatureVersion(workspaceId)
        : readFeatureVersion(editingProject?.metadata)
      if (version === currentVersion) return
      setPendingRestoreVersion(version)
    },
    [editingProject?.metadata, isAllScope, workspaceId],
  )

  const persistProjectCatalog = useCallback(
    async (
      project: PmProject,
      catalog: PmFeatureRow[],
      options?: { bumpVersion?: boolean; note?: string },
    ) => {
      const prevVersion = readFeatureVersion(project.metadata)
      const metadata = {
        ...buildFeatureSaveMetadata(project.metadata ?? {}, {
          featureCount: catalog.length,
          contentFingerprint: fingerprintFeatureCatalog(catalog),
          catalog: toFeatureCatalogSnapshot(catalog),
          bumpVersion: options?.bumpVersion ?? false,
          ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
        }),
        [PM_FEATURE_CATALOG_KEY]: catalog,
      }
      await pmApi.updateProject({
        id: project.id,
        metadata,
      })
      return {
        prevVersion,
        nextVersion: readFeatureVersion(metadata),
      }
    },
    [],
  )

  const propagateSharedToProjects = useCallback(
    async (exceptProjectId?: string | null) => {
      for (const project of projects) {
        if (exceptProjectId && project.id === exceptProjectId) continue
        const resolved = resolveProjectFeatureCatalog(
          workspaceId,
          project.id,
          project.metadata,
        )
        if (!resolved.needsPersist) continue
        // Propagate catalog rows only — do not bump per-project feature versions.
        await pmApi.updateProject({
          id: project.id,
          metadata: { [PM_FEATURE_CATALOG_KEY]: resolved.rows },
        })
      }
    },
    [projects, workspaceId],
  )

  const handleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }): Promise<boolean> => {
      if (!canEdit) {
        window.alert(t('projectManagerPage.files.table.needProject'))
        return false
      }
      const asNewVersion = options?.asNewVersion === true
      const note = options?.note?.trim() || undefined
      setSaving(true)
      try {
        // labor / auxiliary / material / machinery / funds / Gantt materials are live — never persist them raw.
        const persisted = persistFeatureCatalogRows(rows)

        if (isAllScope) {
          const payload = persisted.map((row) => ({
            ...row,
            applicable: PM_FEATURE_APPLICABLE_ALL,
          }))
          const prevVersion = readSharedFeatureVersion(workspaceId)
          writeSharedFeatureCatalog(workspaceId, payload)
          recordSharedFeatureSaveMeta(workspaceId, payload, {
            bumpVersion: asNewVersion,
            note,
          })
          await propagateSharedToProjects()
          applyCatalogRows(payload, { dirty: false })
          await onProjectsChange?.()
          const nextVersion = readSharedFeatureVersion(workspaceId)
          if (nextVersion > prevVersion) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.saveSuccessNewVersion', {
                version: String(nextVersion),
              }),
            })
          } else if (nextVersion > 0) {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.saveSuccessUpdated', {
                version: String(nextVersion),
              }),
            })
          } else {
            setStatusFeedback({
              tone: 'success',
              text: t('projectManagerPage.files.table.saveSuccess'),
            })
          }
          return true
        }
        if (!editingProject) {
          window.alert(t('projectManagerPage.files.table.needProject'))
          return false
        }

        const payload = persisted.map((row) => ({
          ...row,
          applicable:
            row.applicable === PM_FEATURE_APPLICABLE_ALL
              ? PM_FEATURE_APPLICABLE_ALL
              : editingProject.id,
        }))

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
            text: t('projectManagerPage.files.saveSuccessNewVersion', {
              version: String(nextVersion),
            }),
          })
        } else if (nextVersion > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.files.saveSuccessUpdated', {
              version: String(nextVersion),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.files.table.saveSuccess'),
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
      propagateSharedToProjects,
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
      const persisted = persistFeatureCatalogRows(catalog)
      if (isAllScope) {
        const payload = persisted.map((row) => ({
          ...row,
          applicable: PM_FEATURE_APPLICABLE_ALL,
        }))
        writeSharedFeatureCatalog(workspaceId, payload)
        recordSharedFeatureSaveMeta(workspaceId, payload, { bumpVersion: false })
        await propagateSharedToProjects()
        await onProjectsChange?.()
        return
      }
      if (!editingProject) return
      const payload = persisted.map((row) => ({
        ...row,
        applicable:
          row.applicable === PM_FEATURE_APPLICABLE_ALL
            ? PM_FEATURE_APPLICABLE_ALL
            : editingProject.id,
      }))
      await persistProjectCatalog(editingProject, payload, { bumpVersion: false })
      // Refresh parent projects so remount (e.g. leave 计量 → re-enter) does not hydrate
      // from stale metadata and drop the rows we just wrote.
      await onProjectsChange?.()
    } catch {
      // Best-effort leave save.
    }
  }, [
    canEdit,
    editingProject,
    isAllScope,
    onProjectsChange,
    persistProjectCatalog,
    propagateSharedToProjects,
    workspaceId,
  ])

  usePmCatalogAutoSave({ scopeKey, dirty, flush: flushAutoSave })

  useEffect(() => {
    setDirty(false)
    setSelectedId(null)
    setCheckedIds(new Set())
    setSelectionMode(false)
    setContextMenu(null)
    setColumnMenu(null)
    setProjectInfoOpen(false)
    setPendingRestoreVersion(null)
    setMatrixLayout('horizontal')
  }, [scopeKey])

  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.files.table.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.files.table.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  const handleAdd = useCallback(() => {
    if (!canEdit) return
    updateRows((prev) => {
      const next = createEmptyFeatureRow(prev.length, addType, null, viewApplicable)
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
      const next = createEmptyFeatureRow(index, addType, parentId, viewApplicable)
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
        const remove = collectCascadeDeleteIds(prev, ids)
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
    const ids = checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set()
    if (ids.size === 0) return
    setPendingDelete(true)
  }, [checkedIds, selectedId])

  const handleIndent = useCallback(() => {
    if (!selectedId) return
    updateRows((prev) => {
      const index = prev.findIndex((row) => row.id === selectedId)
      if (index <= 0) return prev
      const byIdMap = new Map(prev.map((row) => [row.id, row]))
      const depthRows = prev.map((row) => ({
        item: { id: row.id, parentId: row.parentId },
        depth: featureRowDepth(row, byIdMap),
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
    (type: PmFeatureViewFilter) => {
      if (lockedViewFilter != null) return
      if (type !== 'scheduleAll') {
        setDraftType(type)
      }
      setViewFilter(type)
    },
    [lockedViewFilter],
  )

  const handleScheduleViewChange = useCallback(
    (view: FeaturesScheduleView) => {
      setScheduleView(view)
      const prefs = loadGanttUiPrefs()
      saveGanttUiPrefs({ ...prefs, scheduleView: view as GanttScheduleView })
      onOpenScheduleView?.(view)
    },
    [onOpenScheduleView],
  )

  const handleMenuAction = useCallback(
    (action: FeaturesMenuAction) => {
      if (action === 'scheduleAll') {
        handleTypeChange('scheduleAll')
        return
      }
      if (isPmFeatureType(action)) {
        handleTypeChange(action)
        return
      }
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
        case 'undo':
        case 'redo':
          break
        default:
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
      handleSave,
      handleTypeChange,
    ],
  )

  const patchRow = useCallback(
    (id: string, patch: Partial<PmFeatureRow>) => {
      updateRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    [updateRows],
  )

  const handleRowContextMenu = useCallback(
    (event: ReactMouseEvent, _rowId: string) => {
      if (isPmEditableEventTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      setColumnMenu(null)
      // Right-click opens the menu only — do not enter selection mode until「选择」is clicked.
      setContextMenu(computeContextMenuPosition(event.clientX, event.clientY))
    },
    [],
  )

  const handleTableContextMenu = useCallback((event: ReactMouseEvent) => {
    if (isPmEditableEventTarget(event.target)) return
    event.preventDefault()
    setColumnMenu(null)
    setContextMenu(computeContextMenuPosition(event.clientX, event.clientY))
  }, [])

  const openColumnVisibilityMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setColumnMenu(computeColumnMenuPosition(event.clientX, event.clientY))
  }, [])

  const toggleColumnVisibility = useCallback((column: FeaturesToggleColumn) => {
    setColumnVisibility((prev) => {
      if (column === 'name' && prev.name) return prev
      const next = { ...prev, [column]: !prev[column] }
      if (!next.name) next.name = true
      saveFeaturesColumnVisibility(next)
      return next
    })
  }, [])

  const toggleMeteringColumnVisibility = useCallback((column: CostToggleColumn) => {
    setMeteringColumnVisibility((prev) => {
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

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(visibleRows.map((row) => row.id)))
    setSelectionMode(true)
  }, [visibleRows])

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set())
    setSelectionMode(false)
  }, [])

  const pendingDeleteIds =
    checkedIds.size > 0 ? checkedIds : selectedId ? new Set([selectedId]) : new Set<string>()

  return {
    t,
    workspaceId,
    isAllScope,
    editingProject,
    canEdit,
    saving,
    rows,
    dirty,
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
    meteringColumnVisibility,
    meteringTotalPriceLabel,
    pendingDelete,
    setPendingDelete,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    statusFeedback,
    projectInfoOpen,
    setProjectInfoOpen,
    matrixLayout,
    setMatrixLayout,
    byId,
    isFundsView,
    isProcurementView,
    isNodeView,
    isResourceStatView,
    visibleRows,
    selectedRow,
    selectedType,
    quantityFromGanttHint,
    monthFromGanttHint,
    unitColumnLabel,
    fundsEngineeringQuantityLabel,
    featureColumnLabel,
    showQuantityColumn,
    showPricingUnitColumn,
    showUnitPriceColumn,
    showTotalPriceColumn,
    showMeteringMethodColumn,
    showPricingQuantityColumn,
    showPurchaseCycleColumn,
    showTransportCycleColumn,
    showUnitColumn,
    showFundsEngineeringQuantityColumn,
    showTypeColumn,
    showNameColumn,
    showDurationColumn,
    showStartColumn,
    showFinishColumn,
    showPlannedPercentColumn,
    showRemarkColumn,
    showTrailingMenus,
    lockedViewFilter,
    embedded,
    isMeteringCostView,
    rollups,
    nodeRollups,
    fundsDisplayEntries,
    fundsTotals,
    resourceStatTotals,
    yearBands,
    visibleYearBands,
    visibleMonthKeys,
    headerRowSpan,
    tableScrollRef,
    headerPinInnerRef,
    hTrackRef,
    hScrollMetrics,
    hScrollDragging,
    syncHScrollMetrics,
    onHTrackPointerDown,
    versionSwitchEntries,
    handleRestoreVersion,
    handleConfirmRestoreVersion,
    handleScheduleViewChange,
    scheduleView,
    handleMenuAction,
    flushAutoSave,
    patchRow,
    handleRowContextMenu,
    handleTableContextMenu,
    openColumnVisibilityMenu,
    toggleColumnVisibility,
    toggleMeteringColumnVisibility,
    handleSelectAll,
    handleClearSelection,
    deleteIds,
    pendingDeleteIds,
    handleSave,
  }
}
