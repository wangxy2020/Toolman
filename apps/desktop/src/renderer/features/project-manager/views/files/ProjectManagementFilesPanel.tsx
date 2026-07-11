import type { FC } from 'react'

import type { PmProject } from '@toolman/shared'
import type { Workspace } from '@toolman/shared'

import type { SystemPaths } from '../../../chat/useSystemPaths'
import { useI18n } from '../../../../i18n/useI18n'

interface Props {
  workspaceId: string
  workspace: Workspace | null
  systemPaths: SystemPaths | null
  projects: PmProject[]
  selectedProjectId: string | null
}

/** Features (功能) view placeholder — content cleared pending redesign. */
const ProjectManagementFilesPanel: FC<Props> = () => {
  const { t } = useI18n()
  return (
    <div className="tm-kb-file-panel-empty">
      <p>{t('projectManagerPage.panel.reserved.files')}</p>
    </div>
  )
}

export default ProjectManagementFilesPanel
