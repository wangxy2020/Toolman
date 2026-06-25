import type { ReactNode } from 'react'
import { GroupPanelHeader } from './GroupPanelHeader'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  title: string
  workspaceName: string
  hint: string
  icon?: ReactNode
}

export function GroupPlaceholderPanel({ title, workspaceName, hint, icon }: Props) {
  const { t } = useI18n()
  return (
    <div className="tm-group-member-panel">
      <GroupPanelHeader title={title} subtitle={t('groupPage.panels.comingSoon', { title: workspaceName })} />
      <div className="tm-group-member-panel-empty">
        {icon ? <span className="tm-group-member-panel-empty-icon">{icon}</span> : null}
        <p>{hint}</p>
      </div>
    </div>
  )
}
