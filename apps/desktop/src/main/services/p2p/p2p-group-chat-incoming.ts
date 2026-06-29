import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  P2pGroupChatMessageSchema,
} from '@toolman/shared'
import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getKnownP2pConnections } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { applyRemoteMemberJoin } from './p2p-member-join.service'
import { ensureOwnerMemberRecord } from './p2p-member-shared'
import {
  broadcastP2pGroupChatCleared,
  broadcastP2pGroupChatMessage,
} from './p2p-group-chat-broadcast'
import {
  appendGroupChatMessage,
  clearGroupChatMessages,
} from './p2p-group-chat-store'
import {
  verifyGroupChatClearWireMessage,
  verifyGroupChatWireMessage,
  type SignedGroupChatClearWireEnvelope,
  type SignedGroupChatWireEnvelope,
} from './p2p-group-chat-signing.service'
import { checkReplayGuard } from './p2p-replay-guard.service'
import { maybeRelayGroupChatAfterReceive } from './p2p-group-chat-relay-internal'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

export function handleP2pGroupChatChannelMessage(peerDeviceId: string, data: Buffer): void {
  try {
    const parsed = JSON.parse(data.toString('utf8')) as {
      v?: number
      type?: string
      message?: unknown
      workspaceId?: string
      signerDeviceId?: string
      signature?: string
      clearedAt?: number
    }

    if (
      parsed.v === 2 &&
      parsed.type === 'group-chat.clear' &&
      typeof parsed.workspaceId === 'string' &&
      parsed.signerDeviceId &&
      parsed.signature &&
      typeof parsed.clearedAt === 'number'
    ) {
      const envelope = parsed as SignedGroupChatClearWireEnvelope
      const verified = verifyGroupChatClearWireMessage(peerDeviceId, envelope)
      if (!verified.ok) {
        logStructured('p2p', 'warn', `dropped signed group chat clear from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
        return
      }
      const replay = checkReplayGuard({
        scope: `group-chat-clear:${envelope.workspaceId}`,
        signerId: peerDeviceId,
        at: envelope.clearedAt,
        payloadHash: String(envelope.clearedAt),
      })
      if (!replay.ok) {
        logStructured('p2p', 'warn', `dropped replay group chat clear from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
        return
      }
      handleIncomingP2pGroupChatClear(peerDeviceId, envelope.workspaceId)
      return
    }

    if (parsed.type === 'group-chat.clear') {
      logStructured('p2p', 'warn', `dropped unsigned group-chat.clear from ${peerDeviceId.slice(0, 8)}`)
      return
    }

    if (
      parsed.v === 2 &&
      parsed.type === 'group-chat.message' &&
      parsed.message &&
      parsed.signerDeviceId &&
      parsed.signature
    ) {
      const envelope = parsed as SignedGroupChatWireEnvelope
      const verified = verifyGroupChatWireMessage(peerDeviceId, envelope)
      if (!verified.ok) {
        logStructured('p2p', 'warn', `dropped signed group chat from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`)
        return
      }
      const replay = checkReplayGuard({
        scope: `group-chat:${envelope.message.workspaceId}`,
        signerId: peerDeviceId,
        at: envelope.message.createdAt,
        payloadHash: envelope.message.id,
      })
      if (!replay.ok) {
        logStructured('p2p', 'warn', `dropped replay group chat from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`)
        return
      }
      handleIncomingP2pGroupChatMessage(peerDeviceId, envelope.message)
      return
    }

    logStructured('p2p', 'warn', `dropped unsigned group chat payload from ${peerDeviceId.slice(0, 8)}`)
  } catch (error) {
    const errMessage = toErrorMessage(error, 'parse failed')
    logStructured('p2p', 'warn', `group chat payload rejected from ${peerDeviceId.slice(0, 8)}: ${errMessage}`)
  }
}

function handleIncomingP2pGroupChatClear(peerDeviceId: string, workspaceId: string): void {
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace || workspace.ownerDeviceId !== peerDeviceId) {
    return
  }

  const connected = getKnownP2pConnections().some(
    (item) => item.peerDeviceId === peerDeviceId && item.state === 'connected',
  )
  const member = getMemberRepo().findByWorkspaceAndDevice(workspaceId, peerDeviceId)
  if (!member && !connected) {
    return
  }

  try {
    assertWorkspaceMemberAccess(workspaceId)
  } catch {
    return
  }

  clearGroupChatMessages(workspaceId)
  broadcastP2pGroupChatCleared(workspaceId)
}

export function handleP2pGroupChatClearFromPeer(peerDeviceId: string, workspaceId: string): void {
  handleIncomingP2pGroupChatClear(peerDeviceId, workspaceId)
}

function handleIncomingP2pGroupChatMessage(peerDeviceId: string, wireMessage: unknown): void {
  const message = P2pGroupChatMessageSchema.parse(wireMessage)
  const connected = getKnownP2pConnections().some(
    (item) => item.peerDeviceId === peerDeviceId && item.state === 'connected',
  )

  let member = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, peerDeviceId)
  if (!member || member.status !== 'active') {
    if (!connected) {
      logStructured('p2p', 'warn', `dropped group chat ${message.id.slice(0, 8)}: sender ${peerDeviceId.slice(0, 8)} not connected`)
      return
    }

    const workspace = getWorkspaceRepo().findById(message.workspaceId)
    const localDeviceId = getP2pDeviceInfo().deviceId
    if (workspace?.ownerDeviceId === localDeviceId) {
      void applyRemoteMemberJoin(
        {
          workspaceId: message.workspaceId,
          member: {
            id: message.senderMemberId,
            workspaceId: message.workspaceId,
            identityId: '',
            deviceId: peerDeviceId,
            displayName: message.senderName,
            role: 'member',
            status: 'active',
            online: true,
          },
          peerDeviceId,
        },
        { requirePeerTrust: false },
      )
    } else if (workspace?.ownerDeviceId === peerDeviceId) {
      ensureOwnerMemberRecord(message.workspaceId)
    }

    member = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, peerDeviceId)
  } else if (
    member &&
    message.senderName.trim() &&
    member.displayName !== message.senderName &&
    member.deviceId === peerDeviceId
  ) {
    getMemberRepo().update({ id: member.id, displayName: message.senderName })
  }

  if (member && member.id !== message.senderMemberId) {
    logStructured('p2p', 'warn', `dropped group chat ${message.id.slice(0, 8)}: senderMemberId does not match peer member`)
    return
  }

  if (!member && !connected) {
    logStructured('p2p', 'warn', `dropped group chat ${message.id.slice(0, 8)}: unknown sender ${peerDeviceId.slice(0, 8)}`)
    return
  }

  const inserted = appendGroupChatMessage(message)
  if (!inserted) {
    return
  }

  broadcastP2pGroupChatMessage(message)
  void maybeRelayGroupChatAfterReceive(peerDeviceId, message)
}
