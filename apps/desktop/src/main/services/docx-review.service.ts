import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'

import {
  findDocxMcpToolName,
  type DocxWorkingCopy,
} from './docx-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'

export const DOCX_FILE_LINK_SCHEME = 'toolman-local://'

export function buildLocalDocxMarkdownLink(path: string): string {
  const name = basename(path) || path
  return `[${name}](${DOCX_FILE_LINK_SCHEME}${encodeURIComponent(path)})`
}

export function buildDocxFileLinksMarkdown(paths: readonly string[]): string {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (unique.length === 0) return ''

  return [
    '## 修订版文件（点击打开）',
    '',
    ...unique.map((path) => `- ${buildLocalDocxMarkdownLink(path)}`),
    '',
  ].join('\n')
}

export type DocxReviewIssueAction = 'comment' | 'replace'
export type DocxReviewIssueSeverity = 'high' | 'medium' | 'low'
export type DocxReviewIssueCategory =
  | 'error'
  | 'wording'
  | 'structure'
  | 'terminology'
  | 'other'

export interface DocxReviewIssue {
  id: string
  severity: DocxReviewIssueSeverity
  category: DocxReviewIssueCategory
  action: DocxReviewIssueAction
  anchorText: string
  comment?: string
  replacement?: string
}

export interface DocxReviewApplyResult {
  fileName: string
  workingPath: string
  issues: DocxReviewIssue[]
  parseWarnings: string[]
  commentsRequested: number
  commentsApplied: number
  commentsFailed: number
  replacementsRequested: number
  replacementsApplied: number
  replacementsFailed: number
  errors: string[]
}

const gateway = createModelGateway()
const ADD_COMMENTS_BATCH_SIZE = 20

const VALID_ACTIONS = new Set<DocxReviewIssueAction>(['comment', 'replace'])
const VALID_SEVERITIES = new Set<DocxReviewIssueSeverity>(['high', 'medium', 'low'])
const VALID_CATEGORIES = new Set<DocxReviewIssueCategory>([
  'error',
  'wording',
  'structure',
  'terminology',
  'other',
])

export function buildDocxAuditSystemPrompt(): string {
  return [
    '你是 Word 文档审查助手。根据对话中 read_document 的文档内容与用户要求，输出结构化审查 issue 列表。',
    '**只输出 JSON 数组**，不要 Markdown 代码块、不要解释、不要 tool_code、不要伪工具调用。',
    '每个 issue 对象格式：',
    '{',
    '  "id": "1",',
    '  "severity": "high|medium|low",',
    '  "category": "error|wording|structure|terminology|other",',
    '  "action": "comment|replace",',
    '  "anchor_text": "文档中可精确匹配的原文片段（尽量短且能在文中唯一定位）",',
    '  "comment": "批注说明（action=comment 时必填）",',
    '  "replacement": "替换文本（action=replace 时必填）"',
    '}',
    '审查要求：',
    '- 覆盖用户指令中的所有审查维度（错误、措辞、结构、术语等）',
    '- 列出所有应批注或可替换的问题，不要只给一条',
    '- action=comment：添加 Word 批注；action=replace：直接替换明确错误',
    '- anchor_text 必须来自文档真实文本，避免过长',
  ].join('\n')
}

export function buildDocxAuditUserMessage(options: {
  userRequest: string
  workingPath: string
  fileName: string
}): string {
  return [
    '请审查以下 Word 文档并输出 JSON issue 数组。',
    `用户要求：${options.userRequest.trim() || '全面审查文档，修正错误并添加批注'}`,
    `修订版文件：${options.fileName}`,
    `修订版绝对路径（后续 apply 用）：${options.workingPath}`,
    '文档正文见上方 read_document 工具输出。请基于该输出列出全部 issue。',
  ].join('\n')
}

export function buildDocxFinalSummaryPrompt(results: DocxReviewApplyResult[]): string {
  const lines = results.map((result) => {
    const parts = [
      `- 文件：${result.fileName}`,
      `- 修订版路径：${result.workingPath}`,
      `- 识别问题：${result.issues.length} 项`,
      `- 已添加批注：${result.commentsApplied}/${result.commentsRequested}`,
      `- 已替换修正：${result.replacementsApplied}/${result.replacementsRequested}`,
    ]
    if (result.errors.length) {
      parts.push(`- 部分失败：${result.errors.slice(0, 3).join('；')}`)
    }
    return parts.join('\n')
  })

  return [
    '结构化审查与修订已完成。请向用户输出简洁中文总结，包含：',
    '1. 审查维度与主要发现（按 category/severity 归纳）',
    '2. 已写入修订版的批注与替换数量',
    '3. 若有未成功项，简要说明原因',
    '修订版文件链接将由应用在消息末尾自动附上（含「修订版路径」与「用 Word 打开」），你无需手写 Markdown 链接或 toolman-local:// URL。',
    '',
    '执行结果：',
    lines.join('\n\n'),
  ].join('\n')
}

