import { useMemo, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useMobileApp } from '../state/MobileAppContext'
import { IconRefresh } from '../icons/composer-icons'
import { colors } from '../theme'
import {
  getProjectMenu,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  type ProjectSidebarMenuKey,
} from './projectSidebar'
import { buildProjectStats } from './projectStats'
import { ProjectStatsBody } from './ProjectStatsUi'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import {
  projectCustomizeVisibleCount,
  useProjectUi,
} from './useProjectPanes'

export { getProjectMenu } from './projectSidebar'
export { ProjectUiProvider, useOptionalProjectUi } from './useProjectPanes'

import { styles } from './ProjectPanesStyles'

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

