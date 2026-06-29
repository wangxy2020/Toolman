import type { ContentBlock, Message } from '@toolman/shared'
import { parseAssistantRuntime } from '../agent.service'
import {
  buildDocxMcpApprovalScopeKey,
  DocxMcpNotReadyError,
  filterDocxMcpToolDefinitions,
} from '../docx-mcp-task.service'
import {
  buildExcelMcpApprovalScopeKey,
  ExcelMcpNotReadyError,
  filterExcelMcpToolDefinitions,
} from '../excel-mcp-task.service'
import {
  buildSessionToolApprovalScopeKey,
  clearToolApprovalScope,
} from '../tool-approval.service'
import { resolveToolDefinitions } from '../tool-registry'
import { getProviderConfig, parseModelId } from '../provider.service'
import { ProviderError, isGemmaThinkingOllamaModelId } from '@toolman/model-gateway'
import { throwIfAborted, withAbortSignal } from '../../utils/abort-signal'
import { prepareGenerationAttachments } from './attachment-prepare'
import {
  assertProviderSupportsVisionInput,
  buildChatMessages,
} from './chat-messages'
import { finalizeSuccessfulGeneration, handleGenerationFailure } from './generation-completion'
import { executeGenerationStrategy } from './generation-strategy'
import { buildRuntimeSystemHints } from './system-hints'
import { createGenerationStreamContext } from './stream-context'
import { emitStreamEvent } from './emit'
import type { RunGenerationOptions } from './types'
import { prepareGenerationWorkingCopies } from './working-copies'

export async function runGeneration(opts: RunGenerationOptions): Promise<void> {
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
    abortControllers,
    sendOptions,
  } = opts

  const controller = new AbortController()
  abortControllers.set(assistantMessageId, controller)
  const docxApprovalScopeKey = buildDocxMcpApprovalScopeKey(assistantMessageId)
  const excelApprovalScopeKey = buildExcelMcpApprovalScopeKey(assistantMessageId)
  const sessionApprovalScopeKey = buildSessionToolApprovalScopeKey(sessionId)

  const startedAt = Date.now()
  const stream = createGenerationStreamContext({ sessionId, assistantMessageId, modelId })
  let usage: Message['tokenUsage'] = null
  const onUsage = (value: Message['tokenUsage']) => {
    usage = value
  }

  try {
    const { providerId, model } = parseModelId(modelId)
    const providerConfig = getProviderConfig(providerId)
    if (!providerConfig) {
      throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
    }

    let generationBlocks: ContentBlock[] = userContentBlocks
    let generationText = userText

    const attachmentResult = await prepareGenerationAttachments({
      userContentBlocks,
      userMessageId,
      modelId,
      workspaceId,
      mcpServerIds,
      documentOcrEnabled: sendOptions?.documentOcrEnabled,
      signal: controller.signal,
      stream,
      sessionId,
      assistantMessageId,
    })
    if (attachmentResult?.ok === false) return
    if (attachmentResult?.ok) {
      generationBlocks = attachmentResult.generationBlocks
      generationText = attachmentResult.generationText
    }

    throwIfAborted(controller.signal)

    const runtime = parseAssistantRuntime(assistant, workspaceId)
    runtime.toolContext.memoryEnabled = sendOptions?.memoryEnabled
    runtime.toolContext.mcpServerIds = mcpServerIds
    const effectivePermissionMode = sendOptions?.isHeartbeat
      ? 'full-auto'
      : runtime.effectivePermissionMode

    stream.appendStatus('正在准备回复…\n')

    const workingCopies = await prepareGenerationWorkingCopies({
      generationBlocks,
      enableTools,
      mcpServerIds,
      runtime,
      stream,
    })

    const { hints: runtimeHints, kbResults } = await withAbortSignal(
      buildRuntimeSystemHints({
        assistant,
        runtime,
        userText: generationText,
        userContentBlocks: generationBlocks,
        enableTools,
        mcpServerIds,
        sendOptions,
        docxWorkingCopies: workingCopies.docxWorkingCopies,
        excelWorkingCopies: workingCopies.excelWorkingCopies,
        modelId,
      }),
      controller.signal,
    )
    throwIfAborted(controller.signal)

    if (kbResults.length > 0) {
      stream.buffers.setKbSources(
        kbResults.map((item) => ({
          documentTitle: item.documentTitle,
          kbName: item.kbName,
          score: item.score,
          text: item.text,
          sourcePath: item.sourcePath,
        })),
      )
      stream.persistBlocks()
      emitStreamEvent({
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

    const { docxTaskActive, excelTaskActive } = workingCopies
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

    await executeGenerationStrategy({
      enableTools,
      tools,
      preferGemmaOllamaStreamOnly,
      docxTaskActive,
      excelTaskActive,
      docxWorkingCopies: workingCopies.docxWorkingCopies,
      excelWorkingCopies: workingCopies.excelWorkingCopies,
      sessionId,
      assistantMessageId,
      modelId,
      providerConfig,
      model,
      chatMessages,
      generationText,
      runtime,
      effectivePermissionMode,
      docxApprovalScopeKey,
      excelApprovalScopeKey,
      sessionApprovalScopeKey,
      signal: controller.signal,
      stream,
      onUsage,
    })

    finalizeSuccessfulGeneration({
      sessionId,
      assistantMessageId,
      modelId,
      model,
      workspaceId,
      assistant,
      chatMessages,
      sendOptions,
      stream,
      usage,
    })
  } catch (error) {
    handleGenerationFailure({
      error,
      sessionId,
      assistantMessageId,
      startedAt,
      stream,
    })
  } finally {
    clearToolApprovalScope(docxApprovalScopeKey)
    clearToolApprovalScope(excelApprovalScopeKey)
    abortControllers.delete(assistantMessageId)
  }
}
