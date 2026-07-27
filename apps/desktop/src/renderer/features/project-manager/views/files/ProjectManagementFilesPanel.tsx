import type { FC } from 'react'

import { ProjectFeaturesMenuBar } from './ProjectFeaturesMenuBar'
import { ProjectManagementFilesPanelDialogs } from './ProjectManagementFilesPanelDialogs'
import { ProjectManagementFilesPanelMatrix } from './ProjectManagementFilesPanelMatrix'
import { ProjectManagementFilesPanelMenus } from './ProjectManagementFilesPanelMenus'
import { ProjectManagementFilesPanelScrollbar } from './ProjectManagementFilesPanelScrollbar'
import {
  useProjectManagementFilesPanel,
  type ProjectManagementFilesPanelProps as Props,
} from './useProjectManagementFilesPanel'

export type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

/**
 * Practice (实务) view — table chrome aligned with Resource list
 * (`tm-pm-resource-table-*` + Gantt page shell / Features menubar).
 *
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectManagementFilesPanel`, all presentational JSX lives in the sibling
 * `ProjectManagementFilesPanel*` components (Matrix / Scrollbar / Menus / Dialogs).
 */
const ProjectManagementFilesPanel: FC<Props> = (props) => {
  const state = useProjectManagementFilesPanel(props)
  const {
    t,
    saving,
    canEdit,
    selectedId,
    selectedType,
    scheduleView,
    versionSwitchEntries,
    handleRestoreVersion,
    handleScheduleViewChange,
    handleMenuAction,
    dirty,
    statusFeedback,
    visibleRows,
    selectedRow,
    hScrollMetrics,
    hScrollDragging,
  } = state

  return (
    <div className="tm-pm-gantt-page tm-pm-features-page tm-pm-features-table-page">
      <ProjectFeaturesMenuBar
        disabled={saving}
        hasSelection={selectedId != null}
        hasProject
        canEdit={canEdit}
        selectedType={selectedType}
        scheduleView={scheduleView}
        onScheduleViewChange={handleScheduleViewChange}
        versionSwitchEntries={versionSwitchEntries}
        onRestoreVersion={handleRestoreVersion}
        onAction={handleMenuAction}
      />

      {!canEdit ? (
        <div className="tm-pm-empty">{t('projectManagerPage.files.table.needProject')}</div>
      ) : (
        <div
          className={[
            'tm-pm-features-table-scroll-wrap',
            hScrollMetrics.overflowing ? 'tm-pm-features-table-scroll-wrap--h-overflow' : '',
            hScrollDragging ? 'tm-pm-features-table-scroll-wrap--h-dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <ProjectManagementFilesPanelMatrix state={state} />
          <ProjectManagementFilesPanelScrollbar state={state} />
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
              ? t('projectManagerPage.files.table.statusDirty', {
                  count: String(visibleRows.length),
                })
              : t('projectManagerPage.files.table.statusReady', {
                  count: String(visibleRows.length),
                })}
          {!statusFeedback && selectedRow?.name
            ? ` · ${t('projectManagerPage.files.table.statusSelected', {
                name: selectedRow.name,
              })}`
            : null}
        </div>
      </footer>

      <ProjectManagementFilesPanelMenus state={state} />
      <ProjectManagementFilesPanelDialogs state={state} onProjectsChange={props.onProjectsChange} />
    </div>
  )
}

export default ProjectManagementFilesPanel
