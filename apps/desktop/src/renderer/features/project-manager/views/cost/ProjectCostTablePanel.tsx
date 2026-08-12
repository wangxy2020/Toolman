import type { FC } from 'react'
import { useCallback, useRef, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { ProjectFeaturesMenuBar, type FeaturesMenuAction } from '../files/ProjectFeaturesMenuBar'
import ProjectManagementFilesPanel, {
  type ProjectManagementFilesPanelHandle,
} from '../files/ProjectManagementFilesPanel'
import { ProjectCostMenuBar, type CostMenuAction } from './ProjectCostMenuBar'
import { ProjectCostTableBody } from './ProjectCostTableBody'
import { ProjectCostTableDialogs } from './ProjectCostTableDialogs'
import { ProjectCostTableHeader } from './ProjectCostTableHeader'
import { ProjectCostTableMenus } from './ProjectCostTableMenus'
import {
  useProjectCostTablePanel,
  type ProjectCostTablePanelProps,
} from './useProjectCostTablePanel'

export type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type Props = ProjectCostTablePanelProps

const METERING_FORWARDED_ACTIONS = new Set<CostMenuAction>([
  'save',
  'saveAsNewVersion',
  'print',
  'projectInfo',
  'undo',
  'redo',
  'add',
  'insert',
  'delete',
  'indent',
  'outdent',
  'moveUp',
  'moveDown',
])

/**
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectCostTablePanel`, all presentational JSX lives in the sibling `ProjectCostTable*`
 * components (Header / Body / Menus / Dialogs).
 */
const ProjectCostTablePanel: FC<Props> = (props) => {
  const { t } = useI18n()
  const state = useProjectCostTablePanel(props)
  const {
    panelRootRef,
    tableScrollRef,
    hTrackRef,
    isPractice,
    canEdit,
    sectionalOptions,
    selectedId,
    hScrollMetrics,
    hScrollDragging,
    costQuotaView,
    setCostQuotaView,
    viewFilter,
    handleViewFilterChange,
    sectionFilter,
    handleSectionFilterChange,
    canUndo,
    canRedo,
    saving,
    statusFeedback,
    versionSwitchEntries,
    practiceVersionEntries,
    handleRestoreVersion,
    handleMenuAction,
    handleFeaturesMenuAction,
    meteringViewActive,
    meteringBaselines,
    selectedMeteringBaselineId,
    setSelectedMeteringBaselineId,
    meteringRollupMode,
    handleMeteringRollupModeChange,
    dirty,
    rows,
    selectedRow,
    onHTrackPointerDown,
  } = state

  const showMeteringView = !isPractice && meteringViewActive
  const meteringPanelRef = useRef<ProjectManagementFilesPanelHandle | null>(null)
  const [meteringHasSelection, setMeteringHasSelection] = useState(false)

  const flushMeteringBeforeLeave = useCallback(async () => {
    if (!showMeteringView) return
    await meteringPanelRef.current?.flushIfDirty()
  }, [showMeteringView])

  const onViewFilterChange = useCallback(
    (filter: Parameters<typeof handleViewFilterChange>[0]) => {
      void flushMeteringBeforeLeave().finally(() => {
        handleViewFilterChange(filter)
      })
    },
    [flushMeteringBeforeLeave, handleViewFilterChange],
  )

  const onSectionFilterChange = useCallback(
    (filter: Parameters<typeof handleSectionFilterChange>[0]) => {
      void flushMeteringBeforeLeave().finally(() => {
        handleSectionFilterChange(filter)
      })
    },
    [flushMeteringBeforeLeave, handleSectionFilterChange],
  )

  const handleCostMenuAction = useCallback(
    (
      action: CostMenuAction,
      event?: { metaKey?: boolean; ctrlKey?: boolean },
    ) => {
      if (showMeteringView && METERING_FORWARDED_ACTIONS.has(action)) {
        meteringPanelRef.current?.dispatchMenuAction(action as FeaturesMenuAction)
        return
      }
      handleMenuAction(action, event)
    },
    [handleMenuAction, showMeteringView],
  )

  return (
    <div
      ref={panelRootRef}
      className="tm-pm-gantt-page tm-pm-resource-table-page tm-pm-cost-table-page"
    >
      {isPractice ? (
        <ProjectFeaturesMenuBar
          disabled={saving}
          hasSelection={selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedType="scheduleAll"
          viewMenuMode="costQuota"
          costQuotaView={costQuotaView}
          onCostQuotaViewChange={setCostQuotaView}
          versionSwitchEntries={practiceVersionEntries}
          onRestoreVersion={handleRestoreVersion}
          onAction={handleFeaturesMenuAction}
          showTrailingMenus={false}
        />
      ) : (
        <ProjectCostMenuBar
          disabled={saving}
          hasSelection={showMeteringView ? meteringHasSelection : selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          viewFilter={viewFilter}
          onViewFilterChange={onViewFilterChange}
          sectionFilter={sectionFilter}
          onSectionFilterChange={onSectionFilterChange}
          sectionalOptions={sectionalOptions}
          versionSwitchEntries={versionSwitchEntries}
          onRestoreVersion={handleRestoreVersion}
          meteringActive={meteringViewActive}
          meteringBaselines={meteringBaselines}
          selectedMeteringBaselineId={selectedMeteringBaselineId}
          onSelectMeteringBaseline={setSelectedMeteringBaselineId}
          meteringRollupMode={meteringRollupMode}
          onMeteringRollupModeChange={handleMeteringRollupModeChange}
          onAction={handleCostMenuAction}
        />
      )}

      {showMeteringView ? (
        <ProjectManagementFilesPanel
          workspaceId={props.workspaceId}
          workspace={null}
          systemPaths={null}
          projects={props.projects}
          selectedProjectId={props.selectedProjectId}
          onOpenScheduleView={props.onOpenScheduleView}
          onProjectsChange={props.onProjectsChange}
          lockedViewFilter="metering"
          embedded
          actionBridgeRef={meteringPanelRef}
          onEmbeddedSelectionChange={setMeteringHasSelection}
        />
      ) : !canEdit ? (
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
          <ProjectCostTableHeader state={state} />
          <ProjectCostTableBody state={state} />
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

      {showMeteringView ? null : (
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
      )}

      {showMeteringView ? null : <ProjectCostTableMenus state={state} />}
      <ProjectCostTableDialogs panelProps={props} state={state} />
              </div>
  )
}

export default ProjectCostTablePanel
