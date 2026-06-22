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
import { getMessageRepository, getSessionRepository } from '../../db/repos'
import { blobExists } from '../blob.service'
import { sendMessage } from '../agent.service'
import { listMessages } from '../agent.service'
import {
  broadcastSessionMessagesReload,
  broadcastStreamEvent,
  addStreamRelayListener,
} from '../stream-broadcast'
import { MessageStreamBuffers } from '../message-stream-buffers'
import { ensurePeerReadyForWorkspace } from './p2p-connection.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { readAgentShareMetadata } from './agent-share.service'
import { assertPeerTrustedForSync } from './p2p-peer.service'
import { fetchBlobFromPeers } from './p2p-blob-transfer.service'
import { registerP2pSyncHandlers } from './p2p-sync-lifecycle'
import {
  measureAgentRelayEnvelopeBytes,
  P2P_EVENTS_SAFE_PAYLOAD_BYTES,
  sendAgentRelayOnEventsChannel,
} from './p2p-events-channel'

export const AGENT_RELAY_CHANNEL = 'agent-relay'

const RELAY_TIMEOUT_MS = 120_000

type PendingResolver = {
  resolve: (message: AgentRelayMessage) => void
  reject: (error: Error) => void
}

const pendingRequests = new Map<string, PendingResolver>()

type FetchOkAssembly = {
  partCount: number
  title: string
  parts: Map<number, Message[]>
}

const fetchOkAssemblies = new Map<string, FetchOkAssembly>()

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

function parseRelayMessage(data: Buffer): AgentRelayMessage {
  return AgentRelayMessageSchema.parse(JSON.parse(data.toString('utf8')))
}

async function sendRelayMessage(
  peerDeviceId: string,
  message: AgentRelayMessage,
): Promise<void> {
  await sendAgentRelayOnEventsChannel(peerDeviceId, message)
}

function slimStreamEventForRelay(
  event: MessageStreamEvent,
  requestId: string,
): MessageStreamEvent {
  const bytes = measureAgentRelayEnvelopeBytes({
    v: 1,
    type: 'stream',
    requestId,
    event,
  })
  if (bytes <= P2P_EVENTS_SAFE_PAYLOAD_BYTES) return event

  if (event.type === 'message.done' && event.contentBlocks) {
    console.warn(
      `[p2p] agent relay stream trimmed: event=message.done bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES}`,
    )
    return { ...event, contentBlocks: undefined }
  }

  console.warn(
    `[p2p] agent relay stream oversize: event=${event.type} bytes=${bytes} limit=${P2P_EVENTS_SAFE_PAYLOAD_BYTES}`,
  )
  return event
}

function splitFetchOkParts(
  requestId: string,
  title: string,
  messages: Message[],
): Extract<AgentRelayMessage, { type: 'fetch_ok_part' }>[] {
  const chunks: Message[][] = []
  let current: Message[] = []

  for (const message of messages) {
    const candidate = [...current, message]
    const probe: AgentRelayMessage = {
      v: 1,
      type: 'fetch_ok_part',
      requestId,
      partIndex: chunks.length,
      partCount: 1,
      title: chunks.length === 0 ? title : undefined,
      messages: candidate,
    }
    if (
      current.length > 0 &&
      measureAgentRelayEnvelopeBytes(probe) > P2P_EVENTS_SAFE_PAYLOAD_BYTES
    ) {
      chunks.push(current)
      current = [message]
    } else {
      current = candidate
    }
  }

  if (current.length > 0) {
    chunks.push(current)
  }
  if (chunks.length === 0) {
    chunks.push([])
  }

  const partCount = chunks.length
  return chunks.map((chunk, index) => ({
    v: 1,
    type: 'fetch_ok_part' as const,
    requestId,
    partIndex: index,
    partCount,
    title: index === 0 ? title : undefined,
    messages: chunk,
  }))
}

