import { randomUUID } from 'node:crypto'
import {
  AgentRelayMessageSchema,
  type AgentRelayMessage,
  type ContentBlock,
  type Message,
  type MessageStreamEvent,
  type P2pGroupAgentProxy,
} from '@toolman/shared'
import { P2pMemberRepository, P2pSharedResourceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getMessageRepository } from '../../db/repos'
import { sendMessage } from '../agent.service'
import { listMessages } from '../agent.service'
import { broadcastStreamEvent, addStreamRelayListener } from '../stream-broadcast'
import { MessageStreamBuffers } from '../message-stream-buffers'
import { P2pBridge } from './p2p-bridge'
import { connectP2pPeer } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { readAgentShareMetadata } from './agent-share.service'
import { assertPeerTrustedForSync } from './p2p-peer.service'

export const AGENT_RELAY_CHANNEL = 'agent-relay'

const RELAY_TIMEOUT_MS = 120_000

type PendingResolver = {
  resolve: (message: AgentRelayMessage) => void
  reject: (error: Error) => void
}

const pendingRequests = new Map<string, PendingResolver>()

type ActiveOwnerRelay = {
  memberDeviceId: string
  memberSessionId: string
  memberAssistantMessageId: string
  sourceSessionId: string
  unsubscribe: () => void
}

const activeOwnerRelays = new Map<string, ActiveOwnerRelay>()

const relayStreamBuffers = new Map<string, MessageStreamBuffers>()

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function encodeRelayMessage(message: AgentRelayMessage): Buffer {
  return Buffer.from(JSON.stringify(message), 'utf8')
}

function parseRelayMessage(data: Buffer): AgentRelayMessage {
  return AgentRelayMessageSchema.parse(JSON.parse(data.toString('utf8')))
}

async function sendRelayMessage(
  peerDeviceId: string,
  message: AgentRelayMessage,
): Promise<void> {
  await P2pBridge.connectionSend(peerDeviceId, AGENT_RELAY_CHANNEL, encodeRelayMessage(message))
}

async function ensurePeerConnected(peerDeviceId: string, p2pWorkspaceId: string): Promise<void> {
  await connectP2pPeer(peerDeviceId, p2pWorkspaceId)
}

function waitForRelayResponse(requestId: string): Promise<AgentRelayMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      reject(new Error('群组智能体请求超时'))
    }, RELAY_TIMEOUT_MS)

    pendingRequests.set(requestId, {
      resolve: (message) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        resolve(message)
      },
      reject: (error) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        reject(error)
      },
    })
  })
}

function dispatchPendingResponse(message: AgentRelayMessage): void {
  const pending = pendingRequests.get(message.requestId)
  if (!pending) return
  if (message.type === 'fetch_err' || message.type === 'send_err') {
    pending.reject(new Error(message.message))
    return
  }
  pending.resolve(message)
}

function assertRelayAccess(
  p2pWorkspaceId: string,
  resourceId: string,
  sourceSessionId: string,
  requesterDeviceId: string,
  requireCallable: boolean,
): void {
  const member = getMemberRepo().findByWorkspaceAndDevice(p2pWorkspaceId, requesterDeviceId)
  if (!member || member.status !== 'active') {
    throw new Error('无权访问该群组智能体')
  }

  const resource = getSharedResourceRepo().findById(resourceId)
  if (!resource || resource.status !== 'active' || resource.resourceType !== 'Agent') {
    throw new Error('共享智能体不存在')
  }

  const metadata = readAgentShareMetadata(resource.metadataJson)
  if (metadata.sessionIds && !metadata.sessionIds.includes(sourceSessionId)) {
    throw new Error('话题未共享')
  }

  const permission = metadata.sessionPermissions?.[sourceSessionId] ?? 'read'
  if (requireCallable && permission !== 'callable') {
    throw new Error('该话题为只读')
  }

  const sharer = getMemberRepo().findById(resource.sharedBy)
  if (!sharer || sharer.deviceId !== getP2pDeviceInfo().deviceId) {
    throw new Error('仅资源所有者可处理该请求')
  }
}

