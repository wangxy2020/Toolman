import { useCallback } from 'react'

import {
  readScheduleVersion,
  type PmProject,
  type PmScheduleBaseline,
  type PmWorkItem,
} from '@toolman/shared'
import { isPendingAgentScheduleRevision } from '../../pm-pending-revision'

import { useI18n } from '../../../../i18n/useI18n'
import { usePmStatusFeedback } from '../../usePmStatusFeedback'
import {
  DEFAULT_GANTT_COST_VIEW_PREFS,
  DEFAULT_GANTT_RESOURCE_VIEW_PREFS,
  resolveAssignViewSlotCount,
  type GanttUiPrefs,
} from './pm-gantt-prefs'
import { buildGanttGridPrefs } from './pm-schedule-gantt-grid-prefs'
import {
  buildScheduleTimeline,
  GANTT_ROW_HEIGHT,
  formatWorkItemDate,
  isGanttProjectRootId,
} from './pm-gantt-utils'
import { plannedProgressAtDate, resolveBaselineAsOfDate } from './pm-gantt-baseline-compare'
import { resolveGanttTaskKind, type GanttTreeRow } from './pm-gantt-tree'
import {
  resolveActualProgressPercent,
  resolveGhostRange,
  resolveVarianceTone,
} from './pm-schedule-gantt-panel-utils'

type BaselinePlan = { startDate?: number; dueDate?: number; progressPercent?: number }

