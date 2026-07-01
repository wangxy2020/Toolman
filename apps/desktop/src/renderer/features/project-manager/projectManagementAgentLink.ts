import type { Assistant, Session } from '@toolman/shared'
import {
  buildProjectManagementAssistantSystemPrompt,
  buildProjectManagementSessionMetadata,
  parseProjectManagementSessionMetadata,
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  type ProjectManagementAgentTab,
} from '@toolman/shared'

import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

export {
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
} from '@toolman/shared'

export function isProjectManagementAgentTab(
  tab: ConfigurableSidebarMenuKey,
): tab is ProjectManagementAgentTab {
  return tab === 'cost_management' || tab === 'progress_management'
}

export function resolveProjectManagementAgentSession(
  assistants: Assistant[],
  sessions: Session[],
  tab: ProjectManagementAgentTab,
): { assistant: Assistant; session: Session } | null {
  const sessionTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]

  const assistant = assistants.find(
    (item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME,
  )
  if (!assistant) return null

  const session = sessions.find(
    (item) => item.assistantId === assistant.id && item.title.trim() === sessionTitle,
  )
  if (!session) return null

  return { assistant, session }
}

export function needsProjectManagementSessionMetadata(
  session: Session,
  tab: ProjectManagementAgentTab,
): boolean {
  const metadata = parseProjectManagementSessionMetadata(session.metadata)
  return metadata?.tab !== tab
}

export function projectManagementSessionMetadataPatch(
  session: Session,
  tab: ProjectManagementAgentTab,
): Record<string, unknown> {
  return {
    ...session.metadata,
    ...buildProjectManagementSessionMetadata(tab),
  }
}

export { buildProjectManagementAssistantSystemPrompt }
