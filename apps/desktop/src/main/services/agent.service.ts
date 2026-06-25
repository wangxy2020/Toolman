import { randomUUID } from 'node:crypto'
import { createModelGateway, ProviderError, type ChatContentPart, type ChatMessage, providerSupportsOpenAiVision, isGemmaThinkingOllamaModelId } from '@toolman/model-gateway'
import {
  buildModelTextFromUserBlocks,
  buildStoredUserContent,
  userBlocksHaveUnresolvedAttachments,
  DOCX_MCP_SERVER_ID,
  EXCEL_MCP_SERVER_ID,
  isDocxMcpSourceFileBlock,
  isExcelMcpSourceFileBlock,
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
  isOcrVisionModelId,
  type Message,
  type MessageStreamEvent,
  type ContentBlock,
} from '@toolman/shared'
import { blocksToText, createMessageRepository, createSessionRepository, runInTransaction } from '@toolman/db'
import { getMessageRepository, getSessionRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { toIpcMessage } from '../mappers/chat'
import { getAssistantRow } from './assistant.service'
import { getBlobDataUrl } from './blob.service'
import { buildToolSystemHint } from './mcp-status.service'
import {
  buildAutonomousSystemHint,
  buildMemorySystemHint,
  buildSkillsSystemHint,
  buildWebSearchSystemHint,
  buildKnowledgeSystemHint,
  loadSoulMd,
  resolveEffectivePermissionMode,
} from './agent-runtime.service'
import { evaluateToolPermission, isDeleteTool, type PermissionMode } from './permission.service'
import {
  requestToolApproval,
  grantToolApprovalScope,
  clearToolApprovalScope,
  hasToolApprovalScope,
  buildSessionToolApprovalScopeKey,
} from './tool-approval.service'
import { listRelevantMemories } from './memory.service'
import { searchWeb } from './web-search.service'
import { resolveToolDefinitions } from './tool-registry'
import { filterEnabledMcpServerIds } from './mcp-server-config.service'
import { filterEnabledSkillIds } from './skill.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  assertDocxMcpReady,
  bootstrapDocxMcpRead,
  buildDocxMcpApprovalScopeKey,
  buildDocxMcpBatchApprovalArgs,
  DOCX_MCP_BATCH_TOOL_NAME,
  DocxMcpNotReadyError,
  filterDocxMcpToolDefinitions,
  prepareDocxWorkingCopies,
  type DocxWorkingCopy,
} from './docx-mcp-task.service'
import {
  assertExcelMcpReady,
  bootstrapExcelMcpRead,
  buildExcelMcpApprovalScopeKey,
  buildExcelMcpBatchApprovalArgs,
  EXCEL_MCP_BATCH_TOOL_NAME,
  ExcelMcpNotReadyError,
  filterExcelMcpToolDefinitions,
  prepareExcelWorkingCopies,
  type ExcelWorkingCopy,
} from './excel-mcp-task.service'
import {
  buildDocxFinalSummaryPrompt,
  buildDocxReviewSummaryBlock,
  formatDocxReviewReport,
  runDocxStructuredReviewPipeline,
} from './docx-review.service'
import {
  buildExcelFinalSummaryPrompt,
  buildExcelReviewSummaryBlock,
  formatExcelReviewReport,
  runExcelStructuredReviewPipeline,
} from './excel-review.service'
import { getProviderConfig, parseModelId } from './provider.service'
import { broadcastStreamEvent } from './stream-broadcast'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { persistRepairedSessionProxyMetadata, resolveProxyMetaForSend } from './p2p/p2p-group-agent-proxy.service'
import { relayProxySendMessage } from './p2p/p2p-agent-relay.service'
import { getWorkspace } from './workspace.service'
import { resolveWorkingDirectory } from './permission.service'
import { MessageStreamBuffers } from './message-stream-buffers'
import {
  resolveEffectiveKbIds,
  searchKnowledgeForChat,
} from './knowledge-document.service'
import { extractMemoriesFromConversation } from './memory-extractor.service'
import { stageUserContentBlocks, resolveAttachmentReadPath } from './resolve-user-content-blocks.service'
import {
  contentBlocksNeedModelPrepare,
  prepareChatAttachmentsForModel,
} from './chat-attachment-prepare.service'
import { isAbortError, throwIfAborted, withAbortSignal } from '../utils/abort-signal'
import { isDocumentOcrEnabled } from './runtime-app-settings.service'

function resolveRuntimeMcpServerIds(skillIds: string[], mcpServerIds: string[]): string[] {
  return filterEnabledMcpServerIds(resolveMcpServerIdsForSkills(skillIds, mcpServerIds))
}

const gateway = createModelGateway()
const abortControllers = new Map<string, AbortController>()

function emit(event: MessageStreamEvent) {
  broadcastStreamEvent(event)
}

function assertAttachmentContentResolved(
  blocks: ContentBlock[],
  mcpServerIds?: string[],
): void {
  if (!userBlocksHaveUnresolvedAttachments(blocks, { mcpServerIds })) return

  for (const block of blocks) {
    if (block.type === 'file' && (block.delivery === 'docx_tool' || block.delivery === 'excel_tool')) continue
    if (block.type === 'file' && !block.content?.trim() && !(block.visionPages && block.visionPages.length > 0)) {
      throw new Error(`附件「${block.name}」未能准备就绪，请重新发送`)
    }
    if (block.type === 'image' && !block.blobHash?.trim()) {
      throw new Error(
        `图片附件「${block.alt ?? block.path ?? '未命名'}」未能加载，请重新发送`,
      )
    }
  }
}

