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

import { ProjectCustomizePanel, ProjectDomainPanel } from './ProjectPanesPanels'

export function ProjectRightPane() {
  const { activeTab } = useProjectUi()
  if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) {
    return <ProjectCustomizePanel />
  }
  const menuKey: ProjectSidebarMenuKey = activeTab
  return <ProjectDomainPanel menuKey={menuKey} />
}

