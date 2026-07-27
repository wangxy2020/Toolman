import type { FC } from 'react'

import type { PmProject } from '@toolman/shared'

import {
  ProjectFeaturesMenuBar,
  type FeaturesScheduleView,
} from '../files/ProjectFeaturesMenuBar'
import { ProjectResourceMenuBar } from './ProjectResourceMenuBar'
import { ProjectResourceTableDialogs } from './ProjectResourceTableDialogs'
import { ProjectResourceTableGrid } from './ProjectResourceTableGrid'
import { ProjectResourceTableMenus } from './ProjectResourceTableMenus'
import { useProjectResourceTablePanel } from './useProjectResourceTablePanel'

interface Props {
  workspaceId: string
  projects: PmProject[]
  selectedProjectId: string | null
  onProjectsChange?: () => void | Promise<void>
  /**
   * `catalog` = 资源列表；`practice` = 资源管理-实务（空表起步，独立存储，实务精简菜单）。
   */
  variant?: 'catalog' | 'practice'
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
}

/**
 * Thin orchestrator: owns no rendering logic of its own — all state/handlers live in
 * `useProjectResourceTablePanel`, all presentational JSX lives in the sibling
 * `ProjectResourceTable*` components (Grid / Menus / Dialogs).
 */
const ProjectResourceTablePanel: FC<Props> = ({
  workspaceId,
  projects,
  selectedProjectId,
  onProjectsChange,
  variant = 'catalog',
  onOpenScheduleView: _onOpenScheduleView,
}) => {
  const state = useProjectResourceTablePanel({
    workspaceId,
    projects,
    selectedProjectId,
    onProjectsChange,
    variant,
  })
  const {
    t,
    isPractice,
    canEdit,
    saving,
    selectedId,
    canUndo,
    canRedo,
    practiceQuotaView,
    handleQuotaViewChange,
    practiceVersionEntries,
    handleRestoreVersion,
    handleFeaturesMenuAction,
    viewFilter,
    handleViewFilterChange,
    customTypeNames,
    handleRegisterCustomTypeName,
    handleRequestDeleteCustomTypeName,
    selectedType,
    selectedCustomTypeName,
    handleTypeChange,
    versionSwitchEntries,
    handleMenuAction,
    panelRootRef,
    dirty,
    rows,
    statusFeedback,
    selectedRow,
  } = state

  return (
    <div ref={panelRootRef} className="tm-pm-gantt-page tm-pm-resource-table-page">
      {isPractice ? (
        <ProjectFeaturesMenuBar
          disabled={saving}
          hasSelection={selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedType="scheduleAll"
          viewMenuMode="resourceQuota"
          quotaView={practiceQuotaView}
          onQuotaViewChange={handleQuotaViewChange}
          versionSwitchEntries={practiceVersionEntries}
          onRestoreVersion={handleRestoreVersion}
          onAction={handleFeaturesMenuAction}
          showTrailingMenus={false}
        />
      ) : (
        <ProjectResourceMenuBar
          disabled={saving}
          hasSelection={selectedId != null}
          hasProject
          canEdit={canEdit}
          canUndo={canUndo}
          canRedo={canRedo}
          viewFilter={viewFilter}
          onViewFilterChange={handleViewFilterChange}
          customTypeNames={customTypeNames}
          onRegisterCustomTypeName={handleRegisterCustomTypeName}
          onRequestDeleteCustomTypeName={handleRequestDeleteCustomTypeName}
          selectedType={selectedType}
          selectedCustomTypeName={selectedCustomTypeName}
          onTypeChange={handleTypeChange}
          versionSwitchEntries={versionSwitchEntries}
          onRestoreVersion={handleRestoreVersion}
          onAction={handleMenuAction}
        />
      )}

      <ProjectResourceTableGrid state={state} />

      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <div
          className={[
            'tm-pm-gantt-statusbar-message',
            statusFeedback
              ? `tm-pm-gantt-statusbar-message--${statusFeedback.tone}`
              : dirty
                ? 'tm-pm-gantt-statusbar-message--info'
                : 'tm-pm-gantt-statusbar-message--muted',
          ].join(' ')}>
          {statusFeedback
            ? statusFeedback.text
            : dirty
              ? t('projectManagerPage.resourceTable.statusDirty', {
                  count: String(rows.length),
                })
              : t('projectManagerPage.resourceTable.statusReady', {
                  count: String(rows.length),
                })}
          {!statusFeedback && selectedRow?.name
            ? ` · ${t('projectManagerPage.resourceTable.statusSelected', {
                name: selectedRow.name,
              })}`
            : null}
        </div>
      </footer>

      <ProjectResourceTableMenus state={state} />
      <ProjectResourceTableDialogs state={state} onProjectsChange={onProjectsChange} />
    </div>
  )
}

export default ProjectResourceTablePanel
