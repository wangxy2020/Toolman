import type { P2pGroupAgentProxy } from '@toolman/shared'
import { getAssistantRow } from '../assistant.service'
import { resolveAgentRelayResourceId, findAgentSharedResourceInWorkspace } from './p2p-shared-resource-id'
import {
  normalizeGroupAgentProxy,
  resolveSharedAgentModelId,
} from './p2p-group-agent-proxy-model'
import {
  findSiblingProxyMeta,
  readP2pGroupAgentFromSessionRow,
} from './p2p-group-agent-proxy-metadata'
import {
  normalizeP2pGroupAgentProxyOwnerDevice,
  resolveOwnerDeviceId,
} from './p2p-group-agent-proxy-owner'
import { getSharedResourceRepo } from './p2p-group-agent-proxy-repos'

export function inheritGroupProxySessionMetadata(
  workspaceId: string,
  assistantId: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!assistantId) return undefined
  const assistant = getAssistantRow(assistantId)
  const proxyParams = assistant?.parameters?.p2pGroupProxy as
    | { resourceId?: string; p2pWorkspaceId?: string }
    | undefined
  if (!proxyParams?.resourceId || !proxyParams.p2pWorkspaceId) {
    return undefined
  }
  const sibling = findSiblingProxyMeta(
    workspaceId,
    proxyParams.resourceId,
    proxyParams.p2pWorkspaceId,
  )
  if (!sibling) return undefined
  return { p2pGroupAgent: sibling }
}

export function resolveProxyMetaForSend(
  metadataJson: string,
  assistant: ReturnType<typeof getAssistantRow>,
): P2pGroupAgentProxy | null {
  const fromSession = readP2pGroupAgentFromSessionRow(metadataJson)
  if (fromSession) {
    return normalizeGroupAgentProxy(normalizeP2pGroupAgentProxyOwnerDevice(fromSession))
  }

  const proxyParams = assistant?.parameters?.p2pGroupProxy
  if (!proxyParams?.resourceId || !proxyParams.p2pWorkspaceId) {
    return null
  }

  let partial: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: Record<string, unknown> }
    partial = parsed.p2pGroupAgent ?? {}
  } catch {
    partial = {}
  }

  const sourceSessionId =
    typeof partial.sourceSessionId === 'string' ? partial.sourceSessionId : null

  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    proxyParams.p2pWorkspaceId,
    proxyParams.resourceId,
    proxyParams.sourceAssistantId,
  )
  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    proxyParams.p2pWorkspaceId,
    proxyParams.resourceId,
    proxyParams.sourceAssistantId,
  )
  if (!resource?.sharedBy) {
    return null
  }

  if (!sourceSessionId && assistant?.workspaceId) {
    const sibling = findSiblingProxyMeta(
      assistant.workspaceId,
      relayResourceId,
      proxyParams.p2pWorkspaceId,
    )
    if (sibling) {
      return normalizeGroupAgentProxy(sibling)
    }
    return null
  }

  if (!sourceSessionId) {
    return null
  }

  let ownerDeviceId: string
  try {
    ownerDeviceId = resolveOwnerDeviceId(resource.sharedBy, proxyParams.p2pWorkspaceId)
  } catch {
    return null
  }

  const referencedModelId = resolveSharedAgentModelId(
    typeof partial.referencedModelId === 'string'
      ? partial.referencedModelId
      : typeof proxyParams.referencedModelId === 'string'
        ? proxyParams.referencedModelId
        : assistant?.modelId ?? '',
    proxyParams.p2pWorkspaceId,
    relayResourceId,
    proxyParams.sourceAssistantId,
  )

  const repaired = normalizeP2pGroupAgentProxyOwnerDevice({
    p2pWorkspaceId: proxyParams.p2pWorkspaceId,
    resourceId: relayResourceId,
    sourceAssistantId: proxyParams.sourceAssistantId,
    sourceSessionId,
    ownerMemberId:
      typeof partial.ownerMemberId === 'string' ? partial.ownerMemberId : resource.sharedBy,
    ownerDeviceId,
    permission: partial.permission === 'callable' ? 'callable' : 'read',
    groupName: proxyParams.groupName,
    sharedAgentName: proxyParams.sharedAgentName,
    referencedModelId,
  })

  return normalizeGroupAgentProxy(repaired)
}
