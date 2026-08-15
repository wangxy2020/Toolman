import { AGENT_SCOPE_LABEL } from '../chat/agentScopes'
import type { ChatSession } from '../state/MobileAppContext'
import type { MobileNote, MobileNotebook } from '../storage/notes'
import type { GroupSharedItem, GroupSharedKind } from '../storage/groupChat'
import type { KnowledgeMetaItem } from '../sync/mobileSync'
import type { GroupPickerGroup, GroupPickerSelection } from './GroupResourcePickerModal'
import type { GroupSidebarAction } from './groupSidebar'

/** Match composer / message stream horizontal inset (12 + 8 scrollbar gutter). */
export const STREAM_PAD_SIDE = 20

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Match desktop `formatMessageTime`: `MM/DD HH:mm`. */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

export function groupKnowledgeDocsByKb(
  documents: Array<{ id: string; kbId: string; title: string }>,
): Record<string, Array<{ id: string; name: string }>> {
  const next: Record<string, Array<{ id: string; name: string }>> = {}
  for (const doc of documents) {
    const list = next[doc.kbId] ?? []
    list.push({ id: doc.id, name: doc.title })
    next[doc.kbId] = list
  }
  return next
}

export function sharedItemsFromPickerSelection(
  kind: GroupSharedKind,
  selection: GroupPickerSelection[],
  addedAt = Date.now(),
): GroupSharedItem[] {
  const items: GroupSharedItem[] = []
  for (const group of selection) {
    if (group.items.length === 0) {
      items.push({ id: group.groupId, name: group.groupName, kind, addedAt })
      continue
    }
    for (const item of group.items) {
      items.push({
        id: item.id,
        name: item.name,
        kind,
        parentId: group.groupId,
        parentName: group.groupName,
        addedAt,
      })
    }
  }
  return items
}

export function buildGroupPickerGroups(input: {
  activeAction: GroupSidebarAction
  sharedItems: GroupSharedItem[]
  sessions: ChatSession[]
  notebooks: MobileNotebook[]
  notes: MobileNote[]
  knowledgeMeta: KnowledgeMetaItem[]
  createdKbs: Array<{ id: string; name: string }>
  docsByKb: Record<string, Array<{ id: string; name: string }>>
}): GroupPickerGroup[] {
  const sharedIds = new Set(
    input.sharedItems.filter((item) => item.kind === input.activeAction).map((item) => item.id),
  )
  if (input.activeAction === 'agents') {
    const byScope = new Map<string, Array<{ id: string; name: string }>>()
    for (const session of input.sessions) {
      if (sharedIds.has(session.id)) continue
      const list = byScope.get(session.agentScope) ?? []
      list.push({ id: session.id, name: session.title || '未命名话题' })
      byScope.set(session.agentScope, list)
    }
    return [...byScope.entries()].map(([scope, items]) => ({
      id: scope,
      name: AGENT_SCOPE_LABEL[scope as keyof typeof AGENT_SCOPE_LABEL] ?? scope,
      items,
    }))
  }
  if (input.activeAction === 'notes') {
    return input.notebooks.map((notebook) => ({
      id: notebook.id,
      name: notebook.name,
      items: input.notes
        .filter((note) => note.notebookId === notebook.id && !sharedIds.has(note.id))
        .map((note) => ({ id: note.id, name: note.title || '未命名笔记' })),
    }))
  }
  if (input.activeAction === 'knowledge') {
    const kbs = [
      ...input.createdKbs,
      ...input.knowledgeMeta
        .filter((item) => !input.createdKbs.some((kb) => kb.id === item.id))
        .map((item) => ({ id: item.id, name: item.name })),
    ]
    return kbs.map((kb) => ({
      id: kb.id,
      name: kb.name,
      items: (input.docsByKb[kb.id] ?? []).filter((doc) => !sharedIds.has(doc.id)),
    }))
  }
  return []
}