export function formatDocxReviewReport(result: DocxReviewApplyResult): string {
  if (result.issues.length === 0) {
    return [
      `## 文档审查（${result.fileName}）`,
      '',
      '未从模型输出中解析到有效 issue。',
      '',
      `- 修订版文件：见下方「修订版路径」与「用 Word 打开」`,
      '',
    ].join('\n')
  }

  const issueLines = result.issues
    .slice(0, 30)
    .map(
      (issue) =>
        `- [${issue.severity}/${issue.category}] ${issue.action === 'replace' ? '替换' : '批注'}：${issue.comment ?? issue.replacement ?? issue.anchorText}`,
    )
    .join('\n')
  const more =
    result.issues.length > 30 ? `\n- … 另有 ${result.issues.length - 30} 项` : ''

  return [
    `## 文档审查结果（${result.fileName}）`,
    '',
    `- 修订版文件：见下方「修订版路径」与「用 Word 打开」`,
    `- 识别问题：**${result.issues.length}** 项`,
    `- 已写入批注：**${result.commentsApplied}** / ${result.commentsRequested}`,
    `- 已应用替换：**${result.replacementsApplied}** / ${result.replacementsRequested}`,
    '',
    '### 问题清单（摘要）',
    issueLines + more,
    '',
  ].join('\n')
}

function extractJsonArray(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) return trimmed

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim().startsWith('[')) return fenced[1].trim()

  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)

  return null
}

function normalizeIssue(raw: unknown, index: number): DocxReviewIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const action = String(item.action ?? 'comment').toLowerCase() as DocxReviewIssueAction
  if (!VALID_ACTIONS.has(action)) return null

  const anchorText = String(item.anchor_text ?? item.anchorText ?? '').trim()
  if (!anchorText) return null

  const severity = String(item.severity ?? 'medium').toLowerCase() as DocxReviewIssueSeverity
  const category = String(item.category ?? 'other').toLowerCase() as DocxReviewIssueCategory
  const comment = String(item.comment ?? '').trim()
  const replacement = String(item.replacement ?? item.replace ?? '').trim()

  if (action === 'comment' && !comment) return null
  if (action === 'replace' && !replacement) return null

  return {
    id: String(item.id ?? index + 1),
    severity: VALID_SEVERITIES.has(severity) ? severity : 'medium',
    category: VALID_CATEGORIES.has(category) ? category : 'other',
    action,
    anchorText,
    comment: comment || undefined,
    replacement: replacement || undefined,
  }
}

export function parseDocxReviewIssues(raw: string): {
  issues: DocxReviewIssue[]
  warnings: string[]
} {
  const warnings: string[] = []
  const jsonText = extractJsonArray(raw)
  if (!jsonText) {
    return { issues: [], warnings: ['模型未返回 JSON 数组格式的 issue 列表'] }
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown
    if (!Array.isArray(parsed)) {
      return { issues: [], warnings: ['issue 列表必须是 JSON 数组'] }
    }

    const issues: DocxReviewIssue[] = []
    for (let i = 0; i < parsed.length; i += 1) {
      const issue = normalizeIssue(parsed[i], i)
      if (issue) {
        issues.push(issue)
      } else {
        warnings.push(`第 ${i + 1} 项 issue 格式无效，已跳过`)
      }
    }

    return { issues, warnings }
  } catch (error) {
    return {
      issues: [],
      warnings: [
        `JSON 解析失败：${error instanceof Error ? error.message : '未知错误'}`,
      ],
    }
  }
}

export function chunkReviewCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[][] {
  const commentIssues = issues.filter((issue) => issue.action === 'comment')
  const batches: DocxReviewIssue[][] = []
  for (let i = 0; i < commentIssues.length; i += ADD_COMMENTS_BATCH_SIZE) {
    batches.push(commentIssues.slice(i, i + ADD_COMMENTS_BATCH_SIZE))
  }
  return batches
}

