import type { ReactNode } from 'react'

import {
  IconAgent,
  IconChartBar,
  IconDatabase,
  IconFile,
  IconSliders,
} from '../../components/icons'
import type { ProjectManagerPanelView } from './projectManagerPanelView'

interface Props {
  activeView: ProjectManagerPanelView
  onSelectView: (view: ProjectManagerPanelView) => void
}

const VIEW_ITEMS: {
  key: ProjectManagerPanelView
  title: string
  icon: ReactNode
}[] = [
  { key: 'stats', title: '统计', icon: <IconChartBar size={16} /> },
  { key: 'agent', title: '智能体', icon: <IconAgent size={16} /> },
  { key: 'files', title: '文件', icon: <IconFile size={16} /> },
  { key: 'database', title: '数据库', icon: <IconDatabase size={16} /> },
  { key: 'settings', title: '设置', icon: <IconSliders size={16} /> },
]

export function ProjectManagerPanelToolbar({ activeView, onSelectView }: Props) {
  return (
    <>
      {VIEW_ITEMS.map((item) => {
        const isActive = activeView === item.key
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
            title={item.title}
            aria-label={item.title}
            aria-pressed={isActive}
            onClick={() => onSelectView(item.key)}
          >
            {item.icon}
          </button>
        )
      })}
    </>
  )
}