async function sendFetchOkResponse(
  peerDeviceId: string,
  requestId: string,
  title: string,
  messages: Message[],
): Promise<void> {
  const single: AgentRelayMessage = {
    v: 1,
    type: 'fetch_ok',
    requestId,
    title,
    messages,
  }
  if (measureAgentRelayEnvelopeBytes(single) <= P2P_EVENTS_SAFE_PAYLOAD_BYTES) {
    await sendRelayMessage(peerDeviceId, single)
    return
  }

  const parts = splitFetchOkParts(requestId, title, messages)
  console.warn(
    `[p2p] agent relay fetch_ok chunked: requestId=${requestId} messages=${messages.length} parts=${parts.length}`,
  )
  for (const part of parts) {
    await sendRelayMessage(peerDeviceId, part)
  }
}

async function ensurePeerConnected(peerDeviceId: string, p2pWorkspaceId: string): Promise<void> {
  await ensurePeerReadyForWorkspace(peerDeviceId, p2pWorkspaceId)
}

function waitForRelayResponse(requestId: string): Promise<AgentRelayMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      fetchOkAssemblies.delete(requestId)
      reject(new Error('群组智能体请求超时'))
    }, RELAY_TIMEOUT_MS)

    pendingRequests.set(requestId, {
      resolve: (message) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        fetchOkAssemblies.delete(requestId)
        resolve(message)
      },
      reject: (error) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        fetchOkAssemblies.delete(requestId)
        reject(error)
      },
    })
  })
}

