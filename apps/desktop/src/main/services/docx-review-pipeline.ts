import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'

import type { DocxWorkingCopy } from './docx-mcp-task.service'
import type { ToolExecutionContext } from './tool-executor.service'
import { applyDocxReviewIssues } from './docx-review-apply'
import type { DocxReviewToolUpdate } from './docx-review-apply-types'
import {
  buildIsolatedDocxAuditMessages,
  resolveDocxReadDocumentContent,
} from './docx-review-markdown'
import { parseDocxReviewIssues } from './docx-review-parsers'
import type { DocxReviewApplyResult, DocxReviewIssue } from './docx-review-types'

const gateway = createModelGateway()

async function runDocxAuditPass(options: {
  chatMessages: ChatMessage[]
  providerConfig: ProviderConfig
  model: string
  userRequest: string
  workingCopy: DocxWorkingCopy
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  retryHint?: string
}): Promise<{ issues: DocxReviewIssue[]; warnings: string[]; raw: string }> {
  const documentContent = resolveDocxReadDocumentContent(
    options.chatMessages,
    options.workingCopy.workingPath,
  )
  if (!documentContent?.trim()) {
    return {
      issues: [],
      warnings: ['未找到 read_document 输出，跳过审查'],
      raw: '',
    }
  }

  const auditMessages = buildIsolatedDocxAuditMessages({
    userRequest: options.userRequest,
    workingCopy: options.workingCopy,
    documentContent,
    retryHint: options.retryHint,
  })

  const completion = await gateway.chatComplete(options.providerConfig, {
    model: options.model,
    messages: auditMessages,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 8192,
    signal: options.signal,
  })

  const { issues, warnings } = parseDocxReviewIssues(completion.content)
  return { issues, warnings, raw: completion.content }
}

export async function runDocxStructuredReviewPipeline(options: {
  chatMessages: ChatMessage[]
  tools: ToolDefinition[]
  workingCopies: DocxWorkingCopy[]
  userRequest: string
  providerConfig: ProviderConfig
  model: string
  toolContext: ToolExecutionContext
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onStatus?: (message: string) => void
  emitToolUpdate: (update: DocxReviewToolUpdate) => void
}): Promise<DocxReviewApplyResult[]> {
  const results: DocxReviewApplyResult[] = []

  for (const workingCopy of options.workingCopies) {
    options.onStatus?.(`正在审查「${workingCopy.fileName}」并生成 issue 列表…\n`)

    let audit = await runDocxAuditPass({
      chatMessages: options.chatMessages,
      providerConfig: options.providerConfig,
      model: options.model,
      userRequest: options.userRequest,
      workingCopy,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      signal: options.signal,
    })

    if (audit.issues.length === 0) {
      options.onStatus?.(`首次审查未解析到 issue，正在重试…\n`)
      audit = await runDocxAuditPass({
        chatMessages: options.chatMessages,
        providerConfig: options.providerConfig,
        model: options.model,
        userRequest: options.userRequest,
        workingCopy,
        temperature: 0.1,
        maxTokens: options.maxTokens,
        signal: options.signal,
        retryHint:
          '上次输出无法解析。请仅输出 JSON 数组（不要 Markdown 代码块），每项包含 id、severity、category、action、anchor_text；comment 用于纯批注；replace 需 replacement；edit_paragraph 需 paragraph_index 与 replacement，且仅在用户明确要求整段重写/列表化/重组段落时使用，否则优先 replace。',
      })
    }

    options.onStatus?.(
      `「${workingCopy.fileName}」识别 ${audit.issues.length} 项问题，正在写入替换、段落修订与批注…\n`,
    )

    const applied = await applyDocxReviewIssues({
      issues: audit.issues,
      workingCopy,
      tools: options.tools,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
    })

    results.push({
      fileName: workingCopy.fileName,
      workingPath: workingCopy.workingPath,
      issues: audit.issues,
      parseWarnings: audit.warnings,
      conversionMethod: workingCopy.conversionMethod,
      ...applied,
    })
  }

  return results
}
