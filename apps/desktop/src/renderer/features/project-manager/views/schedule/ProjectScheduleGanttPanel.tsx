import type { CSSProperties, FC } from 'react'

import type { PmProject } from '@toolman/shared'

import { ProjectGanttChartPane } from './ProjectGanttChartPane'
import { ProjectGanttMenuBar } from './ProjectGanttMenuBar'
import { ProjectGanttTaskGrid } from './ProjectGanttTaskGrid'
import ProjectGanttPrintTable from './ProjectGanttPrintTable'
import { ProjectScheduleGanttPanelDialogs } from './ProjectScheduleGanttPanelDialogs'
import { ProjectScheduleGanttPrintLegend } from './ProjectScheduleGanttPrintLegend'
import { useProjectScheduleGanttPanel } from './useProjectScheduleGanttPanel'

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
  const panelState = useProjectScheduleGanttPanel({
    workspaceId,
    projects,
    selectedProjectId,
    dataRevision,
    onProjectsChange,
  })
  const {
    t,
    items,
    relations,
    error,
    showLoadingPlaceholder,

    uiPrefs,
    resourceCatalog,
    costCatalog,
    resourceColumnCatalog,

    selectedId,
    setSelectedId,
    checkedIds,

    panelRootRef,
    gridScrollRef,

    builtinLabels,
    treeRows,
    indexById,
    criticalIds,
    gridPrefs,
    headerHeight,
    timeline,
    showYearRow,
    showMonthRow,
    showWeekRow,
    showDayRow,

    canUndo,
    canRedo,
    selectedTaskType,
    taskColors,
    barStyleClass,
    printTitle,
    rootSelected,
    statusMessage,
    statusMetaParts,

    isResourceView,
    isCostView,
    isChartView,
    isFullWidthListLayout,

    versionSwitchEntries,
    userBaselines,
    selectedBaselineId,
    baselineCompareMode,
    progressPercentById,
    shouldPercentAsOfMs,
    gridBaselinePlanByItemId,
    printBaselineByItemId,

    handleScheduleViewChange,
    handleSelectBaseline,
    handleBaselineCompareModeChange,
    handleResourceTypeFilterChange,
    handleCostTypeFilterChange,
    handleMenuAction,
    handleGridPrefsChange,
    handleCommitCell,
    handleToggleCollapse,
    handleGridWheelScroll,
    syncScroll,
    handleAssignResource,
    handleReplaceResourceAssignments,
    handleAssignCost,
    handleReplaceCostAssignments,
    handleToggleChecked,
    handleSelectAllRows,
    handleClearRowSelection,
    requestDeleteSelectedRows,
    setPendingRestoreBaselineId,
  } = panelState

  if (showLoadingPlaceholder) {
    return <div className="tm-pm-empty">{t('projectManagerPage.schedule.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  if (projects.length === 0) {
    return <div className="tm-pm-empty">{t('projectManagerPage.database.noProjects')}</div>
  }

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
        baselineByItemId={printBaselineByItemId}
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
        onSelectBaseline={handleSelectBaseline}
        baselineCompareMode={baselineCompareMode}
        onBaselineCompareModeChange={handleBaselineCompareModeChange}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreBaseline={(id) => setPendingRestoreBaselineId(id)}
        resourceTypeFilter={uiPrefs.resourceView.typeFilter ?? 'all'}
        costTypeFilter={uiPrefs.costView.typeFilter ?? 'all'}
        onResourceTypeFilterChange={handleResourceTypeFilterChange}
        onCostTypeFilterChange={handleCostTypeFilterChange}
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
          onPrefsChange={handleGridPrefsChange}
          onCommitCell={handleCommitCell}
          resourceCatalog={resourceCatalog}
          resourceColumnCatalog={resourceColumnCatalog}
          costCatalog={costCatalog}
          progressPercentById={progressPercentById}
          onAssignResource={isResourceView ? handleAssignResource : undefined}
          onReplaceResourceAssignments={isResourceView ? handleReplaceResourceAssignments : undefined}
          onAssignCost={isCostView ? handleAssignCost : undefined}
          onReplaceCostAssignments={isCostView ? handleReplaceCostAssignments : undefined}
          selectionResetKey={selectedProjectId}
          shouldPercentAsOfMs={shouldPercentAsOfMs}
          baselinePlanByItemId={gridBaselinePlanByItemId}
        />

        {isChartView ? <ProjectGanttChartPane state={panelState} /> : null}
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

      <ProjectScheduleGanttPrintLegend t={t} taskColors={taskColors} />

      <ProjectScheduleGanttPanelDialogs state={panelState} onProjectsChange={onProjectsChange} />
    </div>
  )
}

export default ProjectScheduleGanttPanel
