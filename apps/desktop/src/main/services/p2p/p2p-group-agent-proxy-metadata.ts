import { P2pGroupAgentProxySchema, type P2pGroupAgentProxy } from '@toolman/shared'
import { getSessionRepository } from '../../db/repos'
import {
  normalizeP2pGroupAgentProxyOwnerDevice,
  resolveOwnerDeviceId,
} from './p2p-group-agent-proxy-owner'
import { resolveSharedAgentModelId } from './p2p-group-agent-proxy-model'

export function readSessionProxyMetadata(metadataJson: string): P2pGroupAgentProxy | null {
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: unknown }
    const raw = parsed.p2pGroupAgent
    if (!raw || typeof raw !== 'object') return null

    const direct = P2pGroupAgentProxySchema.safeParse(raw)
    if (direct.success) {
      try {
        return normalizeP2pGroupAgentProxyOwnerDevice(direct.data)
      } catch {
        return null
      }
    }

    const partial = raw as Record<string, unknown>
    const p2pWorkspaceId = typeof partial.p2pWorkspaceId === 'string' ? partial.p2pWorkspaceId : null
    const resourceId = typeof partial.resourceId === 'string' ? partial.resourceId : null
    const sourceAssistantId =
      typeof partial.sourceAssistantId === 'string' ? partial.sourceAssistantId : null
    const sourceSessionId =
      typeof partial.sourceSessionId === 'string' ? partial.sourceSessionId : null
    const ownerMemberId = typeof partial.ownerMemberId === 'string' ? partial.ownerMemberId : null
    if (!p2pWorkspaceId || !resourceId || !sourceAssistantId || !sourceSessionId || !ownerMemberId) {
      return null
    }

    let ownerDeviceId: string
    try {
      ownerDeviceId = resolveOwnerDeviceId(ownerMemberId, p2pWorkspaceId)
    } catch {
      return null
    }

    let referencedModelId =
      typeof partial.referencedModelId === 'string' ? partial.referencedModelId : ''
    if (!referencedModelId.trim()) {
      referencedModelId = resolveSharedAgentModelId(
        '',
        p2pWorkspaceId,
        resourceId,
        sourceAssistantId,
      )
    }

    const repaired = P2pGroupAgentProxySchema.safeParse({
      p2pWorkspaceId,
      resourceId,
      sourceAssistantId,
      sourceSessionId,
      ownerMemberId,
      ownerDeviceId,
      permission: partial.permission === 'callable' ? 'callable' : 'read',
      groupName: typeof partial.groupName === 'string' ? partial.groupName : '',
      sharedAgentName: typeof partial.sharedAgentName === 'string' ? partial.sharedAgentName : '',
      referencedModelId,
    })
    return repaired.success ? normalizeP2pGroupAgentProxyOwnerDevice(repaired.data) : null
  } catch {
    return null
  }
}

export function readP2pGroupAgentFromSessionRow(
  metadataJson: string,
): P2pGroupAgentProxy | null {
  return readSessionProxyMetadata(metadataJson)
}

export function persistRepairedSessionProxyMetadata(
  sessionId: string,
  metadataJson: string,
  proxyMeta: P2pGroupAgentProxy,
): void {
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: unknown }
    const existing = parsed.p2pGroupAgent
    if (
      existing &&
      P2pGroupAgentProxySchema.safeParse(existing).success &&
      JSON.stringify(existing) === JSON.stringify(proxyMeta)
    ) {
      return
    }
    getSessionRepository().update(sessionId, {
      metadata: { p2pGroupAgent: proxyMeta },
    })
  } catch {
    getSessionRepository().update(sessionId, {
      metadata: { p2pGroupAgent: proxyMeta },
    })
  }
}

export function findSiblingProxyMeta(
  workspaceId: string,
  resourceId: string,
  p2pWorkspaceId: string,
): P2pGroupAgentProxy | null {
  const rows = getSessionRepository().listRows({ workspaceId, limit: 10_000 })
  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (proxy?.resourceId === resourceId && proxy.p2pWorkspaceId === p2pWorkspaceId) {
      return proxy
    }
  }
  return null
}
