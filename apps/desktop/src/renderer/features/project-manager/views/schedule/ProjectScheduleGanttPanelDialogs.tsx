import type { FC } from 'react'

import { readMaxScheduleVersion, readScheduleVersion } from '@toolman/shared'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import BaselineCaptureDialog from './BaselineCaptureDialog'
import ProjectInfoDialog from './ProjectInfoDialog'
import type { ScheduleGanttPanelState } from './useProjectScheduleGanttPanel'

export interface ProjectScheduleGanttPanelDialogsProps {
  state: ScheduleGanttPanelState
  onProjectsChange?: () => void | Promise<void>
}

/** Modal dialogs owned by the schedule Gantt panel: project info, save/delete/baseline confirms. */
export const ProjectScheduleGanttPanelDialogs: FC<ProjectScheduleGanttPanelDialogsProps> = ({
  state,
  onProjectsChange,
}) => {
  const {
    t,
    items,
    selectedProject,
    selectedProjectId,
    checkedIds,
    selectedBaselineId,
    baseline,

    projectInfoOpen,
    setProjectInfoOpen,
    pendingDeleteSelected,
    setPendingDeleteSelected,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    setPendingRestoreBaselineId,
    pendingRestoreBaseline,
    pendingRestoreDisplayName,
    captureBaselineOpen,
    setCaptureBaselineOpen,
    editBaselineOpen,
    setEditBaselineOpen,
    editBaselineNameIndex,
    editBaselineInitialDateMs,
    nextCaptureAsOfMs,
    nextCaptureBaselineIndex,
    nextCaptureBaselineName,

    handleScheduleSave,
    handleDeleteSelectedRows,
    handleConfirmRestoreBaseline,
    handleCaptureBaselineConfirm,
    handleEditBaselineConfirm,
  } = state

  return (
    <>
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
          onConfirm={handleCaptureBaselineConfirm}
        />
      ) : null}

      {editBaselineOpen && selectedBaselineId && baseline ? (
        <BaselineCaptureDialog
          mode="edit"
          initialName={baseline.name}
          initialDateMs={editBaselineInitialDateMs}
          nameIndex={editBaselineNameIndex}
          onCancel={() => setEditBaselineOpen(false)}
          onConfirm={handleEditBaselineConfirm}
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
    </>
  )
}
