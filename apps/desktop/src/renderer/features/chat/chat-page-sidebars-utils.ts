import {
  isAssistantLibSession,
  isP2pSharedKnowledgeMirrorDescription,
  type KnowledgeBase,
  type Session,
} from '@toolman/shared'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  type KnowledgeSidebarSection,
} from '../knowledge/knowledge-sidebar-types'

const LOCAL_SECTION_RESET_IDS = new Set([
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
])

export function findFirstSavedSharedKnowledge(items: KnowledgeBase[]): KnowledgeBase | undefined {
  return items.find(
    (item) =>
      item.kind === 'shared' &&
      !isP2pSharedKnowledgeMirrorDescription(item.description) &&
      item.documentCount > 0,
  )
}

export function resolveKnowledgeActiveIdForSection(
  section: KnowledgeSidebarSection,
  items: KnowledgeBase[],
  activeId: string | null,
): string | undefined {
  if (section === 'network') return DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID
  if (section === 'sync') return DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID
  if (section === 'shared') return findFirstSavedSharedKnowledge(items)?.id
  if (section === 'local-files') return DEFAULT_LOCAL_FILES_FOLDER_ID
  if (section === 'file-tools') return FILE_REGISTRY_TOOL_ID
  if (section === 'local' && !activeId) return DEFAULT_KNOWLEDGE_FOLDER_ID
  if (section === 'local' && activeId && LOCAL_SECTION_RESET_IDS.has(activeId)) {
    return DEFAULT_KNOWLEDGE_FOLDER_ID
  }
  return undefined
}

export function listAssistantLibSidebarSessions(sessions: Session[]): Session[] {
  return sessions
    .filter((session) => isAssistantLibSession(session.metadata))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function resolveAssistantLibSidebarWorkspaceId(
  activeWorkspaceId: string | null | undefined,
  learningSessions: Session[],
): string | null {
  return activeWorkspaceId ?? learningSessions[0]?.workspaceId ?? null
}
