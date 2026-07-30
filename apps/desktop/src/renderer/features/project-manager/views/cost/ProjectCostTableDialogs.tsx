import type { FC } from 'react'

import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { AddMultipleRowsDialog } from '../../../../components/AddMultipleRowsDialog'
import { SaveAsNewVersionDialog } from '../../../../components/SaveAsNewVersionDialog'
import { useI18n } from '../../../../i18n/useI18n'
import ProjectInfoDialog from '../schedule/ProjectInfoDialog'
import MeteringBaselineCaptureDialog from './MeteringBaselineCaptureDialog'
import type { ProjectCostTablePanelProps, ProjectCostTablePanelState } from './useProjectCostTablePanel'

export interface ProjectCostTableDialogsProps {
  panelProps: ProjectCostTablePanelProps
  state: ProjectCostTablePanelState
}

/** Confirm / add-rows / save-as-new-version / project-info dialogs owned by the cost table panel. */
export const ProjectCostTableDialogs: FC<ProjectCostTableDialogsProps> = ({
  panelProps,
  state,
}) => {
  const { t } = useI18n()
  const { workspaceId, onProjectsChange } = panelProps
  const {
    isPractice,
    isAllScope,
    editingProject,
    practiceScopeId,
    rows,
    pendingImportRows,
    setPendingImportRows,
    applyImportedRows,
    pendingDelete,
    setPendingDelete,
    deleteIds,
    pendingRestoreVersion,
    setPendingRestoreVersion,
    handleConfirmRestoreVersion,
    pendingAddMultiple,
    setPendingAddMultiple,
    handleAdd,
    pendingSaveAsNewVersion,
    setPendingSaveAsNewVersion,
    saveAsNewVersionCurrentVersion,
    saveAsNewVersionNextVersion,
    handleSave,
    projectInfoOpen,
    setProjectInfoOpen,
    meteringCaptureBaselineOpen,
    setMeteringCaptureBaselineOpen,
    nextMeteringCaptureBaselineIndex,
    nextMeteringCaptureAsOfMs,
    nextMeteringCaptureBaselineName,
    handleMeteringCaptureBaselineConfirm,
    meteringEditBaselineOpen,
    setMeteringEditBaselineOpen,
    selectedMeteringBaseline,
    editMeteringBaselineNameIndex,
    editMeteringBaselineInitialDateMs,
    handleMeteringEditBaselineConfirm,
    pendingMeteringDeleteBaseline,
    setPendingMeteringDeleteBaseline,
    handleConfirmMeteringDeleteBaseline,
  } = state

  return (
    <>
      {pendingImportRows ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.importTitle')}
          message={t('projectManagerPage.costTable.importReplaceConfirm', {
            name: pendingImportRows.sourceName,
            count: String(pendingImportRows.rows.length),
          })}
          confirmLabel={t('projectManagerPage.costTable.importReplaceConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingImportRows(null)}
          onConfirm={() => {
            applyImportedRows(pendingImportRows.rows)
            setPendingImportRows(null)
          }}
        />
      ) : null}

      {pendingDelete && pendingDelete.size > 0 ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.selection.deleteSelectedTitle')}
          message={t('projectManagerPage.costTable.selection.deleteSelectedConfirm', {
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

      {pendingRestoreVersion != null ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.restoreVersionTitle')}
          message={t('projectManagerPage.costTable.restoreVersionConfirm', {
            name: t('projectManagerPage.projectInfo.saveHistoryVersion', {
              version: String(pendingRestoreVersion),
            }),
          })}
          confirmLabel={t('projectManagerPage.costTable.restoreVersionConfirmLabel')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setPendingRestoreVersion(null)}
          onConfirm={() => void handleConfirmRestoreVersion()}
        />
      ) : null}

      {pendingAddMultiple ? (
        <AddMultipleRowsDialog
          onCancel={() => setPendingAddMultiple(false)}
          onConfirm={(count) => {
            handleAdd(count)
            setPendingAddMultiple(false)
          }}
        />
      ) : null}

      {pendingSaveAsNewVersion ? (
        <SaveAsNewVersionDialog
          currentVersion={saveAsNewVersionCurrentVersion}
          nextVersion={saveAsNewVersionNextVersion}
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
          variant="cost"
          costRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveCosts={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {projectInfoOpen && isAllScope ? (
        <ProjectInfoDialog
          mode="workspaceCost"
          workspaceId={workspaceId}
          costRows={rows}
          practiceScopeId={isPractice ? practiceScopeId : undefined}
          onSaveCosts={handleSave}
          onClose={() => setProjectInfoOpen(false)}
          onSaved={() => {
            void onProjectsChange?.()
          }}
        />
      ) : null}

      {meteringCaptureBaselineOpen && !isPractice ? (
        <MeteringBaselineCaptureDialog
          mode="capture"
          initialName={nextMeteringCaptureBaselineName}
          initialDateMs={nextMeteringCaptureAsOfMs}
          nameIndex={nextMeteringCaptureBaselineIndex}
          onCancel={() => setMeteringCaptureBaselineOpen(false)}
          onConfirm={handleMeteringCaptureBaselineConfirm}
        />
      ) : null}

      {meteringEditBaselineOpen && !isPractice && selectedMeteringBaseline ? (
        <MeteringBaselineCaptureDialog
          mode="edit"
          initialName={selectedMeteringBaseline.name}
          initialDateMs={editMeteringBaselineInitialDateMs}
          nameIndex={editMeteringBaselineNameIndex}
          onCancel={() => setMeteringEditBaselineOpen(false)}
          onConfirm={handleMeteringEditBaselineConfirm}
        />
      ) : null}

      {pendingMeteringDeleteBaseline && !isPractice && selectedMeteringBaseline ? (
        <ConfirmDialog
          title={t('projectManagerPage.costTable.meteringBaselineDelete.title')}
          message={t('projectManagerPage.costTable.meteringBaselineDelete.confirm', {
            name: selectedMeteringBaseline.name,
          })}
          confirmLabel={t('projectManagerPage.costTable.meteringBaselineDelete.confirmLabel')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingMeteringDeleteBaseline(false)}
          onConfirm={handleConfirmMeteringDeleteBaseline}
        />
      ) : null}
    </>
  )
}
