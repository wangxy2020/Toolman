import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  ContentBlockSchema,
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
import { listP2pConnections, getKnownP2pConnections } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { applyRemoteMemberJoin, ensureOwnerMemberRecord } from './p2p-member.service'
import { broadcastP2pGroupChatMessage } from './p2p-group-chat-broadcast'
import { encodeReplicationMessage } from './p2p-sync-protocol'
import { getIdentityProfile } from '../identity.service'

export const GROUP_CHAT_CHANNEL = 'group-chat'
export const P2P_EVENTS_CHANNEL = 'events'

type StoredChatFile = {
  messages: P2pGroupChatMessage[]
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function chatFilePath(workspaceId: string): string {
  const dir = join(app.getPath('userData'), 'p2p', 'group-chat')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${workspaceId}.json`)
}

function readChatFile(workspaceId: string): StoredChatFile {
  const path = chatFilePath(workspaceId)
  if (!existsSync(path)) {
    return { messages: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredChatFile
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages
          .map((item) => {
            try {
              return P2pGroupChatMessageSchema.parse(item)
            } catch {
              return null
            }
          })
          .filter((item): item is P2pGroupChatMessage => item != null)
      : []
    return { messages }
  } catch {
    return { messages: [] }
  }
}

function writeChatFile(workspaceId: string, data: StoredChatFile): void {
  writeFileSync(chatFilePath(workspaceId), JSON.stringify(data, null, 2), 'utf8')
}

function appendMessage(workspaceId: string, message: P2pGroupChatMessage): void {
  const file = readChatFile(workspaceId)
  if (file.messages.some((item) => item.id === message.id)) {
    return
  }
  file.messages.push(message)
  file.messages.sort((a, b) => a.createdAt - b.createdAt)
  if (file.messages.length > 1000) {
    file.messages = file.messages.slice(-1000)
  }
  writeChatFile(workspaceId, file)
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

async function relayMessageToPeers(message: P2pGroupChatMessage): Promise<void> {
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
    if (item.workspaceId && item.workspaceId !== message.workspaceId) continue
    peerDeviceIds.add(item.peerDeviceId)
  }

  const payload = encodeReplicationMessage({
    type: 'group-chat.message',
    message,
  })

  await Promise.all(
    [...peerDeviceIds].map(async (peerDeviceId) => {
      try {
        await P2pBridge.connectionSend(peerDeviceId, P2P_EVENTS_CHANNEL, payload)
      } catch {
        // ignore single peer failure
      }
    }),
  )
}

export function listP2pGroupChatMessages(rawInput: unknown): { items: P2pGroupChatMessage[] } {
  const input = P2pGroupChatListInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)
  const limit = input.limit ?? 200
  const file = readChatFile(input.workspaceId)
  return { items: file.messages.slice(-limit) }
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
  const message = P2pGroupChatMessageSchema.parse({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    senderMemberId: member.id,
    senderName: getIdentityProfile().displayName,
    contentBlocks,
    createdAt: Date.now(),
  })

  appendMessage(input.workspaceId, message)
  broadcastP2pGroupChatMessage(message)
  void relayMessageToPeers(message)

  return { message }
}

export function deleteP2pGroupChatMessage(rawInput: unknown): { deleted: boolean } {
  const input = P2pGroupChatDeleteInputSchema.parse(rawInput)
  const member = assertWorkspaceMemberAccess(input.workspaceId)
  const file = readChatFile(input.workspaceId)
  const target = file.messages.find((item) => item.id === input.messageId)
  if (!target) {
    return { deleted: false }
  }

  const canDelete =
    target.senderMemberId === member.id || member.role === 'owner' || member.role === 'admin'
  if (!canDelete) {
    throw new Error('无权删除该消息')
  }

  file.messages = file.messages.filter((item) => item.id !== input.messageId)
  writeChatFile(input.workspaceId, file)
  return { deleted: true }
}

export function handleP2pGroupChatChannelMessage(peerDeviceId: string, data: Buffer): void {
  try {
    const parsed = JSON.parse(data.toString('utf8')) as {
      v?: number
      type?: string
      message?: unknown
    }
    const wireMessage =
      parsed.type === 'group-chat.message' || parsed.type === 'message' ? parsed.message : null
    if (!wireMessage) {
      return
    }

    const message = P2pGroupChatMessageSchema.parse(wireMessage)
    const connected = getKnownP2pConnections().some(
      (item) => item.peerDeviceId === peerDeviceId && item.state === 'connected',
    )

    let member = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, peerDeviceId)
    if (!member || member.status !== 'active') {
      if (!connected) {
        return
      }

      const workspace = getWorkspaceRepo().findById(message.workspaceId)
      const localDeviceId = getP2pDeviceInfo().deviceId
      if (workspace?.ownerDeviceId === localDeviceId) {
        applyRemoteMemberJoin(
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
      if (!member && !connected) {
        return
      }
    }

    appendMessage(message.workspaceId, message)
    broadcastP2pGroupChatMessage(message)
  } catch {
    // ignore malformed payloads
  }
}
