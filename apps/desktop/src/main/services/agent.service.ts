import { randomUUID } from 'node:crypto'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import {
  buildStoredUserContent,
  shouldEnableToolsWithAttachments,
  ContentBlockSchema,
  MessageAbortInputSchema,
  MessageAbortSessionInputSchema,
  MessageDeleteInputSchema,
  MessageEditUserInputSchema,
  MessageListInputSchema,
  MessageRegenerateInputSchema,
  MessageSendInputSchema,
  MessageTranslateInputSchema,
  MessageDiagnoseInputSchema,
  getDefaultSkillIds,
  getDefaultMcpServerIds,
  resolveMcpServerIdsForSkills,
  isDefaultSessionTitle,
  AssistantParametersSchema,
  type ContentBlock,
} from '@toolman/shared'
import { createMessageRepository, createSessionRepository, runInTransaction, type SessionRow } from '@toolman/db'
import { getMessageRepository, getSessionRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { toIpcMessage } from '../mappers/chat'
import { getAssistantRow } from './assistant.service'
import { resolveEffectivePermissionMode } from './agent-runtime.service'
import { type PermissionMode } from './permission.service'
import { filterEnabledMcpServerIds } from './mcp-server-config.service'
import { filterEnabledSkillIds } from './skill.service'
import { type ToolExecutionContext } from './tool-executor.service'
import { getProviderConfig, parseModelId } from './provider.service'
import { broadcastStreamEvent } from './stream-broadcast'
import { runGeneration } from './agent-generation.service'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { persistRepairedSessionProxyMetadata, resolveProxyMetaForSend } from './p2p/p2p-group-agent-proxy.service'
import { relayProxySendMessage } from './p2p/p2p-agent-relay.service'
import { getWorkspace } from './workspace.service'
import { stageUserContentBlocks } from './resolve-user-content-blocks.service'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'

function resolveRuntimeMcpServerIds(skillIds: string[], mcpServerIds: string[]): string[] {
  return filterEnabledMcpServerIds(resolveMcpServerIdsForSkills(skillIds, mcpServerIds))
}

const gateway = createModelGateway()
const abortControllers = new Map<string, AbortController>()



function resolveAssistantWorkingDirectory(
  assistant: ReturnType<typeof getAssistantRow>,
  workspaceId?: string,
): string | undefined {
  const params = assistant ? (JSON.parse(assistant.parametersJson) as Record<string, unknown>) : {}
  const configured = params.workingDirectory as string | undefined
  if (configured?.trim()) return configured.trim()

  if (workspaceId) {
    const workspace = getWorkspace({ id: workspaceId })
    const folderPath = workspace?.settings.folderPath
    if (typeof folderPath === 'string' && folderPath.trim()) return folderPath.trim()
  }

  return undefined
}

export function parseAssistantRuntime(
  assistant: ReturnType<typeof getAssistantRow>,
  workspaceId?: string,
) {
  const params = assistant ? (JSON.parse(assistant.parametersJson) as Record<string, unknown>) : {}
  const isGroupProxyShell = Boolean(params.p2pGroupProxy)
  const permissionMode = (params.permissionMode as PermissionMode | undefined) ?? 'normal'
  const autonomousMode = Boolean(params.autonomousMode)
  const workingDirectory = resolveAssistantWorkingDirectory(assistant, workspaceId)
  const skillIds = filterEnabledSkillIds(
    isGroupProxyShell
      ? ((params.skillIds as string[] | undefined) ?? [])
      : ((params.skillIds as string[] | undefined) ?? getDefaultSkillIds()),
  )
  const baseMcpServerIds = isGroupProxyShell
    ? ((params.mcpServerIds as string[] | undefined) ?? [])
    : ((params.mcpServerIds as string[] | undefined) ?? getDefaultMcpServerIds())
  return {
    permissionMode,
    autonomousMode,
    effectivePermissionMode: resolveEffectivePermissionMode(permissionMode, autonomousMode),
    toolStates: (params.toolStates as Record<string, boolean> | undefined) ?? {},
    mcpServerIds: resolveRuntimeMcpServerIds(skillIds, baseMcpServerIds),
    skillIds,
    sessionRoundLimit:
      AssistantParametersSchema.shape.sessionRoundLimit.parse(params.sessionRoundLimit) ?? 100,
    temperature: params.temperature as number | undefined,
    maxTokens: params.maxTokens as number | undefined,
    assistantId: assistant?.id,
    workspaceId,
    toolContext: {
      workingDirectory,
      environmentVariables: params.environmentVariables as string | undefined,
      workspaceId,
      assistantId: assistant?.id,
    } as ToolExecutionContext,
  }
}


function shouldEnableTools(
  options: { enableTools?: boolean } | undefined,
  assistant: ReturnType<typeof getAssistantRow>,
  mcpServerIds?: string[],
  userContentBlocks?: ContentBlock[],
): boolean {
  if (options?.enableTools === false) return false
  if (options?.enableTools === true) return true
  if (!assistant) return false
  const runtime = parseAssistantRuntime(assistant)
  const servers = mcpServerIds ?? runtime.mcpServerIds
  return shouldEnableToolsWithAttachments(servers, userContentBlocks ?? [])
}

function deriveSessionTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 24) return cleaned
  return `${cleaned.slice(0, 24)}…`
}


