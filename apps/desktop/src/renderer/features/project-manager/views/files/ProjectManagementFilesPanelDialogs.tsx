import type { FC } from 'react'

import { readFeatureVersion, readMaxFeatureVersion } from '@toolman/shared'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import { readSharedFeatureSaveMeta, readSharedFeatureVersion } from './pm-features-catalog'
import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'

export interface ProjectManagementFilesPanelDialogsProps {
  state: ProjectManagementFilesPanelState
  onProjectsChange?: () => void
}

/** Confirm / save-as-new-version / project-info dialogs owned by the Files panel. */
export const ProjectManagementFilesPanelDialogs: FC<ProjectManagementFilesPanelDialogsProps> = ({
  state,
  onProjectsChange,
}) => {
  const {
    t,
    workspaceId,
    isAllScope,
    editingProject,
    rows,
    pendingDelete,
    setPendingDelete,
    pendingDeleteIds,
    deleteIds,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    handleConfirmRestoreVersion,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    handleSave,
    projectInfoOpen,
    setProjectInfoOpen,
  } = state

  return (
    <>
      {pendingDelete ? (
        <ConfirmDialog
          title={t('projectManagerPage.files.table.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.files.table.selection.deleteSelectedConfirm', {
            count: String(pendingDeleteIds.size),
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(false)}
          onConfirm={() => {
            deleteIds(pendingDeleteIds)
            setPendingDelete(false)
          }}
        />
      ) : null}

      {pendingRestoreVersion != null ? (
        <ConfirmDialog
          title={t('projectManagerPage.files.restoreVersionTitle')}
          message={t('projectManagerPage.files.restoreVersionConfirm', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(pendingRestoreVersion),
            }),
          })}
          confirmLabel={t('projectManagerPage.files.restoreVersionConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingRestoreVersion(null)}
          onConfirm={() => void handleConfirmRestoreVersion()}
        />
      ) : null}

      {pendingSaveAsNewVersion ? (
        <SaveAsNewVersionDialog
          currentVersion={
            isAllScope
              ? readSharedFeatureVersion(workspaceId)
              : readFeatureVersion(editingProject?.metadata)
          }
          nextVersion={
            (isAllScope
              ? readMaxFeatureVersion(readSharedFeatureSaveMeta(workspaceId))
              : readMaxFeatureVersion(editingProject?.metadata)) + 1
          }
          onCancel={() => setPendingSaveAsNewVersion(false)}
          onConfirm={(note) => {
            setPendingSaveAsNewVersion(false)
            void handleSave({ asNewVersion: true, note })
          }}
        />
      ) : null}

      {projectInfoOpen && editingProject ? (
        <ProjectInfoDialog
          project={editingProject}
          variant="features"
          featureRows={rows}
          onSaveFeatures={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceFeatures"
          workspaceId={workspaceId}
          featureRows={rows}
          onSaveFeatures={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            onProjectsChange?.()
          }}
        />
      ) : null}
    </>
  )
}
