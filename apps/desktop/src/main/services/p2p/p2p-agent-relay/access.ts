import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import { readAgentShareMetadata } from '../agent-share.service'
import { findAgentSharedResourceInWorkspace } from '../p2p-shared-resource-id'
import { getMemberRepo, getSharedResourceRepo } from './repos'

export function assertRelayAccess(
  p2pWorkspaceId: string,
  resourceId: string,
  sourceSessionId: string,
  requesterDeviceId: string,
  requireCallable: boolean,
): void {
  const member = getMemberRepo().findByWorkspaceAndDevice(p2pWorkspaceId, requesterDeviceId)
  if (!member || member.status !== 'active') {
    throw new Error('无权访问该群组智能体')
  }

  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    p2pWorkspaceId,
    resourceId,
  )
  if (!resource || resource.status !== 'active') {
    throw new Error('共享智能体不存在')
  }

  const metadata = readAgentShareMetadata(resource.metadataJson)
  if (metadata.sessionIds && !metadata.sessionIds.includes(sourceSessionId)) {
    throw new Error('话题未共享')
  }

  const permission = metadata.sessionPermissions?.[sourceSessionId] ?? 'read'
  if (requireCallable && permission !== 'callable') {
    throw new Error('该话题为只读')
  }

  const sharer = getMemberRepo().findById(resource.sharedBy)
  if (!sharer || sharer.deviceId !== getP2pDeviceInfo().deviceId) {
    throw new Error('仅资源所有者可处理该请求')
  }
}
