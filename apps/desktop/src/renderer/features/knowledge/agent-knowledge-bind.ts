import { isVectorizedKnowledgeBaseKind, type KnowledgeBase } from '@toolman/shared'
import {
  knowledgeSectionForKind,
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
} from './knowledge-sidebar-types'

/** Knowledge bases that support vector search / RAG (excludes local_files storage-only). */
export function filterAgentBindableKnowledgeBases(items: KnowledgeBase[]): KnowledgeBase[] {
  return items.filter((kb) => isVectorizedKnowledgeBaseKind(kb.kind))
}

export const AGENT_BINDABLE_KB_SECTIONS = ['local', 'sync', 'network', 'shared'] as const
export type AgentBindableKbSection = (typeof AGENT_BINDABLE_KB_SECTIONS)[number]

export type AgentBindableKbGroup = {
  id: AgentBindableKbSection
  items: KnowledgeBase[]
}

function isDefaultFolderKb(name: string): boolean {
  return SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(name)
}

function sortBindableKnowledgeBases(items: KnowledgeBase[]): KnowledgeBase[] {
  return [...items].sort((left, right) => {
    const leftDefault = isDefaultFolderKb(left.name) ? 0 : 1
    const rightDefault = isDefaultFolderKb(right.name) ? 0 : 1
    if (leftDefault !== rightDefault) return leftDefault - rightDefault
    return left.name.localeCompare(right.name, 'zh')
  })
}

/** Group bindable KBs under 本地 / 同步 / 网络 / 共享, matching the knowledge sidebar. */
export function groupAgentBindableKnowledgeBases(items: KnowledgeBase[]): AgentBindableKbGroup[] {
  const bindable = filterAgentBindableKnowledgeBases(items)
  return AGENT_BINDABLE_KB_SECTIONS.map((id) => ({
    id,
    items: sortBindableKnowledgeBases(
      bindable.filter((kb) => knowledgeSectionForKind(kb.kind) === id),
    ),
  }))
}
