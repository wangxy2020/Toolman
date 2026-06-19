import type { P2pAgentSessionPermission, P2pSharedResource, Session } from '@toolman/shared'

export function getAgentSessionPermission(
  resource: P2pSharedResource,
  sessionId: string,
): P2pAgentSessionPermission {
  return resource.sharedSessionPermissions?.[sessionId] ?? 'read'
}

export function formatAgentSessionPermissionLabel(
  permission: P2pAgentSessionPermission,
): string {
  return permission === 'callable' ? '可调用' : '仅阅读'
}

export function resolveSharedAgentSessions(
  resource: P2pSharedResource,
  assistantId: string,
  sessions: Session[],
): Session[] {
  const assistantSessions = sessions.filter((item) => item.assistantId === assistantId)
  const sharedIds = resource.sharedSessionIds
  if (!sharedIds || sharedIds.length === 0) {
    return assistantSessions.sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    )
  }

  const byId = new Map(assistantSessions.map((item) => [item.id, item]))
  const workspaceId = assistantSessions[0]?.workspaceId ?? sessions[0]?.workspaceId ?? ''
  const resolved = sharedIds.map((id) => {
    const local = byId.get(id)
    if (local) return local
    return {
      id,
      workspaceId,
      assistantId,
      title: '共享话题',
      type: 'chat' as const,
      parentSessionId: null,
      forkMessageId: null,
      metadata: {},
      messageCount: 0,
      lastMessageAt: null,
      createdAt: resource.updatedAt,
      updatedAt: resource.updatedAt,
    } satisfies Session
  })

  return resolved.sort(
    (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
  )
}

export function isGroupProxyReadOnlySession(session: Session | null | undefined): boolean {
  const meta = session?.metadata?.p2pGroupAgent as { permission?: P2pAgentSessionPermission } | undefined
  return meta?.permission === 'read'
}

export function isGroupProxySession(session: Session | null | undefined): boolean {
  return Boolean(session?.metadata?.p2pGroupAgent)
}