function remapStreamEventForMember(
  event: MessageStreamEvent,
  mapping: {
    sessionId: string
    messageId: string
  },
): MessageStreamEvent {
  return {
    ...event,
    sessionId: mapping.sessionId,
    messageId: mapping.messageId,
  }
}

export async function fetchRemoteSessionHistory(input: {
  ownerDeviceId: string
  p2pWorkspaceId: string
  resourceId: string
  sourceSessionId: string
}): Promise<{ title: string; messages: Message[] }> {
  await assertPeerTrustedForSync(input.p2pWorkspaceId, input.ownerDeviceId)
  await ensurePeerConnected(input.ownerDeviceId, input.p2pWorkspaceId)

  const requestId = randomUUID()
  const responsePromise = waitForRelayResponse(requestId)

  await sendRelayMessage(input.ownerDeviceId, {
    v: 1,
    type: 'fetch',
    requestId,
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: input.resourceId,
    sourceSessionId: input.sourceSessionId,
  })

  const response = await responsePromise
  if (response.type !== 'fetch_ok') {
    throw new Error('拉取话题历史失败')
  }

  return { title: response.title, messages: response.messages }
}

export async function relayProxySendMessage(input: {
  proxy: P2pGroupAgentProxy
  sessionId: string
  contentBlocks: ContentBlock[]
  modelIds: string[]
  memberUserMessageId: string
  memberAssistantMessageId: string
}): Promise<{ userMessageId: string; assistantMessageIds: string[] }> {
  if (input.proxy.permission === 'read') {
    throw new Error('该话题为只读')
  }

  await assertPeerTrustedForSync(input.proxy.p2pWorkspaceId, input.proxy.ownerDeviceId)
  await ensurePeerConnected(input.proxy.ownerDeviceId, input.proxy.p2pWorkspaceId)

  const requestId = randomUUID()
  const responsePromise = waitForRelayResponse(requestId)

  await sendRelayMessage(input.proxy.ownerDeviceId, {
    v: 1,
    type: 'send',
    requestId,
    p2pWorkspaceId: input.proxy.p2pWorkspaceId,
    resourceId: input.proxy.resourceId,
    sourceSessionId: input.proxy.sourceSessionId,
    memberSessionId: input.sessionId,
    memberUserMessageId: input.memberUserMessageId,
    memberAssistantMessageId: input.memberAssistantMessageId,
    contentBlocks: input.contentBlocks as Array<Record<string, unknown>>,
    modelIds: input.modelIds,
  })

  const response = await responsePromise
  if (response.type !== 'send_ok') {
    throw new Error('发送消息失败')
  }

  return {
    userMessageId: input.memberUserMessageId,
    assistantMessageIds: [input.memberAssistantMessageId],
  }
}

async function handleOwnerFetch(
  peerDeviceId: string,
  message: Extract<AgentRelayMessage, { type: 'fetch' }>,
): Promise<void> {
  try {
    assertRelayAccess(
      message.p2pWorkspaceId,
      message.resourceId,
      message.sourceSessionId,
      peerDeviceId,
      false,
    )

    const sessionRepo = await import('../../db/repos').then((m) => m.getSessionRepository())
    const session = sessionRepo.findRowById(message.sourceSessionId)
    if (!session) {
      throw new Error('话题不存在')
    }

    const result = listMessages({ sessionId: message.sourceSessionId })
    const messages = result.items.map((item) => ({
      ...item,
      status: item.status === 'streaming' ? 'completed' : item.status,
    })) as Message[]

    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'fetch_ok',
      requestId: message.requestId,
      title: session.title,
      messages,
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : '拉取话题历史失败'
    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'fetch_err',
      requestId: message.requestId,
      message: errMessage,
    })
  }
}

