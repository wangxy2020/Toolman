import type { Assistant, Session } from '@toolman/shared'
import {
  buildProjectManagementAssistantSystemPrompt,
  isProjectManagementAgentTab as isSharedProjectManagementAgentTab,
  needsProjectManagementSessionReconcile,
  parseProjectManagementSessionMetadata,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  resolveProjectManagementSessionForTab,
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
  return isSharedProjectManagementAgentTab(tab)
}

export function resolveProjectManagementAgentSession(
  assistants: Assistant[],
  sessions: Session[],
  tab: ProjectManagementAgentTab,
): { assistant: Assistant; session: Session } | null {
  const assistant = assistants.find(
    (item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME,
  )
  if (!assistant) return null

  const session = resolveProjectManagementSessionForTab(sessions, assistant.id, tab)
  if (!session) return null

  return { assistant, session: session as Session }
}

export function needsProjectManagementSessionMetadata(
  session: Session,
  tab: ProjectManagementAgentTab,
): boolean {
  return needsProjectManagementSessionReconcile(session, tab)
}

export { buildProjectManagementAssistantSystemPrompt, parseProjectManagementSessionMetadata }
