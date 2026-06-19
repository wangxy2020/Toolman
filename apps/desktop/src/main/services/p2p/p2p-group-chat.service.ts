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
  type P2pGroupChatMessage,
} from '@toolman/shared'
import { P2pMemberRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import { listP2pConnections } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { canWriteWorkspace } from '@toolman/shared'
import { broadcastP2pGroupChatMessage } from './p2p-group-chat-broadcast'

export const GROUP_CHAT_CHANNEL = 'group-chat'

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

async function relayMessageToPeers(message: P2pGroupChatMessage): Promise<void> {
  const device = getP2pDeviceInfo()
  const connections = await listP2pConnections()
  const peers = connections.filter(
    (item) =>
      item.state === 'connected' &&
      item.workspaceId === message.workspaceId &&
      item.peerDeviceId !== device.deviceId,
  )

  const payload = Buffer.from(
    JSON.stringify({ v: 1, type: 'message', message }),
    'utf8',
  )

  await Promise.all(
    peers.map(async (peer) => {
      try {
        await P2pBridge.connectionSend(peer.peerDeviceId, GROUP_CHAT_CHANNEL, payload)
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
    senderName: member.displayName,
    contentBlocks,
    createdAt: Date.now(),
  })

  appendMessage(input.workspaceId, message)
  broadcastP2pGroupChatMessage(message)
  await relayMessageToPeers(message)

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
    if (parsed.v !== 1 || parsed.type !== 'message' || !parsed.message) {
      return
    }

    const message = P2pGroupChatMessageSchema.parse(parsed.message)
    const member = getMemberRepo().findByWorkspaceAndDevice(message.workspaceId, peerDeviceId)
    if (!member || member.status !== 'active') {
      return
    }

    appendMessage(message.workspaceId, message)
    broadcastP2pGroupChatMessage(message)
  } catch {
    // ignore malformed payloads
  }
}
