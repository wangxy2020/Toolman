import type { P2pAgentSessionPermission } from '@toolman/shared'

export function readAgentShareMetadata(metadataJson: string | null | undefined): {
  sourceWorkspaceId?: string
  sessionIds?: string[]
  sessionTitles?: Record<string, string>
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
} {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson) as {
      sourceWorkspaceId?: string
      sessionIds?: string[]
      sessionTitles?: Record<string, unknown>
      packageJson?: string
      sessionPermissions?: Record<string, unknown>
    }
    const sessionPermissions: Record<string, P2pAgentSessionPermission> = {}
    if (parsed.sessionPermissions && typeof parsed.sessionPermissions === 'object') {
      for (const [sessionId, permission] of Object.entries(parsed.sessionPermissions)) {
        if (permission === 'read' || permission === 'callable') {
          sessionPermissions[sessionId] = permission
        }
      }
    }
    const sessionTitles: Record<string, string> = {}
    if (parsed.sessionTitles && typeof parsed.sessionTitles === 'object') {
      for (const [sessionId, title] of Object.entries(parsed.sessionTitles)) {
        if (typeof title === 'string' && title.trim()) {
          sessionTitles[sessionId] = title
        }
      }
    }
    return {
      sourceWorkspaceId: parsed.sourceWorkspaceId,
      packageJson: parsed.packageJson,
      sessionIds: Array.isArray(parsed.sessionIds)
        ? parsed.sessionIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      sessionTitles: Object.keys(sessionTitles).length > 0 ? sessionTitles : undefined,
      sessionPermissions:
        Object.keys(sessionPermissions).length > 0 ? sessionPermissions : undefined,
    }
  } catch {
    return {}
  }
}

export function serializeAgentShareMetadata(metadata: {
  sourceWorkspaceId?: string
  sessionIds?: string[]
  sessionTitles?: Record<string, string>
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
}): string {
  return JSON.stringify({
    ...(metadata.sourceWorkspaceId ? { sourceWorkspaceId: metadata.sourceWorkspaceId } : {}),
    ...(metadata.packageJson ? { packageJson: metadata.packageJson } : {}),
    ...(metadata.sessionIds ? { sessionIds: metadata.sessionIds } : {}),
    ...(metadata.sessionTitles && Object.keys(metadata.sessionTitles).length > 0
      ? { sessionTitles: metadata.sessionTitles }
      : {}),
    ...(metadata.sessionPermissions && Object.keys(metadata.sessionPermissions).length > 0
      ? { sessionPermissions: metadata.sessionPermissions }
      : {}),
  })
}

export function parseAgentSessionTitlesFromPayload(
  payload: Record<string, unknown>,
): Record<string, string> | undefined {
  const raw = payload.session_titles
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const sessionTitles: Record<string, string> = {}
  for (const [sessionId, title] of Object.entries(raw)) {
    if (typeof title === 'string' && title.trim()) {
      sessionTitles[sessionId] = title
    }
  }
  return Object.keys(sessionTitles).length > 0 ? sessionTitles : undefined
}

export function parseAgentSessionPermissionsFromPayload(
  payload: Record<string, unknown>,
): Record<string, P2pAgentSessionPermission> | undefined {
  const raw = payload.session_permissions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const sessionPermissions: Record<string, P2pAgentSessionPermission> = {}
  for (const [sessionId, permission] of Object.entries(raw)) {
    if (permission === 'read' || permission === 'callable') {
      sessionPermissions[sessionId] = permission
    }
  }
  return Object.keys(sessionPermissions).length > 0 ? sessionPermissions : undefined
}
