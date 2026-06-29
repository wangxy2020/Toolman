import { toErrorMessage } from '@toolman/shared'
import type { ContentBlock } from '@toolman/shared'
import type { SessionRow } from '@toolman/db'

import { logStructured } from './structured-log.service'
import { getMessageRepository } from '../db/repos'
import { getAssistantRow } from './assistant.service'
import { broadcastStreamEvent } from './stream-broadcast'
import { persistRepairedSessionProxyMetadata, resolveProxyMetaForSend } from './p2p/p2p-group-agent-proxy.service'
import { relayProxySendMessage } from './p2p/p2p-agent-relay.service'

export function resolveCallableGroupProxyMeta(
  session: SessionRow,
  assistant: ReturnType<typeof getAssistantRow>,
) {
  const proxyMeta = resolveProxyMetaForSend(session.metadataJson, assistant)
  if (proxyMeta) {
    persistRepairedSessionProxyMetadata(session.id, session.metadataJson, proxyMeta)
  } else if (assistant?.parameters?.p2pGroupProxy) {
    logStructured(
      'p2p',
      'warn',
      `group proxy assistant without relay metadata: sessionId=${session.id} assistantId=${assistant.id}`,
    )
  }
  return proxyMeta?.permission === 'callable' ? proxyMeta : null
}

export function dispatchGroupProxyRelay(input: {
  proxyMeta: NonNullable<ReturnType<typeof resolveCallableGroupProxyMeta>>
  sessionId: string
  contentBlocks: ContentBlock[]
  modelIds: string[]
  userMessageId: string
  assistantMessageId: string
}): void {
  void relayProxySendMessage({
    proxy: input.proxyMeta,
    sessionId: input.sessionId,
    contentBlocks: input.contentBlocks,
    modelIds: input.modelIds,
    memberUserMessageId: input.userMessageId,
    memberAssistantMessageId: input.assistantMessageId,
  }).catch((error) => {
    const errMessage = toErrorMessage(error, '发送消息失败')
    const ipcError = {
      code: 'INTERNAL_ERROR' as const,
      message: errMessage,
      retryable: true,
    }
    getMessageRepository().update(input.assistantMessageId, {
      status: 'failed',
      error: ipcError,
    })
    broadcastStreamEvent({
      type: 'message.error',
      sessionId: input.sessionId,
      messageId: input.assistantMessageId,
      error: ipcError,
      timestamp: Date.now(),
    })
  })
}
