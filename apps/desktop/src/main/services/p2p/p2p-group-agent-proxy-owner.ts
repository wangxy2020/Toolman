import type { P2pGroupAgentProxy } from '@toolman/shared'
import { ensureOwnerMemberRecord } from './p2p-member-shared'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { getMemberRepo, getWorkspaceRepo } from './p2p-group-agent-proxy-repos'

export function resolveOwnerDeviceId(ownerMemberId: string, p2pWorkspaceId: string): string {
  const workspace = getWorkspaceRepo().findById(p2pWorkspaceId)
  const member = getMemberRepo().findById(ownerMemberId)
  const localDeviceId = getP2pDeviceInfo().deviceId

  if (member?.role === 'owner' && workspace?.ownerDeviceId) {
    return workspace.ownerDeviceId
  }

  if (member?.deviceId && member.deviceId !== localDeviceId) {
    return member.deviceId
  }

  ensureOwnerMemberRecord(p2pWorkspaceId)

  const ownerByRole = getMemberRepo()
    .listByWorkspace(p2pWorkspaceId, 'active')
    .find((row) => row.role === 'owner')
  if (ownerByRole?.deviceId && ownerByRole.deviceId !== localDeviceId) {
    return ownerByRole.deviceId
  }

  if (workspace?.ownerDeviceId && workspace.ownerDeviceId !== localDeviceId) {
    return workspace.ownerDeviceId
  }

  throw new Error('共享者不存在')
}

export function normalizeP2pGroupAgentProxyOwnerDevice(
  proxy: P2pGroupAgentProxy,
): P2pGroupAgentProxy {
  const localDeviceId = getP2pDeviceInfo().deviceId
  try {
    const ownerDeviceId = resolveOwnerDeviceId(proxy.ownerMemberId, proxy.p2pWorkspaceId)
    if (ownerDeviceId === proxy.ownerDeviceId) {
      return proxy
    }
    return { ...proxy, ownerDeviceId }
  } catch {
    const workspace = getWorkspaceRepo().findById(proxy.p2pWorkspaceId)
    if (workspace?.ownerDeviceId && workspace.ownerDeviceId !== localDeviceId) {
      return { ...proxy, ownerDeviceId: workspace.ownerDeviceId }
    }
    if (proxy.ownerDeviceId !== localDeviceId) {
      return proxy
    }
    throw new Error('无法解析群组智能体所有者设备')
  }
}

export function isLocalOwner(ownerDeviceId: string): boolean {
  return ownerDeviceId === getP2pDeviceInfo().deviceId
}
