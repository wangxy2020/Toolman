import {
  buildGroupChatMessageSignPayload,
  P2P_GROUP_CHAT_RESOURCE_TYPE,
  type P2pGroupChatMessage,
} from '@toolman/shared'
import type { GroupChatMessage } from '../storage/groupChat'
import { newUuid, sha256Hex } from './bytes'
import { signDevicePayload } from './deviceKeys'
import { outbox, toLocalMessage } from './groupChatMesh-helpers'
import { getMailboxTarget, putMailboxProposal } from './mailboxSync'
import { encodeReplicationMessage } from './meshCodec'
import { recordP2pPathMetric } from './pathMetrics'
import { flushShareProposeOutbox } from './sharePropose'
import { sendEventsJson, type LiveMeshSession } from './session'

export async function startMeshHandshake(session: LiveMeshSession): Promise<void> {
  await sendEventsJson(
    session.workspaceId,
    encodeReplicationMessage({
      type: 'sync.hello',
      workspaceId: session.workspaceId,
      deviceId: session.deviceId,
      lastReceivedSeq: session.lastReceivedSeq,
      latestSeq: session.lastReceivedSeq,
    }),
  )
  const pending = outbox.filter((item) => item.workspaceId === session.workspaceId)
  for (const item of pending) {
    try {
      await sendEventsJson(item.workspaceId, item.json)
    } catch {
      continue
    }
  }
  await flushShareProposeOutbox(session.workspaceId)
}

export async function sendGroupChatOverMesh(input: {
  workspaceId: string
  senderMemberId: string
  senderName: string
  deviceId: string
  text?: string
  attachment?: { name: string; contentHash: string; mimeType: string }
}): Promise<GroupChatMessage> {
  const contentBlocks: P2pGroupChatMessage['contentBlocks'] = []
  if (input.text?.trim()) contentBlocks.push({ type: 'text', text: input.text.trim() })
  if (input.attachment) {
    const image = input.attachment.mimeType.startsWith('image/')
    contentBlocks.push(
      image
        ? {
            type: 'image',
            blobHash: input.attachment.contentHash,
            mimeType: input.attachment.mimeType,
            alt: input.attachment.name,
          }
        : {
            type: 'file',
            name: input.attachment.name,
            path: input.attachment.contentHash,
            content: '',
            blobHash: input.attachment.contentHash,
            mimeType: input.attachment.mimeType,
          },
    )
  }
  if (contentBlocks.length === 0) {
    throw new Error('消息不能为空')
  }
  const message: P2pGroupChatMessage = {
    id: newUuid(),
    workspaceId: input.workspaceId,
    senderMemberId: input.senderMemberId,
    senderName: input.senderName,
    contentBlocks,
    createdAt: Date.now(),
  }
  const contentHash = await sha256Hex(JSON.stringify(message.contentBlocks))
  const signPayload = buildGroupChatMessageSignPayload(message, contentHash)
  const signature = await signDevicePayload(signPayload)
  const envelope = {
    v: 2,
    type: 'group-chat.message' as const,
    message,
    signerDeviceId: input.deviceId,
    signature: signature ?? '',
  }
  const json = JSON.stringify(envelope)
  try {
    await sendEventsJson(input.workspaceId, json)
    recordP2pPathMetric('meshSend')
  } catch {
    const mailbox = getMailboxTarget(input.workspaceId)
    if (mailbox) {
      try {
        await putMailboxProposal(mailbox, {
          resourceType: P2P_GROUP_CHAT_RESOURCE_TYPE,
          resourceId: message.id,
          operatorId: input.senderMemberId,
          eventType: 'Updated',
          payload: { v: 1, kind: 'group.chat.message', message },
          sourceDeviceId: input.deviceId,
          timestamp: message.createdAt,
        })
      } catch {
        outbox.push({ workspaceId: input.workspaceId, json })
      }
    } else {
      outbox.push({ workspaceId: input.workspaceId, json })
    }
  }
  return toLocalMessage(message)
}
