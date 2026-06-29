import type { ChatMessage } from '@toolman/model-gateway'
import type { Message } from '@toolman/shared'
import type { parseAssistantRuntime } from '../agent.service'
import type { getProviderConfig } from '../provider.service'
import { resolveToolDefinitions } from '../tool-registry'
import { runDocxReviewGeneration, runExcelReviewGeneration } from './docx-excel-generation'
import { streamPlainCompletion } from './stream-completion'
import { runToolLoop } from './tool-loop'
import type { GenerationStreamContext } from './types'

export async function executeGenerationStrategy(options: {
  enableTools: boolean
  tools: Awaited<ReturnType<typeof resolveToolDefinitions>>
  preferGemmaOllamaStreamOnly: boolean
  docxTaskActive: boolean
  excelTaskActive: boolean
  docxWorkingCopies?: Awaited<ReturnType<typeof import('../docx-mcp-task.service').prepareDocxWorkingCopies>>
  excelWorkingCopies?: Awaited<ReturnType<typeof import('../excel-mcp-task.service').prepareExcelWorkingCopies>>
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  model: string
  chatMessages: ChatMessage[]
  generationText: string
  runtime: ReturnType<typeof parseAssistantRuntime>
  effectivePermissionMode: string
  docxApprovalScopeKey: string
  excelApprovalScopeKey: string
  sessionApprovalScopeKey: string
  signal: AbortSignal
  stream: GenerationStreamContext
  onUsage: (usage: Message['tokenUsage']) => void
}): Promise<void> {
  const { stream, runtime } = options

  if (!options.enableTools || options.tools.length === 0 || options.preferGemmaOllamaStreamOnly) {
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
    return
  }

  if (options.docxTaskActive && options.docxWorkingCopies?.length) {
    await runDocxReviewGeneration({
      sessionId: options.sessionId,
      assistantMessageId: options.assistantMessageId,
      modelId: options.modelId,
      providerConfig: options.providerConfig,
      model: options.model,
      chatMessages: options.chatMessages,
      tools: options.tools,
      workingCopies: options.docxWorkingCopies,
      generationText: options.generationText,
      runtime,
      effectivePermissionMode: options.effectivePermissionMode,
      docxApprovalScopeKey: options.docxApprovalScopeKey,
      signal: options.signal,
      stream,
      onUsage: options.onUsage,
    })
    return
  }

  if (options.excelTaskActive && options.excelWorkingCopies?.length) {
    await runExcelReviewGeneration({
      sessionId: options.sessionId,
      assistantMessageId: options.assistantMessageId,
      modelId: options.modelId,
      providerConfig: options.providerConfig,
      model: options.model,
      chatMessages: options.chatMessages,
      tools: options.tools,
      workingCopies: options.excelWorkingCopies,
      generationText: options.generationText,
      runtime,
      effectivePermissionMode: options.effectivePermissionMode,
      excelApprovalScopeKey: options.excelApprovalScopeKey,
      signal: options.signal,
      stream,
      onUsage: options.onUsage,
    })
    return
  }

  await runToolLoop({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    modelId: options.modelId,
    providerConfig: options.providerConfig,
    model: options.model,
    chatMessages: options.chatMessages,
    tools: options.tools,
    runtime,
    effectivePermissionMode: options.effectivePermissionMode,
    sessionApprovalScopeKey: options.sessionApprovalScopeKey,
    signal: options.signal,
    stream,
    onUsage: options.onUsage,
  })
}
