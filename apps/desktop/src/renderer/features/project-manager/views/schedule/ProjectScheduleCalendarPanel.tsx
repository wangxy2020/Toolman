import type { FC } from 'react'

import { useI18n } from '../../../../i18n/useI18n'

interface Props {
  workspaceId: string
  selectedProjectId: string | null
}

const ProjectScheduleCalendarPanel: FC<Props> = () => {
  const { t } = useI18n()
  return (
    <div className="tm-kb-file-panel-empty">
      <p>{t('projectManagerPage.panel.reserved.calendar')}</p>
    </div>
  )
}

export default ProjectScheduleCalendarPanel
