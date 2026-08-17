import {
  PROJECT_SIDEBAR_CUSTOM_TAB,
  type ProjectSidebarMenuKey,
} from './projectSidebar'
import { useProjectUi } from './useProjectPanes'
import { ProjectCustomizePanel, ProjectDomainPanel } from './ProjectPanesPanels'

export { getProjectMenu } from './projectSidebar'
export { ProjectUiProvider, useOptionalProjectUi } from './useProjectPanes'

export function ProjectRightPane() {
  const { activeTab } = useProjectUi()
  if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) {
    return <ProjectCustomizePanel />
  }
  const menuKey: ProjectSidebarMenuKey = activeTab
  return <ProjectDomainPanel menuKey={menuKey} />
}
