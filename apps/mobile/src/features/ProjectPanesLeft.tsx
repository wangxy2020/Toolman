import { useMobileApp } from '../state/MobileAppContext'
import {
  getProjectMenu,
  PROJECT_SIDEBAR_CUSTOM_TAB,
} from './projectSidebar'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import { useProjectUi } from './useProjectPanes'

export { getProjectMenu } from './projectSidebar'
export { ProjectUiProvider, useOptionalProjectUi } from './useProjectPanes'

export function ProjectLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeTab, setActiveTab, preferences, visibleKeys } = useProjectUi()
  const menus = preferences.order
    .filter((key) => visibleKeys.includes(key))
    .map((key) => getProjectMenu(key))

  return (
    <SidebarShell>
      <SidebarAddButton
        label="自定义"
        onPress={() => {
          setActiveTab(PROJECT_SIDEBAR_CUSTOM_TAB)
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        {menus.map((menu) => (
          <SidebarItem
            key={menu.id}
            label={menu.label}
            active={activeTab === menu.id}
            onPress={() => {
              setActiveTab(menu.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}
