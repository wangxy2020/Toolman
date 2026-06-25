import { randomUUID } from 'node:crypto'
import {
  ContentBlockSchema,
  P2pGroupChatClearInputSchema,
  P2pGroupChatDeleteInputSchema,
  P2pGroupChatListInputSchema,
  P2pGroupChatMessageSchema,
  P2pGroupChatSendInputSchema,
  canWriteWorkspace,
  type P2pGroupChatMessage,
} from '@toolman/shared'
import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { listP2pConnections, getKnownP2pConnections, ensurePeerReadyForWorkspace, isPeerConnected } from './p2p-connection.service'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { applyRemoteMemberJoin, ensureOwnerMemberRecord } from './p2p-member.service'
import {
  broadcastP2pGroupChatCleared,
  broadcastP2pGroupChatMessage,
} from './p2p-group-chat-broadcast'
import {
  appendGroupChatMessage,
  clearGroupChatMessages,
  readGroupChatMessages,
  removeGroupChatMessage,
} from './p2p-group-chat-store'
import { appendGroupChatWalEvent } from './p2p-group-chat-wal'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import { getIdentityProfile } from '../identity.service'
import { isOwnerPeerConnected } from './p2p-sync-sequencing'
import {
  buildGroupChatRelayExcludeDeviceIds,
  shouldRelayGroupChatAfterReceive,
} from './p2p-group-chat-relay'
import {
  signGroupChatWireMessage,
  verifyGroupChatWireMessage,
  type SignedGroupChatWireEnvelope,
} from './p2p-group-chat-signing.service'
import { checkReplayGuard } from './p2p-replay-guard.service'

export const GROUP_CHAT_CHANNEL = 'group-chat'
export const P2P_EVENTS_CHANNEL = 'events'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

async function relayMessageToPeers(
  message: P2pGroupChatMessage,
  excludeDeviceIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const device = getP2pDeviceInfo()
  const memberRepo = getMemberRepo()
  const peerDeviceIds = new Set(
    memberRepo
      .listByWorkspace(message.workspaceId, 'active')
      .filter((item) => item.deviceId !== device.deviceId)
      .map((item) => item.deviceId),
  )

  const connections = await listP2pConnections()
  for (const item of connections) {
    if (item.state !== 'connected' || item.peerDeviceId === device.deviceId) continue
    peerDeviceIds.add(item.peerDeviceId)
  }

  const signedPayload = Buffer.from(
    JSON.stringify(signGroupChatWireMessage(message)),
    'utf8',
  )

  await Promise.all(
    [...peerDeviceIds]
      .filter((peerDeviceId) => !excludeDeviceIds.has(peerDeviceId))
      .map(async (peerDeviceId) => {
        if (
          !isP2pPeerDiscoverableOnline(peerDeviceId) &&
          !isPeerConnected(peerDeviceId)
        ) {
          return
        }
        try {
          await ensurePeerReadyForWorkspace(peerDeviceId, message.workspaceId)
          await P2pBridge.connectionSend(peerDeviceId, P2P_EVENTS_CHANNEL, signedPayload)
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : 'relay failed'
          console.warn(
            `[p2p] group chat relay to ${peerDeviceId.slice(0, 8)} failed: ${errMessage}`,
          )
        }
      }),
  )
}

export function listP2pGroupChatMessages(rawInput: unknown): { items: P2pGroupChatMessage[] } {
  const input = P2pGroupChatListInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)
  const limit = input.limit ?? 200
  return { items: readGroupChatMessages(input.workspaceId).slice(-limit) }
}

export async function sendP2pGroupChatMessage(
  rawInput: unknown,
): Promise<{ message: P2pGroupChatMessage }> {
  const input = P2pGroupChatSendInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  if (!canWriteWorkspace(member.role)) {
    throw new Error('只读成员无法发送消息')
  }

  const contentBlocks = input.contentBlocks.map((block) => ContentBlockSchema.parse(block))
  const identityName = getIdentityProfile().displayName
  const message = P2pGroupChatMessageSchema.parse({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    senderMemberId: member.id,
    senderName: identityName,
    contentBlocks,
    createdAt: Date.now(),
  })

  if (member.displayName !== identityName) {
    getMemberRepo().update({ id: member.id, displayName: identityName })
  }

  appendGroupChatMessage(message)
  broadcastP2pGroupChatMessage(message)
  void relayMessageToPeers(message)
  void appendGroupChatWalEvent(input.workspaceId, member.id, {
    v: 1,
    kind: 'group.chat.message',
    message,
  }).catch((error) => {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] group chat WAL append failed: ${errMessage}`)
  })

  return { message }
}

async function relayClearToPeers(workspaceId: string): Promise<void> {
  const device = getP2pDeviceInfo()
  const memberRepo = getMemberRepo()
  const peerDeviceIds = new Set(
    memberRepo
      .listByWorkspace(workspaceId, 'active')
      .filter((item) => item.deviceId !== device.deviceId)
      .map((item) => item.deviceId),
  )

  const connections = await listP2pConnections()
  for (const item of connections) {
    if (item.state !== 'connected' || item.peerDeviceId === device.deviceId) continue
    peerDeviceIds.add(item.peerDeviceId)
  }

  const payload = encodeReplicationMessage({
    type: 'group-chat.clear',
    workspaceId,
  })

  await Promise.all(
    [...peerDeviceIds].map(async (peerDeviceId) => {
      if (
        !isP2pPeerDiscoverableOnline(peerDeviceId) &&
        !isPeerConnected(peerDeviceId)
      ) {
        return
      }
      try {
        await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
        await P2pBridge.connectionSend(peerDeviceId, P2P_EVENTS_CHANNEL, payload)
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : 'relay failed'
        console.warn(
          `[p2p] group chat clear relay to ${peerDeviceId.slice(0, 8)} failed: ${errMessage}`,
        )
      }
    }),
  )
}

export function clearP2pGroupChatMessages(rawInput: unknown): { cleared: boolean } {
  const input = P2pGroupChatClearInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  if (member.role !== 'owner') {
    throw new Error('只有群主可以清空群组消息')
  }

  clearGroupChatMessages(input.workspaceId)
  broadcastP2pGroupChatCleared(input.workspaceId)
  void relayClearToPeers(input.workspaceId)
  const clearedAt = Date.now()
  void appendGroupChatWalEvent(input.workspaceId, member.id, {
    v: 1,
    kind: 'group.chat.clear',
    workspaceId: input.workspaceId,
    clearedAt,
    clearedByMemberId: member.id,
  }).catch((error) => {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] group chat clear WAL append failed: ${errMessage}`)
  })

  return { cleared: true }
}

