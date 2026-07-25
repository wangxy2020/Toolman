import type { CSSProperties, FC, UIEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  buildPmWorkItemForest,
  buildScheduleSaveMetadata,
  computeScheduleTotalDurationDays,
  dedupeVersionBaselines,
  findDuplicateVersionBaselineIds,
  findVersionPlanSnapshot,
  listUserBaselines,
  IpcChannel,
  PM_PENDING_AGENT_REVISION_KEY,
  parseVersionPlanSnapshotName,
  readPendingAgentScheduleRevision,
  readMaxScheduleVersion,
  readSaveHistory,
  readScheduleVersion,
  versionPlanSnapshotName,
  type PmProject,
  type PmScheduleBaseline,
  type PmWorkItem,
  type PmWorkItemRelation,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import { isPmEditableEventTarget, isPmPanelDomActive } from '../../pm-editable-dom'
import { pmApi } from '../../pm-api'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import BaselineCaptureDialog from './BaselineCaptureDialog'
import {
  clearSessionPendingAgentRevision,
  hasSessionPendingAgentRevision,
  isPendingAgentScheduleRevision,
} from '../../pm-pending-revision'
import { ProjectGanttMenuBar, type GanttMenuAction, type GanttVersionSwitchEntry } from './ProjectGanttMenuBar'
import {
  ProjectGanttTaskGrid,
  type GanttColumnLabels,
} from './ProjectGanttTaskGrid'
import ProjectGanttPrintTable from './ProjectGanttPrintTable'
import ProjectInfoDialog from './ProjectInfoDialog'
import {
  resolveProjectCostCatalog,
  type PmCostRow,
} from '../cost/pm-cost-catalog'
import {
  ensureDefaultResourcesInCatalog,
  readSharedResourceCatalog,
  resolveAssignableResourceCatalog,
  sortResourceRowsByTypeMenu,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from '../resource/pm-resource-catalog'
import {
  isEmptyAssignment,
  countResourceAssignmentsForTypeFilter,
  hydrateTaskResourceAssignmentsAgainstCatalog,
  patchTaskResourceAssignmentMetadata,
  readTaskResourceAssignments,
  replaceTaskResourceAssignmentsMetadata,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment'
import {
  hydrateTaskCostAssignmentsAgainstCatalog,
  isEmptyCostAssignment,
  countCostAssignmentsForTypeFilter,
  patchTaskCostAssignmentMetadata,
  readTaskCostAssignments,
  replaceTaskCostAssignmentsMetadata,
  type TaskCostAssignment,
} from './pm-gantt-cost-assignment'
import {
  buildStableRowNumberById,
  findDemoteParentId,
  flattenPmWorkItemForestCollapsed,
  resolveGanttTaskKind,
} from './pm-gantt-tree'
import {
  ACTUAL_FINISH_META_KEY,
  ACTUAL_START_META_KEY,
  GANTT_MAX_DEPTH,
  buildDefaultResourceColumnBindings,
  buildResourceViewColumnOrder,
  buildCostViewColumnOrder,
  buildListViewColumnOrder,
  SHOULD_PERCENT_META_KEY,
  computeGanttDayWidth,
  customColumnMetaKey,
  dateHeaderHeight,
  isGanttBuiltinColumn,
  isGanttCustomColumnId,
  loadGanttUiPrefs,
  PROGRESS_CHECK_COLUMN_ORDER,
  saveGanttUiPrefs,
  withGanttDefaultPredecessorsColumn,
  type GanttAssignTypeFilter,
  type GanttScheduleView,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import {
  barPercentsInRange,
  buildScheduleTimeline,
  finishFromStartDuration,
  formatWorkItemDate,
  GANTT_PROJECT_ROOT_ID,
  GANTT_ROW_HEIGHT,
  isGanttProjectRootId,
  parseDateInput,
  parseDurationDaysInput,
  resolveGanttDayTickStep,
  withGanttProjectRootItems,
  workItemDurationDays,
} from './pm-gantt-utils'
import {
  computeProgressLineStubs,
  nextUserBaselineName,
  nextUserBaselineIndex,
  patchBaselineWorkItemProgress,
  plannedProgressAtDate,
  resolveBaselineAsOfDate,
  suggestBaselineAsOfDate,
  type BaselineCompareMode,
} from './pm-gantt-baseline-compare'
import {
  applyScheduledRangesToItems,
  collectScheduleUpdates,
  computeCriticalTaskIds,
  isSchedulableRelation,
  rangesFromStoredItems,
  scheduleWorkItems,
  startOfLocalDay,
} from './pm-gantt-schedule'
import { parsePredecessors } from './pm-predecessor-utils'
import {
  applyGanttHistorySnapshot,
  cloneGanttSnapshot,
  GanttHistoryStack,
} from './pm-gantt-history'
import {
  collectProgressRollupUpdates,
  buildProgressPercentById,
} from './pm-gantt-progress-rollup'
import { pmScheduleApi } from './pm-schedule-api'

interface Props {
  workspaceId: string
  active?: boolean
  projects: PmProject[]
  selectedProjectId: string | null
  /** Bump to force reload after external plan apply. */
  dataRevision?: number
  onProjectsChange?: () => void | Promise<void>
}

const ProjectScheduleGanttPanel: FC<Props> = ({
  workspaceId,
  projects,
  selectedProjectId,
  dataRevision = 0,
  onProjectsChange,
}) => {
  const { t } = useI18n()
  const [items, setItems] = useState<PmWorkItem[]>([])
  const [relations, setRelations] = useState<PmWorkItemRelation[]>([])
  const [baselines, setBaselines] = useState<PmScheduleBaseline[]>([])
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null)
  const [baselineCompareMode, setBaselineCompareMode] = useState<BaselineCompareMode>('none')
  const [captureBaselineOpen, setCaptureBaselineOpen] = useState(false)
  const [editBaselineOpen, setEditBaselineOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uiPrefs, setUiPrefs] = useState<GanttUiPrefs>(() => loadGanttUiPrefs())
  const [chartPaneWidth, setChartPaneWidth] = useState(600)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [pendingDeleteSelected, setPendingDeleteSelected] = useState(false)
  const [pendingSaveAsNewVersion, setPendingSaveAsNewVersion] = useState(false)
  const [pendingRestoreBaselineId, setPendingRestoreBaselineId] = useState<string | null>(null)
  const [statusFeedback, setStatusFeedback] = usePmStatusFeedback()
  const hasDataRef = useRef(false)
  const scheduleSyncingRef = useRef(false)
  const pendingRescheduleRef = useRef(false)
  /** After version restore, skip one auto-schedule persist so snapshot dates stick. */
  const suppressAutoScheduleRef = useRef(false)
  const lastScheduleFingerprintRef = useRef('')
  /**
   * After restoring a version, show stored dates instead of live auto-schedule overlay
   * until the user edits schedule inputs or saves (which re-snapshots relations).
   */
  const [freezeStoredSchedule, setFreezeStoredSchedule] = useState(false)
  const [historyEpoch, setHistoryEpoch] = useState(0)
  const historyStackRef = useRef(new GanttHistoryStack())
  const historyApplyingRef = useRef(false)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(items)
  const relationsRef = useRef(relations)
  itemsRef.current = items
  relationsRef.current = relations
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const chartHeaderScrollRef = useRef<HTMLDivElement>(null)
  const chartPaneRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  const builtinLabels = useMemo<GanttColumnLabels>(
    () => ({
      index: t('projectManagerPage.schedule.columns.index'),
      name: t('projectManagerPage.schedule.columns.name'),
      duration: t('projectManagerPage.schedule.columns.duration'),
      start: t('projectManagerPage.schedule.columns.start'),
      finish: t('projectManagerPage.schedule.columns.finish'),
      predecessors: t('projectManagerPage.schedule.columns.predecessors'),
      actualStart: t('projectManagerPage.schedule.columns.actualStart'),
      actualFinish: t('projectManagerPage.schedule.columns.actualFinish'),
      shouldPercentComplete: t('projectManagerPage.schedule.columns.shouldPercentComplete'),
      percentComplete: t('projectManagerPage.schedule.columns.percentComplete'),
      variance: t('projectManagerPage.schedule.columns.variance'),
    }),
    [t],
  )

  const handlePrefsChange = useCallback((next: GanttUiPrefs) => {
    setUiPrefs(next)
    saveGanttUiPrefs(next)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'tm-pm-gantt-ui-prefs') {
        setUiPrefs(loadGanttUiPrefs())
      }
    }
    window.addEventListener('storage', onStorage)
    const onPrefsEvent = () => setUiPrefs(loadGanttUiPrefs())
    window.addEventListener('tm-pm-gantt-prefs', onPrefsEvent)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('tm-pm-gantt-prefs', onPrefsEvent)
    }
  }, [])

  useEffect(() => {
    const pane = chartPaneRef.current
    if (!pane) return
    const update = () => {
      // Use content box width so the fitted timeline never exceeds the visible area.
      const width = Math.floor(pane.getBoundingClientRect().width)
      if (width > 0) setChartPaneWidth(width)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(pane)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [projects.length, selectedProjectId, uiPrefs.scheduleView])

  const loadProjectData = useCallback(
    async (
      projectId: string | null,
    ): Promise<{ items: PmWorkItem[]; relations: PmWorkItemRelation[] } | null> => {
      if (!projectId) {
        setItems([])
        setRelations([])
        setBaselines([])
        setSelectedBaselineId(null)
        return null
      }
      const [relationResult, itemResult] = await Promise.all([
        pmScheduleApi.listRelations(workspaceId, projectId),
        pmApi.listWorkItems({
          workspaceId,
          projectId,
          domain: 'progress_management',
          limit: 1000,
        }),
      ])
      setRelations(relationResult.relations)
      setItems(itemResult.items)

      let listedBaselines: PmScheduleBaseline[] = []
      try {
        const baselineResult = await pmScheduleApi.listBaselines(workspaceId, projectId)
        listedBaselines = baselineResult.baselines
      } catch {
        listedBaselines = []
      }

      // Soft-delete older duplicate version-plan snapshots only (not user baselines).
      const duplicateIds = findDuplicateVersionBaselineIds(listedBaselines)
      if (duplicateIds.length > 0) {
        await Promise.all(
          duplicateIds.map(async (id) => {
            try {
              await pmScheduleApi.deleteBaseline(id, { allowVersionPlan: true })
            } catch {
              // ignore; UI still dedupes below
            }
          }),
        )
        listedBaselines = listedBaselines.filter((entry) => !duplicateIds.includes(entry.id))
      }

      // Do NOT backfill missing version plan snapshots from the current plan — that makes
      // "switch to version N" a no-op and pollutes history with identical snapshots.

      listedBaselines = dedupeVersionBaselines(listedBaselines)
      setBaselines(listedBaselines)
      // Compare is opt-in: keep selection only if it still exists; never auto-pick.
      setSelectedBaselineId((currentId) => {
        if (
          currentId &&
          listUserBaselines(listedBaselines).some((entry) => entry.id === currentId)
        ) {
          return currentId
        }
        return null
      })
      return { items: itemResult.items, relations: relationResult.relations }
    },
    [workspaceId],
  )

  const reloadProjectData = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true)
    setError(null)
    try {
      await loadProjectData(selectedProjectId)
      hasDataRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [loadProjectData, selectedProjectId])

  useEffect(() => {
    hasDataRef.current = false
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
    void reloadProjectData()
  }, [reloadProjectData, dataRevision])

  const canUndo = historyEpoch >= 0 && historyStackRef.current.canUndo
  const canRedo = historyEpoch >= 0 && historyStackRef.current.canRedo

  useEffect(() => {
    setCheckedIds(new Set())
    setSelectedId(null)
    setFreezeStoredSchedule(false)
    setSelectedBaselineId(null)
    setBaselineCompareMode('none')
    setCaptureBaselineOpen(false)
    setEditBaselineOpen(false)
    suppressAutoScheduleRef.current = false
    lastScheduleFingerprintRef.current = ''
    historyStackRef.current.clear()
    setHistoryEpoch((value) => value + 1)
  }, [selectedProjectId])

  const captureHistoryBeforeChange = useCallback(() => {
    if (historyApplyingRef.current) return
    historyStackRef.current.pushBeforeChange(
      cloneGanttSnapshot(itemsRef.current, relationsRef.current),
    )
    setHistoryEpoch((value) => value + 1)
  }, [])

  const applyHistoryTarget = useCallback(
    async (target: ReturnType<typeof cloneGanttSnapshot>) => {
      if (!selectedProjectId) return
      historyApplyingRef.current = true
      suppressAutoScheduleRef.current = true
      setFreezeStoredSchedule(true)
      try {
        await applyGanttHistorySnapshot(
          workspaceId,
          selectedProjectId,
          cloneGanttSnapshot(itemsRef.current, relationsRef.current),
          target,
        )
        lastScheduleFingerprintRef.current = ''
        await loadProjectData(selectedProjectId)
      } finally {
        historyApplyingRef.current = false
        setHistoryEpoch((value) => value + 1)
      }
    },
    [loadProjectData, selectedProjectId, workspaceId],
  )

  const handleUndo = useCallback(async () => {
    if (!selectedProjectId || !historyStackRef.current.canUndo) return
    const current = cloneGanttSnapshot(itemsRef.current, relationsRef.current)
    const previous = historyStackRef.current.popUndo(current)
    if (!previous) return
    setHistoryEpoch((value) => value + 1)
    try {
      await applyHistoryTarget(previous)
    } catch (err) {
      historyStackRef.current.revertFailedUndo(previous)
      setHistoryEpoch((value) => value + 1)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [applyHistoryTarget, selectedProjectId])

  const handleRedo = useCallback(async () => {
    if (!selectedProjectId || !historyStackRef.current.canRedo) return
    const current = cloneGanttSnapshot(itemsRef.current, relationsRef.current)
    const next = historyStackRef.current.popRedo(current)
    if (!next) return
    setHistoryEpoch((value) => value + 1)
    try {
      await applyHistoryTarget(next)
    } catch (err) {
      historyStackRef.current.revertFailedRedo(next)
      setHistoryEpoch((value) => value + 1)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [applyHistoryTarget, selectedProjectId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPmPanelDomActive(panelRootRef.current)) return
      if (projectInfoOpen || pendingDeleteSelected || pendingRestoreBaselineId) return
      if (isPmEditableEventTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void handleUndo()
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleRedo,
    handleUndo,
    pendingDeleteSelected,
    pendingRestoreBaselineId,
    projectInfoOpen,
  ])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const resourceCatalog = useMemo((): PmResourceRow[] => {
    if (!selectedProject) return []
    return resolveAssignableResourceCatalog(
      workspaceId,
      selectedProject.id,
      selectedProject.metadata,
      { projectCode: selectedProject.code },
    )
  }, [selectedProject, workspaceId])

  const costCatalog = useMemo((): PmCostRow[] => {
    if (!selectedProject) return []
    return resolveProjectCostCatalog(workspaceId, selectedProject.metadata).rows
  }, [selectedProject, workspaceId])

  const resourceColumnCatalog = useMemo((): PmResourceRow[] => {
    const shared = readSharedResourceCatalog(workspaceId)
    const ensured = ensureDefaultResourcesInCatalog(shared.rows)
    const ordered = sortResourceRowsByTypeMenu(ensured.rows)
    if (shared.isDefault || ensured.changed) {
      writeSharedResourceCatalog(workspaceId, ordered)
    }
    return ordered
  }, [workspaceId])

  /** Rewrite stale assignment types (e.g. 模板 still stored as material) to match resource list. */
  const assignmentHydrateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || resourceCatalog.length === 0) return
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const item of items) {
      if (item.type === 'milestone') continue
      const current = readTaskResourceAssignments(item.metadata)
      if (current.length === 0) continue
      const hydrated = hydrateTaskResourceAssignmentsAgainstCatalog(current, resourceCatalog)
      if (!hydrated.changed) continue
      updates.push({
        id: item.id,
        metadata: replaceTaskResourceAssignmentsMetadata(item.metadata, hydrated.assignments),
      })
    }
    if (updates.length === 0) {
      assignmentHydrateKeyRef.current = selectedProjectId
      return
    }
    const hydrateKey = `${selectedProjectId}:${updates.map((entry) => entry.id).join(',')}`
    if (assignmentHydrateKeyRef.current === hydrateKey) return
    assignmentHydrateKeyRef.current = hydrateKey
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(
          updates.map((entry) =>
            pmApi.updateWorkItem({ id: entry.id, metadata: entry.metadata }),
          ),
        )
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        assignmentHydrateKeyRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [items, loadProjectData, resourceCatalog, selectedProjectId])

  /** Bind legacy cost assignments (name-only) to price-list ids when possible. */
  const costAssignmentHydrateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || costCatalog.length === 0) return
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const item of items) {
      if (item.type === 'milestone') continue
      const current = readTaskCostAssignments(item.metadata)
      if (current.length === 0) continue
      const hydrated = hydrateTaskCostAssignmentsAgainstCatalog(current, costCatalog)
      if (!hydrated.changed) continue
      updates.push({
        id: item.id,
        metadata: replaceTaskCostAssignmentsMetadata(item.metadata, hydrated.assignments),
      })
    }
    if (updates.length === 0) {
      costAssignmentHydrateKeyRef.current = selectedProjectId
      return
    }
    const hydrateKey = `${selectedProjectId}:cost:${updates.map((entry) => entry.id).join(',')}`
    if (costAssignmentHydrateKeyRef.current === hydrateKey) return
    costAssignmentHydrateKeyRef.current = hydrateKey
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(
          updates.map((entry) =>
            pmApi.updateWorkItem({ id: entry.id, metadata: entry.metadata }),
          ),
        )
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        costAssignmentHydrateKeyRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [costCatalog, items, loadProjectData, selectedProjectId])

  /** Remove leftover ancestor↔descendant links (e.g. after older demotes) so CP stays consistent. */
  const prunedAncestorRelationsRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedProjectId || items.length === 0 || relations.length === 0) return
    const byId = new Map(items.map((entry) => [entry.id, entry]))
    const stale = relations.filter((relation) => !isSchedulableRelation(relation, byId))
    if (stale.length === 0) {
      prunedAncestorRelationsRef.current = selectedProjectId
      return
    }
    const key = `${selectedProjectId}:${stale
      .map((entry) => entry.id)
      .sort()
      .join(',')}`
    if (prunedAncestorRelationsRef.current === key) return
    prunedAncestorRelationsRef.current = key
    let cancelled = false
    void (async () => {
      try {
        await Promise.all(stale.map((relation) => pmScheduleApi.deleteRelation(relation.id)))
        if (!cancelled) await loadProjectData(selectedProjectId)
      } catch {
        prunedAncestorRelationsRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [items, loadProjectData, relations, selectedProjectId])

  /** Widest per-task assignment count — resource view must show at least this many columns. */
  const maxResourceAssignmentSlots = useMemo(() => {
    const typeFilter = uiPrefs.resourceView.typeFilter ?? 'all'
    let max = 0
    for (const item of items) {
      if (item.type === 'milestone') continue
      const count = countResourceAssignmentsForTypeFilter(
        readTaskResourceAssignments(item.metadata),
        typeFilter === 'all' ? 'all' : typeFilter,
      )
      if (count > max) max = count
    }
    return max
  }, [items, uiPrefs.resourceView.typeFilter])

  /** Widest per-task cost assignment count — cost view must show at least this many columns. */
  const maxCostAssignmentSlots = useMemo(() => {
    const typeFilter = uiPrefs.costView.typeFilter ?? 'all'
    let max = 0
    for (const item of items) {
      if (item.type === 'milestone') continue
      const count = countCostAssignmentsForTypeFilter(
        readTaskCostAssignments(item.metadata),
        typeFilter === 'all' ? 'all' : typeFilter,
      )
      if (count > max) max = count
    }
    return max
  }, [items, uiPrefs.costView.typeFilter])

  const itemsForView = useMemo(
    () => withGanttProjectRootItems(selectedProject, items),
    [items, selectedProject],
  )

  const forest = useMemo(() => buildPmWorkItemForest(itemsForView), [itemsForView])
  const rowNumberById = useMemo(
    () => buildStableRowNumberById(forest, { skipIds: new Set([GANTT_PROJECT_ROOT_ID]) }),
    [forest],
  )
  const treeRowsRaw = useMemo(
    () => flattenPmWorkItemForestCollapsed(forest, collapsedIds, rowNumberById),
    [collapsedIds, forest, rowNumberById],
  )

  const scheduled = useMemo(() => scheduleWorkItems(items, relations), [items, relations])
  /** Critical path must use the same early dates the bars show (live schedule vs frozen stored). */
  const criticalSchedule = useMemo(
    () => (freezeStoredSchedule ? rangesFromStoredItems(items) : scheduled),
    [freezeStoredSchedule, items, scheduled],
  )
  const criticalIds = useMemo(
    () => computeCriticalTaskIds(items, relations, criticalSchedule),
    [criticalSchedule, items, relations],
  )
  const displayItems = useMemo(() => {
    const scheduledItems = freezeStoredSchedule
      ? items
      : applyScheduledRangesToItems(items, scheduled)
    return withGanttProjectRootItems(selectedProject, scheduledItems)
  }, [freezeStoredSchedule, items, scheduled, selectedProject])
  const displayById = useMemo(
    () => new Map(displayItems.map((item) => [item.id, item])),
    [displayItems],
  )

  const treeRows = useMemo(
    () =>
      treeRowsRaw.map((row) => ({
        ...row,
        item: displayById.get(row.item.id) ?? row.item,
      })),
    [displayById, treeRowsRaw],
  )

  const visibleItems = useMemo(() => treeRows.map((row) => row.item), [treeRows])
  const timeline = useMemo(() => {
    const rough = buildScheduleTimeline(visibleItems, {
      weekStartsOn: uiPrefs.calendarWeekStartsOn,
    })
    const paneWidth = Math.max(chartPaneWidth, 1)
    // Always compress the full project range into the visible chart width.
    const fittedDayWidth = computeGanttDayWidth(rough.dayCount, paneWidth, 0)
    const dayTickStep = resolveGanttDayTickStep(rough.dayCount, paneWidth)
    return buildScheduleTimeline(visibleItems, {
      dayWidth: fittedDayWidth,
      weekStartsOn: uiPrefs.calendarWeekStartsOn,
      dayTickStep,
      paneWidthPx: paneWidth,
    })
  }, [visibleItems, chartPaneWidth, uiPrefs.calendarWeekStartsOn])
  const headerHeight = dateHeaderHeight(uiPrefs.dateHeaderMode)
  /** Stable 序号 map — includes collapsed rows so predecessors stay valid. */
  const indexById = rowNumberById
  const idByIndex = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, index] of rowNumberById) {
      if (index <= 0 || isGanttProjectRootId(id)) continue
      map.set(index, id)
    }
    return map
  }, [rowNumberById])
  const baseline = useMemo(
    () => baselines.find((entry) => entry.id === selectedBaselineId) ?? null,
    [baselines, selectedBaselineId],
  )
  const baselineByItemId = useMemo(() => {
    const map = new Map<
      string,
      { startDate?: number; dueDate?: number; progressPercent?: number }
    >()
    if (!baseline || baselineCompareMode === 'none') return map
    for (const entry of baseline.snapshot.workItems) {
      map.set(entry.workItemId, {
        startDate: entry.startDate,
        dueDate: entry.dueDate,
        progressPercent:
          typeof entry.progressPercent === 'number' && Number.isFinite(entry.progressPercent)
            ? Math.min(100, Math.max(0, Math.floor(entry.progressPercent)))
            : 0,
      })
    }
    return map
  }, [baseline, baselineCompareMode])

  const liveProgressPercentById = useMemo(() => buildProgressPercentById(items), [items])

  const showBaselineVariance =
    (baselineCompareMode === 'gantt' || baselineCompareMode === 'progressLine') &&
    baseline != null

  /** While comparing a baseline, show that snapshot's actual % (not live progress). */
  const progressPercentById = useMemo(() => {
    if (!showBaselineVariance || baselineByItemId.size === 0) return liveProgressPercentById
    const map = new Map(liveProgressPercentById)
    for (const [id, plan] of baselineByItemId) {
      if (typeof plan.progressPercent === 'number' && Number.isFinite(plan.progressPercent)) {
        map.set(id, plan.progressPercent)
      }
    }
    return map
  }, [baselineByItemId, liveProgressPercentById, showBaselineVariance])

  const showGanttBaselineGhosts =
    baselineCompareMode === 'gantt' && selectedBaselineId != null && baselineByItemId.size > 0

  const progressLine = useMemo(() => {
    if (baselineCompareMode !== 'progressLine' || !baseline) {
      return {
        stubs: [] as ReturnType<typeof computeProgressLineStubs>['stubs'],
        statusLeftPercent: 0,
      }
    }
    return computeProgressLineStubs({
      rows: treeRows,
      baselineByItemId,
      statusDateMs: resolveBaselineAsOfDate(baseline),
      rangeStart: timeline.rangeStart,
      rangeEnd: timeline.rangeEnd,
      progressPercentById,
    })
  }, [
    baseline,
    baselineByItemId,
    baselineCompareMode,
    progressPercentById,
    timeline.rangeEnd,
    timeline.rangeStart,
    treeRows,
  ])

  const userBaselines = useMemo(
    () =>
      listUserBaselines(baselines).map((entry) => ({
        id: entry.id,
        name: entry.name,
        createdAt: entry.createdAt,
        capturedAt: entry.snapshot.capturedAt ?? entry.createdAt,
        asOfDate: resolveBaselineAsOfDate(entry),
      })),
    [baselines],
  )

  const nextCaptureAsOfMs = useMemo(() => suggestBaselineAsOfDate(items), [items])

  const nextCaptureBaselineIndex = useMemo(
    () => nextUserBaselineIndex(userBaselines),
    [userBaselines],
  )

  const nextCaptureBaselineName = useMemo(
    () =>
      nextUserBaselineName(userBaselines, formatWorkItemDate(nextCaptureAsOfMs)),
    [userBaselines, nextCaptureAsOfMs],
  )

  const versionSwitchEntries = useMemo((): GanttVersionSwitchEntry[] => {
    const history = readSaveHistory(selectedProject?.metadata)
    const currentVersion = readScheduleVersion(selectedProject?.metadata)
    if (history.length === 0) return []
    return history.map((entry) => {
      const matched = findVersionPlanSnapshot(baselines, entry.version)
      return {
        version: entry.version,
        name: t('projectManagerPage.schedule.versionBaselineName', {
          version: String(entry.version),
        }),
        baselineId: matched?.id ?? null,
        isCurrent: entry.version === currentVersion,
      }
    })
  }, [baselines, selectedProject?.metadata, t])

  const persistAutoSchedule = useCallback(
    async (snapshot?: { items: PmWorkItem[]; relations: PmWorkItemRelation[] }) => {
      if (!selectedProjectId) return
      if (scheduleSyncingRef.current) {
        pendingRescheduleRef.current = true
        return
      }
      scheduleSyncingRef.current = true
      let sourceItems = snapshot?.items ?? items
      let sourceRelations = snapshot?.relations ?? relations
      const maxIterations = 8
      try {
        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          pendingRescheduleRef.current = false
          const next = scheduleWorkItems(sourceItems, sourceRelations)
          const updates = collectScheduleUpdates(sourceItems, next)
          if (updates.length === 0) break
          const fingerprint = updates
            .map((update) => `${update.id}:${update.startDate}:${update.dueDate}`)
            .sort()
            .join('|')
          if (fingerprint === lastScheduleFingerprintRef.current) break
          lastScheduleFingerprintRef.current = fingerprint
          await Promise.all(
            updates.map((update) =>
              pmApi.updateWorkItem({
                id: update.id,
                startDate: update.startDate,
                dueDate: update.dueDate,
              }),
            ),
          )
          const loaded = await loadProjectData(selectedProjectId)
          if (!loaded) break
          sourceItems = loaded.items
          sourceRelations = loaded.relations
          if (!pendingRescheduleRef.current) break
        }
      } finally {
        scheduleSyncingRef.current = false
      }
      if (pendingRescheduleRef.current) {
        queueMicrotask(() => {
          void persistAutoSchedule()
        })
      }
    },
    [items, loadProjectData, relations, selectedProjectId],
  )

  useEffect(() => {
    if (!selectedProjectId || items.length === 0) return
    if (suppressAutoScheduleRef.current) {
      // Accept restored (or just-loaded) dates: remember what auto-schedule would
      // change, but do not write — otherwise version switch is immediately undone.
      const updates = collectScheduleUpdates(items, scheduleWorkItems(items, relations))
      if (updates.length > 0) {
        lastScheduleFingerprintRef.current = updates
          .map((update) => `${update.id}:${update.startDate}:${update.dueDate}`)
          .sort()
          .join('|')
      } else {
        lastScheduleFingerprintRef.current = ''
      }
      suppressAutoScheduleRef.current = false
      return
    }
    if (scheduleSyncingRef.current) {
      pendingRescheduleRef.current = true
      return
    }
    const updates = collectScheduleUpdates(items, scheduleWorkItems(items, relations))
    if (updates.length === 0) return
    const fingerprint = updates
      .map((update) => `${update.id}:${update.startDate}:${update.dueDate}`)
      .sort()
      .join('|')
    if (fingerprint === lastScheduleFingerprintRef.current) return
    void persistAutoSchedule()
  }, [items, persistAutoSchedule, relations, selectedProjectId])

  const chartHeight = Math.max(treeRows.length, 1) * GANTT_ROW_HEIGHT
  const selectedIndex = selectedId
    ? treeRows.findIndex((row) => row.item.id === selectedId)
    : -1
  const selectedItem = selectedIndex >= 0 ? treeRows[selectedIndex]?.item : null

  const syncScroll = (source: 'grid' | 'chart') => (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    const top = event.currentTarget.scrollTop
    const target = source === 'grid' ? chartScrollRef.current : gridScrollRef.current
    if (!target || target.scrollTop === top) return
    syncingScroll.current = true
    target.scrollTop = top
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  const syncChartHorizontal = (source: 'header' | 'body') => (event: UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return
    const left = event.currentTarget.scrollLeft
    const target = source === 'header' ? chartScrollRef.current : chartHeaderScrollRef.current
    if (!target || target.scrollLeft === left) return
    syncingScroll.current = true
    target.scrollLeft = left
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  const handleGridWheelScroll = (deltaY: number) => {
    const chart = chartScrollRef.current
    const grid = gridScrollRef.current
    if (!chart) return
    chart.scrollTop += deltaY
    if (grid) grid.scrollTop = chart.scrollTop
  }

  const handleToggleCollapse = (itemId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const ensureResourceViewSlotCount = useCallback(
    (needed: number) => {
      const nextCount = Math.max(1, Math.floor(needed))
      setUiPrefs((current) => {
        if (nextCount <= current.resourceView.slotCount) return current
        const prevBindings = current.resourceView.columnBindings ?? []
        const next: GanttUiPrefs = {
          ...current,
          resourceView: {
            ...current.resourceView,
            slotCount: nextCount,
            columnBindings: buildDefaultResourceColumnBindings(nextCount).map(
              (binding, index) => prevBindings[index] ?? binding,
            ),
          },
        }
        saveGanttUiPrefs(next)
        return next
      })
    },
    [],
  )

  const ensureCostViewSlotCount = useCallback((needed: number) => {
    const nextCount = Math.max(1, Math.floor(needed))
    setUiPrefs((current) => {
      if (nextCount <= current.costView.slotCount) return current
      const next: GanttUiPrefs = {
        ...current,
        costView: {
          ...current.costView,
          slotCount: nextCount,
        },
      }
      saveGanttUiPrefs(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (uiPrefs.scheduleView !== 'resource') return
    if (maxResourceAssignmentSlots <= uiPrefs.resourceView.slotCount) return
    ensureResourceViewSlotCount(maxResourceAssignmentSlots)
  }, [
    ensureResourceViewSlotCount,
    maxResourceAssignmentSlots,
    uiPrefs.resourceView.slotCount,
    uiPrefs.scheduleView,
  ])

  useEffect(() => {
    if (uiPrefs.scheduleView !== 'cost') return
    if (maxCostAssignmentSlots <= uiPrefs.costView.slotCount) return
    ensureCostViewSlotCount(maxCostAssignmentSlots)
  }, [
    ensureCostViewSlotCount,
    maxCostAssignmentSlots,
    uiPrefs.costView.slotCount,
    uiPrefs.scheduleView,
  ])

  const handleAssignResource = useCallback(
    async (itemId: string, patch: Partial<TaskResourceAssignment>, slot = 0) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      // Summary / milestone tasks cannot be assigned resources.
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      // Patch the target slot only — do not auto-reorder other cells.
      const nextMeta = patchTaskResourceAssignmentMetadata(item.metadata, patch, slot)
      const nextList = readTaskResourceAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureResourceViewSlotCount(nextList.filter((entry) => !isEmptyAssignment(entry)).length)
      await loadProjectData(selectedProjectId)
    },
    [
      captureHistoryBeforeChange,
      ensureResourceViewSlotCount,
      items,
      loadProjectData,
      selectedProjectId,
    ],
  )

  const handleReplaceResourceAssignments = useCallback(
    async (itemId: string, assignments: TaskResourceAssignment[]) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      // Keep caller order (manual move / per-slot edits). No type/name auto-sort.
      const nextMeta = replaceTaskResourceAssignmentsMetadata(item.metadata, assignments)
      const nextList = readTaskResourceAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureResourceViewSlotCount(nextList.length)
      await loadProjectData(selectedProjectId)
    },
    [
      captureHistoryBeforeChange,
      ensureResourceViewSlotCount,
      items,
      loadProjectData,
      selectedProjectId,
    ],
  )

  const handleReplaceCostAssignments = useCallback(
    async (itemId: string, assignments: TaskCostAssignment[]) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      const nextMeta = replaceTaskCostAssignmentsMetadata(item.metadata, assignments)
      const nextList = readTaskCostAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureCostViewSlotCount(nextList.length)
      await loadProjectData(selectedProjectId)
    },
    [
      captureHistoryBeforeChange,
      ensureCostViewSlotCount,
      items,
      loadProjectData,
      selectedProjectId,
    ],
  )

  const handleAssignCost = useCallback(
    async (itemId: string, patch: Partial<TaskCostAssignment>, slot = 0) => {
      if (!selectedProjectId || isGanttProjectRootId(itemId)) return
      if (items.some((entry) => entry.parentId === itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item || item.type === 'milestone') return
      const nextMeta = patchTaskCostAssignmentMetadata(item.metadata, patch, slot)
      const nextList = readTaskCostAssignments(nextMeta)
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      ensureCostViewSlotCount(nextList.filter((entry) => !isEmptyCostAssignment(entry)).length)
      await loadProjectData(selectedProjectId)
    },
    [
      captureHistoryBeforeChange,
      ensureCostViewSlotCount,
      items,
      loadProjectData,
      selectedProjectId,
    ],
  )

  const handleCommitCell = async (itemId: string, field: string, rawValue: string) => {
    if (!selectedProjectId || isGanttProjectRootId(itemId)) return
    const item = items.find((entry) => entry.id === itemId)
    if (!item) return

    if (
      field === 'duration' ||
      field === 'start' ||
      field === 'finish' ||
      field === 'predecessors'
    ) {
      setFreezeStoredSchedule(false)
    }

    if (field === 'spacer') return

    if (isGanttCustomColumnId(field) || !isGanttBuiltinColumn(field)) {
      const key = customColumnMetaKey(field)
      const nextMeta = { ...item.metadata, [key]: rawValue.trim() }
      captureHistoryBeforeChange()
      await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
      await loadProjectData(selectedProjectId)
      return
    }

    const hasPredecessors = relations.some((relation) => relation.toWorkItemId === itemId)

    switch (field) {
      case 'name': {
        const title = rawValue.trim()
        if (!title || title === item.title) return
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, title })
        break
      }
      case 'duration': {
        const days = parseDurationDaysInput(rawValue)
        if (days == null) return
        const startMs = startOfLocalDay(
          displayById.get(itemId)?.startDate ?? item.startDate ?? Date.now(),
        )
        captureHistoryBeforeChange()
        if (days === 0) {
          await pmApi.updateWorkItem({
            id: itemId,
            type: 'milestone',
            startDate: startMs,
            dueDate: startMs,
          })
        } else {
          await pmApi.updateWorkItem({
            id: itemId,
            type: item.type === 'milestone' ? 'task' : item.type,
            startDate: startMs,
            dueDate: finishFromStartDuration(startMs, days),
          })
        }
        break
      }
      case 'start': {
        if (hasPredecessors) return
        const startMs = parseDateInput(rawValue)
        if (!startMs) return
        const days = workItemDurationDays(displayById.get(itemId) ?? item)
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({
          id: itemId,
          startDate: startMs,
          dueDate: finishFromStartDuration(startMs, days),
        })
        break
      }
      case 'finish': {
        const finishMs = parseDateInput(rawValue)
        if (!finishMs) return
        captureHistoryBeforeChange()
        if (hasPredecessors) {
          const startMs = startOfLocalDay(
            displayById.get(itemId)?.startDate ?? item.startDate ?? finishMs,
          )
          const days = Math.max(1, Math.round((finishMs - startMs) / (24 * 60 * 60 * 1000)) + 1)
          await pmApi.updateWorkItem({
            id: itemId,
            startDate: startMs,
            dueDate: finishFromStartDuration(startMs, days),
          })
        } else {
          const startMs = startOfLocalDay(
            item.startDate ?? finishMs - workItemDurationDays(item) * 24 * 60 * 60 * 1000,
          )
          await pmApi.updateWorkItem({
            id: itemId,
            startDate: Math.min(startMs, finishMs),
            dueDate: finishMs,
          })
        }
        break
      }
      case 'predecessors': {
        const tokens = parsePredecessors(rawValue)
        const existing = relations.filter((relation) => relation.toWorkItemId === itemId)
        captureHistoryBeforeChange()
        for (const relation of existing) {
          await pmScheduleApi.deleteRelation(relation.id)
        }
        const byId = new Map(items.map((entry) => [entry.id, entry]))
        for (const token of tokens) {
          const fromId = idByIndex.get(token.index)
          if (!fromId || fromId === itemId) continue
          if (
            !isSchedulableRelation(
              { fromWorkItemId: fromId, toWorkItemId: itemId },
              byId,
            )
          ) {
            continue
          }
          await pmScheduleApi.createRelation({
            workspaceId,
            projectId: selectedProjectId,
            fromWorkItemId: fromId,
            toWorkItemId: itemId,
            type: token.type,
            lagDays: token.lagDays,
          })
        }
        break
      }
      case 'actualStart': {
        const startMs = parseDateInput(rawValue)
        const nextMeta = { ...item.metadata }
        if (startMs == null) delete nextMeta[ACTUAL_START_META_KEY]
        else nextMeta[ACTUAL_START_META_KEY] = startMs
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      case 'actualFinish': {
        const finishMs = parseDateInput(rawValue)
        const nextMeta = { ...item.metadata }
        if (finishMs == null) delete nextMeta[ACTUAL_FINISH_META_KEY]
        else nextMeta[ACTUAL_FINISH_META_KEY] = finishMs
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      case 'percentComplete': {
        const digits = rawValue.replace(/[^\d]/g, '')
        if (!digits) return
        if (items.some((entry) => entry.parentId === itemId)) return
        const progressPercent = Math.min(100, Math.max(0, Number.parseInt(digits, 10)))
        captureHistoryBeforeChange()
        const baselineIdForProgress =
          showBaselineVariance && selectedBaselineId ? selectedBaselineId : null
        // While comparing, roll up parents from baseline snapshot actuals (not live siblings).
        const rollupSourceItems = itemsRef.current.map((entry) => {
          if (entry.id === itemId) return { ...entry, progressPercent }
          if (!baselineIdForProgress) return entry
          const fromSnap = baselineByItemId.get(entry.id)?.progressPercent
          return typeof fromSnap === 'number' && Number.isFinite(fromSnap)
            ? { ...entry, progressPercent: fromSnap }
            : entry
        })
        const rollups = collectProgressRollupUpdates(rollupSourceItems)
        // Live schedule keeps leaf + parent rollups; baseline snapshot gets the same patch.
        const liveItems = itemsRef.current.map((entry) => {
          if (entry.id === itemId) return { ...entry, progressPercent }
          const rolled = rollups.find((update) => update.id === entry.id)
          return rolled ? { ...entry, progressPercent: rolled.progressPercent } : entry
        })
        const workItemProgress = [
          { workItemId: itemId, progressPercent },
          ...rollups.map((update) => ({
            workItemId: update.id,
            progressPercent: update.progressPercent,
          })),
        ]
        // Flush before any await so cancelEdit (called right after onCommitCell)
        // does not flash the old snapshot 0% while IPC is in flight.
        flushSync(() => {
          setItems(liveItems)
          if (baselineIdForProgress) {
            setBaselines((prev) =>
              patchBaselineWorkItemProgress(prev, baselineIdForProgress, workItemProgress),
            )
          }
        })
        await pmApi.updateWorkItem({ id: itemId, progressPercent })
        if (rollups.length > 0) {
          await Promise.all(
            rollups.map((update) =>
              pmApi.updateWorkItem({
                id: update.id,
                progressPercent: update.progressPercent,
              }),
            ),
          )
        }
        let baselinePersistOk = !baselineIdForProgress
        if (baselineIdForProgress) {
          try {
            const updated = await pmScheduleApi.updateBaseline(baselineIdForProgress, {
              workItemProgress,
            })
            setBaselines((prev) =>
              patchBaselineWorkItemProgress(
                prev.map((entry) => (entry.id === updated.id ? updated : entry)),
                baselineIdForProgress,
                workItemProgress,
              ),
            )
            baselinePersistOk = true
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
            baselinePersistOk = false
          }
        }
        const loaded = await loadProjectData(selectedProjectId)
        // Re-apply only after a successful persist (guards against stale listBaselines).
        // On failure, keep the reloaded DB snapshot so UI matches disk.
        if (baselineIdForProgress && baselinePersistOk) {
          setBaselines((prev) =>
            patchBaselineWorkItemProgress(prev, baselineIdForProgress, workItemProgress),
          )
        }
        if (loaded) await persistAutoSchedule(loaded)
        return
      }
      case 'variance':
        // Read-only computed column.
        return
      case 'shouldPercentComplete': {
        const digits = rawValue.replace(/[^\d]/g, '')
        const nextMeta = { ...item.metadata }
        if (!digits) delete nextMeta[SHOULD_PERCENT_META_KEY]
        else {
          nextMeta[SHOULD_PERCENT_META_KEY] = Math.min(
            100,
            Math.max(0, Number.parseInt(digits, 10)),
          )
        }
        captureHistoryBeforeChange()
        await pmApi.updateWorkItem({ id: itemId, metadata: nextMeta })
        break
      }
      default:
        return
    }
    const loaded = await loadProjectData(selectedProjectId)
    if (loaded) await persistAutoSchedule(loaded)
  }

  const handleCreateTask = async (afterId: string | null) => {
    if (!selectedProjectId) return
    const afterAfterRoot = isGanttProjectRootId(afterId) ? null : afterId
    const after = afterAfterRoot ? items.find((item) => item.id === afterAfterRoot) : null
    const parentId = after?.parentId
    const insertSortOrder = (after?.sortOrder ?? items.length) + 1

    captureHistoryBeforeChange()
    if (after) {
      const siblingsToShift = items
        .filter(
          (item) =>
            (item.parentId ?? null) === (parentId ?? null) && item.sortOrder >= insertSortOrder,
        )
        .sort((left, right) => right.sortOrder - left.sortOrder)
      for (const sibling of siblingsToShift) {
        await pmApi.updateWorkItem({ id: sibling.id, sortOrder: sibling.sortOrder + 1 })
      }
    }

    const created = await pmApi.createWorkItem({
      workspaceId,
      projectId: selectedProjectId,
      parentId,
      title: t('projectManagerPage.schedule.newTaskTitle'),
      domain: 'progress_management',
      type: 'task',
      sortOrder: insertSortOrder,
      startDate: Date.now(),
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    setSelectedId(created.id)
    await loadProjectData(selectedProjectId)
  }

  const handleInsertTask = async () => {
    const afterId = selectedId ?? treeRows[treeRows.length - 1]?.item.id ?? null
    await handleCreateTask(isGanttProjectRootId(afterId) ? null : afterId)
  }

  const handleDeleteTask = async () => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    captureHistoryBeforeChange()
    await pmApi.deleteWorkItem(selectedId)
    setSelectedId(null)
    setCheckedIds((prev) => {
      if (!prev.has(selectedId)) return prev
      const next = new Set(prev)
      next.delete(selectedId)
      return next
    })
    await loadProjectData(selectedProjectId)
  }

  const handleToggleChecked = useCallback((itemId: string) => {
    if (isGanttProjectRootId(itemId)) return
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const handleSelectAllRows = useCallback(() => {
    setCheckedIds(
      new Set(
        treeRows
          .map((row) => row.item.id)
          .filter((id) => !isGanttProjectRootId(id)),
      ),
    )
  }, [treeRows])

  const handleClearRowSelection = useCallback(() => {
    setCheckedIds(new Set())
  }, [])

  const handleDeleteSelectedRows = useCallback(async () => {
    if (!selectedProjectId || checkedIds.size === 0) return
    const ids = [...checkedIds].filter((id) => !isGanttProjectRootId(id))
    captureHistoryBeforeChange()
    for (const id of ids) {
      try {
        await pmApi.deleteWorkItem(id)
      } catch {
        // continue deleting others
      }
    }
    setCheckedIds(new Set())
    setPendingDeleteSelected(false)
    if (selectedId && ids.includes(selectedId)) setSelectedId(null)
    await loadProjectData(selectedProjectId)
  }, [captureHistoryBeforeChange, checkedIds, loadProjectData, selectedId, selectedProjectId])

  const requestDeleteSelectedRows = useCallback(() => {
    if (!selectedProjectId || checkedIds.size === 0) return
    setPendingDeleteSelected(true)
  }, [checkedIds.size, selectedProjectId])

  const handleIndent = async () => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    // Use full (uncollapsed) outline so 降级 follows outline level, not visible rows.
    const fullRows = flattenPmWorkItemForestCollapsed(forest, new Set(), rowNumberById)
    const fullIndex = fullRows.findIndex((row) => row.item.id === selectedId)
    // Project summary row occupies depth 0; allow one extra level so WBS depth is unchanged.
    const parentId = findDemoteParentId(fullRows, fullIndex, GANTT_MAX_DEPTH + 1)
    if (!parentId || isGanttProjectRootId(parentId)) return
    captureHistoryBeforeChange()
    await pmApi.updateWorkItem({ id: selectedId, parentId })

    // Drop predecessor links that become ancestor↔descendant after demote (e.g. FS
    // from the new parent). Keeping them desyncs schedule vs critical path.
    const nextById = new Map(
      items.map((entry) => [
        entry.id,
        entry.id === selectedId ? { ...entry, parentId } : entry,
      ]),
    )
    const staleRelations = relations.filter(
      (relation) => !isSchedulableRelation(relation, nextById),
    )
    if (staleRelations.length > 0) {
      await Promise.all(
        staleRelations.map((relation) => pmScheduleApi.deleteRelation(relation.id)),
      )
    }

    lastScheduleFingerprintRef.current = ''
    await loadProjectData(selectedProjectId)
  }

  const handleOutdent = async () => {
    if (!selectedItem?.parentId || !selectedProjectId || isGanttProjectRootId(selectedItem.id)) {
      return
    }
    captureHistoryBeforeChange()
    if (isGanttProjectRootId(selectedItem.parentId)) {
      await pmApi.updateWorkItem({ id: selectedItem.id, parentId: null })
    } else {
      const parent = items.find((item) => item.id === selectedItem.parentId)
      await pmApi.updateWorkItem({
        id: selectedItem.id,
        parentId: parent?.parentId ?? null,
      })
    }
    lastScheduleFingerprintRef.current = ''
    await loadProjectData(selectedProjectId)
  }

  const handleSetTaskType = async (type: 'task' | 'milestone') => {
    if (!selectedId || !selectedProjectId || isGanttProjectRootId(selectedId)) return
    const item = items.find((entry) => entry.id === selectedId)
    if (!item) return
    if (items.some((entry) => entry.parentId === selectedId)) return
    const patch: { id: string; type: 'task' | 'milestone'; startDate?: number; dueDate?: number } = {
      id: selectedId,
      type,
    }
    if (type === 'milestone') {
      const day = startOfLocalDay(item.startDate ?? item.dueDate ?? Date.now())
      patch.startDate = day
      patch.dueDate = day
    }
    captureHistoryBeforeChange()
    await pmApi.updateWorkItem(patch)
    await loadProjectData(selectedProjectId)
  }

  const handleMove = async (direction: -1 | 1) => {
    if (!selectedItem || !selectedProjectId || isGanttProjectRootId(selectedItem.id)) return
    const parentKey = isGanttProjectRootId(selectedItem.parentId)
      ? null
      : (selectedItem.parentId ?? null)
    const siblings = items
      .filter((item) => (item.parentId ?? null) === parentKey)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const index = siblings.findIndex((item) => item.id === selectedItem.id)
    const swapWith = siblings[index + direction]
    if (!swapWith || index < 0) return
    captureHistoryBeforeChange()
    await Promise.all([
      pmApi.updateWorkItem({ id: selectedItem.id, sortOrder: swapWith.sortOrder }),
      pmApi.updateWorkItem({ id: swapWith.id, sortOrder: selectedItem.sortOrder }),
    ])
    await loadProjectData(selectedProjectId)
  }

  const applyPrintPageNumberVars = useCallback(() => {
    const root = document.documentElement
    const prefix = t('projectManagerPage.schedule.print.pageLabel')
    const suffix = t('projectManagerPage.schedule.print.pageOf').trim()
    const title = selectedProject
      ? `${selectedProject.code} · ${selectedProject.name}`
      : t('projectManagerPage.headerProject.allProjects')
    const cssString = (value: string) =>
      `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    // CSS content() strings must include quotes inside the custom property value.
    root.style.setProperty('--tm-pm-print-page-prefix', cssString(`${prefix} `))
    root.style.setProperty('--tm-pm-print-page-sep', cssString(' / '))
    root.style.setProperty('--tm-pm-print-page-suffix', suffix ? cssString(` ${suffix}`) : '""')
    root.style.setProperty('--tm-pm-print-title', cssString(title))
  }, [selectedProject, t])

  const printDocumentTitleRef = useRef<string | null>(null)

  const applyPrintDocumentTitle = useCallback(() => {
    if (printDocumentTitleRef.current == null) {
      printDocumentTitleRef.current = document.title
    }
    // Chromium “Save as PDF” uses document.title as the default filename.
    const code = selectedProject?.code?.trim() ?? ''
    const name = selectedProject?.name?.trim() ?? ''
    const rawName =
      code && name ? `${code} · ${name}` : code || name || 'Toolman'
    const safeName = rawName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'Toolman'
    document.title = safeName
  }, [selectedProject])

  const restorePrintDocumentTitle = useCallback(() => {
    if (printDocumentTitleRef.current != null) {
      document.title = printDocumentTitleRef.current
      printDocumentTitleRef.current = null
    }
  }, [])

  useEffect(() => {
    const onBeforePrint = () => {
      flushSync(() => {
        applyPrintPageNumberVars()
        applyPrintDocumentTitle()
      })
    }
    const onAfterPrint = () => {
      restorePrintDocumentTitle()
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [applyPrintDocumentTitle, applyPrintPageNumberVars, restorePrintDocumentTitle])

  const handlePrint = useCallback(() => {
    // Do not toggle screen layout — print uses a separate hidden table.
    // Only set document title / @page CSS vars, then open the print dialog.
    flushSync(() => {
      applyPrintPageNumberVars()
      applyPrintDocumentTitle()
    })
    const runPrint = () => {
      // Prefer Electron print API so landscape is forced (window.print often stays portrait).
      void window.api.invoke(IpcChannel.AppPrintWindow, { landscape: true, printBackground: true })
    }
    // Brief delay so title/CSS vars settle before Chromium snapshots.
    window.setTimeout(runPrint, 0)
  }, [applyPrintDocumentTitle, applyPrintPageNumberVars])

  const handleScheduleSave = useCallback(
    async (options?: { asNewVersion?: boolean; note?: string }) => {
      if (!selectedProjectId || !selectedProject) return
      const asNewVersion = options?.asNewVersion === true
      try {
        // While frozen on a restored version, do not re-drive dates from live relations
        // before snapshotting — that would overwrite the version being saved.
        if (!freezeStoredSchedule) {
          await persistAutoSchedule()
        }

        // Prefer fresh project metadata — list prop can lag behind agent apply.
        let prevMeta: Record<string, unknown> = { ...(selectedProject.metadata ?? {}) }
        try {
          const fresh = await pmApi.getProject(selectedProjectId)
          prevMeta = { ...(fresh.metadata ?? {}) }
        } catch {
          // fall back to list prop metadata
        }

        const sessionPending = hasSessionPendingAgentRevision(workspaceId, selectedProjectId)
        // Session only fills the gap until fresh metadata reflects the DB pending flag.
        if (sessionPending && !readPendingAgentScheduleRevision(prevMeta)) {
          prevMeta = { ...prevMeta, [PM_PENDING_AGENT_REVISION_KEY]: true }
        }

        const prevVersion = readScheduleVersion(prevMeta)
        // 「保存」= update current (first save still creates v1). 「另存新版本」= bump.
        const bumpVersion = asNewVersion ? true : false
        const totalDurationDays = computeScheduleTotalDurationDays(items) ?? undefined
        const note = options?.note?.trim() || undefined
        const nextMeta = buildScheduleSaveMetadata(prevMeta, {
          workItemCount: items.length,
          ...(totalDurationDays != null ? { totalDurationDays } : {}),
          bumpVersion,
          ...(note ? { note } : {}),
        })
        const updated = await pmApi.updateProject({
          id: selectedProjectId,
          metadata: nextMeta,
        })
        clearSessionPendingAgentRevision(workspaceId, selectedProjectId)

        const version = readScheduleVersion(updated.metadata ?? nextMeta)
        const createdNewVersion = version > prevVersion
        if (version > 0) {
          // Persist the version's plan snapshot for version switch (not a user baseline).
          try {
            await pmScheduleApi.createBaseline(workspaceId, selectedProjectId, {
              name: versionPlanSnapshotName(version),
            })
          } catch (err) {
            window.alert(
              t('projectManagerPage.schedule.versionBaselineCreateFailed', {
                detail: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        }

        setFreezeStoredSchedule(false)
        suppressAutoScheduleRef.current = false
        lastScheduleFingerprintRef.current = ''
        await onProjectsChange?.()
        await loadProjectData(selectedProjectId)
        if (createdNewVersion) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccessNewVersion', {
              version: String(version),
            }),
          })
        } else if (version > 0) {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccessUpdated', {
              version: String(version),
            }),
          })
        } else {
          setStatusFeedback({
            tone: 'success',
            text: t('projectManagerPage.schedule.saveSuccess'),
          })
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err))
      }
    },
    [
      freezeStoredSchedule,
      items,
      loadProjectData,
      onProjectsChange,
      persistAutoSchedule,
      selectedProject,
      selectedProjectId,
      setStatusFeedback,
      t,
      workspaceId,
    ],
  )

  const pendingRestoreBaseline = useMemo(
    () =>
      pendingRestoreBaselineId
        ? (baselines.find((entry) => entry.id === pendingRestoreBaselineId) ?? null)
        : null,
    [baselines, pendingRestoreBaselineId],
  )

  const pendingRestoreDisplayName = useMemo(() => {
    if (!pendingRestoreBaseline) return ''
    const version = parseVersionPlanSnapshotName(pendingRestoreBaseline.name)
    if (version != null) {
      return t('projectManagerPage.schedule.versionBaselineName', {
        version: String(version),
      })
    }
    return pendingRestoreBaseline.name
  }, [pendingRestoreBaseline, t])

  const handleConfirmRestoreBaseline = useCallback(async () => {
    if (!pendingRestoreBaselineId || !selectedProjectId) return
    try {
      const result = await pmScheduleApi.restoreBaseline(pendingRestoreBaselineId)
      setPendingRestoreBaselineId(null)
      // Clear compare overlay so restored bars aren't confused with ghost baselines.
      setSelectedBaselineId(null)
      clearSessionPendingAgentRevision(workspaceId, selectedProjectId)
      // Prevent auto-schedule from rewriting restored dates/relations on next load.
      suppressAutoScheduleRef.current = true
      lastScheduleFingerprintRef.current = ''
      setFreezeStoredSchedule(true)
      await onProjectsChange?.()
      await loadProjectData(selectedProjectId)
      const restoredVersion = result.scheduleVersion
      const restoredName =
        restoredVersion != null
          ? t('projectManagerPage.schedule.versionBaselineName', {
              version: String(restoredVersion),
            })
          : result.baselineName
      window.alert(
        t('projectManagerPage.schedule.restoreBaselineSuccess', {
          name: restoredName,
          updated: String(result.changedCount),
          missing: String(result.missingCount),
        }),
      )
    } catch (err) {
      setPendingRestoreBaselineId(null)
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [
    loadProjectData,
    onProjectsChange,
    pendingRestoreBaselineId,
    selectedProjectId,
    t,
    workspaceId,
  ])

  /** Defaults for 进度检查: Gantt compare + latest user baseline (no version restore). */
  const applyProgressCheckDefaults = useCallback(() => {
    if (!selectedProjectId) return
    setBaselineCompareMode('gantt')
    const users = listUserBaselines(baselines)
    const latestBaseline = [...users].sort(
      (a, b) =>
        (b.snapshot.capturedAt ?? b.createdAt) - (a.snapshot.capturedAt ?? a.createdAt),
    )[0]
    setSelectedBaselineId(latestBaseline?.id ?? null)
  }, [baselines, selectedProjectId])

  const progressCheckSetupKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (uiPrefs.scheduleView !== 'progressCheck' || loading || !selectedProjectId) {
      if (uiPrefs.scheduleView !== 'progressCheck') {
        // Leaving 进度检查: restore baseline menu to 不对比 (defaults are only for that view).
        if (progressCheckSetupKeyRef.current != null) {
          setBaselineCompareMode('none')
          setSelectedBaselineId(null)
        }
        progressCheckSetupKeyRef.current = null
      }
      return
    }
    const key = `${selectedProjectId}:progressCheck`
    if (progressCheckSetupKeyRef.current === key) return
    progressCheckSetupKeyRef.current = key
    applyProgressCheckDefaults()
  }, [
    applyProgressCheckDefaults,
    loading,
    selectedProjectId,
    uiPrefs.scheduleView,
  ])

  const handleScheduleViewChange = useCallback(
    (scheduleView: GanttScheduleView) => {
      let next: GanttUiPrefs = { ...uiPrefs, scheduleView }
      // Gantt chart view defaults to showing 前置任务 when entering that view.
      if (scheduleView === 'gantt') {
        next = withGanttDefaultPredecessorsColumn(next)
      }
      handlePrefsChange(next)
    },
    [handlePrefsChange, uiPrefs],
  )

  const handleMenuAction = (action: GanttMenuAction) => {
    void (async () => {
      const structureLocked = uiPrefs.scheduleView === 'resource'
      const structureActions = new Set<GanttMenuAction>([
        'newTask',
        'insertTask',
        'deleteTask',
        'indent',
        'outdent',
        'setTask',
        'setMilestone',
        'moveUp',
        'moveDown',
        'captureBaseline',
        'editBaseline',
        'deleteBaseline',
      ])
      if (structureLocked && structureActions.has(action)) return

      switch (action) {
        case 'save':
          await handleScheduleSave()
          break
        case 'saveAsNewVersion':
          setPendingSaveAsNewVersion(true)
          break
        case 'print':
          handlePrint()
          break
        case 'projectInfo':
          if (selectedProjectId) setProjectInfoOpen(true)
          break
        case 'link':
          // Placeholder for a future link feature.
          break
        case 'undo':
          await handleUndo()
          break
        case 'redo':
          await handleRedo()
          break
        case 'newTask':
          await handleCreateTask(null)
          break
        case 'insertTask':
          await handleInsertTask()
          break
        case 'deleteTask':
          await handleDeleteTask()
          break
        case 'indent':
          await handleIndent()
          break
        case 'outdent':
          await handleOutdent()
          break
        case 'setTask':
          await handleSetTaskType('task')
          break
        case 'setMilestone':
          await handleSetTaskType('milestone')
          break
        case 'moveUp':
          await handleMove(-1)
          break
        case 'moveDown':
          await handleMove(1)
          break
        case 'captureBaseline':
          if (!selectedProjectId) break
          setCaptureBaselineOpen(true)
          break
        case 'editBaseline':
          if (!selectedBaselineId || !selectedProjectId) break
          setEditBaselineOpen(true)
          break
        case 'deleteBaseline':
          if (!selectedBaselineId || !selectedProjectId) break
          try {
            await pmScheduleApi.deleteBaseline(selectedBaselineId)
            setSelectedBaselineId(null)
            setBaselineCompareMode('none')
            await loadProjectData(selectedProjectId)
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        case 'openResource':
          handlePrefsChange({ ...uiPrefs, scheduleView: 'resource' })
          break
        case 'openCost':
          handlePrefsChange({ ...uiPrefs, scheduleView: 'cost' })
          break
        case 'autoAssignResource': {
          if (!selectedProjectId) break
          try {
            const result = await pmApi.smartAssignWorkItems({
              workspaceId,
              projectId: selectedProjectId,
              kind: 'resource',
            })
            await loadProjectData(selectedProjectId)
            window.alert(
              t('projectManagerPage.agent.smartAssignResourceDone', {
                count: result.updatedCount,
              }),
            )
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        }
        case 'autoAssignCost': {
          if (!selectedProjectId) break
          try {
            const result = await pmApi.smartAssignWorkItems({
              workspaceId,
              projectId: selectedProjectId,
              kind: 'cost',
            })
            await loadProjectData(selectedProjectId)
            window.alert(
              t('projectManagerPage.agent.smartAssignCostDone', {
                count: result.updatedCount,
              }),
            )
          } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err))
          }
          break
        }
        case 'openAnalysis':
          window.alert(t('projectManagerPage.schedule.analysisComingSoon'))
          break
      }
    })()
  }

  if (loading && !hasDataRef.current) {
    return <div className="tm-pm-empty">{t('projectManagerPage.schedule.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  if (projects.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.database.noProjects')}</div>
  }

  const dayHeaders = timeline.headers
  const headerMode = uiPrefs.dateHeaderMode
  const showYearRow =
    headerMode === 'year' || headerMode === 'year_month' || headerMode === 'year_month_day'
  const showMonthRow =
    headerMode === 'month' ||
    headerMode === 'month_day' ||
    headerMode === 'year_month' ||
    headerMode === 'year_month_day'
  const showWeekRow = headerMode === 'week'
  const showDayRow =
    headerMode === 'day' || headerMode === 'month_day' || headerMode === 'year_month_day'
  const selectedTaskType =
    selectedItem?.type === 'milestone' ? 'milestone' : 'task'
  const { barStyle, taskColors } = uiPrefs
  const isListView = uiPrefs.scheduleView === 'list'
  const isResourceView = uiPrefs.scheduleView === 'resource'
  const isCostView = uiPrefs.scheduleView === 'cost'
  const isProgressCheckView = uiPrefs.scheduleView === 'progressCheck'
  const isChartView = uiPrefs.scheduleView === 'gantt' || isProgressCheckView
  const isFullWidthListLayout = isListView || isResourceView || isCostView
  // Plain derive (not useMemo): this block sits after early returns for loading/error.
  const gridPrefs: GanttUiPrefs = isResourceView
    ? {
        ...uiPrefs,
        resourceView: {
          ...uiPrefs.resourceView,
          slotCount: Math.max(
            uiPrefs.resourceView.slotCount,
            maxResourceAssignmentSlots,
            1,
          ),
        },
        columnOrder: buildResourceViewColumnOrder({
          ...uiPrefs.resourceView,
          slotCount: Math.max(
            uiPrefs.resourceView.slotCount,
            maxResourceAssignmentSlots,
            1,
          ),
        }),
        columnLabels: {
          ...uiPrefs.columnLabels,
          resourceType: t('projectManagerPage.schedule.columns.resourceType'),
          resourceName: t('projectManagerPage.schedule.columns.resourceName'),
          resourceQty: t('projectManagerPage.schedule.columns.resourceQty'),
          spacer: '',
        },
      }
    : isCostView
      ? {
          ...uiPrefs,
          costView: {
            ...uiPrefs.costView,
            slotCount: Math.max(uiPrefs.costView.slotCount, maxCostAssignmentSlots, 1),
          },
          columnOrder: buildCostViewColumnOrder({
            ...uiPrefs.costView,
            slotCount: Math.max(uiPrefs.costView.slotCount, maxCostAssignmentSlots, 1),
          }),
          columnLabels: {
            ...uiPrefs.columnLabels,
            costName: t('projectManagerPage.schedule.columns.costName'),
            costAmount: t('projectManagerPage.schedule.columns.costAmount'),
            spacer: '',
          },
        }
      : isProgressCheckView
        ? {
            ...uiPrefs,
            columnOrder: [...PROGRESS_CHECK_COLUMN_ORDER],
          }
        : isListView
          ? {
              ...uiPrefs,
              columnOrder: buildListViewColumnOrder(uiPrefs.columnOrder),
              columnLabels: {
                ...uiPrefs.columnLabels,
                spacer: '',
              },
            }
          : uiPrefs
  const barStyleClass =
    barStyle === 'outline'
      ? 'tm-pm-gantt-page--outline'
      : barStyle === 'hatch'
        ? 'tm-pm-gantt-page--hatch'
        : 'tm-pm-gantt-page--fill'
  const printTitle = selectedProject
    ? `${selectedProject.code} · ${selectedProject.name}`
    : t('projectManagerPage.headerProject.allProjects')
  const rootSelected = isGanttProjectRootId(selectedId)
  const workItemCount = items.length
  const checkedCount = checkedIds.size
  const criticalCount = criticalIds.size
  const scheduleVersion = readScheduleVersion(selectedProject?.metadata)
  const pendingAgentRevision =
    selectedProjectId != null &&
    isPendingAgentScheduleRevision(
      selectedProject?.metadata,
      workspaceId,
      selectedProjectId,
    )
  const statusMessage = (() => {
    if (statusFeedback) {
      return statusFeedback
    }
    if (pendingAgentRevision) {
      return {
        text: t('projectManagerPage.schedule.statusBar.pendingAgentRevision'),
        tone: 'info' as const,
      }
    }
    if (selectedItem && !isGanttProjectRootId(selectedItem.id)) {
      return {
        text: t('projectManagerPage.schedule.statusBar.selected', {
          title: selectedItem.title,
        }),
        tone: 'muted' as const,
      }
    }
    if (checkedCount > 0) {
      return {
        text: t('projectManagerPage.schedule.statusBar.checked', {
          count: String(checkedCount),
        }),
        tone: 'muted' as const,
      }
    }
    return {
      text: t('projectManagerPage.schedule.statusBar.ready', {
        count: String(workItemCount),
      }),
      tone: 'muted' as const,
    }
  })()
  const statusMetaParts = [
    t(`projectManagerPage.schedule.views.${uiPrefs.scheduleView}`),
    t('projectManagerPage.schedule.statusBar.tasks', { count: String(workItemCount) }),
    t('projectManagerPage.schedule.statusBar.critical', { count: String(criticalCount) }),
    scheduleVersion > 0
      ? t('projectManagerPage.schedule.statusBar.version', {
          version: String(scheduleVersion),
        })
      : t('projectManagerPage.schedule.statusBar.versionNone'),
  ]

  return (
    <div
      ref={panelRootRef}
      className={['tm-pm-gantt-page', barStyleClass].filter(Boolean).join(' ')}
      style={
        {
          '--tm-pm-gantt-color-task': taskColors.task,
          '--tm-pm-gantt-color-critical': taskColors.critical,
          '--tm-pm-gantt-color-summary': taskColors.summary,
          '--tm-pm-gantt-color-milestone': taskColors.milestone,
        } as CSSProperties
      }>
      <div className="tm-pm-gantt-print-header" aria-hidden>
        {printTitle}
      </div>

      <ProjectGanttPrintTable
        rows={treeRows}
        relations={relations}
        indexById={indexById}
        criticalIds={criticalIds}
        prefs={gridPrefs}
        builtinLabels={builtinLabels}
        timeline={timeline}
        baselineByItemId={showGanttBaselineGhosts ? baselineByItemId : new Map()}
        showYearRow={showYearRow}
        showMonthRow={showMonthRow}
        showWeekRow={showWeekRow}
        showDayRow={showDayRow}
        headerHeight={headerHeight}
        resourceCatalog={resourceCatalog}
      />

      <ProjectGanttMenuBar
        hasSelection={selectedId != null && !rootSelected}
        hasProject={selectedProjectId != null}
        canUndo={canUndo}
        canRedo={canRedo}
        canSetTaskType={
          selectedId != null &&
          !rootSelected &&
          !items.some((entry) => entry.parentId === selectedId)
        }
        selectedTaskType={selectedTaskType}
        scheduleView={uiPrefs.scheduleView}
        onScheduleViewChange={handleScheduleViewChange}
        baselines={userBaselines}
        selectedBaselineId={selectedBaselineId}
        onSelectBaseline={(id) => {
          setSelectedBaselineId(id)
          if (id == null) setBaselineCompareMode('none')
          else if (baselineCompareMode === 'none') setBaselineCompareMode('gantt')
        }}
        baselineCompareMode={baselineCompareMode}
        onBaselineCompareModeChange={(mode) => {
          setBaselineCompareMode(mode)
          if (mode === 'none') setSelectedBaselineId(null)
        }}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreBaseline={(id) => setPendingRestoreBaselineId(id)}
        resourceTypeFilter={uiPrefs.resourceView.typeFilter ?? 'all'}
        costTypeFilter={uiPrefs.costView.typeFilter ?? 'all'}
        onResourceTypeFilterChange={(filter: GanttAssignTypeFilter) => {
          handlePrefsChange({
            ...uiPrefs,
            scheduleView: 'resource',
            resourceView: { ...uiPrefs.resourceView, typeFilter: filter },
          })
        }}
        onCostTypeFilterChange={(filter: GanttAssignTypeFilter) => {
          handlePrefsChange({
            ...uiPrefs,
            scheduleView: 'cost',
            costView: { ...uiPrefs.costView, typeFilter: filter },
          })
        }}
        onAction={handleMenuAction}
      />

      <div
        className={[
          'tm-pm-gantt-workspace',
          isFullWidthListLayout ? 'tm-pm-gantt-workspace--full-list' : '',
          isResourceView ? 'tm-pm-gantt-workspace--resource' : '',
          isCostView ? 'tm-pm-gantt-workspace--cost' : '',
        ]
          .filter(Boolean)
          .join(' ')}>
        <ProjectGanttTaskGrid
          rows={treeRows}
          relations={relations}
          indexById={indexById}
          criticalIds={criticalIds}
          prefs={gridPrefs}
          builtinLabels={builtinLabels}
          headerHeight={headerHeight}
          selectedId={selectedId}
          checkedIds={checkedIds}
          listView={isFullWidthListLayout}
          resourceViewMode={isResourceView}
          costViewMode={isCostView}
          printLayout={false}
          gridScrollRef={gridScrollRef}
          onScroll={syncScroll('grid')}
          onWheelScroll={isFullWidthListLayout ? undefined : handleGridWheelScroll}
          onSelect={setSelectedId}
          onToggleChecked={handleToggleChecked}
          onSelectAllRows={handleSelectAllRows}
          onClearRowSelection={handleClearRowSelection}
          onDeleteSelectedRows={requestDeleteSelectedRows}
          onToggleCollapse={handleToggleCollapse}
          onPrefsChange={
            isProgressCheckView
              ? (next) =>
                  handlePrefsChange({
                    ...next,
                    columnOrder: uiPrefs.columnOrder,
                  })
              : handlePrefsChange
          }
          onCommitCell={handleCommitCell}
          resourceCatalog={resourceCatalog}
          resourceColumnCatalog={resourceColumnCatalog}
          costCatalog={costCatalog}
          progressPercentById={progressPercentById}
          onAssignResource={isResourceView ? handleAssignResource : undefined}
          onReplaceResourceAssignments={
            isResourceView ? handleReplaceResourceAssignments : undefined
          }
          onAssignCost={isCostView ? handleAssignCost : undefined}
          onReplaceCostAssignments={isCostView ? handleReplaceCostAssignments : undefined}
          selectionResetKey={selectedProjectId}
          shouldPercentAsOfMs={
            showBaselineVariance && baseline
              ? resolveBaselineAsOfDate(baseline)
              : null
          }
          baselinePlanByItemId={
            showBaselineVariance && baselineByItemId.size > 0 ? baselineByItemId : undefined
          }
        />

        {isChartView ? (
        <div className="tm-pm-gantt-chart-pane" ref={chartPaneRef}>
          <div
            ref={chartHeaderScrollRef}
            className="tm-pm-gantt-chart-header-scroll"
            style={{ height: headerHeight }}
            onScroll={syncChartHorizontal('header')}>
            <div
              className="tm-pm-gantt-chart-header tm-pm-gantt-chart-header--layered"
              style={{ width: '100%', height: headerHeight }}>
              {showYearRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--year">
                  {timeline.yearBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showMonthRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--month">
                  {timeline.monthBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showWeekRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--week">
                  {timeline.weekBands.map((band) => (
                    <span
                      key={band.key}
                      className="tm-pm-gantt-scale-band"
                      style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                      title={band.label}>
                      {band.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {showDayRow ? (
                <div className="tm-pm-gantt-scale-row tm-pm-gantt-scale-row--day">
                  {dayHeaders.map((header) => (
                    <span
                      key={header.key}
                      className="tm-pm-gantt-day-tick"
                      style={{
                        left: `${header.leftPercent}%`,
                        width: `${header.widthPercent}%`,
                      }}
                    />
                  ))}
                  {dayHeaders.map((header) =>
                    header.labelBottom ? (
                      <span
                        key={`${header.key}-label`}
                        className="tm-pm-gantt-day-label"
                        style={{
                          left: `${header.leftPercent + header.widthPercent / 2}%`,
                        }}>
                        {header.labelBottom}
                      </span>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div
            ref={chartScrollRef}
            className="tm-pm-gantt-chart-body"
            onScroll={(event) => {
              syncScroll('chart')(event)
              syncChartHorizontal('body')(event)
            }}>
            <div
              className="tm-pm-gantt-chart-canvas"
              style={{ width: '100%', minHeight: chartHeight }}>
              {treeRows.map(({ item, hasChildren }) => {
                const bar = timeline.bars.find((entry) => entry.item.id === item.id)
                const ghost = showGanttBaselineGhosts ? baselineByItemId.get(item.id) : undefined
                const ghostRange =
                  ghost?.startDate != null && ghost.dueDate != null
                    ? barPercentsInRange(
                        ghost.startDate,
                        ghost.dueDate,
                        timeline.rangeStart,
                        timeline.rangeEnd,
                      )
                    : null
                const active = item.id === selectedId
                const onCritical = criticalIds.has(item.id)
                const kind = resolveGanttTaskKind(item, hasChildren, onCritical)
                const isMilestoneBar = !hasChildren && item.type === 'milestone'
                const isProjectRoot = isGanttProjectRootId(item.id)
                const actualPct = (() => {
                  const fromMap = progressPercentById.get(item.id)
                  if (typeof fromMap === 'number' && Number.isFinite(fromMap)) {
                    return Math.min(100, Math.max(0, fromMap))
                  }
                  return typeof item.progressPercent === 'number' &&
                    Number.isFinite(item.progressPercent)
                    ? Math.min(100, Math.max(0, item.progressPercent))
                    : 0
                })()
                const planDates = baselineByItemId.get(item.id)
                const shouldPct = showBaselineVariance
                  ? plannedProgressAtDate(
                      planDates?.startDate ?? item.startDate,
                      planDates?.dueDate ?? item.dueDate,
                      resolveBaselineAsOfDate(baseline!),
                    )
                  : 0
                const variancePct = actualPct - shouldPct
                return (
                  <div
                    key={item.id}
                    className={[
                      'tm-pm-gantt-chart-row',
                      active ? 'tm-pm-gantt-chart-row--active' : '',
                      isProjectRoot ? 'tm-pm-gantt-chart-row--project-root' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ height: GANTT_ROW_HEIGHT }}
                    onClick={() => setSelectedId(item.id)}>
                    {ghostRange ? (
                      <div
                        className={[
                          'tm-pm-gantt-bar',
                          'tm-pm-gantt-bar--baseline',
                          isMilestoneBar ? 'tm-pm-gantt-bar--baseline-milestone' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={
                          isMilestoneBar
                            ? { left: `${ghostRange.leftPercent}%` }
                            : {
                                left: `${ghostRange.leftPercent}%`,
                                width: `${ghostRange.widthPercent}%`,
                              }
                        }
                      />
                    ) : null}
                    {bar ? (
                      <div
                        className={[
                          'tm-pm-gantt-bar',
                          kind === 'summary' ? 'tm-pm-gantt-bar--summary' : '',
                          isMilestoneBar ? 'tm-pm-gantt-bar--milestone' : '',
                          onCritical ? 'tm-pm-gantt-bar--critical' : '',
                          showBaselineVariance && !isMilestoneBar && !hasChildren
                            ? variancePct < -0.5
                              ? 'tm-pm-gantt-bar--behind'
                              : variancePct > 0.5
                                ? 'tm-pm-gantt-bar--ahead'
                                : 'tm-pm-gantt-bar--ontrack'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={
                          isMilestoneBar
                            ? { left: `${bar.leftPercent}%`, width: 12, height: 12 }
                            : { left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }
                        }
                        title={
                          showBaselineVariance && !hasChildren
                            ? `${item.title} · ${t('projectManagerPage.schedule.baselineVarianceTitle', {
                                actual: String(Math.round(actualPct)),
                                should: String(Math.round(shouldPct)),
                                variance:
                                  (variancePct >= 0 ? '+' : '') + String(Math.round(variancePct)),
                              })}`
                            : `${item.title} · ${formatWorkItemDate(item.startDate)} → ${formatWorkItemDate(item.dueDate)}`
                        }>
                        {showBaselineVariance && !isMilestoneBar && !hasChildren ? (
                          <>
                            <div
                              className="tm-pm-gantt-bar-actual"
                              style={{ width: `${actualPct}%` }}
                            />
                            <div
                              className="tm-pm-gantt-bar-should"
                              style={{ left: `${shouldPct}%` }}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {baselineCompareMode === 'progressLine' && baseline ? (
                <div
                  className="tm-pm-gantt-progress-line-layer"
                  style={{ height: chartHeight }}
                  aria-hidden>
                  <div
                    className="tm-pm-gantt-progress-line-status"
                    style={{ left: `${progressLine.statusLeftPercent}%` }}
                    title={formatWorkItemDate(resolveBaselineAsOfDate(baseline))}
                  />
                  {progressLine.stubs.length > 0 ? (
                    <>
                      <svg
                        className="tm-pm-gantt-progress-line-svg"
                        width="100%"
                        height={chartHeight}
                        viewBox={`0 0 100 ${chartHeight}`}
                        preserveAspectRatio="none">
                        {progressLine.stubs.map((stub) => (
                          <line
                            key={`stub-${stub.itemId}`}
                            className={[
                              'tm-pm-gantt-progress-line-stub',
                              stub.variancePct < -0.5
                                ? 'tm-pm-gantt-progress-line-stub--behind'
                                : stub.variancePct > 0.5
                                  ? 'tm-pm-gantt-progress-line-stub--ahead'
                                  : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            x1={progressLine.statusLeftPercent}
                            y1={stub.y}
                            x2={stub.tipLeftPercent}
                            y2={stub.y}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </svg>
                      {progressLine.stubs.map((stub) => (
                        <span
                          key={stub.itemId}
                          className={[
                            'tm-pm-gantt-progress-line-dot',
                            stub.variancePct < -0.5
                              ? 'tm-pm-gantt-progress-line-dot--behind'
                              : stub.variancePct > 0.5
                                ? 'tm-pm-gantt-progress-line-dot--ahead'
                                : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ left: `${stub.tipLeftPercent}%`, top: stub.y }}
                          title={`${stub.variancePct >= 0 ? '+' : ''}${stub.variancePct.toFixed(0)}%`}
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        ) : null}
      </div>

      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <span
          className={[
            'tm-pm-gantt-statusbar-message',
            `tm-pm-gantt-statusbar-message--${statusMessage.tone}`,
          ].join(' ')}>
          {statusMessage.text}
        </span>
        <div className="tm-pm-gantt-statusbar-meta" title={statusMetaParts.join(' · ')}>
          {statusMetaParts.map((part, index) => (
            <span key={`${part}-${index}`} className="tm-pm-gantt-statusbar-meta-item">
              {index > 0 ? (
                <span className="tm-pm-gantt-statusbar-sep" aria-hidden>
                  ·
                </span>
              ) : null}
              {part}
            </span>
          ))}
        </div>
      </footer>

      <div className="tm-pm-gantt-print-legend" aria-hidden>
        <span className="tm-pm-gantt-print-legend-title">
          {t('projectManagerPage.schedule.print.legend')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--task"
            style={{ background: taskColors.task }}
          />
          {t('projectManagerPage.schedule.print.legendTask')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--critical"
            style={{ background: taskColors.critical }}
          />
          {t('projectManagerPage.schedule.print.legendCritical')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--summary"
            style={{ background: taskColors.summary }}
          />
          {t('projectManagerPage.schedule.print.legendSummary')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span
            className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--milestone"
            style={{ background: taskColors.milestone }}
          />
          {t('projectManagerPage.schedule.print.legendMilestone')}
        </span>
        <span className="tm-pm-gantt-print-legend-item">
          <span className="tm-pm-gantt-print-swatch tm-pm-gantt-print-swatch--baseline" />
          {t('projectManagerPage.schedule.print.legendBaseline')}
        </span>
      </div>
      {/* Page numbers come from @page @bottom-center; keep a hidden stub for a11y/DOM stability. */}
      <div className="tm-pm-gantt-print-footer" aria-hidden />

      {projectInfoOpen && selectedProject ? (
        <ProjectInfoDialog
          project={selectedProject}
          workItems={items}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            onProjectsChange?.()
          }}
        />
      ) : null}

      {pendingSaveAsNewVersion ? (
        <SaveAsNewVersionDialog
          currentVersion={readScheduleVersion(selectedProject?.metadata)}
          nextVersion={readMaxScheduleVersion(selectedProject?.metadata) + 1}
          onCancel={() => setPendingSaveAsNewVersion(false)}
          onConfirm={(note) => {
            setPendingSaveAsNewVersion(false)
            void handleScheduleSave({ asNewVersion: true, note })
          }}
        />
      ) : null}

      {pendingDeleteSelected ? (
        <ConfirmDialog
          title={t('projectManagerPage.schedule.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.schedule.selection.deleteSelectedConfirm', {
            count: checkedIds.size,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDeleteSelected(false)}
          onConfirm={() => void handleDeleteSelectedRows()}
        />
      ) : null}

      {captureBaselineOpen && selectedProjectId ? (
        <BaselineCaptureDialog
          mode="capture"
          initialName={nextCaptureBaselineName}
          initialDateMs={nextCaptureAsOfMs}
          nameIndex={nextCaptureBaselineIndex}
          onCancel={() => setCaptureBaselineOpen(false)}
          onConfirm={({ name, asOfDate }) => {
            setCaptureBaselineOpen(false)
            void (async () => {
              try {
                const created = await pmScheduleApi.createBaseline(
                  workspaceId,
                  selectedProjectId,
                  {
                    name,
                    asOfDate,
                  },
                )
                const asOfMs = parseDateInput(asOfDate)
                let leafCount = 0
                let zeroCount = 0
                let minStart: number | null = null
                if (asOfMs != null) {
                  const currentItems = itemsRef.current
                  const childIds = new Set(
                    currentItems
                      .map((item) => item.parentId)
                      .filter((id): id is string => Boolean(id)),
                  )
                  await Promise.all(
                    currentItems.map((item) => {
                      const should = Math.round(
                        plannedProgressAtDate(item.startDate, item.dueDate, asOfMs),
                      )
                      if (item.startDate != null) {
                        const start = startOfLocalDay(item.startDate)
                        minStart = minStart == null ? start : Math.min(minStart, start)
                      }
                      if (!childIds.has(item.id) && item.type !== 'milestone') {
                        leafCount += 1
                        if (should === 0) zeroCount += 1
                      }
                      const prev = item.metadata?.[SHOULD_PERCENT_META_KEY]
                      if (prev === should) return Promise.resolve()
                      return pmApi.updateWorkItem({
                        id: item.id,
                        metadata: {
                          ...item.metadata,
                          [SHOULD_PERCENT_META_KEY]: should,
                        },
                      })
                    }),
                  )
                }
                await loadProjectData(selectedProjectId)
                setSelectedBaselineId(created.id)
                setBaselineCompareMode('gantt')
                if (
                  asOfMs != null &&
                  leafCount > 0 &&
                  zeroCount === leafCount &&
                  minStart != null &&
                  asOfMs <= minStart
                ) {
                  window.alert(
                    t('projectManagerPage.schedule.baselineCapture.allZeroHint', {
                      name,
                      asOfDate,
                      suggestDate: formatWorkItemDate(suggestBaselineAsOfDate(itemsRef.current)),
                    }),
                  )
                }
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
              }
            })()
          }}
        />
      ) : null}

      {editBaselineOpen && selectedBaselineId && baseline ? (
        <BaselineCaptureDialog
          mode="edit"
          initialName={baseline.name}
          initialDateMs={resolveBaselineAsOfDate(baseline)}
          nameIndex={
            /^基线\s*(\d+)/u.exec(baseline.name.trim())
              ? Number.parseInt(/^基线\s*(\d+)/u.exec(baseline.name.trim())![1]!, 10)
              : nextCaptureBaselineIndex
          }
          onCancel={() => setEditBaselineOpen(false)}
          onConfirm={({ name, asOfDate }) => {
            setEditBaselineOpen(false)
            void (async () => {
              try {
                await pmScheduleApi.updateBaseline(selectedBaselineId, { name, asOfDate })
                const asOfMs = parseDateInput(asOfDate)
                if (asOfMs != null) {
                  const currentItems = itemsRef.current
                  await Promise.all(
                    currentItems.map((item) => {
                      const should = Math.round(
                        plannedProgressAtDate(item.startDate, item.dueDate, asOfMs),
                      )
                      const prev = item.metadata?.[SHOULD_PERCENT_META_KEY]
                      if (prev === should) return Promise.resolve()
                      return pmApi.updateWorkItem({
                        id: item.id,
                        metadata: {
                          ...item.metadata,
                          [SHOULD_PERCENT_META_KEY]: should,
                        },
                      })
                    }),
                  )
                }
                await loadProjectData(selectedProjectId)
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
              }
            })()
          }}
        />
      ) : null}

      {pendingRestoreBaseline ? (
        <ConfirmDialog
          title={t('projectManagerPage.schedule.restoreBaselineTitle')}
          message={t('projectManagerPage.schedule.restoreBaselineConfirm', {
            name: pendingRestoreDisplayName,
          })}
          confirmLabel={t('projectManagerPage.schedule.restoreBaselineConfirmLabel')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingRestoreBaselineId(null)}
          onConfirm={() => void handleConfirmRestoreBaseline()}
        />
      ) : null}
    </div>
  )
}

export default ProjectScheduleGanttPanel
