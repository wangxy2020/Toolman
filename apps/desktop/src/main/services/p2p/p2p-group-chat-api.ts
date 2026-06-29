import { randomUUID } from 'node:crypto'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
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
import { P2pMemberRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
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
import { getIdentityProfile } from '../identity.service'
import { relayClearToPeers, relayMessageToPeers } from './p2p-group-chat-relay-internal'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
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
    const errMessage = toErrorMessage(error, String(error))
    logStructured('p2p', 'warn', `group chat WAL append failed: ${errMessage}`)
  })

  return { message }
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
    const errMessage = toErrorMessage(error, String(error))
    logStructured('p2p', 'warn', `group chat clear WAL append failed: ${errMessage}`)
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
    const errMessage = toErrorMessage(error, String(error))
    logStructured('p2p', 'warn', `group chat delete WAL append failed: ${errMessage}`)
  })

  return { deleted: true }
}
