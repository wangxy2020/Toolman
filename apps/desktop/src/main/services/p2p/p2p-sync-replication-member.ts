import type { P2pMember } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { applyRemoteMemberJoin } from './p2p-member-join.service'
import {
  handleMemberSyncRequest,
  handleMemberSyncResponse,
} from './p2p-member-reconcile.service'
import { handleMemberApprovedWire } from './p2p-member-activation.service'
import {
  verifyMemberJoinedWireMessage,
  type SignedMemberJoinedWire,
  type SignedMemberSyncRequestWire,
  type SignedMemberSyncResponseWire,
} from './p2p-member-sync-signing.service'
import { checkReplayGuard } from './p2p-replay-guard.service'
import { parseReplicationMessage } from './p2p-sync-protocol'

type ReplicationMessage = NonNullable<ReturnType<typeof parseReplicationMessage>>

export async function handleMemberReplicationMessage(
  peerDeviceId: string,
  message: ReplicationMessage,
): Promise<boolean> {
  switch (message.type) {
    case 'member.joined': {
      const joined = message as SignedMemberJoinedWire
      if (joined.v !== 2 || !joined.signature || !joined.signerDeviceId || !joined.at) {
        logStructured('p2p', 'warn', `dropped unsigned member.joined from ${peerDeviceId.slice(0, 8)}`)
        return true
      }
      const verified = verifyMemberJoinedWireMessage(peerDeviceId, joined)
      if (!verified.ok) {
        logStructured('p2p', 'warn', `dropped member.joined from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
        return true
      }
      const replay = checkReplayGuard({
        scope: `member-join:${joined.workspaceId}`,
        signerId: peerDeviceId,
        at: joined.at,
        payloadHash: joined.member.id,
      })
      if (!replay.ok) {
        logStructured('p2p', 'warn', `dropped replay member.joined from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
        return true
      }
      void applyRemoteMemberJoin(
        {
          workspaceId: joined.workspaceId,
          member: {
            id: joined.member.id,
            workspaceId: joined.workspaceId,
            identityId: joined.member.identityId ?? '',
            deviceId: joined.member.deviceId,
            displayName: joined.member.displayName,
            role: joined.member.role as P2pMember['role'],
            status: 'active',
            online: false,
          },
          inviteId: joined.inviteId,
          peerDeviceId,
          subscriptionSku: joined.member.subscriptionSku,
          remoteDevicePublicKey: joined.member.devicePublicKey,
        },
        { requirePeerTrust: false, forcePendingApproval: true },
      ).catch((error) => {
        logStructured('p2p', 'warn', `member.joined apply failed: ${toErrorMessage(error, 'member.joined apply failed')}`)
      })
      return true
    }
    case 'member.sync_request':
      await handleMemberSyncRequest(peerDeviceId, message as SignedMemberSyncRequestWire)
      return true
    case 'member.sync_response':
      handleMemberSyncResponse(peerDeviceId, message as SignedMemberSyncResponseWire)
      return true
    case 'member.approved':
      handleMemberApprovedWire(peerDeviceId, message)
      return true
    default:
      return false
  }
}
