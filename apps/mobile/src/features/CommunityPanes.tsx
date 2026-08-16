import { Text } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import { shellStyles } from '../theme'
import { COMMUNITY_SIDEBAR_SECTIONS } from './communitySidebar'
import {
  CommunityListSectionPanel,
  ManagementPanel,
  MinePanel,
} from './CommunityPanesPanels'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import { useCommunityUi } from './useCommunityPanes'

export { CommunityUiProvider } from './useCommunityPanes'

export function CommunityLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeSection, setActiveSection, canAccessManagement } = useCommunityUi()
  const sections = COMMUNITY_SIDEBAR_SECTIONS.filter(
    (section) => section.id !== 'management' || canAccessManagement,
  )

  return (
    <SidebarShell>
      <SidebarAddButton
        label="探索社区"
        disabled
        onPress={() => undefined}
      />
      <SidebarList>
        {sections.map((section) => (
          <SidebarItem
            key={section.id}
            label={section.label}
            active={activeSection === section.id}
            onPress={() => {
              setActiveSection(section.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

export function CommunityRightPane() {
  const { activeSection } = useCommunityUi()

  switch (activeSection) {
    case 'mine':
      return <MinePanel />
    case 'management':
      return <ManagementPanel />
    case 'news':
    case 'messages':
    case 'knowledge':
    case 'mcp':
    case 'skills':
    case 'workflow':
    case 'tasks':
      return <CommunityListSectionPanel sectionId={activeSection} />
    default:
      return <Text style={shellStyles.emptyHint}>选择社区分区</Text>
  }
}
