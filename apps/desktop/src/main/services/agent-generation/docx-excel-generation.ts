import type { ChatMessage } from '@toolman/model-gateway'
import type { Message } from '@toolman/shared'
import type { parseAssistantRuntime } from '../agent.service'
import {
  bootstrapDocxMcpRead,
  buildDocxMcpBatchApprovalArgs,
  DOCX_MCP_BATCH_TOOL_NAME,
  type DocxWorkingCopy,
} from '../docx-mcp-task.service'
import {
  bootstrapExcelMcpRead,
  buildExcelMcpBatchApprovalArgs,
  EXCEL_MCP_BATCH_TOOL_NAME,
  type ExcelWorkingCopy,
} from '../excel-mcp-task.service'
import {
  buildDocxFinalSummaryPrompt,
  buildDocxReviewSummaryBlock,
  formatDocxReviewReport,
  runDocxStructuredReviewPipeline,
} from '../docx-review.service'
import {
  buildExcelFinalSummaryPrompt,
  buildExcelReviewSummaryBlock,
  formatExcelReviewReport,
  runExcelStructuredReviewPipeline,
} from '../excel-review.service'
import {
  requestToolApproval,
  grantToolApprovalScope,
} from '../tool-approval.service'
import type { getProviderConfig } from '../provider.service'
import type { GenerationStreamContext } from './types'
import { streamPlainCompletion } from './stream-completion'

type ToolDefinitions = Awaited<ReturnType<typeof import('../tool-registry').resolveToolDefinitions>>

export async function runDocxReviewGeneration(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  model: string
  chatMessages: ChatMessage[]
  tools: ToolDefinitions
  workingCopies: DocxWorkingCopy[]
  generationText: string
  runtime: ReturnType<typeof parseAssistantRuntime>
  effectivePermissionMode: string
  docxApprovalScopeKey: string
  signal: AbortSignal
  stream: GenerationStreamContext
  onUsage: (usage: Message['tokenUsage']) => void
}): Promise<void> {
  const { stream, runtime } = options

  stream.appendStatus('正在读取 Word 文档…\n')
  await bootstrapDocxMcpRead({
    chatMessages: options.chatMessages,
    tools: options.tools,
    workingCopies: options.workingCopies,
    toolContext: runtime.toolContext,
    emitToolUpdate: stream.emitToolUpdate,
  })

  if (options.effectivePermissionMode === 'normal') {
    stream.appendStatus('等待 Word 文档编辑授权…\n')
    const batchApproval = await requestToolApproval({
      toolName: DOCX_MCP_BATCH_TOOL_NAME,
      arguments: buildDocxMcpBatchApprovalArgs(options.workingCopies),
    })
    if (!batchApproval.approved) {
      throw new Error(
        batchApproval.timedOut
          ? 'Word 文档编辑授权超时，请在弹出的授权窗口中点击「允许本次全部」'
          : '已取消 Word 文档编辑授权',
      )
    }
    grantToolApprovalScope(options.docxApprovalScopeKey)
  }

  stream.appendStatus('正在执行结构化审查流水线…\n')
  const reviewResults = await runDocxStructuredReviewPipeline({
    chatMessages: options.chatMessages,
    tools: options.tools,
    workingCopies: options.workingCopies,
    userRequest: options.generationText,
    providerConfig: options.providerConfig,
    model: options.model,
    toolContext: runtime.toolContext,
    temperature: runtime.temperature,
    maxTokens: runtime.maxTokens,
    signal: options.signal,
    onStatus: stream.appendStatus,
    emitToolUpdate: stream.emitToolUpdate,
  })

  for (const result of reviewResults) {
    stream.appendText(formatDocxReviewReport(result))
  }
  stream.buffers.setDocxReviewSummaries(reviewResults.map(buildDocxReviewSummaryBlock))
  stream.persistBlocks(true)

  options.chatMessages.push({
    role: 'user',
    content: buildDocxFinalSummaryPrompt(reviewResults),
  })

  stream.buffers.clearThinking()
  stream.persistBlocks(true)
  await streamPlainCompletion({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    modelId: options.modelId,
    providerConfig: options.providerConfig,
    model: options.model,
    chatMessages: options.chatMessages,
    temperature: runtime.temperature,
    maxTokens: runtime.maxTokens,
    signal: options.signal,
    onText: stream.appendText,
    onThinking: stream.appendThinking,
    onUsage: options.onUsage,
  })

  stream.buffers.setLocalFileLinks(reviewResults.map((result) => result.workingPath))
  stream.persistBlocks(true)
}

export async function runExcelReviewGeneration(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  model: string
  chatMessages: ChatMessage[]
  tools: ToolDefinitions
  workingCopies: ExcelWorkingCopy[]
  generationText: string
  runtime: ReturnType<typeof parseAssistantRuntime>
  effectivePermissionMode: string
  excelApprovalScopeKey: string
  signal: AbortSignal
  stream: GenerationStreamContext
  onUsage: (usage: Message['tokenUsage']) => void
}): Promise<void> {
  const { stream, runtime } = options

  stream.appendStatus('正在读取 Excel 表格…\n')
  await bootstrapExcelMcpRead({
    chatMessages: options.chatMessages,
    tools: options.tools,
    workingCopies: options.workingCopies,
    toolContext: runtime.toolContext,
    emitToolUpdate: stream.emitToolUpdate,
  })

  if (options.effectivePermissionMode === 'normal') {
    stream.appendStatus('等待 Excel 编辑授权…\n')
    const batchApproval = await requestToolApproval({
      toolName: EXCEL_MCP_BATCH_TOOL_NAME,
      arguments: buildExcelMcpBatchApprovalArgs(options.workingCopies),
    })
    if (!batchApproval.approved) {
      throw new Error(
        batchApproval.timedOut
          ? 'Excel 编辑授权超时，请在弹出的授权窗口中点击「允许本次全部」'
          : '已取消 Excel 编辑授权',
      )
    }
    grantToolApprovalScope(options.excelApprovalScopeKey)
  }

  stream.appendStatus('正在执行 Excel 结构化审查流水线…\n')
  const reviewResults = await runExcelStructuredReviewPipeline({
    chatMessages: options.chatMessages,
    tools: options.tools,
    workingCopies: options.workingCopies,
    userRequest: options.generationText,
    providerConfig: options.providerConfig,
    model: options.model,
    toolContext: runtime.toolContext,
    temperature: runtime.temperature,
    maxTokens: runtime.maxTokens,
    signal: options.signal,
    onStatus: stream.appendStatus,
    emitToolUpdate: stream.emitToolUpdate,
  })

  for (const result of reviewResults) {
    stream.appendText(formatExcelReviewReport(result))
  }
  stream.buffers.setDocxReviewSummaries(reviewResults.map(buildExcelReviewSummaryBlock))
  stream.persistBlocks(true)

  options.chatMessages.push({
    role: 'user',
    content: buildExcelFinalSummaryPrompt(reviewResults),
  })

  stream.buffers.clearThinking()
  stream.persistBlocks(true)
  await streamPlainCompletion({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    modelId: options.modelId,
    providerConfig: options.providerConfig,
    model: options.model,
    chatMessages: options.chatMessages,
    temperature: runtime.temperature,
    maxTokens: runtime.maxTokens,
    signal: options.signal,
    onText: stream.appendText,
    onThinking: stream.appendThinking,
    onUsage: options.onUsage,
  })

  stream.buffers.setLocalFileLinks(reviewResults.map((result) => result.workingPath))
  stream.persistBlocks(true)
}