export function deleteP2pGroupChatMessage(rawInput: unknown): { deleted: boolean } {
  const input = P2pGroupChatDeleteInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  const messages = readGroupChatMessages(input.workspaceId)
  const target = messages.find((item) => item.id === input.messageId)
  if (!target) {
    return { deleted: false }
  }

  const canDelete =
    target.senderMemberId === member.id || member.role === 'owner' || member.role === 'admin'
  if (!canDelete) {
    throw new Error('无权删除该消息')
  }

  removeGroupChatMessage(input.workspaceId, input.messageId)
  const deletedAt = Date.now()
  void appendGroupChatWalEvent(input.workspaceId, member.id, {
    v: 1,
    kind: 'group.chat.delete',
    workspaceId: input.workspaceId,
    messageId: input.messageId,
    deletedAt,
    deletedByMemberId: member.id,
  }).catch((error) => {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] group chat delete WAL append failed: ${errMessage}`)
  })

  return { deleted: true }
}

async function maybeRelayGroupChatAfterReceive(
  senderDeviceId: string,
  message: P2pGroupChatMessage,
): Promise<void> {
  const workspace = getWorkspaceRepo().findById(message.workspaceId)
  if (!workspace) return

  const localDeviceId = getP2pDeviceInfo().deviceId
  const connections = await listP2pConnections()
  const ownerPeerConnected = isOwnerPeerConnected(message.workspaceId, connections)

  if (
    !shouldRelayGroupChatAfterReceive({
      localDeviceId,
      ownerDeviceId: workspace.ownerDeviceId,
      senderDeviceId,
      ownerPeerConnected,
    })
  ) {
    return
  }

  void relayMessageToPeers(
    message,
    buildGroupChatRelayExcludeDeviceIds(localDeviceId, senderDeviceId),
  )
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
    }
    if (parsed.type === 'group-chat.clear' && typeof parsed.workspaceId === 'string') {
      handleIncomingP2pGroupChatClear(peerDeviceId, parsed.workspaceId)
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
        console.warn(
          `[p2p] dropped signed group chat from ${peerDeviceId.slice(0, 8)}: ${verified.reason}`,
        )
        return
      }
      const replay = checkReplayGuard({
        scope: `group-chat:${envelope.message.workspaceId}`,
        signerId: peerDeviceId,
        at: envelope.message.createdAt,
        payloadHash: envelope.message.id,
      })
      if (!replay.ok) {
        console.warn(
          `[p2p] dropped replay group chat from ${peerDeviceId.slice(0, 8)}: ${replay.reason}`,
        )
        return
      }
      handleIncomingP2pGroupChatMessage(peerDeviceId, envelope.message)
      return
    }

    const wireMessage =
      parsed.type === 'group-chat.message' || parsed.type === 'message' ? parsed.message : null
    if (!wireMessage) {
      return
    }

    handleIncomingP2pGroupChatMessage(peerDeviceId, wireMessage)
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'parse failed'
    console.warn(`[p2p] group chat payload rejected from ${peerDeviceId.slice(0, 8)}: ${errMessage}`)
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
      console.warn(
        `[p2p] dropped group chat ${message.id.slice(0, 8)}: sender ${peerDeviceId.slice(0, 8)} not connected`,
      )
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
    console.warn(
      `[p2p] dropped group chat ${message.id.slice(0, 8)}: senderMemberId does not match peer member`,
    )
    return
  }

  if (!member && !connected) {
    console.warn(
      `[p2p] dropped group chat ${message.id.slice(0, 8)}: unknown sender ${peerDeviceId.slice(0, 8)}`,
    )
    return
  }

  const inserted = appendGroupChatMessage(message)
  if (!inserted) {
    return
  }

  broadcastP2pGroupChatMessage(message)
  void maybeRelayGroupChatAfterReceive(peerDeviceId, message)
}
