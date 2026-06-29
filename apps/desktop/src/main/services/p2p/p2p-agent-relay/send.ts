import { randomUUID } from 'node:crypto'
import { logStructured } from '../../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type {
  AgentRelayMessage,
  ContentBlock,
  MessageStreamEvent,
  P2pGroupAgentProxy,
} from '@toolman/shared'
import { sendMessage } from '../../agent.service'
import {
  broadcastSessionMessagesReload,
  addStreamRelayListener,
} from '../../stream-broadcast'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import { assertPeerTrustedForSync } from '../p2p-peer.service'
import { resolveAgentRelayResourceId } from '../p2p-shared-resource-id'
import { assertRelayAccess } from './access'
import { ensureRelayContentBlobs } from './blobs'
import { waitForRelayResponse } from './pending'
import { getSharedResourceRepo } from './repos'
import {
  clearActiveOwnerRelay,
  handleMemberStream,
  remapStreamEventForMember,
} from './stream'
import { activeOwnerRelays } from './state'
import { ensurePeerConnected, sendRelayMessage, slimStreamEventForRelay } from './transport'

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

  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    input.proxy.p2pWorkspaceId,
    input.proxy.resourceId,
    input.proxy.sourceAssistantId,
  )
  const proxy = { ...input.proxy, resourceId: relayResourceId }

  const localDeviceId = getP2pDeviceInfo().deviceId
  const requestId = randomUUID()
  const relayMessage: Extract<AgentRelayMessage, { type: 'send' }> = {
    v: 1,
    type: 'send',
    requestId,
    p2pWorkspaceId: proxy.p2pWorkspaceId,
    resourceId: proxy.resourceId,
    sourceSessionId: proxy.sourceSessionId,
    memberSessionId: input.sessionId,
    memberUserMessageId: input.memberUserMessageId,
    memberAssistantMessageId: input.memberAssistantMessageId,
    contentBlocks: input.contentBlocks,
    modelIds: input.modelIds,
  }

  if (proxy.ownerDeviceId === localDeviceId) {
    logStructured('p2p', 'info', `agent relay send start (local): sourceSessionId=${proxy.sourceSessionId} memberSessionId=${input.sessionId}`)
    await runOwnerRelaySend(localDeviceId, relayMessage, { deliverStreamLocally: true })
    return {
      userMessageId: input.memberUserMessageId,
      assistantMessageIds: [input.memberAssistantMessageId],
    }
  }

  await assertPeerTrustedForSync(proxy.p2pWorkspaceId, proxy.ownerDeviceId)
  await ensurePeerConnected(proxy.ownerDeviceId, proxy.p2pWorkspaceId)

  logStructured('p2p', 'info', `agent relay send start: ownerDeviceId=${proxy.ownerDeviceId} sourceSessionId=${proxy.sourceSessionId} memberSessionId=${input.sessionId}`)

  const responsePromise = waitForRelayResponse(requestId)

  await sendRelayMessage(proxy.ownerDeviceId, relayMessage)

  const response = await responsePromise
  if (response.type !== 'send_ok') {
    throw new Error('发送消息失败')
  }

  return {
    userMessageId: input.memberUserMessageId,
    assistantMessageIds: [input.memberAssistantMessageId],
  }
}

export async function handleOwnerSend(
  peerDeviceId: string,
  message: Extract<AgentRelayMessage, { type: 'send' }>,
): Promise<void> {
  await runOwnerRelaySend(peerDeviceId, message)
}

export async function runOwnerRelaySend(
  peerDeviceId: string,
  message: Extract<AgentRelayMessage, { type: 'send' }>,
  options: { deliverStreamLocally?: boolean } = {},
): Promise<void> {
  logStructured('p2p', 'info', `agent relay send received: peer=${peerDeviceId} sourceSessionId=${message.sourceSessionId} local=${options.deliverStreamLocally === true}`)
  try {
    assertRelayAccess(
      message.p2pWorkspaceId,
      message.resourceId,
      message.sourceSessionId,
      peerDeviceId,
      true,
    )

    await ensureRelayContentBlobs(peerDeviceId, message.p2pWorkspaceId, message.contentBlocks)

    clearActiveOwnerRelay(message.requestId)

    let ownerAssistantMessageId: string | null = null
    const bufferedEvents: MessageStreamEvent[] = []

    const forwardStream = (event: MessageStreamEvent) => {
      const relayEvent = slimStreamEventForRelay(event, message.requestId)
      const remapped = remapStreamEventForMember(relayEvent, {
        sessionId: message.memberSessionId,
        messageId: message.memberAssistantMessageId,
      })

      if (options.deliverStreamLocally) {
        handleMemberStream({
          v: 1,
          type: 'stream',
          requestId: message.requestId,
          event: remapped,
        })
      } else {
        void sendRelayMessage(peerDeviceId, {
          v: 1,
          type: 'stream',
          requestId: message.requestId,
          event: remapped,
        }).catch((error) => {
          const errMessage = toErrorMessage(error, String(error))
          logStructured('p2p', 'error', `agent relay stream forward failed: requestId=${message.requestId} event=${event.type} error=${errMessage}`)
        })
      }

      if (event.type === 'message.done' || event.type === 'message.error') {
        clearActiveOwnerRelay(message.requestId)
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

    logStructured('p2p', 'info', `agent relay owner send ok: sourceSessionId=${message.sourceSessionId} userMessageId=${result.userMessageId} assistantMessageId=${ownerAssistantMessageId}`)
    broadcastSessionMessagesReload(message.sourceSessionId)

    for (const event of bufferedEvents) {
      if (event.messageId === ownerAssistantMessageId) {
        forwardStream(event)
      }
    }

    if (!options.deliverStreamLocally) {
      await sendRelayMessage(peerDeviceId, {
        v: 1,
        type: 'send_ok',
        requestId: message.requestId,
      })
    }
  } catch (error) {
    clearActiveOwnerRelay(message.requestId)
    const errMessage = toErrorMessage(error, '发送消息失败')
    logStructured('p2p', 'error', `agent relay owner send failed: sourceSessionId=${message.sourceSessionId} error=${errMessage}`)
    if (options.deliverStreamLocally) {
      throw error
    }
    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'send_err',
      requestId: message.requestId,
      message: errMessage,
    })
  }
}
