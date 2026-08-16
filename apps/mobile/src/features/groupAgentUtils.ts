import type { GroupAgentProxy, ChatSession, MobileAgent } from '../state/MobileAppContext'
import type { GroupSharedItem } from '../storage/groupChat'
import { newUuid } from '../p2p/bytes'

export type GroupAgentTopic = {
  id: string
  name: string
  permission: 'read' | 'callable'
  addedAt: number
  item: GroupSharedItem
}

export type GroupAgentSection = {
  id: string
  name: string
  topics: GroupAgentTopic[]
  parent: GroupSharedItem
}

export function formatGroupVirtualAgentName(groupName: string, agentName: string): string {
  const trimmedGroup = groupName.trim()
  const prefix = trimmedGroup ? `[${trimmedGroup}] ` : '[群组] '
  if (agentName.startsWith(prefix)) return agentName
  return `${prefix}${agentName}`
}

export function formatAgentSessionPermissionLabel(permission: 'read' | 'callable'): string {
  return permission === 'callable' ? '可调用' : '仅阅读'
}

export function groupSharedAgentSections(items: GroupSharedItem[]): GroupAgentSection[] {
  const agents = items.filter((item) => item.kind === 'agents')
  const parents = agents.filter((item) => !item.parentId)
  const children = agents.filter((item) => item.parentId)
  const byParent = new Map<string, GroupSharedItem[]>()
  for (const child of children) {
    const list = byParent.get(child.parentId!) ?? []
    list.push(child)
    byParent.set(child.parentId!, list)
  }
  const orphanParentIds = [...byParent.keys()].filter(
    (id) => !parents.some((parent) => parent.id === id),
  )
  const sections: GroupAgentSection[] = parents.map((parent) => ({
    id: parent.id,
    name: parent.name,
    parent,
    topics: (byParent.get(parent.id) ?? [])
      .slice()
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((item) => ({
        id: item.id,
        name: item.name,
        permission: item.sessionPermission === 'callable' ? 'callable' : 'read',
        addedAt: item.addedAt,
        item,
      })),
  }))
  for (const parentId of orphanParentIds) {
    const topics = byParent.get(parentId) ?? []
    const first = topics[0]
    if (!first) continue
    sections.push({
      id: parentId,
      name: first.parentName || '共享智能体',
      parent: {
        id: parentId,
        name: first.parentName || '共享智能体',
        kind: 'agents',
        addedAt: first.addedAt,
        sharedBy: first.sharedBy,
        sourceAssistantId: first.sourceAssistantId ?? parentId,
        referencedModelId: first.referencedModelId,
        ownerDeviceId: first.ownerDeviceId,
      },
      topics: topics
        .slice()
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((item) => ({
          id: item.id,
          name: item.name,
          permission: item.sessionPermission === 'callable' ? 'callable' : 'read',
          addedAt: item.addedAt,
          item,
        })),
    })
  }
  return sections
}

export function findGroupAgentProxySession(
  sessions: ChatSession[],
  workspaceId: string,
  sourceSessionId: string,
): ChatSession | undefined {
  return sessions.find(
    (session) =>
      session.groupAgent?.workspaceId === workspaceId &&
      session.groupAgent.sourceSessionId === sourceSessionId,
  )
}

export function buildGroupAgentProxy(
  input: {
    workspaceId: string
    groupName: string
    section: GroupAgentSection
    topic: GroupAgentTopic
    ownerDeviceId?: string
  },
): GroupAgentProxy {
  const parent = input.section.parent
  const item = input.topic.item
  return {
    workspaceId: input.workspaceId,
    resourceId: parent.sourceAssistantId ?? parent.id,
    sourceSessionId: input.topic.id,
    sourceAssistantId: item.sourceAssistantId ?? parent.sourceAssistantId ?? parent.id,
    groupName: input.groupName,
    sharedAgentName: input.section.name,
    permission: input.topic.permission,
    ownerMemberId: item.sharedBy || parent.sharedBy || input.ownerDeviceId || 'owner',
    ownerDeviceId: item.ownerDeviceId || parent.ownerDeviceId || input.ownerDeviceId,
    referencedModelId: item.referencedModelId || parent.referencedModelId,
  }
}

export function createGroupAgentProxySession(input: {
  title: string
  groupAgent: GroupAgentProxy
  existing?: ChatSession
}): ChatSession {
  return {
    id: input.existing?.id ?? newUuid(),
    title: input.title,
    updatedAt: Date.now(),
    messages: input.existing?.messages ?? [],
    agentScope: 'agent',
    groupAgent: input.groupAgent,
  }
}

export type AgentSidebarSection = {
  key: string
  title: string
  /** Local agent id when this is a personal assistant group; null for group-proxy sections. */
  assistantId: string | null
  sessions: ChatSession[]
}

export function groupAgentSessionsForSidebar(
  sessions: ChatSession[],
  agents: MobileAgent[],
): AgentSidebarSection[] {
  const sections: AgentSidebarSection[] = []

  const sortedAgents = agents
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'zh'))
  for (const agent of sortedAgents) {
    const agentSessions = sessions
      .filter((session) => !session.groupAgent && session.assistantId === agent.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    sections.push({
      key: agent.id,
      title: agent.name,
      assistantId: agent.id,
      sessions: agentSessions,
    })
  }

  // Orphan personal sessions (should be rare after migrate) — show under a fallback header.
  const knownAgentIds = new Set(sortedAgents.map((a) => a.id))
  const orphans = sessions
    .filter(
      (session) =>
        !session.groupAgent && (!session.assistantId || !knownAgentIds.has(session.assistantId)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (orphans.length > 0) {
    sections.push({
      key: 'orphan-personal',
      title: '其他话题',
      assistantId: null,
      sessions: orphans,
    })
  }

  const grouped = new Map<string, { title: string; sessions: ChatSession[] }>()
  for (const session of sessions) {
    const proxy = session.groupAgent
    if (!proxy) continue
    const key = `${proxy.workspaceId}:${proxy.sourceAssistantId}`
    const title = formatGroupVirtualAgentName(proxy.groupName, proxy.sharedAgentName)
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.sessions.push(session)
    } else {
      grouped.set(key, { title, sessions: [session] })
    }
  }
  for (const [key, bucket] of grouped) {
    sections.push({
      key,
      title: bucket.title,
      assistantId: null,
      sessions: bucket.sessions.sort((a, b) => b.updatedAt - a.updatedAt),
    })
  }
  return sections
}
