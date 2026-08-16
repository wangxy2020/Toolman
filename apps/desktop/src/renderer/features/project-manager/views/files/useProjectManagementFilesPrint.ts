import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { IpcChannel, type PmProject } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { formatPathProjectLabel } from '../../pm-panel-shared'

export function useProjectManagementFilesPrint(args: {
  editingProject: PmProject | null
  t: ReturnType<typeof useI18n>['t']
}) {
  const { editingProject, t } = args
  const handlePrint = useCallback(() => {
    flushSync(() => {
      document.title = editingProject
        ? `${formatPathProjectLabel(editingProject)} · ${t('projectManagerPage.files.table.printTitle')}`
        : `${t('projectManagerPage.headerProject.allProjects')} · ${t('projectManagerPage.files.table.printTitle')}`
    })
    void window.api.invoke(IpcChannel.AppPrintWindow, {
      landscape: false,
      printBackground: true,
    })
  }, [editingProject, t])

  return { handlePrint }
}
