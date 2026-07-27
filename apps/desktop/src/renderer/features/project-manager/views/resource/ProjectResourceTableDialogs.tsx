import type { FC } from 'react'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export interface ProjectResourceTableDialogsProps {
  state: ProjectResourceTablePanelState
  onProjectsChange?: () => void | Promise<void>
}

/** Confirm dialogs, the save-as-new-version dialog, and the project info dialog. */
export const ProjectResourceTableDialogs: FC<ProjectResourceTableDialogsProps> = ({
  state,
  onProjectsChange,
}) => {
  const {
    t,
    workspaceId,
    isPractice,
    isAllScope,
    editingProject,
    practiceScopeId,
    rows,
    pendingDelete,
    setPendingDelete,
    deleteIds,
    pendingDeleteCustomTypeName,
    setPendingDeleteCustomTypeName,
    handleConfirmDeleteCustomTypeName,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    handleConfirmRestoreVersion,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    getSaveAsNewVersionInfo,
    handleSave,
    projectInfoOpen,
    setProjectInfoOpen,
  } = state

  return (
    <>
      {pendingDelete && pendingDelete.size > 0 ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.resourceTable.selection.deleteSelectedConfirm', {
            count: String(pendingDelete.size),
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteIds(pendingDelete)
            setPendingDelete(null)
          }}
        />
      ) : null}

      {pendingDeleteCustomTypeName ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.deleteCustomTypeTitle')}
          message={t('projectManagerPage.resourceTable.deleteCustomTypeConfirm', {
            name: pendingDeleteCustomTypeName,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDeleteCustomTypeName(null)}
          onConfirm={handleConfirmDeleteCustomTypeName}
        />
      ) : null}

      {pendingRestoreVersion != null ? (
        <ConfirmDialog
          title={t('projectManagerPage.resourceTable.restoreVersionTitle')}
          message={t('projectManagerPage.resourceTable.restoreVersionConfirm', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(pendingRestoreVersion),
            }),
          })}
          confirmLabel={t('projectManagerPage.resourceTable.restoreVersionConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingRestoreVersion(null)}
          onConfirm={() => void handleConfirmRestoreVersion()}
        />
      ) : null}

      {pendingSaveAsNewVersion
        ? (() => {
            const { currentVersion, nextVersion } = getSaveAsNewVersionInfo()
            return (
              <SaveAsNewVersionDialog
                currentVersion={currentVersion}
                nextVersion={nextVersion}
                onCancel={() => setPendingSaveAsNewVersion(false)}
                onConfirm={(note) => {
                  setPendingSaveAsNewVersion(false)
                  void handleSave({ asNewVersion: true, note })
                }}
              />
            )
          })()
        : null}

      {projectInfoOpen && editingProject ? (
        <ProjectInfoDialog
          project={editingProject}
          variant="resource"
          resourceRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveResources={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceResource"
          workspaceId={workspaceId}
          resourceRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveResources={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}
    </>
  )
}