function buildUserChatMessage(userContentBlocks: ContentBlock[]): ChatMessage | null {
  const images = userContentBlocks.filter((block) => block.type === 'image')
  const visionPageImages = userContentBlocks.flatMap((block) => {
    if (block.type !== 'file' || !block.visionPages?.length) return []
    return block.visionPages.map((page) => ({
      blobHash: page.blobHash,
      alt: `${block.name} 第${page.pageNumber}页`,
    }))
  })

  const modelText = buildModelTextFromUserBlocks(userContentBlocks)
  const visionHints = userContentBlocks
    .filter((block) => block.type === 'file' && block.visionPages && block.visionPages.length > 0)
    .map(
      (block) =>
        `附件「${block.type === 'file' ? block.name : ''}」已作为 ${block.type === 'file' ? block.visionPages!.length : 0} 页图片发送，请直接阅读图片内容作答。`,
    )

  const combinedText = [modelText, ...visionHints].filter((part) => part.trim()).join('\n\n')

  if (!combinedText.trim() && images.length === 0 && visionPageImages.length === 0) return null

  if (images.length === 0 && visionPageImages.length === 0) {
    return { role: 'user', content: combinedText }
  }

  const parts: ChatContentPart[] = []
  if (combinedText.trim()) {
    parts.push({ type: 'text', text: combinedText })
  }

  for (const image of images) {
    if (image.type !== 'image' || !image.blobHash?.trim()) continue
    parts.push({
      type: 'image_url',
      image_url: { url: getBlobDataUrl(image.blobHash) },
    })
  }

  for (const page of visionPageImages) {
    parts.push({
      type: 'image_url',
      image_url: { url: getBlobDataUrl(page.blobHash) },
    })
  }

  return { role: 'user', content: parts }
}

function chatMessageHasImages(content: ChatMessage['content']): boolean {
  return Array.isArray(content) && content.some((part) => part.type === 'image_url')
}

function assertProviderSupportsVisionInput(
  providerConfig: ReturnType<typeof getProviderConfig>,
  model: string,
  userContentBlocks: ContentBlock[],
): void {
  if (!providerConfig || providerSupportsOpenAiVision(providerConfig, model)) return
  const userMessage = buildUserChatMessage(userContentBlocks)
  if (userMessage && chatMessageHasImages(userMessage.content)) {
    throw new ProviderError(
      '当前模型不支持图片输入。请切换到支持视觉的模型（如 deepseek-v4-pro），或移除图片后重试。',
      false,
    )
  }
}

function buildHistoryChatMessage(blocks: ContentBlock[], role: 'user' | 'assistant'): ChatMessage | null {
  if (role === 'assistant') {
    const text = blocksToText(blocks)
    return text ? { role, content: text } : null
  }

  return buildUserChatMessage(blocks)
}

function buildChatMessages(
  sessionId: string,
  assistant: ReturnType<typeof getAssistantRow>,
  userContentBlocks: ContentBlock[],
  excludeMessageIds: string[],
  extraSystemHint?: string,
): ChatMessage[] {
  const exclude = new Set(excludeMessageIds)
  const history = getMessageRepository()
    .listCompletedRows(sessionId)
    .filter((row) => !exclude.has(row.id))
  const chatMessages: ChatMessage[] = []

  const systemParts: string[] = []
  if (assistant?.systemPrompt) systemParts.push(assistant.systemPrompt)
  if (extraSystemHint?.trim()) systemParts.push(extraSystemHint.trim())
  if (systemParts.length) {
    chatMessages.push({ role: 'system', content: systemParts.join('\n\n') })
  }

  for (const msg of history) {
    const blocks = ContentBlockSchema.array().parse(JSON.parse(msg.contentBlocksJson))
    const chatMessage =
      msg.role === 'user' || msg.role === 'assistant'
        ? buildHistoryChatMessage(blocks, msg.role)
        : null
    if (chatMessage) {
      chatMessages.push(chatMessage)
    }
  }

  const userMessage = buildUserChatMessage(userContentBlocks)
  if (userMessage) {
    chatMessages.push(userMessage)
  }

  return chatMessages
}

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

