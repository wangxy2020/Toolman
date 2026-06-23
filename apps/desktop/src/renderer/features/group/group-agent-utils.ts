import type {
  Assistant,
  P2pAgentSessionPermission,
  P2pGroupAgentProxy,
  P2pSharedResource,
  Session,
} from '@toolman/shared'

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

const PLACEHOLDER_SESSION_TITLES = new Set(['未命名话题', '共享话题', '新对话'])

export function resolveSharedSessionTitle(
  resource: P2pSharedResource,
  sessionId: string,
  fallback = '未命名话题',
): string {
  const sharedTitle = resource.sharedSessionTitles?.[sessionId]?.trim()
  if (sharedTitle) return sharedTitle

  const trimmedFallback = fallback.trim()
  if (trimmedFallback && !PLACEHOLDER_SESSION_TITLES.has(trimmedFallback)) {
    return trimmedFallback
  }

  return '未命名话题'
}

export function resolveSharedAgentSessions(
  resource: P2pSharedResource,
  assistantId: string,
  sessions: Session[],
  assistant?: Assistant | null,
): Session[] {
  const assistantSessions = sessions.filter((item) => item.assistantId === assistantId)
  const sharedIds = resource.sharedSessionIds
  if (!sharedIds || sharedIds.length === 0) {
    if (assistant && isGroupSharedMirrorAssistant(assistant)) {
      return []
    }
    return assistantSessions.sort(
      (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    )
  }

  const byId = new Map(assistantSessions.map((item) => [item.id, item]))
  const workspaceId = assistantSessions[0]?.workspaceId ?? sessions[0]?.workspaceId ?? ''
  const resolved = sharedIds.map((id) => {
    const local = byId.get(id)
    if (local) {
      const sharedTitle = resolveSharedSessionTitle(resource, id, local.title)
      if (sharedTitle !== local.title) {
        return { ...local, title: sharedTitle }
      }
      return local
    }
    return {
      id,
      workspaceId,
      assistantId,
      title: resolveSharedSessionTitle(resource, id),
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

export function isGroupSharedMirrorAssistant(assistant: {
  parameters?: { p2pGroupSharedMirror?: unknown }
}): boolean {
  return Boolean(assistant.parameters?.p2pGroupSharedMirror)
}

export function isGroupProxyAssistant(assistant: {
  parameters?: { p2pGroupProxy?: unknown }
}): boolean {
  return Boolean(assistant.parameters?.p2pGroupProxy)
}

export function isShareableGroupAgentSource(assistant: Assistant): boolean {
  return !isGroupSharedMirrorAssistant(assistant) && !isGroupProxyAssistant(assistant)
}

const GROUP_AGENT_NAME_PREFIX_RE = /^\[[^\]]+\]\s+/

export function resolveGroupAgentPanelTitle(
  resource: P2pSharedResource,
  assistant: Assistant | null,
): string {
  if (assistant && isShareableGroupAgentSource(assistant)) {
    return assistant.name
  }
  const name = resource.name.trim()
  return GROUP_AGENT_NAME_PREFIX_RE.test(name) ? name.replace(GROUP_AGENT_NAME_PREFIX_RE, '') : name
}

export function isGroupProxyReadOnlySession(session: Session | null | undefined): boolean {
  const meta = session?.metadata?.p2pGroupAgent as { permission?: P2pAgentSessionPermission } | undefined
  return meta?.permission === 'read'
}

export function isGroupProxySession(session: Session | null | undefined): boolean {
  return Boolean(session?.metadata?.p2pGroupAgent)
}

export function readGroupProxyFromSession(
  session: Session | null | undefined,
): P2pGroupAgentProxy | undefined {
  const meta = session?.metadata?.p2pGroupAgent
  if (!meta || typeof meta !== 'object') return undefined
  const proxy = meta as P2pGroupAgentProxy
  if (!proxy.resourceId || !proxy.sourceSessionId || !proxy.ownerDeviceId) return undefined
  return proxy
}

export function resolveGroupProxyAssistantModelId(
  assistant: Assistant,
  session?: Session | null,
): string {
  const fromSession = readGroupProxyFromSession(session)?.referencedModelId?.trim()
  if (fromSession) return fromSession
  const fromAssistant = (
    assistant.parameters.p2pGroupProxy as { referencedModelId?: string } | undefined
  )?.referencedModelId?.trim()
  if (fromAssistant) return fromAssistant
  return assistant.modelId
}