export function useProjectScheduleGanttView(args: {
  workspaceId: string
  selectedProjectId: string | null
  selectedProject: PmProject | null
  items: PmWorkItem[]
  uiPrefs: GanttUiPrefs
  t: ReturnType<typeof useI18n>['t']
  selectedId: string | null
  checkedIds: ReadonlySet<string>
  treeRows: GanttTreeRow[]
  criticalIds: ReadonlySet<string>
  timeline: ReturnType<typeof buildScheduleTimeline>
  maxResourceAssignmentSlots: number
  maxCostAssignmentSlots: number
  resourceSlotFloor: number
  costSlotFloor: number
  baseline: PmScheduleBaseline | null
  baselineByItemId: Map<string, BaselinePlan>
  showBaselineVariance: boolean
  showGanttBaselineGhosts: boolean
  progressPercentById: Map<string, number>
  statusFeedback: ReturnType<typeof usePmStatusFeedback>[0]
}) {
  const {
    workspaceId, selectedProjectId, selectedProject, items, uiPrefs, t, selectedId, checkedIds,
    treeRows, criticalIds, timeline, maxResourceAssignmentSlots, maxCostAssignmentSlots,
    resourceSlotFloor, costSlotFloor, baseline, baselineByItemId, showBaselineVariance,
    showGanttBaselineGhosts, progressPercentById, statusFeedback,
  } = args
  const isProgressCheckView = uiPrefs.scheduleView === 'progressCheck'
  const selectedIndex = selectedId ? treeRows.findIndex((row) => row.item.id === selectedId) : -1
  const selectedItem = selectedIndex >= 0 ? treeRows[selectedIndex]?.item : null
  const chartHeight = Math.max(treeRows.length, 1) * GANTT_ROW_HEIGHT
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
  const selectedTaskType: 'task' | 'milestone' =
    selectedItem?.type === 'milestone' ? 'milestone' : 'task'
  const { barStyle, taskColors } = uiPrefs
  const isListView = uiPrefs.scheduleView === 'list'
  const isResourceView = uiPrefs.scheduleView === 'resource'
  const isCostView = uiPrefs.scheduleView === 'cost'
  const isChartView = uiPrefs.scheduleView === 'gantt' || isProgressCheckView
  const isFullWidthListLayout = isListView || isResourceView || isCostView
  const resourceSlotCount = Math.max(
    resolveAssignViewSlotCount(maxResourceAssignmentSlots, DEFAULT_GANTT_RESOURCE_VIEW_PREFS.slotCount),
    resourceSlotFloor,
  )
  const costSlotCount = Math.max(
    resolveAssignViewSlotCount(maxCostAssignmentSlots, DEFAULT_GANTT_COST_VIEW_PREFS.slotCount),
    costSlotFloor,
  )
  const gridPrefs = buildGanttGridPrefs({
    uiPrefs, isResourceView, isCostView, isProgressCheckView, isListView, resourceSlotCount, costSlotCount, t,
  })
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
    isPendingAgentScheduleRevision(selectedProject?.metadata, workspaceId, selectedProjectId)
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
      ? t('projectManagerPage.schedule.statusBar.version', { version: String(scheduleVersion) })
      : t('projectManagerPage.schedule.statusBar.versionNone'),
  ]

  const shouldPercentAsOfMs = showBaselineVariance && baseline ? resolveBaselineAsOfDate(baseline) : null
  const gridBaselinePlanByItemId =
    showBaselineVariance && baselineByItemId.size > 0 ? baselineByItemId : undefined
  const printBaselineByItemId = showGanttBaselineGhosts ? baselineByItemId : new Map()

  /** Per-row bar/ghost/variance presentation — keeps the chart-row JSX purely declarative. */
  const getGanttRowContext = useCallback(
    (row: Pick<GanttTreeRow, 'item' | 'hasChildren'>) => {
      const { item, hasChildren } = row
      const bar = timeline.bars.find((entry) => entry.item.id === item.id)
      const ghost = showGanttBaselineGhosts ? baselineByItemId.get(item.id) : undefined
      const ghostRange = resolveGhostRange(ghost, timeline.rangeStart, timeline.rangeEnd)
      const active = item.id === selectedId
      const onCritical = criticalIds.has(item.id)
      const kind = resolveGanttTaskKind(item, hasChildren, onCritical)
      const isMilestoneBar = !hasChildren && item.type === 'milestone'
      const isProjectRoot = isGanttProjectRootId(item.id)
      const actualPct = resolveActualProgressPercent(progressPercentById, item)
      const shouldPct =
        showBaselineVariance && baseline
          ? plannedProgressAtDate(
              ghost?.startDate ?? item.startDate,
              ghost?.dueDate ?? item.dueDate,
              resolveBaselineAsOfDate(baseline),
            )
          : 0
      const variancePct = actualPct - shouldPct
      const varianceTone = resolveVarianceTone(variancePct)
      const showVarianceSplit = showBaselineVariance && !isMilestoneBar && !hasChildren
      const showVarianceTitle = showBaselineVariance && !hasChildren
      const title = showVarianceTitle
        ? `${item.title} · ${t('projectManagerPage.schedule.baselineVarianceTitle', {
            actual: String(Math.round(actualPct)),
            should: String(Math.round(shouldPct)),
            variance: (variancePct >= 0 ? '+' : '') + String(Math.round(variancePct)),
          })}`
        : `${item.title} · ${formatWorkItemDate(item.startDate)} → ${formatWorkItemDate(item.dueDate)}`
      return {
        bar,
        ghostRange,
        active,
        onCritical,
        kind,
        isMilestoneBar,
        isProjectRoot,
        actualPct,
        shouldPct,
        variancePct,
        varianceTone,
        showVarianceSplit,
        title,
      }
    },
    [
      baseline,
      baselineByItemId,
      criticalIds,
      progressPercentById,
      selectedId,
      showBaselineVariance,
      showGanttBaselineGhosts,
      t,
      timeline,
    ],
  )

  return {
    selectedItem,
    selectedIndex,
    chartHeight,
    dayHeaders,
    showYearRow,
    showMonthRow,
    showWeekRow,
    showDayRow,
    selectedTaskType,
    taskColors,
    isListView,
    isResourceView,
    isCostView,
    isProgressCheckView,
    isChartView,
    isFullWidthListLayout,
    resourceSlotCount,
    costSlotCount,
    gridPrefs,
    barStyleClass,
    printTitle,
    rootSelected,
    workItemCount,
    scheduleVersion,
    statusMessage,
    statusMetaParts,
    shouldPercentAsOfMs,
    gridBaselinePlanByItemId,
    printBaselineByItemId,
    getGanttRowContext,
  }
}
