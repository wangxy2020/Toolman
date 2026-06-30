import type { ReactNode } from 'react'

import {
  IconAgent,
  IconChartBar,
  IconDatabase,
  IconFile,
  IconSliders,
} from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectManagerPanelView } from './projectManagerPanelView'

interface Props {
  activeView: ProjectManagerPanelView
  onSelectView: (view: ProjectManagerPanelView) => void
}

const VIEW_ITEMS: {
  key: ProjectManagerPanelView
  titleKey: string
  icon: ReactNode
}[] = [
  { key: 'stats', titleKey: 'projectManagerPage.toolbar.stats', icon: <IconChartBar size={16} /> },
  { key: 'agent', titleKey: 'projectManagerPage.toolbar.agent', icon: <IconAgent size={16} /> },
  { key: 'files', titleKey: 'projectManagerPage.toolbar.files', icon: <IconFile size={16} /> },
  {
    key: 'database',
    titleKey: 'projectManagerPage.toolbar.database',
    icon: <IconDatabase size={16} />,
  },
  {
    key: 'settings',
    titleKey: 'projectManagerPage.toolbar.settings',
    icon: <IconSliders size={16} />,
  },
]

export function ProjectManagerPanelToolbar({ activeView, onSelectView }: Props) {
  const { t } = useI18n()

  return (
    <>
      {VIEW_ITEMS.map((item) => {
        const isActive = activeView === item.key
        const title = t(item.titleKey)
        return (
          <button
            key={item.key}
            type="button"
            className={[
              'tm-chat-header-settings-btn',
              isActive ? 'tm-chat-header-settings-btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={title}
            aria-label={title}
            aria-pressed={isActive}
            onClick={() => onSelectView(item.key)}>
            {item.icon}
          </button>
        )
      })}
    </>
  )
}
