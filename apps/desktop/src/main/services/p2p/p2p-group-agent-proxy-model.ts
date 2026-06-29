import { isDefaultSessionTitle } from '@toolman/shared'
import type { P2pGroupAgentProxy } from '@toolman/shared'
import {
  normalizeAssistantModelId,
  readAgentShareMetadata,
  readSharedAgentModelId,
} from './agent-share.service'
import { resolveAgentRelayResourceId, findAgentSharedResourceInWorkspace } from './p2p-shared-resource-id'
import { getSharedResourceRepo } from './p2p-group-agent-proxy-repos'

export function proxyResourceMatches(
  proxy: P2pGroupAgentProxy,
  relayResourceId: string,
  legacyResourceId?: string,
): boolean {
  if (proxy.resourceId === relayResourceId || proxy.sourceAssistantId === relayResourceId) {
    return true
  }
  return Boolean(legacyResourceId && proxy.resourceId === legacyResourceId)
}

export function normalizeGroupAgentProxy(proxy: P2pGroupAgentProxy): P2pGroupAgentProxy {
  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    proxy.p2pWorkspaceId,
    proxy.resourceId,
    proxy.sourceAssistantId,
  )
  if (relayResourceId === proxy.resourceId) {
    return proxy
  }
  return { ...proxy, resourceId: relayResourceId }
}

export function resolveSharedAgentModelId(
  referencedModelId: string,
  p2pWorkspaceId: string,
  relayResourceId: string,
  sourceAssistantId?: string,
): string {
  const normalizedInput = normalizeAssistantModelId(referencedModelId)
  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    p2pWorkspaceId,
    relayResourceId,
    sourceAssistantId,
  )
  const metadata = readAgentShareMetadata(resource?.metadataJson)
  const fromPackage = readSharedAgentModelId(metadata)
  if (fromPackage) return fromPackage
  return normalizedInput
}

export function resolveSharedSessionTitle(
  p2pWorkspaceId: string,
  relayResourceId: string,
  sourceSessionId: string,
  fallbackTitle: string,
  sourceAssistantId?: string,
): string {
  const trimmedFallback = fallbackTitle.trim()
  if (
    trimmedFallback &&
    trimmedFallback !== '未命名话题' &&
    trimmedFallback !== '共享话题' &&
    !isDefaultSessionTitle(trimmedFallback)
  ) {
    return trimmedFallback
  }

  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    p2pWorkspaceId,
    relayResourceId,
    sourceAssistantId,
  )
  const metadata = readAgentShareMetadata(resource?.metadataJson)
  return metadata.sessionTitles?.[sourceSessionId]?.trim() || trimmedFallback || '未命名话题'
}

export function buildProxySessionMetadata(input: {
  p2pWorkspaceId: string
  resourceId: string
  sourceAssistantId: string
  sourceSessionId: string
  ownerMemberId: string
  ownerDeviceId: string
  permission: P2pGroupAgentProxy['permission']
  groupName: string
  sharedAgentName: string
  referencedModelId: string
}): P2pGroupAgentProxy {
  return {
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: input.resourceId,
    sourceAssistantId: input.sourceAssistantId,
    sourceSessionId: input.sourceSessionId,
    ownerMemberId: input.ownerMemberId,
    ownerDeviceId: input.ownerDeviceId,
    permission: input.permission,
    groupName: input.groupName,
    sharedAgentName: input.sharedAgentName,
    referencedModelId: input.referencedModelId,
  }
}
