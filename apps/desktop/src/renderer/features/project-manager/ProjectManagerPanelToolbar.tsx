import type { ReactNode } from 'react'

import {
  IconAgent,
  IconApps,
  IconChartBar,
  IconDatabase,
  IconGantt,
  IconPlus,
  IconSliders,
  IconTable,
} from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { useI18n } from '../../i18n/useI18n'
import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'
import type { ProjectManagerPanelView } from './projectManagerPanelView'

interface Props {
  activeTab: ConfigurableSidebarMenuKey | 'customize_menu'
  activeView: ProjectManagerPanelView
  onSelectView: (view: ProjectManagerPanelView) => void
  onCreateProject?: () => void
}

type PanelToolbarItem = {
  key: ProjectManagerPanelView | 'create_project'
  titleKey: string
  icon: ReactNode
}

const BASE_VIEW_ITEMS: PanelToolbarItem[] = [
  { key: 'stats', titleKey: 'projectManagerPage.toolbar.stats', icon: <IconChartBar size={16} /> },
  { key: 'agent', titleKey: 'projectManagerPage.toolbar.agent', icon: <IconAgent size={16} /> },
  { key: 'files', titleKey: 'projectManagerPage.toolbar.files', icon: <IconApps size={16} /> },
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

const PROGRESS_SCHEDULE_ITEMS: PanelToolbarItem[] = [
  { key: 'gantt', titleKey: 'projectManagerPage.toolbar.gantt', icon: <IconGantt size={16} /> },
]

const RESOURCE_TABLE_ITEMS: PanelToolbarItem[] = [
  {
    key: 'resource_table',
    titleKey: 'projectManagerPage.toolbar.resourceTable',
    icon: <IconTable size={16} />,
  },
]

function insertAfterAgent(items: PanelToolbarItem[], extra: PanelToolbarItem[]): PanelToolbarItem[] {
  const agentIndex = items.findIndex((item) => item.key === 'agent')
  return [
    ...items.slice(0, agentIndex + 1),
    ...extra,
    ...items.slice(agentIndex + 1),
  ]
}

function insertCreateBetweenDatabaseAndSettings(
  items: PanelToolbarItem[],
): PanelToolbarItem[] {
  const databaseIndex = items.findIndex((item) => item.key === 'database')
  if (databaseIndex < 0) return items
  const createItem: PanelToolbarItem = {
    key: 'create_project',
    titleKey: 'projectManagerPage.headerProject.newProject',
    icon: <IconPlus size={16} />,
  }
  return [
    ...items.slice(0, databaseIndex + 1),
    createItem,
    ...items.slice(databaseIndex + 1),
  ]
}

export function ProjectManagerPanelToolbar({
  activeTab,
  activeView,
  onSelectView,
  onCreateProject,
}: Props) {
  const { t } = useI18n()
  const withDomainExtras =
    activeTab === 'progress_management'
      ? insertAfterAgent(BASE_VIEW_ITEMS, PROGRESS_SCHEDULE_ITEMS)
      : activeTab === 'resource_management'
        ? insertAfterAgent(BASE_VIEW_ITEMS, RESOURCE_TABLE_ITEMS)
        : BASE_VIEW_ITEMS
  const viewItems = onCreateProject
    ? insertCreateBetweenDatabaseAndSettings(withDomainExtras)
    : withDomainExtras

  return (
    <>
      {viewItems.map((item) => {
        if (item.key === 'create_project') {
          const title = t(item.titleKey)
          return (
            <HeaderIconButton
              key={item.key}
              label={title}
              onClick={() => onCreateProject?.()}>
              {item.icon}
            </HeaderIconButton>
          )
        }

        const viewKey = item.key
        const isActive = activeView === viewKey
        const title = t(item.titleKey)
        return (
          <HeaderIconButton
            key={viewKey}
            label={title}
            active={isActive}
            aria-pressed={isActive}
            onClick={() => onSelectView(viewKey)}>
            {item.icon}
          </HeaderIconButton>
        )
      })}
    </>
  )
}
