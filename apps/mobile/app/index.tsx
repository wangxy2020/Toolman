import { AgentLeftPane, AgentRightPane } from '../src/features/AgentPanes'
import {
  ClassroomLeftPane,
  ClassroomRightPane,
  ClassroomUiProvider,
} from '../src/features/ClassroomPanes'
import {
  CommunityLeftPane,
  CommunityRightPane,
  CommunityUiProvider,
} from '../src/features/CommunityPanes'
import {
  GroupChatProvider,
  GroupLeftPane,
  GroupRightPane,
} from '../src/features/GroupPanes'
import {
  KnowledgeLeftPane,
  KnowledgeRightPane,
  KnowledgeUiProvider,
} from '../src/features/KnowledgePanes'
import { ModuleLeftPane, ModuleRightPane } from '../src/features/ModulePanes'
import {
  ProjectLeftPane,
  ProjectRightPane,
  ProjectUiProvider,
} from '../src/features/ProjectPanes'
import { SettingsLeftPane, SettingsRightPane } from '../src/features/SettingsPanes'
import { isAgentChatScope } from '../src/chat/agentScopes'
import { AppShell } from '../src/shell/AppShell'
import { useMobileApp } from '../src/state/MobileAppContext'

export default function HomeScreen() {
  const { module, showSettings } = useMobileApp()

  if (showSettings) {
    return (
      <AppShell
        sidebarMode="docked"
        left={<SettingsLeftPane />}
        right={<SettingsRightPane />}
      />
    )
  }

  // Each agent page has its own sessions + pane instance (same shared modelConfig).
  // Projects uses the desktop-like domain sidebar instead of agent topics.
  if (module === 'classroom') {
    return (
      <ClassroomUiProvider>
        <AppShell
          key="classroom"
          left={<ClassroomLeftPane />}
          right={<ClassroomRightPane />}
        />
      </ClassroomUiProvider>
    )
  }

  if (isAgentChatScope(module) && module !== 'projects') {
    return (
      <AppShell
        key={module}
        left={<AgentLeftPane />}
        right={<AgentRightPane key={module} />}
      />
    )
  }

  if (module === 'knowledge') {
    return (
      <KnowledgeUiProvider>
        <AppShell left={<KnowledgeLeftPane />} right={<KnowledgeRightPane />} />
      </KnowledgeUiProvider>
    )
  }

  if (module === 'group') {
    return (
      <GroupChatProvider>
        <AppShell left={<GroupLeftPane />} right={<GroupRightPane />} />
      </GroupChatProvider>
    )
  }

  if (module === 'community') {
    return (
      <CommunityUiProvider>
        <AppShell left={<CommunityLeftPane />} right={<CommunityRightPane />} />
      </CommunityUiProvider>
    )
  }

  if (module === 'projects') {
    return (
      <ProjectUiProvider>
        <AppShell left={<ProjectLeftPane />} right={<ProjectRightPane />} />
      </ProjectUiProvider>
    )
  }

  return (
    <AppShell
      left={<ModuleLeftPane moduleId={module} />}
      right={<ModuleRightPane moduleId={module} />}
    />
  )
}
