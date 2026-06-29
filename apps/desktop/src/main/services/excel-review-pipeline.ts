import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'

import type { ExcelWorkingCopy } from './excel-mcp-task.service'
import { applyExcelReviewIssues } from './excel-review-apply'
import { normalizeExcelReviewIssues } from './excel-review-cell-normalize'
import { parseExcelReviewIssues } from './excel-review-parsers'
import {
  buildExcelAuditSystemPrompt,
  buildExcelAuditUserMessage,
} from './excel-review-prompts'
import {
  type ExcelReviewApplyResult,
  type ExcelReviewIssue,
  requestsExcelDirectFix,
} from './excel-review-types'
import { type ToolExecutionContext } from './tool-executor.service'

const gateway = createModelGateway()

async function runExcelAuditPass(options: {
  chatMessages: ChatMessage[]
  providerConfig: ProviderConfig
  model: string
  userRequest: string
  workingCopy: ExcelWorkingCopy
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  extraUserHint?: string
}): Promise<{ issues: ExcelReviewIssue[]; warnings: string[]; raw: string }> {
  const auditMessages: ChatMessage[] = [
    { role: 'system', content: buildExcelAuditSystemPrompt({ userRequest: options.userRequest }) },
    ...options.chatMessages,
    {
      role: 'user',
      content: [
        buildExcelAuditUserMessage({
          userRequest: options.userRequest,
          workingPath: options.workingCopy.workingPath,
          fileName: options.workingCopy.fileName,
          snapshot: options.workingCopy.readSnapshot,
        }),
        options.extraUserHint,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ]

  const completion = await gateway.chatComplete(options.providerConfig, {
    model: options.model,
    messages: auditMessages,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 8192,
    signal: options.signal,
  })

  const { issues, warnings } = parseExcelReviewIssues(completion.content)
  const normalized = normalizeExcelReviewIssues(issues, {
    userRequest: options.userRequest,
    snapshot: options.workingCopy.readSnapshot,
  })
  return { issues: normalized, warnings, raw: completion.content }
}

export async function runExcelStructuredReviewPipeline(options: {
  chatMessages: ChatMessage[]
  tools: ToolDefinition[]
  workingCopies: ExcelWorkingCopy[]
  userRequest: string
  providerConfig: ProviderConfig
  model: string
  toolContext: ToolExecutionContext
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onStatus?: (message: string) => void
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<ExcelReviewApplyResult[]> {
  const results: ExcelReviewApplyResult[] = []

  for (const workingCopy of options.workingCopies) {
    options.onStatus?.(`正在审查「${workingCopy.fileName}」并生成 issue 列表…\n`)

    let audit = await runExcelAuditPass({
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
      audit = await runExcelAuditPass({
        chatMessages: [
          ...options.chatMessages,
          { role: 'assistant', content: audit.raw },
          {
            role: 'user',
            content:
              '上次输出无法解析。请仅输出 JSON 数组，每项含 id、severity、category、action、sheet、cell；modify 需 value；highlight 需 comment。',
          },
        ],
        providerConfig: options.providerConfig,
        model: options.model,
        userRequest: options.userRequest,
        workingCopy,
        temperature: 0.1,
        maxTokens: options.maxTokens,
        signal: options.signal,
      })
    }

    const needsModifyRetry =
      requestsExcelDirectFix(options.userRequest) &&
      audit.issues.length > 0 &&
      audit.issues.every((issue) => issue.action === 'highlight') &&
      audit.issues.some(
        (issue) =>
          issue.category === 'error' ||
          issue.severity === 'high' ||
          /金额|大写|不符|留空|SAY U\.S\. DOLLARS/i.test(issue.comment ?? ''),
      )

    if (needsModifyRetry) {
      options.onStatus?.(`识别到应直接修正的问题，正在生成 modify 修订项…\n`)
      audit = await runExcelAuditPass({
        chatMessages: [
          ...options.chatMessages,
          { role: 'assistant', content: audit.raw },
        ],
        providerConfig: options.providerConfig,
        model: options.model,
        userRequest: options.userRequest,
        workingCopy,
        temperature: 0.15,
        maxTokens: options.maxTokens,
        signal: options.signal,
        extraUserHint: [
          '上次输出全部使用了 highlight，但用户要求生成修订版并修正错误。',
          '请重新输出 JSON 数组：',
          '- 金额大写与合计不符、错别字、应填项留空等可确定正确值的项 → action=modify，value 为完整替换文本（金额大写须为 SAY U.S. DOLLARS ... ONLY 整句）',
          '- modify 可同时填写 comment 说明修改理由',
          '- 仅无法确定替换内容的项保留 highlight',
        ].join('\n'),
      })
    }

    options.onStatus?.(
      `「${workingCopy.fileName}」识别 ${audit.issues.length} 项问题，正在写入修订版…\n`,
    )

    const applied = await applyExcelReviewIssues({
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
      ...applied,
    })
  }

  return results
}