async function runDocxAuditPass(options: {
  chatMessages: ChatMessage[]
  providerConfig: ProviderConfig
  model: string
  userRequest: string
  workingCopy: DocxWorkingCopy
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}): Promise<{ issues: DocxReviewIssue[]; warnings: string[]; raw: string }> {
  const auditMessages: ChatMessage[] = [
    { role: 'system', content: buildDocxAuditSystemPrompt() },
    ...options.chatMessages,
    {
      role: 'user',
      content: buildDocxAuditUserMessage({
        userRequest: options.userRequest,
        workingPath: options.workingCopy.workingPath,
        fileName: options.workingCopy.fileName,
      }),
    },
  ]

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

async function applyDocxReviewIssues(options: {
  issues: DocxReviewIssue[]
  workingCopy: DocxWorkingCopy
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<Pick<
  DocxReviewApplyResult,
  | 'commentsRequested'
  | 'commentsApplied'
  | 'commentsFailed'
  | 'replacementsRequested'
  | 'replacementsApplied'
  | 'replacementsFailed'
  | 'errors'
>> {
  const addCommentsTool = findDocxMcpToolName(options.tools, 'add_comments')
  const addCommentTool = findDocxMcpToolName(options.tools, 'add_comment')
  const replaceTextTool = findDocxMcpToolName(options.tools, 'replace_text')

  let commentsRequested = 0
  let commentsApplied = 0
  let commentsFailed = 0
  let replacementsRequested = 0
  let replacementsApplied = 0
  let replacementsFailed = 0
  const errors: string[] = []

  const commentBatches = chunkReviewCommentIssues(options.issues)
  commentsRequested = options.issues.filter((issue) => issue.action === 'comment').length

  if (commentBatches.length > 0) {
    if (addCommentsTool) {
      for (const batch of commentBatches) {
        const callId = `docx-review-comments-${randomUUID()}`
        const args = JSON.stringify({
          file_path: options.workingCopy.workingPath,
          comments: batch.map((issue) => ({
            anchor_text: issue.anchorText,
            comment_text: issue.comment ?? '',
            author: 'Toolman',
          })),
          default_author: 'Toolman',
        })

        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentsTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(addCommentsTool, args, options.toolContext)
          const failed = /fail|error|未找到|not found/i.test(result) ? batch.length : 0
          commentsApplied += batch.length - failed
          commentsFailed += failed
          if (failed > 0) errors.push(`add_comments 部分失败：${result.slice(0, 200)}`)
          options.emitToolUpdate({
            toolCallId: callId,
            name: addCommentsTool,
            arguments: args,
            result: result.slice(0, 800),
            status: failed === batch.length ? 'failed' : 'done',
          })
        } catch (error) {
          commentsFailed += batch.length
          const message = error instanceof Error ? error.message : 'add_comments 失败'
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: addCommentsTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    } else if (addCommentTool) {
      for (const issue of options.issues.filter((item) => item.action === 'comment')) {
        const callId = `docx-review-comment-${randomUUID()}`
        const args = JSON.stringify({
          file_path: options.workingCopy.workingPath,
          anchor_text: issue.anchorText,
          comment_text: issue.comment ?? '',
          author: 'Toolman',
        })

        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(addCommentTool, args, options.toolContext)
          if (result.startsWith('Error:') || /fail|未找到|not found/i.test(result)) {
            commentsFailed += 1
            errors.push(result.slice(0, 200))
            options.emitToolUpdate({
              toolCallId: callId,
              name: addCommentTool,
              arguments: args,
              result: result.slice(0, 800),
              status: 'failed',
            })
          } else {
            commentsApplied += 1
            options.emitToolUpdate({
              toolCallId: callId,
              name: addCommentTool,
              arguments: args,
              result: result.slice(0, 800),
              status: 'done',
            })
          }
        } catch (error) {
          commentsFailed += 1
          const message = error instanceof Error ? error.message : 'add_comment 失败'
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: addCommentTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    } else {
      commentsFailed = commentsRequested
      errors.push('未找到 add_comments / add_comment 工具')
    }
  }

  const replaceIssues = options.issues.filter((issue) => issue.action === 'replace')
  replacementsRequested = replaceIssues.length

  if (replaceIssues.length > 0) {
    if (!replaceTextTool) {
      replacementsFailed = replacementsRequested
      errors.push('未找到 replace_text 工具')
    } else {
      for (const issue of replaceIssues) {
        const callId = `docx-review-replace-${randomUUID()}`
        const args = JSON.stringify({
          file_path: options.workingCopy.workingPath,
          search: issue.anchorText,
          replace: issue.replacement ?? '',
          track_changes: true,
          author: 'Toolman',
        })

        options.emitToolUpdate({
          toolCallId: callId,
          name: replaceTextTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(replaceTextTool, args, options.toolContext)
          if (result.startsWith('Error:') || /0 replacement|未找到|not found/i.test(result)) {
            replacementsFailed += 1
            errors.push(`替换失败(${issue.id})：${result.slice(0, 120)}`)
            options.emitToolUpdate({
              toolCallId: callId,
              name: replaceTextTool,
              arguments: args,
              result: result.slice(0, 800),
              status: 'failed',
            })
          } else {
            replacementsApplied += 1
            options.emitToolUpdate({
              toolCallId: callId,
              name: replaceTextTool,
              arguments: args,
              result: result.slice(0, 800),
              status: 'done',
            })
          }
        } catch (error) {
          replacementsFailed += 1
          const message = error instanceof Error ? error.message : 'replace_text 失败'
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: replaceTextTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    }
  }

  return {
    commentsRequested,
    commentsApplied,
    commentsFailed,
    replacementsRequested,
    replacementsApplied,
    replacementsFailed,
    errors,
  }
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
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
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
        chatMessages: [
          ...options.chatMessages,
          { role: 'assistant', content: audit.raw },
          {
            role: 'user',
            content:
              '上次输出无法解析。请仅输出 JSON 数组（不要 Markdown 代码块），每项包含 id、severity、category、action、anchor_text，以及 comment 或 replacement。',
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

    options.onStatus?.(
      `「${workingCopy.fileName}」识别 ${audit.issues.length} 项问题，正在写入批注与替换…\n`,
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
      ...applied,
    })
  }

  return results
}
