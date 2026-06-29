import { randomUUID } from 'node:crypto'
import {
  buildStoredUserContent,
  MessageSendInputSchema,
  isDefaultSessionTitle,
} from '@toolman/shared'
import { createMessageRepository, createSessionRepository, runInTransaction } from '@toolman/db'

import { getMessageRepository, getSessionRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { logStructured } from './structured-log.service'
import { getAssistantRow } from './assistant.service'
import { runGeneration } from './agent-generation.service'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { persistRepairedSessionProxyMetadata, resolveProxyMetaForSend } from './p2p/p2p-group-agent-proxy.service'
import { relayProxySendMessage } from './p2p/p2p-agent-relay.service'
import { stageUserContentBlocks } from './resolve-user-content-blocks.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import { toErrorMessage } from '@toolman/shared'
import { broadcastStreamEvent } from './stream-broadcast'
import { abortControllers } from './agent-state'
import {
  deriveSessionTitle,
  parseAssistantRuntime,
  resolveRuntimeMcpServerIds,
  shouldEnableTools,
} from './agent-runtime'

export async function sendMessage(input: unknown) {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const isRelayExecution = raw.__p2pAgentRelayExecution === true
  const data = MessageSendInputSchema.parse(input)
  const sessions = getSessionRepository()

  const session = sessions.findRowById(data.sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  let proxyMeta: Awaited<ReturnType<typeof resolveProxyMetaForSend>> = null
  const assistant = session.assistantId ? getAssistantRow(session.assistantId) : null

  if (!isRelayExecution) {
    proxyMeta = resolveProxyMetaForSend(session.metadataJson, assistant)
    if (proxyMeta) {
      persistRepairedSessionProxyMetadata(session.id, session.metadataJson, proxyMeta)
    } else if (assistant?.parameters?.p2pGroupProxy) {
      logStructured('p2p', 'warn', `group proxy assistant without relay metadata: sessionId=${session.id} assistantId=${assistant.id}`)
    }
  }

  const localDeviceId = getP2pDeviceInfo().deviceId
  const isGroupProxyClient =
    !isRelayExecution && proxyMeta && proxyMeta.permission === 'callable'

  if (isGroupProxyClient && proxyMeta) {
    logStructured('p2p', 'info', `group proxy send: sessionId=${data.sessionId} ownerDeviceId=${proxyMeta.ownerDeviceId} sourceSessionId=${proxyMeta.sourceSessionId} local=${proxyMeta.ownerDeviceId === localDeviceId}`)
  }

  const runtime = parseAssistantRuntime(assistant, session.workspaceId)
  const mcpServerIds = resolveRuntimeMcpServerIds(
    runtime.skillIds,
    data.options?.mcpServerIds ?? runtime.mcpServerIds,
  )
  const memoryEnabled = data.options?.memoryEnabled ?? false
  const kbEnabled = data.options?.kbEnabled ?? false

  const modelIds =
    data.modelIds ??
    (isGroupProxyClient && proxyMeta?.referencedModelId
      ? [proxyMeta.referencedModelId]
      : assistant
        ? [assistant.modelId]
        : [])
  if (modelIds.length === 0) {
    throw new Error('No model configured for this session')
  }

  const stagedBlocks = await stageUserContentBlocks(data.contentBlocks)
  const userText = buildStoredUserContent(stagedBlocks)

  const userMessageId = randomUUID()
  const assistantMessageIds: string[] = modelIds.map(() => randomUUID())

  runInTransaction(getDatabase(), (tx) => {
    const sessions = createSessionRepository(tx)
    const messages = createMessageRepository(tx)

    if (isDefaultSessionTitle(session.title) && session.messageCount === 0) {
      sessions.update(session.id, { title: deriveSessionTitle(userText) })
    }

    messages.createWithId({
      id: userMessageId,
      sessionId: data.sessionId,
      role: 'user',
      content: userText,
      contentBlocks: stagedBlocks,
      status: 'completed',
      touchSession: false,
    })

    for (let i = 0; i < modelIds.length; i++) {
      messages.createWithId({
        id: assistantMessageIds[i]!,
        sessionId: data.sessionId,
        parentMessageId: userMessageId,
        role: 'assistant',
        modelId: modelIds[i],
        content: '',
        contentBlocks: [{ type: 'text', text: '' }],
        status: 'streaming',
        touchSession: false,
      })
    }

    sessions.touch(data.sessionId, 1 + modelIds.length)
  })

  if (isGroupProxyClient && proxyMeta) {
    const assistantMessageId = assistantMessageIds[0]!
    void relayProxySendMessage({
      proxy: proxyMeta,
      sessionId: data.sessionId,
      contentBlocks: stagedBlocks,
      modelIds,
      memberUserMessageId: userMessageId,
      memberAssistantMessageId: assistantMessageId,
    }).catch((error) => {
      const errMessage = toErrorMessage(error, '发送消息失败')
      const ipcError = {
        code: 'INTERNAL_ERROR' as const,
        message: errMessage,
        retryable: true,
      }
      getMessageRepository().update(assistantMessageId, {
        status: 'failed',
        error: ipcError,
      })
      broadcastStreamEvent({
        type: 'message.error',
        sessionId: data.sessionId,
        messageId: assistantMessageId,
        error: ipcError,
        timestamp: Date.now(),
      })
    })
    return { userMessageId, assistantMessageIds, userContentBlocks: stagedBlocks }
  }

  for (let i = 0; i < modelIds.length; i++) {
    const assistantMessageId = assistantMessageIds[i]!
    const modelId = modelIds[i]!

    void runGeneration({
      sessionId: data.sessionId,
      assistantMessageId,
      userMessageId,
      modelId,
      assistant,
      workspaceId: session.workspaceId,
      userText,
      userContentBlocks: stagedBlocks,
      enableTools: shouldEnableTools(data.options, assistant, mcpServerIds, stagedBlocks),
      mcpServerIds,
      abortControllers,
      sendOptions: {
        webSearchEnabled: data.options?.webSearchEnabled,
        webSearchProvider: data.options?.webSearchProvider,
        memoryEnabled,
        memoryRetentionDays: data.options?.memoryRetentionDays,
        kbEnabled,
        kbIds: data.options?.kbIds,
        kbTopK: data.options?.kbTopK,
        kbScoreThreshold: data.options?.kbScoreThreshold,
        documentOcrEnabled: data.options?.documentOcrEnabled ?? isDocumentOcrEnabled(),
        isHeartbeat: data.options?.isHeartbeat,
        isChannelMessage: data.options?.isChannelMessage,
      },
    })
  }

  return { userMessageId, assistantMessageIds, userContentBlocks: stagedBlocks }
}
