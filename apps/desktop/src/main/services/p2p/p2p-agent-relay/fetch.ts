import { randomUUID } from 'node:crypto'
import { toErrorMessage } from '@toolman/shared'
import type { Message } from '@toolman/shared'
import { getSessionRepository } from '../../../db/repos'
import { listMessages } from '../../agent.service'
import { assertPeerTrustedForSync } from '../p2p-peer.service'
import { resolveAgentRelayResourceId } from '../p2p-shared-resource-id'
import { assertRelayAccess } from './access'
import { waitForRelayResponse } from './pending'
import { getSharedResourceRepo } from './repos'
import { ensurePeerConnected, sendFetchOkResponse, sendRelayMessage } from './transport'

export async function fetchRemoteSessionHistory(input: {
  ownerDeviceId: string
  p2pWorkspaceId: string
  resourceId: string
  sourceSessionId: string
  sourceAssistantId?: string
}): Promise<{ title: string; messages: Message[] }> {
  await assertPeerTrustedForSync(input.p2pWorkspaceId, input.ownerDeviceId)
  await ensurePeerConnected(input.ownerDeviceId, input.p2pWorkspaceId)

  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    input.p2pWorkspaceId,
    input.resourceId,
    input.sourceAssistantId,
  )

  const requestId = randomUUID()
  const responsePromise = waitForRelayResponse(requestId)

  await sendRelayMessage(input.ownerDeviceId, {
    v: 1,
    type: 'fetch',
    requestId,
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: relayResourceId,
    sourceSessionId: input.sourceSessionId,
  })

  const response = await responsePromise
  if (response.type !== 'fetch_ok') {
    throw new Error('拉取话题历史失败')
  }

  return { title: response.title, messages: response.messages }
}

export async function handleOwnerFetch(
  peerDeviceId: string,
  message: Extract<import('@toolman/shared').AgentRelayMessage, { type: 'fetch' }>,
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
    const errMessage = toErrorMessage(error, '拉取话题历史失败')
    await sendRelayMessage(peerDeviceId, {
      v: 1,
      type: 'fetch_err',
      requestId: message.requestId,
      message: errMessage,
    })
  }
}