function dispatchPendingResponse(message: AgentRelayMessage): void {
  if (message.type === 'fetch_ok_part') {
    const pending = pendingRequests.get(message.requestId)
    if (!pending) return

    let assembly = fetchOkAssemblies.get(message.requestId)
    if (!assembly) {
      assembly = {
        partCount: message.partCount,
        title: message.title ?? '',
        parts: new Map(),
      }
      fetchOkAssemblies.set(message.requestId, assembly)
    }

    assembly.parts.set(message.partIndex, message.messages)
    if (message.title) {
      assembly.title = message.title
    }

    if (assembly.parts.size < message.partCount) return

    const merged: Message[] = []
    for (let index = 0; index < message.partCount; index += 1) {
      merged.push(...(assembly.parts.get(index) ?? []))
    }

    pending.resolve({
      v: 1,
      type: 'fetch_ok',
      requestId: message.requestId,
      title: assembly.title,
      messages: merged,
    })
    return
  }

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

async function ensureRelayContentBlobs(
  peerDeviceId: string,
  p2pWorkspaceId: string,
  contentBlocks: ContentBlock[],
): Promise<void> {
  for (const block of contentBlocks) {
    if (block.type !== 'file' && block.type !== 'image') continue

    const hash = block.blobHash?.trim()
    if (!hash || blobExists(hash)) continue

    const label = block.type === 'file' ? block.name || '附件' : '图片'
    console.log(
      `[p2p] agent relay fetching blob: hash=${hash.slice(0, 12)}… peer=${peerDeviceId}`,
    )
    const ok = await fetchBlobFromPeers(p2pWorkspaceId, hash, block.mimeType, peerDeviceId)
    if (!ok) {
      throw new Error(`附件「${label}」未能从群组成员同步，请让对方重新发送`)
    }
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

  console.log(
    `[p2p] agent relay send start: ownerDeviceId=${input.proxy.ownerDeviceId} sourceSessionId=${input.proxy.sourceSessionId} memberSessionId=${input.sessionId}`,
  )

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
    contentBlocks: input.contentBlocks,
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

    const sessionRepo = getSessionRepository()
    const session = sessionRepo.findRowById(message.sourceSessionId)
    if (!session) {
      throw new Error('话题不存在')
    }

    const result = listMessages({ sessionId: message.sourceSessionId })
    const messages = result.items.map((item) => ({
      ...item,
      status: item.status === 'streaming' ? 'completed' : item.status,
    })) as Message[]

    await sendFetchOkResponse(peerDeviceId, message.requestId, session.title, messages)
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
  console.log(
    `[p2p] agent relay send received: peer=${peerDeviceId} sourceSessionId=${message.sourceSessionId}`,
  )
  try {
    assertRelayAccess(
      message.p2pWorkspaceId,
      message.resourceId,
      message.sourceSessionId,
      peerDeviceId,
      true,
    )

    await ensureRelayContentBlobs(peerDeviceId, message.p2pWorkspaceId, message.contentBlocks)

    activeOwnerRelays.get(message.requestId)?.unsubscribe()
    activeOwnerRelays.delete(message.requestId)

    let ownerAssistantMessageId: string | null = null
    const bufferedEvents: MessageStreamEvent[] = []

    const forwardStream = (event: MessageStreamEvent) => {
      const relayEvent = slimStreamEventForRelay(event, message.requestId)
      const remapped = remapStreamEventForMember(relayEvent, {
        sessionId: message.memberSessionId,
        messageId: message.memberAssistantMessageId,
      })

      void sendRelayMessage(peerDeviceId, {
        v: 1,
        type: 'stream',
        requestId: message.requestId,
        event: remapped,
      }).catch((error) => {
        const errMessage = error instanceof Error ? error.message : String(error)
        console.error(
          `[p2p] agent relay stream forward failed: requestId=${message.requestId} event=${event.type} error=${errMessage}`,
        )
      })

      if (event.type === 'message.done' || event.type === 'message.error') {
        activeOwnerRelays.get(message.requestId)?.unsubscribe()
        activeOwnerRelays.delete(message.requestId)
      }
    }

    const relayUnsubscribe = addStreamRelayListener((event) => {
      if (event.sessionId !== message.sourceSessionId) return

      if (!ownerAssistantMessageId) {
        if (
          event.type === 'message.delta' ||
          event.type === 'message.done' ||
          event.type === 'message.error'
        ) {
          bufferedEvents.push(event)
        }
        return
      }

      if (event.messageId !== ownerAssistantMessageId) return
      forwardStream(event)
    })

    activeOwnerRelays.set(message.requestId, {
      memberDeviceId: peerDeviceId,
      memberSessionId: message.memberSessionId,
      memberAssistantMessageId: message.memberAssistantMessageId,
      sourceSessionId: message.sourceSessionId,
      unsubscribe: relayUnsubscribe,
    })

    const result = await sendMessage({
      __p2pAgentRelayExecution: true,
      sessionId: message.sourceSessionId,
      contentBlocks: message.contentBlocks,
      modelIds: message.modelIds,
    })

    ownerAssistantMessageId = result.assistantMessageIds[0] ?? null
    if (!ownerAssistantMessageId) {
      relayUnsubscribe()
      activeOwnerRelays.delete(message.requestId)
      throw new Error('生成回复失败')
    }

    console.log(
      `[p2p] agent relay owner send ok: sourceSessionId=${message.sourceSessionId} userMessageId=${result.userMessageId} assistantMessageId=${ownerAssistantMessageId}`,
    )
    broadcastSessionMessagesReload(message.sourceSessionId)

    for (const event of bufferedEvents) {
      if (event.messageId === ownerAssistantMessageId) {
        forwardStream(event)
      }
    }

    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'send_ok',
      requestId: message.requestId,
    })
  } catch (error) {
    activeOwnerRelays.get(message.requestId)?.unsubscribe()
    activeOwnerRelays.delete(message.requestId)
    const errMessage = error instanceof Error ? error.message : '发送消息失败'
    console.error(
      `[p2p] agent relay owner send failed: sourceSessionId=${message.sourceSessionId} error=${errMessage}`,
    )
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
    const blocks =
      event.contentBlocks ?? relayStreamBuffers.get(event.messageId)?.toContentBlocks()
    if (blocks) {
      messages.updateStreamBlocks(event.messageId, blocks)
    }
    relayStreamBuffers.delete(event.messageId)
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
  data: Buffer | Uint8Array,
): Promise<void> {
  const message = parseRelayMessage(Buffer.from(data))

  switch (message.type) {
    case 'fetch':
      await handleOwnerFetch(peerDeviceId, message)
      return
    case 'send':
      await handleOwnerSend(peerDeviceId, message)
      return
    case 'fetch_ok':
    case 'fetch_ok_part':
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

export function bootstrapP2pAgentRelay(): void {
  registerP2pSyncHandlers({
    handleAgentRelayMessage: handleP2pAgentRelayMessage,
  })
}
