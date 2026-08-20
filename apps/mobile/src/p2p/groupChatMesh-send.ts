import {
  buildGroupChatMessageSignPayload,
  isMailboxFirstP2pClient,
  P2P_GROUP_CHAT_RESOURCE_TYPE,
  type P2pGroupChatMessage,
} from '@toolman/shared'
import type { GroupChatMessage } from '../storage/groupChat'
import { newUuid, sha256Hex } from './bytes'
import { signDevicePayload } from './deviceKeys'
import { localP2pClientDeviceKind } from './deviceKind'
import { outbox, toLocalMessage } from './groupChatMesh-helpers'
import { getMailboxTarget, putMailboxProposal } from './mailboxSync'
import { encodeReplicationMessage } from './meshCodec'
import { recordP2pPathMetric } from './pathMetrics'
import { flushShareProposeOutbox } from './sharePropose'
import { hasLiveSession, sendEventsJson, type LiveMeshSession } from './session'

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
  const deposit = async (): Promise<boolean> => {
    try {
      const { ensureMailboxForDesktopGroup } = await import('./mailboxBootstrap')
      await ensureMailboxForDesktopGroup({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        force: true,
      })
      const mailbox = getMailboxTarget(input.workspaceId)
      if (!mailbox?.ownerDeviceId) return false
      await putMailboxProposal(mailbox, {
        resourceType: P2P_GROUP_CHAT_RESOURCE_TYPE,
        resourceId: message.id,
        operatorId: input.senderMemberId,
        eventType: 'Updated',
        payload: { v: 1, kind: 'group.chat.message', message },
        sourceDeviceId: input.deviceId,
        timestamp: message.createdAt,
      })
      return true
    } catch {
      return false
    }
  }
  // Browser/phone must not prefer LAN WebRTC: a live data channel still gets
  // dropped on desktop (web signatures are not in the owner peer-key store).
  if (
    (isMailboxFirstP2pClient(input.deviceId) || localP2pClientDeviceKind() === 'web') &&
    (await deposit())
  ) {
    return toLocalMessage(message)
  }
  try {
    if (hasLiveSession(input.workspaceId)) {
      await sendEventsJson(input.workspaceId, json)
      recordP2pPathMetric('meshSend')
    } else {
      throw new Error('no-mesh')
    }
  } catch {
    if (!(await deposit())) {
      outbox.push({ workspaceId: input.workspaceId, json })
    }
  }
  return toLocalMessage(message)
}
