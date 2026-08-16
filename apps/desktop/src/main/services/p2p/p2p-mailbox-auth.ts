import { createHash } from 'node:crypto'
import {
  buildMailboxGrant,
  grantsMatch,
  isPersonalSyncWorkspaceId,
  personalSyncWorkspaceId,
  workspaceKeyFromB64,
  type P2pMailboxPropose,
} from '@toolman/shared'
import { decodeInviteToken, parseInviteInput, verifyInviteToken } from './p2p-invite.token'
import { getMemberRepo, getWorkspaceRepo } from './p2p-member-shared'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { getOrCreatePersonalPairingStore } from '../personal-device-pairing.service'

export async function expectedGrant(workspaceId: string, deviceId: string): Promise<string | null> {
  const keyB64 = loadWorkspaceKey(workspaceId)
  if (!keyB64) return null
  return buildMailboxGrant({
    workspaceKey: workspaceKeyFromB64(keyB64),
    workspaceId,
    deviceId,
  })
}

export function memberVisible(workspaceId: string, deviceId: string): boolean {
  if (isPersonalSyncWorkspaceId(workspaceId)) {
    const store = getOrCreatePersonalPairingStore()
    if (deviceId === store.desktopDeviceId) return true
    return store.pairedDevices.some((item) => item.deviceId === deviceId)
  }
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, deviceId)
  return Boolean(member && (member.status === 'active' || member.status === 'invited'))
}

export async function authorizeMailbox(input: {
  workspaceId: string
  deviceId: string
  grant: string
  inviteToken?: string
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (isPersonalSyncWorkspaceId(input.workspaceId)) {
    const store = getOrCreatePersonalPairingStore()
    if (input.workspaceId !== personalSyncWorkspaceId(store.identityId)) {
      return { ok: false, status: 403, error: '个人同步工作区不匹配' }
    }
    const expected = await expectedGrant(input.workspaceId, input.deviceId)
    if (!expected || !(await grantsMatch(input.grant, expected))) {
      return { ok: false, status: 401, error: '个人同步信箱凭证无效' }
    }
    return { ok: true }
  }
  if (!getWorkspaceRepo().findById(input.workspaceId)) {
    return { ok: false, status: 404, error: '群组不存在' }
  }
  if (!memberVisible(input.workspaceId, input.deviceId)) {
    return { ok: false, status: 403, error: '不是该群成员' }
  }
  if (input.inviteToken) {
    try {
      const { token } = parseInviteInput(input.inviteToken)
      const payload = decodeInviteToken(token)
      verifyInviteToken(payload)
      if (payload.workspaceId !== input.workspaceId) {
        return { ok: false, status: 403, error: '邀请与群组不匹配' }
      }
      return { ok: true }
    } catch {
      // fall through to grant
    }
  }
  const expected = await expectedGrant(input.workspaceId, input.deviceId)
  if (!expected || !(await grantsMatch(input.grant, expected))) {
    return { ok: false, status: 401, error: '信箱凭证无效' }
  }
  return { ok: true }
}

export function proposalReplayHash(proposal: P2pMailboxPropose): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        resourceType: proposal.resourceType,
        resourceId: proposal.resourceId,
        eventType: proposal.eventType,
        payload: proposal.payload,
        sourceDeviceId: proposal.sourceDeviceId,
        timestamp: proposal.timestamp,
      }),
    )
    .digest('hex')
}