async function handleOwnerSend(
  peerDeviceId: string,
  message: Extract<AgentRelayMessage, { type: 'send' }>,
): Promise<void> {
  try {
    assertRelayAccess(
      message.p2pWorkspaceId,
      message.resourceId,
      message.sourceSessionId,
      peerDeviceId,
      true,
    )

    activeOwnerRelays.get(message.requestId)?.unsubscribe()
    activeOwnerRelays.delete(message.requestId)

    const result = await sendMessage({
      sessionId: message.sourceSessionId,
      contentBlocks: message.contentBlocks,
      modelIds: message.modelIds,
    })

    const ownerAssistantMessageId = result.assistantMessageIds[0]
    if (!ownerAssistantMessageId) {
      throw new Error('生成回复失败')
    }

    const relayUnsubscribe = addStreamRelayListener((event) => {
      if (event.sessionId !== message.sourceSessionId) return
      if (event.messageId !== ownerAssistantMessageId) return

      const remapped = remapStreamEventForMember(event, {
        sessionId: message.memberSessionId,
        messageId: message.memberAssistantMessageId,
      })

      void sendRelayMessage(peerDeviceId, {
        v: 1,
        type: 'stream',
        requestId: message.requestId,
        event: remapped,
      }).catch(() => undefined)

      if (event.type === 'message.done' || event.type === 'message.error') {
        activeOwnerRelays.get(message.requestId)?.unsubscribe()
        activeOwnerRelays.delete(message.requestId)
      }
    })

    activeOwnerRelays.set(message.requestId, {
      memberDeviceId: peerDeviceId,
      memberSessionId: message.memberSessionId,
      memberAssistantMessageId: message.memberAssistantMessageId,
      sourceSessionId: message.sourceSessionId,
      unsubscribe: relayUnsubscribe,
    })

    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'send_ok',
      requestId: message.requestId,
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : '发送消息失败'
    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'send_err',
      requestId: message.requestId,
      message: errMessage,
    })
  }
}

function persistRelayStreamEvent(event: MessageStreamEvent): void {
  if (!event.messageId) return

  const messages = getMessageRepository()

  if (event.type === 'message.done') {
    const buffer = relayStreamBuffers.get(event.messageId)
    if (buffer) {
      messages.updateStreamBlocks(event.messageId, buffer.toContentBlocks())
      relayStreamBuffers.delete(event.messageId)
    }
    messages.update(event.messageId, {
      status: 'completed',
      tokenUsage: event.tokenUsage ?? undefined,
    })
    return
  }

  if (event.type === 'message.error') {
    relayStreamBuffers.delete(event.messageId)
    messages.update(event.messageId, {
      status: 'failed',
      error: event.error,
    })
    return
  }

  if (event.type !== 'message.delta') return

  let buffer = relayStreamBuffers.get(event.messageId)
  if (!buffer) {
    buffer = new MessageStreamBuffers()
    relayStreamBuffers.set(event.messageId, buffer)
  }

  const delta = event.delta
  if (delta.type === 'text') {
    buffer.appendText(delta.text)
  } else if (delta.type === 'thinking') {
    buffer.appendThinking(delta.text)
  } else if (delta.type === 'tool') {
    buffer.upsertTool({
      toolCallId: delta.toolCallId,
      name: delta.name,
      arguments: delta.arguments,
      result: delta.result,
      status: delta.status,
    })
  } else if (delta.type === 'kb_sources') {
    buffer.setKbSources(delta.sources)
  }

  messages.updateStreamBlocks(event.messageId, buffer.toContentBlocks())
}

function handleMemberStream(message: Extract<AgentRelayMessage, { type: 'stream' }>): void {
  persistRelayStreamEvent(message.event)
  broadcastStreamEvent(message.event)
}

export async function handleP2pAgentRelayMessage(
  peerDeviceId: string,
  data: Buffer,
): Promise<void> {
  const message = parseRelayMessage(data)

  switch (message.type) {
    case 'fetch':
      await handleOwnerFetch(peerDeviceId, message)
      return
    case 'send':
      await handleOwnerSend(peerDeviceId, message)
      return
    case 'fetch_ok':
    case 'fetch_err':
    case 'send_ok':
    case 'send_err':
      dispatchPendingResponse(message)
      return
    case 'stream':
      handleMemberStream(message)
      return
    default:
      return
  }
}