export function recoverStaleStreamingMessages() {
  getMessageRepository().recoverStaleStreaming({
    code: 'ABORTED',
    message: '应用重启，生成已中断',
    retryable: false,
  })
}

export function listMessages(input: unknown) {
  const data = MessageListInputSchema.parse(input)
  const limit = data.pagination?.limit ?? 200

  const rows = getMessageRepository().listRows({
    sessionId: data.sessionId,
    limit,
  })

  return { items: rows.map(toIpcMessage) }
}

function resolveCallableGroupProxyMeta(
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

function dispatchGroupProxyRelay(input: {
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


const TRANSLATION_LANGUAGE_LABELS = {
  zh: 'Simplified Chinese',
  en: 'English',
} as const

export async function translateText(input: unknown) {
  const data = MessageTranslateInputSchema.parse(input)
  const { providerId, model } = parseModelId(data.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  const targetLabel = TRANSLATION_LANGUAGE_LABELS[data.targetLanguage]
  const prompt = [
    `Translate the following text into ${targetLabel}.`,
    'Output only the translated text without explanations, quotes, or markdown fences.',
    '',
    data.text,
  ].join('\n')

  let translated = ''
  for await (const chunk of gateway.chatStream(providerConfig, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 4096,
  })) {
    if (chunk.type === 'text-delta' && chunk.text) {
      translated += chunk.text
    }
  }

  return {
    text: translated.trim(),
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
  }
}

export async function diagnoseError(input: unknown) {
  const data = MessageDiagnoseInputSchema.parse(input)
  const { providerId, model } = parseModelId(data.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  const prompt = [
    '你是 Toolman 桌面聊天应用的技术支持助手。',
    '请用简体中文分析以下错误，给出简洁、可操作的诊断。',
    '使用 Markdown，包含两个小节：',
    '1. **原因分析** — 说明发生了什么',
    '2. **解决方案** — 列出用户可立即尝试的步骤',
    '不要复述完整堆栈，聚焦用户能做什么。',
    '',
    '---',
    data.errorSummary,
  ].join('\n')

  let diagnosis = ''
  for await (const chunk of gateway.chatStream(providerConfig, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 2048,
  })) {
    if (chunk.type === 'text-delta' && chunk.text) {
      diagnosis += chunk.text
    }
  }

  return { text: diagnosis.trim() }
}

export function abortMessage(input: unknown): boolean {
  const data = MessageAbortInputSchema.parse(input)
  const controller = abortControllers.get(data.messageId)
  if (!controller) return false
  controller.abort()
  return true
}

/** 中断指定会话内所有进行中的流式生成 */
export function abortSessionStreaming(input: unknown): number {
  const { sessionId } = MessageAbortSessionInputSchema.parse(input)
  const rows = getMessageRepository()
    .listRows({ sessionId })
    .filter((row) => row.status === 'streaming')

  let aborted = 0
  for (const row of rows) {
    if (abortMessage({ sessionId, messageId: row.id })) aborted++
  }
  return aborted
}

export function deleteMessage(input: unknown): boolean {
  const data = MessageDeleteInputSchema.parse(input)
  return runInTransaction(getDatabase(), (tx) => {
    const messages = createMessageRepository(tx)
    const row = messages.findRowById(data.messageId)
    if (!row || row.sessionId !== data.sessionId) return false
    return messages.delete(data.messageId)
  })
}
