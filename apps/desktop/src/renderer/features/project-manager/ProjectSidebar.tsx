import { useEffect, useMemo } from 'react'

import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  isConfigurableSidebarMenuKey,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  SIDEBAR_MENU_I18N_KEY,
  type ProjectSidebarMenuTab,
} from './projectSidebarMenuConfig'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'

const DEFAULT_TAB: ProjectSidebarMenuTab = 'cost_management'

interface Props {
  activeTab: ProjectSidebarMenuTab
  onSelectTab: (tab: ProjectSidebarMenuTab) => void
}

export function ProjectSidebar({ activeTab, onSelectTab }: Props) {
  const { t } = useI18n()
  const { preferences, visibleMenuKeys } = useProjectSidebarMenuPreferences()

  const menus = useMemo(
    () =>
      preferences.order
        .filter((key) => visibleMenuKeys.includes(key))
        .map((key) => ({
          key,
          label: t(SIDEBAR_MENU_I18N_KEY[key]),
        })),
    [preferences.order, t, visibleMenuKeys],
  )

  useEffect(() => {
    if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) return
    if (isConfigurableSidebarMenuKey(activeTab) && !visibleMenuKeys.includes(activeTab)) {
      const fallback =
        visibleMenuKeys.find((key) => key === DEFAULT_TAB) ??
        visibleMenuKeys[0] ??
        PROJECT_SIDEBAR_CUSTOM_TAB
      onSelectTab(fallback)
    }
  }, [activeTab, onSelectTab, visibleMenuKeys])

  const isCustomActive = activeTab === PROJECT_SIDEBAR_CUSTOM_TAB

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button
          type="button"
          className={['tm-sidebar-add', isCustomActive ? 'tm-sidebar-add--active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelectTab(PROJECT_SIDEBAR_CUSTOM_TAB)}>
          <IconPlus />
          {t('projectManagerPage.sidebar.customize')}
        </button>

        <div className="tm-sidebar-list">
          {menus.map((menu) => {
            const isActive = menu.key === activeTab

            return (
              <div key={menu.key} className="tm-assistant-group">
                <div
                  className={[
                    'tm-assistant-row',
                    isActive ? 'tm-assistant-row--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}>
                  <span
                    className="tm-assistant-expand tm-assistant-expand--placeholder"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className={[
                      'tm-assistant-name',
                      isActive ? 'tm-assistant-name--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      if (menu.key !== activeTab) onSelectTab(menu.key)
                    }}>
                    {menu.label}
                  </button>
                  <div
                    className="tm-assistant-actions tm-assistant-actions--placeholder"
                    aria-hidden="true"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
