import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'

import type { PmProject } from '@toolman/shared'
import type { Workspace } from '@toolman/shared'

import type { SystemPaths } from '../../../chat/useSystemPaths'
import { useI18n } from '../../../../i18n/useI18n'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import {
  loadGanttUiPrefs,
  saveGanttUiPrefs,
  type GanttScheduleView,
} from '../schedule/pm-gantt-prefs'
import {
  ProjectFeaturesMenuBar,
  type FeaturesMenuAction,
  type FeaturesScheduleView,
} from './ProjectFeaturesMenuBar'

interface Props {
  workspaceId: string
  workspace: Workspace | null
  systemPaths: SystemPaths | null
  projects: PmProject[]
  selectedProjectId: string | null
  /** Switch to the Gantt panel with the chosen schedule sub-view. */
  onOpenScheduleView?: (view: FeaturesScheduleView) => void
  onProjectsChange?: () => void
}

/**
 * Practice (实务) view — same page chrome as Gantt (`tm-pm-gantt-page` + toolbar + statusbar)
 * so menu height, padding, and bottom border match.
 */
const ProjectManagementFilesPanel: FC<Props> = ({
  projects,
  selectedProjectId,
  onOpenScheduleView,
  onProjectsChange,
}) => {
  const { t } = useI18n()
  const [scheduleView, setScheduleView] = useState<FeaturesScheduleView>(() => {
    const prefs = loadGanttUiPrefs()
    return prefs.scheduleView
  })
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
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
      switch (action) {
        case 'projectInfo':
          if (selectedProject) setProjectInfoOpen(true)
          break
        case 'save':
        case 'print':
        case 'undo':
        case 'redo':
        case 'add':
        case 'insert':
        case 'delete':
        case 'indent':
        case 'outdent':
        case 'moveUp':
        case 'moveDown':
        case 'labor':
        case 'material':
        case 'machinery':
        case 'procurement':
        case 'metering':
        case 'node':
        case 'funds':
          // Editing surface for Practice (实务) view is still being redesigned;
          // toolbar actions are wired for UI parity with Gantt.
          break
        default:
          break
      }
    },
    [selectedProject],
  )

  return (
    <div className="tm-pm-gantt-page tm-pm-features-page">
      <ProjectFeaturesMenuBar
        hasProject={selectedProject != null}
        scheduleView={scheduleView}
        onScheduleViewChange={handleScheduleViewChange}
        onAction={handleMenuAction}
      />
      <div className="tm-pm-gantt-workspace tm-pm-gantt-workspace--full-list tm-pm-features-workspace">
        <div className="tm-kb-file-panel-empty tm-pm-features-placeholder">
          <p>{t('projectManagerPage.panel.reserved.files')}</p>
        </div>
      </div>
      <footer className="tm-pm-gantt-statusbar" aria-live="polite">
        <span className="tm-pm-gantt-statusbar-message tm-pm-gantt-statusbar-message--muted">
          {t('projectManagerPage.files.statusBar.ready')}
        </span>
      </footer>
      {projectInfoOpen && selectedProject ? (
        <ProjectInfoDialog
          project={selectedProject}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            onProjectsChange?.()
          }}
        />
      ) : null}
    </div>
  )
}

export default ProjectManagementFilesPanel
