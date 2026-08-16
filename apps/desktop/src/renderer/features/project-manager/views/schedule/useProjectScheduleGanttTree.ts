import { useMemo } from 'react'

import {
  buildPmWorkItemForest,
  findVersionPlanSnapshot,
  listUserBaselines,
  readSaveHistory,
  readScheduleVersion,
  type PmProject,
  type PmScheduleBaseline,
  type PmWorkItem,
  type PmWorkItemRelation,
} from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import {
  buildStableRowNumberById,
  flattenPmWorkItemForestCollapsed,
} from './pm-gantt-tree'
import { computeGanttDayWidth, dateHeaderHeight, type GanttUiPrefs } from './pm-gantt-prefs'
import {
  buildScheduleTimeline,
  GANTT_PROJECT_ROOT_ID,
  isGanttProjectRootId,
  resolveGanttDayTickStep,
  withGanttProjectRootItems,
  formatWorkItemDate,
} from './pm-gantt-utils'
import {
  applyScheduledRangesToItems,
  computeCriticalTaskIds,
  rangesFromStoredItems,
  scheduleWorkItems,
} from './pm-gantt-schedule'
import {
  computeProgressLineStubs,
  nextUserBaselineName,
  nextUserBaselineIndex,
  resolveBaselineAsOfDate,
  suggestBaselineAsOfDate,
  type BaselineCompareMode,
} from './pm-gantt-baseline-compare'
import { buildProgressPercentById } from './pm-gantt-progress-rollup'
import { parseBaselineNameIndex } from './pm-schedule-gantt-panel-utils'
import type { GanttVersionSwitchEntry } from './ProjectGanttMenuBar'

export function useProjectScheduleGanttTree(args: {
  items: PmWorkItem[]
  relations: PmWorkItemRelation[]
  baselines: PmScheduleBaseline[]
  selectedProject: PmProject | null
  selectedBaselineId: string | null
  baselineCompareMode: BaselineCompareMode
  collapsedIds: ReadonlySet<string>
  freezeStoredSchedule: boolean
  chartPaneWidth: number
  uiPrefs: GanttUiPrefs
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    items,
    relations,
    baselines,
    selectedProject,
    selectedBaselineId,
    baselineCompareMode,
    collapsedIds,
    freezeStoredSchedule,
    chartPaneWidth,
    uiPrefs,
    t,
  } = args

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

  const progressLineStatusDateLabel = baseline ? formatWorkItemDate(resolveBaselineAsOfDate(baseline)) : ''

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
    () => nextUserBaselineName(userBaselines, formatWorkItemDate(nextCaptureAsOfMs)),
    [userBaselines, nextCaptureAsOfMs],
  )

  const editBaselineNameIndex = baseline
    ? (parseBaselineNameIndex(baseline.name) ?? nextCaptureBaselineIndex)
    : nextCaptureBaselineIndex
  const editBaselineInitialDateMs = baseline ? resolveBaselineAsOfDate(baseline) : nextCaptureAsOfMs

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

  return {
    itemsForView,
    forest,
    rowNumberById,
    treeRowsRaw,
    scheduled,
    criticalSchedule,
    criticalIds,
    displayItems,
    displayById,
    treeRows,
    visibleItems,
    timeline,
    headerHeight,
    indexById,
    idByIndex,
    baseline,
    baselineByItemId,
    liveProgressPercentById,
    showBaselineVariance,
    progressPercentById,
    showGanttBaselineGhosts,
    progressLine,
    progressLineStatusDateLabel,
    userBaselines,
    nextCaptureAsOfMs,
    nextCaptureBaselineIndex,
    nextCaptureBaselineName,
    editBaselineNameIndex,
    editBaselineInitialDateMs,
    versionSwitchEntries,
  }
}