function parseAssistantRuntime(
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
    sessionRoundLimit: (params.sessionRoundLimit as number | undefined) ?? 100,
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

async function buildRuntimeSystemHints(options: {
  assistant: ReturnType<typeof getAssistantRow>
  runtime: ReturnType<typeof parseAssistantRuntime>
  userText: string
  userContentBlocks?: ContentBlock[]
  enableTools: boolean
  mcpServerIds: string[]
  sendOptions?: {
    webSearchEnabled?: boolean
    webSearchProvider?: 'duckduckgo' | 'bing' | 'google'
    memoryEnabled?: boolean
    memoryRetentionDays?: number
    kbEnabled?: boolean
    kbIds?: string[]
    kbTopK?: number
    kbScoreThreshold?: number
  }
  docxWorkingCopies?: DocxWorkingCopy[]
  excelWorkingCopies?: ExcelWorkingCopy[]
  modelId?: string
}): Promise<{ hints: string[]; kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> }> {
  const hints: string[] = []
  let kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> = []

  const hasInlineAttachment = options.userContentBlocks?.some(
    (block) =>
      (block.type === 'file' && (block.content?.trim() || (block.visionPages && block.visionPages.length > 0))) ||
      (block.type === 'image' && block.blobHash?.trim()),
  )

  const docxBlocks =
    options.userContentBlocks?.filter(
      (block): block is Extract<ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isDocxMcpSourceFileBlock(block),
    ) ?? []
  const docxMcpEnabled =
    options.enableTools &&
    options.mcpServerIds.includes(DOCX_MCP_SERVER_ID) &&
    docxBlocks.length > 0

  const excelBlocks =
    options.userContentBlocks?.filter(
      (block): block is Extract<ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isExcelMcpSourceFileBlock(block),
    ) ?? []
  const excelMcpEnabled =
    options.enableTools &&
    options.mcpServerIds.includes(EXCEL_MCP_SERVER_ID) &&
    excelBlocks.length > 0

  if (docxMcpEnabled) {
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    const sourcePaths = docxBlocks
      .map((block) => `- 源文件 ${block.name}: ${resolveAttachmentReadPath(block)}`)
      .join('\n')
    const workingPaths =
      options.docxWorkingCopies
        ?.map((copy) => `- 修订版 ${copy.fileName}: ${copy.workingPath}`)
        .join('\n') ?? ''
    hints.push(
      [
        '## Word 文档（DOCX MCP · 结构化审查流水线）',
        '用户上传了 Word 文档并要求审查、修订并生成新文件。应用将按以下阶段自动执行：',
        '1. **准备修订版**：`.docx` 复制为工作目录副本；`.doc`/`.wps` 通过 LibreOffice 或 Microsoft Word 转换为 docx（不使用 textutil，以免破坏目录域）；纯文本兜底会丢失目录与格式',
        '2. **读取**：应用调用 read_document 读取修订版全文',
        '3. **审查**：内置审查 prompt 生成结构化 issue JSON 列表（含 anchor_text、comment、replace）',
        '4. **应用**：应用根据 issue 列表批量调用 replace_texts / edit_paragraphs / add_comments 写入修订版',
        '5. **总结**：向你输出审查摘要与修订版绝对路径',
        'docx-mcp-server **没有** save_document；编辑类工具直接写入 file_path。',
        '**禁止**提及 Toolman Office Skills、office-audit、toolman-office、`apply_semantic_diff_overlay` 等已移除能力。',
        sourcePaths,
        workingPaths ? `修订版文件：\n${workingPaths}` : '',
        `工作文件路径：${workdir}`,
        '你无需再自行调用 DOCX 工具；若需补充说明，仅总结审查结果并给出修订版完整绝对路径（纯文本，不要 Markdown 链接）。',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  if (excelMcpEnabled) {
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    const sourcePaths = excelBlocks
      .map((block) => `- 源文件 ${block.name}: ${resolveAttachmentReadPath(block)}`)
      .join('\n')
    const workingPaths =
      options.excelWorkingCopies
        ?.map((copy) => `- 修订版 ${copy.fileName}: ${copy.workingPath}`)
        .join('\n') ?? ''
    hints.push(
      [
        '## Excel 表格（Excel MCP · 结构化审查流水线）',
        '用户上传了 Excel 并要求审查、修订并生成新文件。应用将按以下阶段自动执行：',
        '1. **准备修订版**：复制为工作目录中的 `修订版_*.xlsx` 副本',
        '2. **读取**：应用调用 read_excel / review_excel 读取修订版',
        '3. **审查**：内置审查 prompt 生成结构化 issue JSON（含 sheet、cell、modify/highlight）',
        '4. **应用**：应用调用 modify_excel_cells / highlight_excel_cells 写入修订版',
        '5. **总结**：向你输出审查摘要；修订版下载链接由应用自动附上',
        '**禁止**模拟工具执行、禁止手写假下载链接、禁止编造未实际修改的内容。',
        sourcePaths,
        workingPaths ? `修订版文件：\n${workingPaths}` : '',
        `工作文件路径：${workdir}`,
        '你无需再自行调用 Excel 工具。',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  if (
    options.userContentBlocks?.some(
      (block) =>
        block.type === 'file' &&
        block.content?.trim() &&
        !(docxMcpEnabled && isDocxMcpSourceFileBlock(block)) &&
        !(excelMcpEnabled && isExcelMcpSourceFileBlock(block)),
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户消息中已附带文件正文（已解析并内联在消息里），请直接阅读其中的「### 附件」段落作答。',
        '不要告诉用户去上传文件或访问本地路径；不要调用文件系统、Python 等工具去重新读取或解析这些附件。',
      ].join('\n'),
    )
  } else if (
    options.userContentBlocks?.some(
      (block) => block.type === 'file' && block.visionPages && block.visionPages.length > 0,
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户已上传文档页面图片（见消息中的图片），请直接阅读图片内容作答。',
        '不要告诉用户去上传文件或访问本地路径。',
      ].join('\n'),
    )
  } else if (
    options.userContentBlocks?.some(
      (block) => block.type === 'image' && block.blobHash?.trim(),
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户消息中已附带图片，请结合图片内容作答。',
        '不要调用工具去重新读取图片文件。',
      ].join('\n'),
    )
  }

  if (options.enableTools) {
    hints.push(buildToolSystemHint(options.runtime.toolContext, options.mcpServerIds))
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    hints.push(
      [
        '## 工作目录',
        `当前工具工作目录：${workdir}`,
        '使用 fs_glob、fs_list、fs_read 等工具时，默认从此目录搜索文件。',
      ].join('\n'),
    )
  }

  const compactSystemHints = (() => {
    if (!options.modelId) return false
    const { providerId, model } = parseModelId(options.modelId)
    if (providerId !== 'ollama') return false
    return isGemmaThinkingOllamaModelId(model)
  })()

  const skillsHint = buildSkillsSystemHint(options.runtime.skillIds, {
    compact: compactSystemHints,
  })
  if (skillsHint) hints.push(skillsHint)

  const soul = loadSoulMd(options.runtime.toolContext.workingDirectory)
  if (soul) {
    hints.push(['## 身份设定（soul.md）', soul].join('\n\n'))
  }

  if (options.runtime.autonomousMode) {
    hints.push(buildAutonomousSystemHint())
  }

  if (!hasInlineAttachment && options.sendOptions?.memoryEnabled && options.runtime.workspaceId) {
    const memories = await listRelevantMemories(options.runtime.workspaceId, options.userText, {
      assistantId: options.runtime.assistantId,
      retentionDays: options.sendOptions.memoryRetentionDays,
    })
    const memoryHint = buildMemorySystemHint(memories)
    if (memoryHint) hints.push(memoryHint)
  }

  if (!hasInlineAttachment && options.sendOptions?.webSearchEnabled) {
    try {
      const result = await searchWeb(
        options.userText,
        options.sendOptions.webSearchProvider ?? 'duckduckgo',
      )
      hints.push(buildWebSearchSystemHint(result, options.userText))
    } catch (error) {
      hints.push(
        `## 网络搜索\n检索失败：${error instanceof Error ? error.message : '未知错误'}。请基于已有知识回答。`,
      )
    }
  }

  if (!hasInlineAttachment && options.sendOptions?.kbEnabled === true && options.runtime.workspaceId) {
    const kbIds = resolveEffectiveKbIds({
      workspaceId: options.runtime.workspaceId,
      assistant: options.assistant,
      overrideKbIds: options.sendOptions?.kbIds,
    })

    if (kbIds.length > 0) {
      try {
        const assistantParams = options.assistant
          ? (JSON.parse(options.assistant.parametersJson) as Record<string, unknown>)
          : {}
        const results = await searchKnowledgeForChat({
          workspaceId: options.runtime.workspaceId,
          kbIds,
          query: options.userText,
          topK:
            options.sendOptions?.kbTopK ??
            (assistantParams.kbTopK as number | undefined),
          scoreThreshold:
            options.sendOptions?.kbScoreThreshold ??
            (assistantParams.kbScoreThreshold as number | undefined),
          kbSettings: assistantParams.kbSettings as
            | Record<string, { topK?: number; scoreThreshold?: number }>
            | undefined,
        })
        kbResults = results
        const knowledgeHint = buildKnowledgeSystemHint(results, options.userText)
        if (knowledgeHint) hints.push(knowledgeHint)
      } catch (error) {
        hints.push(
          `## 知识库检索\n检索失败：${error instanceof Error ? error.message : '未知错误'}。请基于已有知识回答。`,
        )
      }
    }
  }

  return {
    hints: hints.filter((item) => item.trim().length > 0),
    kbResults,
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

function estimateTokenUsage(
  promptText: string,
  completionText: string,
): NonNullable<Message['tokenUsage']> {
  const prompt = Math.max(1, Math.ceil(promptText.length / 4))
  const completion = Math.max(1, Math.ceil(completionText.length / 4))
  return { prompt, completion, total: prompt + completion }
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
      console.warn(
        `[p2p] group proxy assistant without relay metadata: sessionId=${session.id} assistantId=${assistant.id}`,
      )
    }
  }

  const localDeviceId = getP2pDeviceInfo().deviceId
  const isGroupProxyClient =
    !isRelayExecution && proxyMeta && proxyMeta.permission === 'callable'

  if (isGroupProxyClient && proxyMeta) {
    console.log(
      `[p2p] group proxy send: sessionId=${data.sessionId} ownerDeviceId=${proxyMeta.ownerDeviceId} sourceSessionId=${proxyMeta.sourceSessionId} local=${proxyMeta.ownerDeviceId === localDeviceId}`,
    )
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

    if (session.title === '新对话' && session.messageCount === 0) {
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
      const errMessage = error instanceof Error ? error.message : '发送消息失败'
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

async function runGeneration(opts: {
  sessionId: string
  assistantMessageId: string
  userMessageId: string
  modelId: string
  assistant: ReturnType<typeof getAssistantRow>
  workspaceId: string
  userText: string
  userContentBlocks: ContentBlock[]
  enableTools: boolean
  mcpServerIds: string[]
  sendOptions?: {
    webSearchEnabled?: boolean
    webSearchProvider?: 'duckduckgo' | 'bing' | 'google'
    memoryEnabled?: boolean
    memoryRetentionDays?: number
    kbEnabled?: boolean
    kbIds?: string[]
    kbTopK?: number
    kbScoreThreshold?: number
    documentOcrEnabled?: boolean
    isHeartbeat?: boolean
    isChannelMessage?: boolean
  }
}) {
  const {
    sessionId,
    assistantMessageId,
    userMessageId,
    modelId,
    assistant,
    workspaceId,
    userText,
    userContentBlocks,
    enableTools,
    mcpServerIds,
    sendOptions,
  } = opts
  const messages = getMessageRepository()
  const controller = new AbortController()
  abortControllers.set(assistantMessageId, controller)
  const docxApprovalScopeKey = buildDocxMcpApprovalScopeKey(assistantMessageId)
  const excelApprovalScopeKey = buildExcelMcpApprovalScopeKey(assistantMessageId)
  const sessionApprovalScopeKey = buildSessionToolApprovalScopeKey(sessionId)

  const startedAt = Date.now()
  const buffers = new MessageStreamBuffers()
  let usage: Message['tokenUsage'] = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const persistBlocks = (immediate = false) => {
    const flush = () => {
      persistTimer = null
      messages.updateStreamBlocks(assistantMessageId, buffers.toContentBlocks())
    }

    if (immediate) {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      flush()
      return
    }

    if (persistTimer) return
    persistTimer = setTimeout(flush, 300)
  }

  const emitThinkingDelta = (text: string) => {
    emit({
      type: 'message.delta',
      sessionId,
      messageId: assistantMessageId,
      modelId,
      delta: { type: 'thinking', text },
      timestamp: Date.now(),
    })
  }

  const appendStatus = (text: string) => {
    buffers.appendStatus(text)
    persistBlocks()
    emitThinkingDelta(text)
  }

  const appendThinking = (text: string) => {
    buffers.appendThinking(text)
    persistBlocks()
    emitThinkingDelta(text)
  }

  const appendText = (text: string) => {
    buffers.appendText(text)
    persistBlocks()

    emit({
      type: 'message.delta',
      sessionId,
      messageId: assistantMessageId,
      modelId,
      delta: { type: 'text', text },
      timestamp: Date.now(),
    })
  }

  const emitToolUpdate = (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => {
    const delta = buffers.upsertTool(update)
    persistBlocks()
    emit({
      type: 'message.delta',
      sessionId,
      messageId: assistantMessageId,
      modelId,
      delta,
      timestamp: Date.now(),
    })
  }

  const emitThinkingDurationIfNeeded = () => {
    buffers.finalizeThinkingDuration()
    const thinkingDurationSeconds = buffers.getThinkingDurationSeconds()
    if (thinkingDurationSeconds === null) return
    emit({
      type: 'message.delta',
      sessionId,
      messageId: assistantMessageId,
      modelId,
      delta: { type: 'thinking', text: '', durationSeconds: thinkingDurationSeconds },
      timestamp: Date.now(),
    })
  }

  try {
    const { providerId, model } = parseModelId(modelId)
    const providerConfig = getProviderConfig(providerId)
    if (!providerConfig) {
      throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
    }

    let generationBlocks = userContentBlocks
    let generationText = userText

    if (contentBlocksNeedModelPrepare(userContentBlocks)) {
      appendStatus('正在准备附件并发送给模型…')
      try {
        generationBlocks = await withAbortSignal(
          prepareChatAttachmentsForModel({
            blocks: userContentBlocks,
            modelId,
            workspaceId,
            mcpServerIds,
            documentOcrEnabled: sendOptions?.documentOcrEnabled,
            signal: controller.signal,
            onStatus: (message) => {
              appendStatus(`${message}\n`)
            },
          }),
          controller.signal,
        )
        throwIfAborted(controller.signal)
        assertAttachmentContentResolved(generationBlocks, mcpServerIds)
        generationText = buildStoredUserContent(generationBlocks)
        messages.update(userMessageId, {
          content: generationText,
          contentBlocks: generationBlocks,
        })
      } catch (error) {
        if (isAbortError(error)) throw error
        const parseMessage = error instanceof Error ? error.message : '附件解析失败'
        const ipcError = {
          code: 'INTERNAL_ERROR' as const,
          message: parseMessage,
          retryable: true,
          details: {
            name: error instanceof Error ? error.name : 'AttachmentParseError',
            stack: error instanceof Error ? error.stack ?? '' : '',
          },
        }
        messages.update(assistantMessageId, {
          status: 'failed',
          contentBlocks: buffers.toContentBlocks(),
          error: ipcError,
        })
        emit({
          type: 'message.error',
          sessionId,
          messageId: assistantMessageId,
          error: ipcError,
          timestamp: Date.now(),
        })
        return
      }
    }

    throwIfAborted(controller.signal)

    const runtime = parseAssistantRuntime(assistant, workspaceId)
    runtime.toolContext.memoryEnabled = sendOptions?.memoryEnabled
    runtime.toolContext.mcpServerIds = mcpServerIds
    const effectivePermissionMode = sendOptions?.isHeartbeat
      ? 'full-auto'
      : runtime.effectivePermissionMode

    appendStatus('正在准备回复…\n')

    const docxBlocks = generationBlocks.filter(
      (block): block is Extract<ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isDocxMcpSourceFileBlock(block),
    )
    const docxTaskActive =
      enableTools &&
      mcpServerIds.includes(DOCX_MCP_SERVER_ID) &&
      docxBlocks.length > 0

    const excelBlocks = generationBlocks.filter(
      (block): block is Extract<ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isExcelMcpSourceFileBlock(block),
    )
    const excelTaskActive =
      enableTools &&
      mcpServerIds.includes(EXCEL_MCP_SERVER_ID) &&
      excelBlocks.length > 0

    let docxWorkingCopies: DocxWorkingCopy[] | undefined
    if (docxTaskActive) {
      appendStatus('正在连接 DOCX MCP Server…\n')
      await assertDocxMcpReady()
      const workdir = resolveWorkingDirectory(runtime.toolContext.workingDirectory)
      docxWorkingCopies = await prepareDocxWorkingCopies({
        workdir,
        sourcePaths: docxBlocks.map((block) => ({
          sourcePath: resolveAttachmentReadPath(block),
          fileName: block.name,
        })),
        onStatus: (message) => appendStatus(`${message}\n`),
      })
      appendStatus('修订版文档已就绪…\n')
    }

    let excelWorkingCopies: ExcelWorkingCopy[] | undefined
    if (excelTaskActive) {
      appendStatus('正在连接 Excel MCP Server…\n')
      await assertExcelMcpReady()
      const workdir = resolveWorkingDirectory(runtime.toolContext.workingDirectory)
      excelWorkingCopies = await prepareExcelWorkingCopies({
        workdir,
        sourcePaths: excelBlocks.map((block) => ({
          sourcePath: resolveAttachmentReadPath(block),
          fileName: block.name,
        })),
        onStatus: (message) => appendStatus(`${message}\n`),
      })
      appendStatus('修订版 Excel 已就绪…\n')
    }

    const { hints: runtimeHints, kbResults } = await withAbortSignal(
      buildRuntimeSystemHints({
        assistant,
        runtime,
        userText: generationText,
        userContentBlocks: generationBlocks,
        enableTools,
        mcpServerIds,
        sendOptions,
        docxWorkingCopies,
        excelWorkingCopies,
        modelId,
      }),
      controller.signal,
    )
    throwIfAborted(controller.signal)
    if (kbResults.length > 0) {
      buffers.setKbSources(
        kbResults.map((item) => ({
          documentTitle: item.documentTitle,
          kbName: item.kbName,
          score: item.score,
          text: item.text,
          sourcePath: item.sourcePath,
        })),
      )
      persistBlocks()
      emit({
        type: 'message.delta',
        sessionId,
        messageId: assistantMessageId,
        modelId,
        delta: {
          type: 'kb_sources',
          sources: kbResults.map((item) => ({
            documentTitle: item.documentTitle,
            kbName: item.kbName,
            score: item.score,
            text: item.text,
            sourcePath: item.sourcePath,
          })),
        },
        timestamp: Date.now(),
      })
    }
    const toolHint = runtimeHints.join('\n\n')
    assertProviderSupportsVisionInput(providerConfig, model, generationBlocks)
    const chatMessages = buildChatMessages(
      sessionId,
      assistant,
      generationBlocks,
      [assistantMessageId, userMessageId],
      toolHint,
    )
    let tools = enableTools
      ? await resolveToolDefinitions(mcpServerIds, {
          autonomousMode: runtime.autonomousMode,
          memoryEnabled: sendOptions?.memoryEnabled,
          localKnowledgeEnabled: sendOptions?.kbEnabled === true,
          notesEnabled: true,
        })
      : []

    if (docxTaskActive) {
      const docxTools = filterDocxMcpToolDefinitions(tools)
      if (docxTools.length === 0) {
        throw new DocxMcpNotReadyError('DOCX MCP Server 已连接，但未加载 Word 编辑工具')
      }
      tools = docxTools
    } else if (excelTaskActive) {
      const excelTools = filterExcelMcpToolDefinitions(tools)
      if (excelTools.length === 0) {
        throw new ExcelMcpNotReadyError('Excel MCP Server 已连接，但未加载 Excel 编辑工具')
      }
      tools = excelTools
    }

    if (docxTaskActive && (!enableTools || tools.length === 0)) {
      throw new DocxMcpNotReadyError('Word 文档任务需要 DOCX MCP 工具，但当前未启用任何工具')
    }
    if (excelTaskActive && (!enableTools || tools.length === 0)) {
      throw new ExcelMcpNotReadyError('Excel 表格任务需要 Excel MCP 工具，但当前未启用任何工具')
    }

    const preferGemmaOllamaStreamOnly =
      providerConfig.type === 'ollama' &&
      isGemmaThinkingOllamaModelId(model) &&
      !docxTaskActive &&
      !excelTaskActive

    if (!enableTools || tools.length === 0 || preferGemmaOllamaStreamOnly) {
      buffers.clearThinking()
      persistBlocks(true)
      await streamPlainCompletion({
        sessionId,
        assistantMessageId,
        modelId,
        providerConfig,
        model,
        chatMessages,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        signal: controller.signal,
        onText: appendText,
        onThinking: appendThinking,
        onUsage: (value) => {
          usage = value
        },
      })
    } else {
      if (docxTaskActive && docxWorkingCopies?.length) {
        appendStatus('正在读取 Word 文档…\n')
        await bootstrapDocxMcpRead({
          chatMessages,
          tools,
          workingCopies: docxWorkingCopies,
          toolContext: runtime.toolContext,
          emitToolUpdate,
        })

        if (effectivePermissionMode === 'normal') {
          appendStatus('等待 Word 文档编辑授权…\n')
          const batchApproval = await requestToolApproval({
            toolName: DOCX_MCP_BATCH_TOOL_NAME,
            arguments: buildDocxMcpBatchApprovalArgs(docxWorkingCopies),
          })
          if (!batchApproval.approved) {
            throw new Error(
              batchApproval.timedOut
                ? 'Word 文档编辑授权超时，请在弹出的授权窗口中点击「允许本次全部」'
                : '已取消 Word 文档编辑授权',
            )
          }
          grantToolApprovalScope(docxApprovalScopeKey)
        }

        appendStatus('正在执行结构化审查流水线…\n')
        const reviewResults = await runDocxStructuredReviewPipeline({
          chatMessages,
          tools,
          workingCopies: docxWorkingCopies,
          userRequest: generationText,
          providerConfig,
          model,
          toolContext: runtime.toolContext,
          temperature: runtime.temperature,
          maxTokens: runtime.maxTokens,
          signal: controller.signal,
          onStatus: appendStatus,
          emitToolUpdate,
        })

        for (const result of reviewResults) {
          appendText(formatDocxReviewReport(result))
        }
        buffers.setDocxReviewSummaries(reviewResults.map(buildDocxReviewSummaryBlock))
        persistBlocks(true)

        chatMessages.push({
          role: 'user',
          content: buildDocxFinalSummaryPrompt(reviewResults),
        })

        buffers.clearThinking()
        persistBlocks(true)
        await streamPlainCompletion({
          sessionId,
          assistantMessageId,
          modelId,
          providerConfig,
          model,
          chatMessages,
          temperature: runtime.temperature,
          maxTokens: runtime.maxTokens,
          signal: controller.signal,
          onText: appendText,
          onThinking: appendThinking,
          onUsage: (value) => {
            usage = value
          },
        })

        buffers.setLocalFileLinks(reviewResults.map((result) => result.workingPath))
        persistBlocks(true)
      } else if (excelTaskActive && excelWorkingCopies?.length) {
        appendStatus('正在读取 Excel 表格…\n')
        await bootstrapExcelMcpRead({
          chatMessages,
          tools,
          workingCopies: excelWorkingCopies,
          toolContext: runtime.toolContext,
          emitToolUpdate,
        })

        if (effectivePermissionMode === 'normal') {
          appendStatus('等待 Excel 编辑授权…\n')
          const batchApproval = await requestToolApproval({
            toolName: EXCEL_MCP_BATCH_TOOL_NAME,
            arguments: buildExcelMcpBatchApprovalArgs(excelWorkingCopies),
          })
          if (!batchApproval.approved) {
            throw new Error(
              batchApproval.timedOut
                ? 'Excel 编辑授权超时，请在弹出的授权窗口中点击「允许本次全部」'
                : '已取消 Excel 编辑授权',
            )
          }
          grantToolApprovalScope(excelApprovalScopeKey)
        }

        appendStatus('正在执行 Excel 结构化审查流水线…\n')
        const reviewResults = await runExcelStructuredReviewPipeline({
          chatMessages,
          tools,
          workingCopies: excelWorkingCopies,
          userRequest: generationText,
          providerConfig,
          model,
          toolContext: runtime.toolContext,
          temperature: runtime.temperature,
          maxTokens: runtime.maxTokens,
          signal: controller.signal,
          onStatus: appendStatus,
          emitToolUpdate,
        })

        for (const result of reviewResults) {
          appendText(formatExcelReviewReport(result))
        }
        buffers.setDocxReviewSummaries(reviewResults.map(buildExcelReviewSummaryBlock))
        persistBlocks(true)

        chatMessages.push({
          role: 'user',
          content: buildExcelFinalSummaryPrompt(reviewResults),
        })

        buffers.clearThinking()
        persistBlocks(true)
        await streamPlainCompletion({
          sessionId,
          assistantMessageId,
          modelId,
          providerConfig,
          model,
          chatMessages,
          temperature: runtime.temperature,
          maxTokens: runtime.maxTokens,
          signal: controller.signal,
          onText: appendText,
          onThinking: appendThinking,
          onUsage: (value) => {
            usage = value
          },
        })

        buffers.setLocalFileLinks(reviewResults.map((result) => result.workingPath))
        persistBlocks(true)
      } else {
      try {
        let round = 0
        let hitToolRoundLimit = false
        while (round < runtime.sessionRoundLimit) {
          const completion = await gateway.chatComplete(providerConfig, {
            model,
            messages: chatMessages,
            tools,
            temperature: runtime.temperature,
            maxTokens: runtime.maxTokens,
            signal: controller.signal,
          })

          if (completion.usage) {
            usage = {
              prompt: completion.usage.prompt,
              completion: completion.usage.completion,
              total: completion.usage.total,
            }
          }

          if (completion.toolCalls.length > 0) {
            chatMessages.push({
              role: 'assistant',
              content: completion.content || '',
              tool_calls: completion.toolCalls,
            })

            for (const call of completion.toolCalls) {
              let sqlStatement: string | undefined
              try {
                const parsed = JSON.parse(call.arguments) as { sql?: string }
                sqlStatement = typeof parsed.sql === 'string' ? parsed.sql : undefined
              } catch {
                sqlStatement = undefined
              }

              emitToolUpdate({
                toolCallId: call.id,
                name: call.name,
                arguments: call.arguments?.trim() || undefined,
                status: 'running',
              })

              const permission = evaluateToolPermission({
                toolName: call.name,
                permissionMode: runtime.permissionMode,
                toolStates: runtime.toolStates,
                sqlStatement,
                autonomousMode: runtime.autonomousMode,
              })

              let result: string
              if (!permission.allowed && permission.requiresApproval) {
                const skipApproval =
                  hasToolApprovalScope(sessionApprovalScopeKey) &&
                  !(runtime.autonomousMode && isDeleteTool(call.name))

                if (skipApproval) {
                  try {
                    result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
                  } catch (error) {
                    result = `Error: ${error instanceof Error ? error.message : '工具执行失败'}`
                  }
                } else {
                  const approval = await requestToolApproval({
                    toolName: call.name,
                    arguments: call.arguments,
                  })
                  if (!approval.approved) {
                    result = approval.timedOut
                      ? 'Error: 工具调用授权超时，请在弹出的「工具调用授权」窗口中点击允许'
                      : 'Error: 用户拒绝了工具调用'
                  } else {
                    if (!runtime.autonomousMode || !isDeleteTool(call.name)) {
                      grantToolApprovalScope(sessionApprovalScopeKey)
                    }
                    try {
                      result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
                    } catch (error) {
                      result = `Error: ${error instanceof Error ? error.message : '工具执行失败'}`
                    }
                  }
                }
              } else if (!permission.allowed) {
                result = `Error: ${permission.reason}`
              } else {
                try {
                  result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
                } catch (error) {
                  result = `Error: ${error instanceof Error ? error.message : '工具执行失败'}`
                }
              }

              chatMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: result,
              })

              const listTools = new Set([
                'fs_list',
                'fs_glob',
                'fs_grep',
                'glob',
                'grep',
                'bash',
                'sql_list_tables',
                'memory_list',
                'agent_task_list',
              ])
              const shortToolName = call.name.startsWith('mcp__')
                ? (call.name.split('__').pop() ?? call.name)
                : call.name
              const displayLimit = listTools.has(shortToolName) ? 12000 : 800
              const snippet =
                result.length > displayLimit ? `${result.slice(0, displayLimit)}…` : result
              emitToolUpdate({
                toolCallId: call.id,
                name: call.name,
                arguments: call.arguments?.trim() || undefined,
                result: snippet,
                status: result.startsWith('Error:') ? 'failed' : 'done',
              })
            }

            round += 1
            if (round >= runtime.sessionRoundLimit) {
              hitToolRoundLimit = true
            }
            continue
          }

          buffers.clearThinking()
          persistBlocks(true)
          await streamPlainCompletion({
            sessionId,
            assistantMessageId,
            modelId,
            providerConfig,
            model,
            chatMessages,
            temperature: runtime.temperature,
            maxTokens: runtime.maxTokens,
            signal: controller.signal,
            onText: appendText,
            onThinking: appendThinking,
            onUsage: (value) => {
              usage = value
            },
          })
          break
        }

        if (hitToolRoundLimit) {
          appendText(
            `\n\n⚠️ 已达到工具调用轮次上限（${runtime.sessionRoundLimit} 轮），已停止继续调用工具。可在智能体设置中调高「会话轮次上限」。`,
          )
        }
      } catch (toolError) {
        if (toolError instanceof ProviderError) {
          buffers.clearThinking()
          persistBlocks(true)
          await streamPlainCompletion({
            sessionId,
            assistantMessageId,
            modelId,
            providerConfig,
            model,
            chatMessages,
            temperature: runtime.temperature,
            maxTokens: runtime.maxTokens,
            signal: controller.signal,
            onText: appendText,
            onThinking: appendThinking,
            onUsage: (value) => {
              usage = value
            },
          })
        } else {
          throw toolError
        }
      }
      }
    }

    if (isOcrVisionModelId(model) && buffers.promoteThinkingToText()) {
      persistBlocks(true)
      emit({
        type: 'message.delta',
        sessionId,
        messageId: assistantMessageId,
        modelId,
        delta: { type: 'text', text: buffers.plainText() },
        timestamp: Date.now(),
      })
    }

    if (!usage) {
      const promptText = chatMessages.map((m) => m.content).join('\n')
      usage = estimateTokenUsage(promptText, buffers.plainText())
    }

    emitThinkingDurationIfNeeded()
    persistBlocks(true)

    messages.update(assistantMessageId, {
      status: 'completed',
      tokenUsage: usage,
      contentBlocks: buffers.toContentBlocks(),
    })

    emit({
      type: 'message.done',
      sessionId,
      messageId: assistantMessageId,
      tokenUsage: usage,
      contentBlocks: buffers.toContentBlocks(),
      timestamp: Date.now(),
    })

    if (
      sendOptions?.memoryEnabled &&
      !sendOptions.isHeartbeat &&
      !sendOptions.isChannelMessage
    ) {
      void extractMemoriesFromConversation({
        workspaceId,
        sessionId,
        assistantId: assistant?.id,
        modelId,
      }).catch((error) => {
        console.error('[memory-extractor] failed', error)
      })
    }
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError'
    const message = error instanceof Error ? error.message : 'Unknown error'
    const ipcError = {
      code: isAbort ? ('ABORTED' as const) : ('PROVIDER_ERROR' as const),
      message,
      retryable: error instanceof ProviderError ? error.retryable : false,
      details:
        error instanceof Error
          ? { name: error.name, stack: error.stack ?? '' }
          : undefined,
    }

    emitThinkingDurationIfNeeded()
    persistBlocks(true)

    messages.update(assistantMessageId, {
      status: isAbort ? 'aborted' : 'failed',
      content: buffers.plainText(),
      contentBlocks: buffers.toContentBlocks(),
      error: ipcError,
    })

    emit({
      type: 'message.error',
      sessionId,
      messageId: assistantMessageId,
      error: ipcError,
      timestamp: startedAt,
    })
  } finally {
    clearToolApprovalScope(docxApprovalScopeKey)
    clearToolApprovalScope(excelApprovalScopeKey)
    abortControllers.delete(assistantMessageId)
  }
}

async function streamPlainCompletion(opts: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: ReturnType<typeof getProviderConfig>
  model: string
  chatMessages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal: AbortSignal
  onText: (text: string) => void
  onThinking?: (text: string) => void
  onUsage: (usage: Message['tokenUsage']) => void
}) {
  if (!opts.providerConfig) {
    throw new ProviderError('Provider 配置无效')
  }

  for await (const chunk of gateway.chatStream(opts.providerConfig, {
    model: opts.model,
    messages: opts.chatMessages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  })) {
    if (chunk.type === 'reasoning-delta' && chunk.text) {
      opts.onThinking?.(chunk.text)
    }
    if (chunk.type === 'text-delta' && chunk.text) {
      opts.onText(chunk.text)
    }
    if (chunk.type === 'done' && chunk.usage) {
      opts.onUsage({
        prompt: chunk.usage.prompt,
        completion: chunk.usage.completion,
        total: chunk.usage.total,
      })
    }
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
