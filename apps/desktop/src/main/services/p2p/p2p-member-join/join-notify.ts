import { toErrorMessage } from '@toolman/shared'
import { hashInviteToken } from '@toolman/db'
import { logStructured } from '../../structured-log.service'
import type { P2pMember } from '@toolman/shared'
import { P2pBridge } from '../p2p-bridge'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import { ensureWorkspaceKeyFromInvite } from '../p2p-workspace-key.store'
import { encodeReplicationMessage } from '../p2p-sync-protocol'
import { signMemberJoinedWireMessage } from '../p2p-member-sync-signing.service'
import { getEntitlementContext } from '../../auth/entitlement.service'
import { getInviteRepo } from '../p2p-member-shared'
import type { decodeInviteToken } from '../p2p-invite.token'
import { connectToOwnerPeer, isOwnerPeerConnected } from './join-connection'
import { sleep } from './utils'

const JOIN_NOTIFY_MAX_ATTEMPTS = 30
const JOIN_NOTIFY_INTERVAL_MS = 1_000
export const JOIN_NOTIFY_RETRY_BASE_MS = 200

type InvitePayload = ReturnType<typeof decodeInviteToken>

const pendingJoinNotifications = new Map<
  string,
  {
    payload: InvitePayload
    member: P2pMember
    timer: ReturnType<typeof setInterval>
  }
>()

function pendingJoinKey(payload: InvitePayload): string {
  return `${payload.workspaceId}:${payload.ownerDeviceId}`
}

function stopBackgroundJoinNotify(key: string): void {
  const pending = pendingJoinNotifications.get(key)
  if (!pending) return
  clearInterval(pending.timer)
  pendingJoinNotifications.delete(key)
}

export function stopAllBackgroundJoinNotifications(): void {
  for (const key of [...pendingJoinNotifications.keys()]) {
    stopBackgroundJoinNotify(key)
  }
}

function startBackgroundJoinNotify(payload: InvitePayload, member: P2pMember): void {
  const key = pendingJoinKey(payload)
  stopBackgroundJoinNotify(key)

  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    if (attempts > JOIN_NOTIFY_MAX_ATTEMPTS) {
      stopBackgroundJoinNotify(key)
      logStructured('p2p', 'warn', `gave up notifying owner of join for workspace ${payload.workspaceId}`)
      return
    }

    void (async () => {
      if (await notifyOwnerOfJoinOnce(payload, member)) {
        stopBackgroundJoinNotify(key)
      }
    })()
  }, JOIN_NOTIFY_INTERVAL_MS)

  pendingJoinNotifications.set(key, { payload, member, timer })
}

export function flushPendingJoinNotification(
  ownerDeviceId: string,
  workspaceId?: string,
): void {
  for (const [key, pending] of pendingJoinNotifications) {
    if (pending.payload.ownerDeviceId !== ownerDeviceId) continue
    if (workspaceId && pending.payload.workspaceId !== workspaceId) continue
    void notifyOwnerOfJoinOnce(pending.payload, pending.member).then((sent) => {
      if (sent) stopBackgroundJoinNotify(key)
    })
  }
}

export async function notifyOwnerOfJoinOnce(
  payload: InvitePayload,
  member: P2pMember,
): Promise<boolean> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return true
  }

  ensureWorkspaceKeyFromInvite(payload)

  try {
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      await connectToOwnerPeer(
        payload.ownerDeviceId,
        payload.workspaceId,
        'notify owner connect failed',
        payload.workspaceKeyB64,
      )
    }
    if (!(await isOwnerPeerConnected(payload.ownerDeviceId))) {
      return false
    }

    const signed = signMemberJoinedWireMessage({
      workspaceId: payload.workspaceId,
      inviteId: payload.inviteId,
      member: {
        id: member.id,
        workspaceId: payload.workspaceId,
        identityId: member.identityId,
        deviceId: member.deviceId,
        displayName: member.displayName,
        role: member.role,
        subscriptionSku: getEntitlementContext().subscriptionSku ?? 'community',
      },
    })
    const envelope = encodeReplicationMessage(signed)
    await P2pBridge.connectionSend(payload.ownerDeviceId, 'events', envelope)
    return true
  } catch (error) {
    const message = toErrorMessage(error, 'notify owner failed')
    logStructured('p2p', 'warn', `notify owner of join failed: ${message}`)
    return false
  }
}

export async function tryNotifyOwnerOfJoin(
  payload: InvitePayload,
  member: P2pMember,
): Promise<void> {
  if (payload.ownerDeviceId === getP2pDeviceInfo().deviceId) {
    return
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await notifyOwnerOfJoinOnce(payload, member)) {
      return
    }
    await sleep(JOIN_NOTIFY_RETRY_BASE_MS * (attempt + 1))
  }

  startBackgroundJoinNotify(payload, member)
}

export function validateLocalInviteRecord(inviteToken: string, payload: InvitePayload): void {
  const invite = getInviteRepo().findActiveByTokenHash(hashInviteToken(inviteToken))
  if (!invite) return

  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new Error('邀请码已过期')
  }
  if (invite.useCount >= invite.maxUses) {
    throw new Error('邀请码已达使用上限')
  }
  if (invite.workspaceId !== payload.workspaceId || invite.role !== payload.role) {
    throw new Error('邀请码与群组记录不匹配')
  }
}
