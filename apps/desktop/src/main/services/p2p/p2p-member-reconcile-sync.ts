import { logStructured } from '../structured-log.service'
import type { P2pMember } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import {
  signMemberSyncResponseWireMessage,
  verifyMemberSyncRequestWireMessage,
  verifyMemberSyncResponseWireMessage,
  type SignedMemberSyncRequestWire,
  type SignedMemberSyncResponseWire,
} from './p2p-member-sync-signing.service'
import { checkReplayGuard } from './p2p-replay-guard.service'
import {
  getMemberRepo,
  getWorkspaceRepo,
} from './p2p-member-shared'
import { applyRemoteMemberJoin } from './p2p-member-join.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

export async function handleMemberSyncRequest(
  peerDeviceId: string,
  message: SignedMemberSyncRequestWire,
): Promise<void> {
  if (message.v !== 2 || !message.signature || !message.signerDeviceId || !message.at) {
    logStructured('p2p', 'warn', `dropped unsigned member.sync_request from ${peerDeviceId.slice(0, 8)}`)
    return
  }

  const verified = verifyMemberSyncRequestWireMessage(peerDeviceId, message)
  if (!verified.ok) {
    logStructured('p2p', 'warn', `dropped member.sync_request from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
    return
  }

  const replay = checkReplayGuard({
    scope: `member-sync-req:${message.workspaceId}`,
    signerId: peerDeviceId,
    at: message.at,
    payloadHash: message.signature,
  })
  if (!replay.ok) {
    logStructured('p2p', 'warn', `dropped replay member.sync_request from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
    return
  }

  const workspace = getWorkspaceRepo().findById(message.workspaceId)
  if (!workspace || workspace.ownerDeviceId !== peerDeviceId) {
    return
  }

  const device = getP2pDeviceInfo()
  const memberRow = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, device.deviceId)
  if (
    !memberRow ||
    (memberRow.status !== 'active' && memberRow.status !== 'invited')
  ) {
    return
  }

  const signed = signMemberSyncResponseWireMessage({
    workspaceId: message.workspaceId,
    member: {
      id: memberRow.id,
      workspaceId: message.workspaceId,
      deviceId: memberRow.deviceId,
      displayName: memberRow.displayName,
      role: memberRow.role,
      identityId: memberRow.identityId,
    },
  })
  const payload = encodeReplicationMessage(signed)
  await P2pBridge.connectionSend(peerDeviceId, 'events', payload)
}

export function handleMemberSyncResponse(
  peerDeviceId: string,
  message: SignedMemberSyncResponseWire,
): void {
  if (message.v !== 2 || !message.signature || !message.signerDeviceId || !message.at) {
    logStructured('p2p', 'warn', `dropped unsigned member.sync_response from ${peerDeviceId.slice(0, 8)}`)
    return
  }

  const verified = verifyMemberSyncResponseWireMessage(peerDeviceId, message)
  if (!verified.ok) {
    logStructured('p2p', 'warn', `dropped member.sync_response from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
    return
  }

  const replay = checkReplayGuard({
    scope: `member-sync:${message.workspaceId}`,
    signerId: peerDeviceId,
    at: message.at,
    payloadHash: message.member.id,
  })
  if (!replay.ok) {
    logStructured('p2p', 'warn', `dropped replay member.sync_response from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
    return
  }

  void applyRemoteMemberJoin(
    {
      workspaceId: message.workspaceId,
      member: {
        id: message.member.id,
        workspaceId: message.workspaceId,
        identityId: message.member.identityId ?? '',
        deviceId: message.member.deviceId,
        displayName: message.member.displayName,
        role: message.member.role as P2pMember['role'],
        status: 'invited',
        online: true,
      },
      peerDeviceId,
      remoteDevicePublicKey: message.member.devicePublicKey,
    },
    { requirePeerTrust: false, allowReactivation: false, forcePendingApproval: true },
  ).catch((error) => {
    logStructured('p2p', 'warn', `member.sync_response apply failed: ${toErrorMessage(error, 'member.sync_response apply failed')}`)
  })
}
