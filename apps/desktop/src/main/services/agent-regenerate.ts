import { randomUUID } from 'node:crypto'
import {
  buildStoredUserContent,
  ContentBlockSchema,
  MessageEditUserInputSchema,
  MessageRegenerateInputSchema,
} from '@toolman/shared'
import { createMessageRepository, createSessionRepository, runInTransaction } from '@toolman/db'

import { getMessageRepository, getSessionRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { getAssistantRow } from './assistant.service'
import { runGeneration } from './agent-generation.service'
import { stageUserContentBlocks } from './resolve-user-content-blocks.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'
import { abortMessage, abortControllers } from './agent-state'
import { dispatchGroupProxyRelay, resolveCallableGroupProxyMeta } from './agent-group-proxy'
import {
  parseAssistantRuntime,
  resolveRuntimeMcpServerIds,
  shouldEnableTools,
} from './agent-runtime'

export async function regenerateMessage(input: unknown) {
  const data = MessageRegenerateInputSchema.parse(input)
  const sessions = getSessionRepository()
  const messages = getMessageRepository()

  const session = sessions.findRowById(data.sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const assistantRow = messages.findRowById(data.messageId)
  if (
    !assistantRow ||
    assistantRow.sessionId !== data.sessionId ||
    assistantRow.role !== 'assistant'
  ) {
    throw new Error('Assistant message not found')
  }

  abortMessage({ sessionId: data.sessionId, messageId: data.messageId })

  const allRows = messages.listRows({ sessionId: data.sessionId })
  const cutoff = assistantRow.createdAt.getTime()
  const deleteIds = allRows
    .filter((row) => row.createdAt.getTime() >= cutoff)
    .map((row) => row.id)

  for (const id of deleteIds) {
    abortMessage({ sessionId: data.sessionId, messageId: id })
  }

  const userRow = assistantRow.parentMessageId
    ? messages.findRowById(assistantRow.parentMessageId)
    : null
  if (!userRow || userRow.role !== 'user') {
    throw new Error('Parent user message not found')
  }

  const storedUserBlocks = ContentBlockSchema.array().parse(
    JSON.parse(userRow.contentBlocksJson),
  )
  const userContentBlocks = await stageUserContentBlocks(storedUserBlocks)
  const userText = buildStoredUserContent(userContentBlocks)

  if (JSON.stringify(storedUserBlocks) !== JSON.stringify(userContentBlocks)) {
    messages.update(userRow.id, {
      content: userText,
      contentBlocks: userContentBlocks,
    })
  }
  const assistant = session.assistantId ? getAssistantRow(session.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, session.workspaceId)
  const mcpServerIds = resolveRuntimeMcpServerIds(
    runtime.skillIds,
    data.options?.mcpServerIds ?? runtime.mcpServerIds,
  )
  const memoryEnabled = data.options?.memoryEnabled ?? false
  const kbEnabled = data.options?.kbEnabled ?? false

  const modelIds =
    data.modelIds ??
    (assistantRow.modelId ? [assistantRow.modelId] : assistant ? [assistant.modelId] : [])
  if (modelIds.length === 0) {
    throw new Error('No model configured for regeneration')
  }

  const assistantMessageIds = modelIds.map(() => randomUUID())

  runInTransaction(getDatabase(), (tx) => {
    const sessions = createSessionRepository(tx)
    const txMessages = createMessageRepository(tx)

    txMessages.deleteMany(deleteIds, { touchSession: false })

    for (let i = 0; i < modelIds.length; i++) {
      txMessages.createWithId({
        id: assistantMessageIds[i]!,
        sessionId: data.sessionId,
        parentMessageId: userRow.id,
        role: 'assistant',
        modelId: modelIds[i],
        content: '',
        contentBlocks: [{ type: 'text', text: '' }],
        status: 'streaming',
        touchSession: false,
      })
    }

    sessions.touch(data.sessionId, modelIds.length - deleteIds.length)
  })

  const proxyMeta = resolveCallableGroupProxyMeta(session, assistant)
  if (proxyMeta) {
    dispatchGroupProxyRelay({
      proxyMeta,
      sessionId: data.sessionId,
      contentBlocks: userContentBlocks,
      modelIds,
      userMessageId: userRow.id,
      assistantMessageId: assistantMessageIds[0]!,
    })
    return {
      userMessageId: userRow.id,
      assistantMessageIds,
      userContentBlocks,
    }
  }

  for (let i = 0; i < modelIds.length; i++) {
    const assistantMessageId = assistantMessageIds[i]!
    const modelId = modelIds[i]!

    void runGeneration({
      sessionId: data.sessionId,
      assistantMessageId,
      userMessageId: userRow.id,
      modelId,
      assistant,
      workspaceId: session.workspaceId,
      userText,
      userContentBlocks,
      enableTools: shouldEnableTools(data.options, assistant, mcpServerIds, userContentBlocks),
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
      },
    })
  }

  return { userMessageId: userRow.id, assistantMessageIds }
}

export async function editUserMessage(input: unknown) {
  const data = MessageEditUserInputSchema.parse(input)
  const sessions = getSessionRepository()
  const messages = getMessageRepository()

  const session = sessions.findRowById(data.sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const userRow = messages.findRowById(data.messageId)
  if (!userRow || userRow.sessionId !== data.sessionId || userRow.role !== 'user') {
    throw new Error('User message not found')
  }

  const allRows = messages.listRows({ sessionId: data.sessionId })
  const cutoff = userRow.createdAt.getTime()
  const deleteIds = allRows
    .filter((row) => row.createdAt.getTime() >= cutoff && row.id !== userRow.id)
    .map((row) => row.id)

  for (const id of deleteIds) {
    abortMessage({ sessionId: data.sessionId, messageId: id })
  }

  const stagedBlocks = await stageUserContentBlocks(data.contentBlocks)
  const userText = buildStoredUserContent(stagedBlocks)

  const assistant = session.assistantId ? getAssistantRow(session.assistantId) : null
  const runtime = parseAssistantRuntime(assistant, session.workspaceId)
  const mcpServerIds = resolveRuntimeMcpServerIds(
    runtime.skillIds,
    data.options?.mcpServerIds ?? runtime.mcpServerIds,
  )
  const memoryEnabled = data.options?.memoryEnabled ?? false
  const kbEnabled = data.options?.kbEnabled ?? false

  const modelIds =
    data.modelIds ?? (assistant ? [assistant.modelId] : [])
  if (modelIds.length === 0) {
    throw new Error('No model configured for regeneration')
  }

  const assistantMessageIds = modelIds.map(() => randomUUID())

  runInTransaction(getDatabase(), (tx) => {
    const sessions = createSessionRepository(tx)
    const txMessages = createMessageRepository(tx)

    txMessages.update(userRow.id, {
      content: userText,
      contentBlocks: stagedBlocks,
    })

    txMessages.deleteMany(deleteIds, { touchSession: false })

    for (let i = 0; i < modelIds.length; i++) {
      txMessages.createWithId({
        id: assistantMessageIds[i]!,
        sessionId: data.sessionId,
        parentMessageId: userRow.id,
        role: 'assistant',
        modelId: modelIds[i],
        content: '',
        contentBlocks: [{ type: 'text', text: '' }],
        status: 'streaming',
        touchSession: false,
      })
    }

    sessions.touch(data.sessionId, modelIds.length - deleteIds.length)
  })

  const proxyMeta = resolveCallableGroupProxyMeta(session, assistant)
  if (proxyMeta) {
    dispatchGroupProxyRelay({
      proxyMeta,
      sessionId: data.sessionId,
      contentBlocks: stagedBlocks,
      modelIds,
      userMessageId: userRow.id,
      assistantMessageId: assistantMessageIds[0]!,
    })
    return {
      userMessageId: userRow.id,
      assistantMessageIds,
      userContentBlocks: stagedBlocks,
    }
  }

  for (let i = 0; i < modelIds.length; i++) {
    const assistantMessageId = assistantMessageIds[i]!
    const modelId = modelIds[i]!

    void runGeneration({
      sessionId: data.sessionId,
      assistantMessageId,
      userMessageId: userRow.id,
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
      },
    })
  }

  return {
    userMessageId: userRow.id,
    assistantMessageIds,
    userContentBlocks: stagedBlocks,
  }
}
