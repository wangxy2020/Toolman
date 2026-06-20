import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'
import type { ContentBlock } from '@toolman/shared'

import {
  findDocxMcpToolName,
  requestsDocxParagraphRewrite,
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

export type DocxReviewIssueAction = 'comment' | 'replace' | 'edit_paragraph'
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
  paragraphIndex?: number
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
  paragraphEditsRequested: number
  paragraphEditsApplied: number
  paragraphEditsFailed: number
  errors: string[]
}

const gateway = createModelGateway()
const ADD_COMMENTS_BATCH_SIZE = 20

const VALID_ACTIONS = new Set<DocxReviewIssueAction>(['comment', 'replace', 'edit_paragraph'])
const VALID_SEVERITIES = new Set<DocxReviewIssueSeverity>(['high', 'medium', 'low'])
const VALID_CATEGORIES = new Set<DocxReviewIssueCategory>([
  'error',
  'wording',
  'structure',
  'terminology',
  'other',
])

export function buildDocxAuditSystemPrompt(options?: { userRequest?: string }): string {
  const allowParagraphRewrite = requestsDocxParagraphRewrite(options?.userRequest ?? '')
  const paragraphRule = allowParagraphRewrite
    ? [
        '- **edit_paragraph（谨慎使用）**：仅当用户已明确要求整段重写/列表化/重组段落，且该段无法通过一条或多条 replace 完成时，才使用 read_document 的 paragraph_index + replacement 作为 new_text；仍须优先尝试 replace',
      ]
    : [
        '- **edit_paragraph（默认禁用）**：用户未要求整段替换时**不要**使用 edit_paragraph。结构/润色/措辞类问题请拆成 replace 或 comment，不要整段覆盖',
      ]

  return [
    '你是 Word 文档审查助手。根据对话中 read_document 的文档内容与用户要求，输出结构化审查 issue 列表。',
    '**只输出 JSON 数组**，不要 Markdown 代码块、不要解释、不要 tool_code、不要伪工具调用。',
    '每个 issue 对象格式：',
    '{',
    '  "id": "1",',
    '  "severity": "high|medium|low",',
    '  "category": "error|wording|structure|terminology|other",',
    '  "action": "comment|replace|edit_paragraph",',
    '  "anchor_text": "文档中可精确匹配的原文片段（用于定位与批注锚点）",',
    '  "paragraph_index": 12,',
    '  "comment": "批注说明（action=comment 时必填；replace/edit_paragraph 时可选，作为修改说明批注）",',
    '  "replacement": "替换文本（action=replace 或 edit_paragraph 时必填）"',
    '}',
    'action 选择规则（重要，按优先级）：',
    '1. **replace（默认首选）**：只要能用精确 anchor_text + replacement 表达的改动（错别字、语法、措辞、术语、句内调整），一律用 replace；能拆成多条 replace 的不要合并为 edit_paragraph；不要只写 comment',
    '2. **comment**：需要人工判断、信息不足、跨段关联、或仅建议不改正文时使用',
    ...paragraphRule,
    '其他要求：',
    '- 覆盖用户指令中的所有审查维度（错误、措辞、结构、术语等）',
    '- 列出所有应处理的问题，不要只给一条',
    '- replacement 应尽量短、贴近原文，避免无必要扩写',
    '- anchor_text 必须来自文档真实文本；edit_paragraph 时 anchor_text 填该段原文摘要（便于定位）',
    '- paragraph_index 必须来自 read_document 输出中的段落索引',
    '- 对 replace / edit_paragraph，若需说明修改理由，填写 comment（应用会自动写入 Word 批注）',
  ].join('\n')
}

export function buildDocxAuditUserMessage(options: {
  userRequest: string
  workingPath: string
  fileName: string
}): string {
  const allowParagraphRewrite = requestsDocxParagraphRewrite(options.userRequest)
  const actionHint = allowParagraphRewrite
    ? '优先 replace；仅当用户要求整段重写/列表化/重组段落且 replace 不足时，才使用 edit_paragraph。'
    : '优先 replace 与 comment；不要使用 edit_paragraph（用户未要求整段替换）。'

  return [
    '请审查以下 Word 文档并输出 JSON issue 数组。',
    `用户要求：${options.userRequest.trim() || '全面审查文档，修正错误并添加批注'}`,
    `修订版文件：${options.fileName}`,
    `修订版绝对路径（后续 apply 用）：${options.workingPath}`,
    `文档正文见上方 read_document 工具输出（含 paragraph_index）。请基于该输出列出全部 issue。${actionHint}`,
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
      `- 已段落修订：${result.paragraphEditsApplied}/${result.paragraphEditsRequested}`,
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
        `- [${issue.severity}/${issue.category}] ${issue.action === 'replace' ? '替换' : issue.action === 'edit_paragraph' ? '段落修订' : '批注'}：${issue.comment ?? issue.replacement ?? issue.anchorText}`,
    )
    .join('\n')
  const more =
    result.issues.length > 30 ? `\n- … 另有 ${result.issues.length - 30} 项` : ''

  return [
    `## 文档审查结果（${result.fileName}）`,
    '',
    `- 修订版文件：见下方「修订版路径」与「用 Word 打开」`,
    `- 执行统计：见下方「修订执行统计」卡片`,
    '',
    '### 问题清单（摘要）',
    issueLines + more,
    '',
  ].join('\n')
}

export function buildDocxReviewSummaryBlock(
  result: DocxReviewApplyResult,
): Extract<ContentBlock, { type: 'docx_review_summary' }> {
  return {
    type: 'docx_review_summary',
    fileName: result.fileName,
    workingPath: result.workingPath,
    issuesFound: result.issues.length,
    commentsRequested: result.commentsRequested,
    commentsApplied: result.commentsApplied,
    commentsFailed: result.commentsFailed,
    replacementsRequested: result.replacementsRequested,
    replacementsApplied: result.replacementsApplied,
    replacementsFailed: result.replacementsFailed,
    paragraphEditsRequested: result.paragraphEditsRequested,
    paragraphEditsApplied: result.paragraphEditsApplied,
    paragraphEditsFailed: result.paragraphEditsFailed,
    errors: result.errors.length > 0 ? result.errors : undefined,
    parseWarnings: result.parseWarnings.length > 0 ? result.parseWarnings : undefined,
  }
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

function parseParagraphIndex(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
  const text = String(raw ?? '').trim()
  if (!text) return undefined
  const parsed = Number.parseInt(text, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
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
  const replacement = String(item.replacement ?? item.replace ?? item.new_text ?? '').trim()
  const paragraphIndex = parseParagraphIndex(item.paragraph_index ?? item.paragraphIndex)

  if (action === 'comment' && !comment) return null
  if (action === 'replace' && !replacement) return null
  if (action === 'edit_paragraph' && (!replacement || paragraphIndex === undefined)) return null

  return {
    id: String(item.id ?? index + 1),
    severity: VALID_SEVERITIES.has(severity) ? severity : 'medium',
    category: VALID_CATEGORIES.has(category) ? category : 'other',
    action,
    anchorText,
    paragraphIndex,
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

export interface DocxToolBatchStats {
  applied: number
  failed: number
}

export function isDocxToolHardFailure(result: string): boolean {
  const trimmed = result.trim()
  return trimmed.startsWith('Error:') || /^UNTRACKED_EDIT_NOT_ALLOWED/i.test(trimmed)
}

export function parseDocxCommentsBatchResult(result: string, requested: number): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const succeeded = Number(
      parsed.succeeded ?? parsed.success_count ?? parsed.added ?? parsed.success ?? NaN,
    )
    const failed = Number(parsed.failed ?? parsed.failure_count ?? parsed.failures ?? NaN)
    if (Number.isFinite(succeeded) && Number.isFinite(failed)) {
      return {
        applied: Math.max(0, Math.min(requested, succeeded)),
        failed: Math.max(0, Math.min(requested, failed)),
      }
    }
    if (Number.isFinite(succeeded)) {
      const applied = Math.max(0, Math.min(requested, succeeded))
      return { applied, failed: Math.max(0, requested - applied) }
    }
    if (Array.isArray(parsed.failures)) {
      const failedCount = parsed.failures.length
      return { applied: Math.max(0, requested - failedCount), failed: failedCount }
    }
  } catch {
    // fall through to heuristics
  }

  const addedMatch = result.match(/(?:added|succeeded|成功(?:添加|写入)?)\s*[:：]?\s*(\d+)/i)
  if (addedMatch?.[1]) {
    const applied = Math.max(0, Math.min(requested, Number.parseInt(addedMatch[1], 10)))
    return { applied, failed: Math.max(0, requested - applied) }
  }

  if (/未找到|not found|anchor.*fail|失败/i.test(result)) {
    const failedMatch = result.match(/(\d+)\s*(?:条|个)?\s*(?:失败|failed)/i)
    const failed = failedMatch?.[1]
      ? Math.max(0, Math.min(requested, Number.parseInt(failedMatch[1], 10)))
      : requested
    return { applied: Math.max(0, requested - failed), failed }
  }

  return { applied: requested, failed: 0 }
}

export function parseDocxSingleReplaceResult(result: string): boolean {
  if (isDocxToolHardFailure(result)) return false
  if (/0\s*replacement|未找到|not found|no match/i.test(result)) return false
  return true
}

export function parseDocxReplaceTextsBatchResult(
  result: string,
  requested: number,
): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const results = parsed.results
    if (Array.isArray(results)) {
      let applied = 0
      for (const entry of results) {
        if (entry && typeof entry === 'object') {
          const item = entry as Record<string, unknown>
          const replacements = Number(item.replacements ?? item.count ?? 0)
          const ok = item.success === true || replacements > 0
          if (ok) applied += 1
          continue
        }
        applied += 1
      }
      return { applied, failed: Math.max(0, requested - applied) }
    }
    const succeeded = Number(parsed.succeeded ?? parsed.success_count ?? NaN)
    if (Number.isFinite(succeeded)) {
      const applied = Math.max(0, Math.min(requested, succeeded))
      return { applied, failed: Math.max(0, requested - applied) }
    }
  } catch {
    // fall through
  }

  const replacedMatch = result.match(/(\d+)\s*(?:处|个)?\s*(?:替换|replacement)/i)
  if (replacedMatch?.[1]) {
    const count = Number.parseInt(replacedMatch[1], 10)
    return count > 0
      ? { applied: requested, failed: 0 }
      : { applied: 0, failed: requested }
  }

  return parseDocxSingleReplaceResult(result)
    ? { applied: requested, failed: 0 }
    : { applied: 0, failed: requested }
}

export function parseDocxEditParagraphsBatchResult(
  result: string,
  requested: number,
): DocxToolBatchStats {
  if (isDocxToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const edited = Number(parsed.edited ?? parsed.succeeded ?? parsed.success_count ?? NaN)
    if (Number.isFinite(edited)) {
      const applied = Math.max(0, Math.min(requested, edited))
      return { applied, failed: Math.max(0, requested - applied) }
    }
    if (Array.isArray(parsed.results)) {
      const applied = parsed.results.filter((entry) => {
        if (!entry || typeof entry !== 'object') return true
        const item = entry as Record<string, unknown>
        return item.success !== false
      }).length
      return { applied, failed: Math.max(0, requested - applied) }
    }
  } catch {
    // fall through
  }

  if (/edited\s*[:：]?\s*(\d+)/i.test(result)) {
    const match = result.match(/edited\s*[:：]?\s*(\d+)/i)
    const applied = match?.[1]
      ? Math.max(0, Math.min(requested, Number.parseInt(match[1], 10)))
      : requested
    return { applied, failed: Math.max(0, requested - applied) }
  }

  if (/未找到|not found|invalid paragraph|失败/i.test(result)) {
    return { applied: 0, failed: requested }
  }

  return { applied: requested, failed: 0 }
}

function buildCommentAnchorForEditedIssue(issue: DocxReviewIssue): string {
  if (issue.action === 'replace') {
    return issue.replacement?.trim() || issue.anchorText
  }
  const replacement = issue.replacement?.trim() ?? ''
  const firstLine = replacement.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine || issue.anchorText
}

function collectExplanationCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[] {
  return issues
    .filter(
      (issue) =>
        (issue.action === 'replace' || issue.action === 'edit_paragraph') &&
        Boolean(issue.comment?.trim()),
    )
    .map((issue) => ({
      ...issue,
      action: 'comment' as const,
      anchorText: buildCommentAnchorForEditedIssue(issue),
    }))
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
    { role: 'system', content: buildDocxAuditSystemPrompt({ userRequest: options.userRequest }) },
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

async function applyCommentIssueBatches(options: {
  issues: DocxReviewIssue[]
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
  idPrefix: string
}): Promise<DocxToolBatchStats> {
  const addCommentsTool = findDocxMcpToolName(options.tools, 'add_comments')
  const addCommentTool = findDocxMcpToolName(options.tools, 'add_comment')
  const requested = options.issues.length
  if (requested === 0) return { applied: 0, failed: 0 }

  let applied = 0
  let failed = 0
  const batches = chunkReviewCommentIssues(options.issues)

  if (addCommentsTool) {
    for (const batch of batches) {
      const callId = `${options.idPrefix}-${randomUUID()}`
      const args = JSON.stringify({
        file_path: options.workingPath,
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
        const stats = parseDocxCommentsBatchResult(result, batch.length)
        applied += stats.applied
        failed += stats.failed
        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentsTool,
          arguments: args,
          result: result.slice(0, 800),
          status: stats.failed === batch.length ? 'failed' : 'done',
        })
      } catch (error) {
        failed += batch.length
        const message = error instanceof Error ? error.message : 'add_comments 失败'
        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentsTool,
          arguments: args,
          result: `Error: ${message}`,
          status: 'failed',
        })
      }
    }
    return { applied, failed }
  }

  if (addCommentTool) {
    for (const issue of options.issues) {
      const callId = `${options.idPrefix}-${randomUUID()}`
      const args = JSON.stringify({
        file_path: options.workingPath,
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
        const itemFailed =
          isDocxToolHardFailure(result) || /未找到|not found/i.test(result)
        if (itemFailed) {
          failed += 1
        } else {
          applied += 1
        }
        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentTool,
          arguments: args,
          result: result.slice(0, 800),
          status: itemFailed ? 'failed' : 'done',
        })
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : 'add_comment 失败'
        options.emitToolUpdate({
          toolCallId: callId,
          name: addCommentTool,
          arguments: args,
          result: `Error: ${message}`,
          status: 'failed',
        })
      }
    }
    return { applied, failed }
  }

  return { applied: 0, failed: requested }
}

export async function applyDocxReviewIssues(options: {
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
  | 'paragraphEditsRequested'
  | 'paragraphEditsApplied'
  | 'paragraphEditsFailed'
  | 'errors'
>> {
  const replaceTextsTool =
    findDocxMcpToolName(options.tools, 'replace_texts') ??
    findDocxMcpToolName(options.tools, 'replace_text')
  const editParagraphsTool =
    findDocxMcpToolName(options.tools, 'edit_paragraphs') ??
    findDocxMcpToolName(options.tools, 'edit_paragraph')

  const errors: string[] = []
  const replaceIssues = options.issues.filter((issue) => issue.action === 'replace')
  const paragraphIssues = options.issues.filter((issue) => issue.action === 'edit_paragraph')
  const commentOnlyIssues = options.issues.filter((issue) => issue.action === 'comment')
  const explanationIssues = collectExplanationCommentIssues(options.issues)

  let replacementsRequested = replaceIssues.length
  let replacementsApplied = 0
  let replacementsFailed = 0
  let paragraphEditsRequested = paragraphIssues.length
  let paragraphEditsApplied = 0
  let paragraphEditsFailed = 0

  if (replaceIssues.length > 0) {
    if (!replaceTextsTool) {
      replacementsFailed = replacementsRequested
      errors.push('未找到 replace_texts / replace_text 工具')
    } else if (replaceTextsTool.includes('replace_texts')) {
      const callId = `docx-review-replace-batch-${randomUUID()}`
      const args = JSON.stringify({
        file_path: options.workingCopy.workingPath,
        items: replaceIssues.map((issue) => ({
          search: issue.anchorText,
          replace: issue.replacement ?? '',
        })),
        track_changes: true,
        author: 'Toolman',
      })

      options.emitToolUpdate({
        toolCallId: callId,
        name: replaceTextsTool,
        arguments: args,
        status: 'running',
      })

      try {
        const result = await executeToolCall(replaceTextsTool, args, options.toolContext)
        const stats = parseDocxReplaceTextsBatchResult(result, replaceIssues.length)
        replacementsApplied = stats.applied
        replacementsFailed = stats.failed
        if (stats.failed > 0) errors.push(`replace_texts 部分失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: replaceTextsTool,
          arguments: args,
          result: result.slice(0, 800),
          status: stats.failed === replaceIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        replacementsFailed = replacementsRequested
        const message = error instanceof Error ? error.message : 'replace_texts 失败'
        errors.push(message)
        options.emitToolUpdate({
          toolCallId: callId,
          name: replaceTextsTool,
          arguments: args,
          result: `Error: ${message}`,
          status: 'failed',
        })
      }
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
          name: replaceTextsTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(replaceTextsTool, args, options.toolContext)
          if (parseDocxSingleReplaceResult(result)) {
            replacementsApplied += 1
          } else {
            replacementsFailed += 1
            errors.push(`替换失败(${issue.id})：${result.slice(0, 120)}`)
          }
          options.emitToolUpdate({
            toolCallId: callId,
            name: replaceTextsTool,
            arguments: args,
            result: result.slice(0, 800),
            status: parseDocxSingleReplaceResult(result) ? 'done' : 'failed',
          })
        } catch (error) {
          replacementsFailed += 1
          const message = error instanceof Error ? error.message : 'replace_text 失败'
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: replaceTextsTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    }
  }

  if (paragraphIssues.length > 0) {
    if (!editParagraphsTool) {
      paragraphEditsFailed = paragraphEditsRequested
      errors.push('未找到 edit_paragraphs / edit_paragraph 工具')
    } else if (editParagraphsTool.includes('edit_paragraphs')) {
      const callId = `docx-review-paragraph-batch-${randomUUID()}`
      const args = JSON.stringify({
        file_path: options.workingCopy.workingPath,
        edits: paragraphIssues.map((issue) => ({
          paragraph_index: issue.paragraphIndex,
          new_text: issue.replacement ?? '',
        })),
        track_changes: true,
        author: 'Toolman',
      })

      options.emitToolUpdate({
        toolCallId: callId,
        name: editParagraphsTool,
        arguments: args,
        status: 'running',
      })

      try {
        const result = await executeToolCall(editParagraphsTool, args, options.toolContext)
        const stats = parseDocxEditParagraphsBatchResult(result, paragraphIssues.length)
        paragraphEditsApplied = stats.applied
        paragraphEditsFailed = stats.failed
        if (stats.failed > 0) errors.push(`edit_paragraphs 部分失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          result: result.slice(0, 800),
          status: stats.failed === paragraphIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        paragraphEditsFailed = paragraphEditsRequested
        const message = error instanceof Error ? error.message : 'edit_paragraphs 失败'
        errors.push(message)
        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          result: `Error: ${message}`,
          status: 'failed',
        })
      }
    } else {
      for (const issue of paragraphIssues) {
        const callId = `docx-review-paragraph-${randomUUID()}`
        const args = JSON.stringify({
          file_path: options.workingCopy.workingPath,
          paragraph_index: issue.paragraphIndex,
          new_text: issue.replacement ?? '',
          track_changes: true,
          author: 'Toolman',
        })

        options.emitToolUpdate({
          toolCallId: callId,
          name: editParagraphsTool,
          arguments: args,
          status: 'running',
        })

        try {
          const result = await executeToolCall(editParagraphsTool, args, options.toolContext)
          const stats = parseDocxEditParagraphsBatchResult(result, 1)
          paragraphEditsApplied += stats.applied
          paragraphEditsFailed += stats.failed
          if (stats.failed > 0) errors.push(`段落修订失败(${issue.id})：${result.slice(0, 120)}`)
          options.emitToolUpdate({
            toolCallId: callId,
            name: editParagraphsTool,
            arguments: args,
            result: result.slice(0, 800),
            status: stats.failed > 0 ? 'failed' : 'done',
          })
        } catch (error) {
          paragraphEditsFailed += 1
          const message = error instanceof Error ? error.message : 'edit_paragraph 失败'
          errors.push(message)
          options.emitToolUpdate({
            toolCallId: callId,
            name: editParagraphsTool,
            arguments: args,
            result: `Error: ${message}`,
            status: 'failed',
          })
        }
      }
    }
  }

  const allCommentIssues = [...commentOnlyIssues, ...explanationIssues]
  const commentsRequested = allCommentIssues.length
  let commentsApplied = 0
  let commentsFailed = 0

  if (allCommentIssues.length > 0) {
    const stats = await applyCommentIssueBatches({
      issues: allCommentIssues,
      workingPath: options.workingCopy.workingPath,
      tools: options.tools,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
      idPrefix: 'docx-review-comments',
    })
    commentsApplied = stats.applied
    commentsFailed = stats.failed
    if (stats.failed > 0 && stats.applied === 0) {
      errors.push('add_comments / add_comment 全部失败')
    }
  }

  return {
    commentsRequested,
    commentsApplied,
    commentsFailed,
    replacementsRequested,
    replacementsApplied,
    replacementsFailed,
    paragraphEditsRequested,
    paragraphEditsApplied,
    paragraphEditsFailed,
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
              '上次输出无法解析。请仅输出 JSON 数组（不要 Markdown 代码块），每项包含 id、severity、category、action、anchor_text；comment 用于纯批注；replace 需 replacement；edit_paragraph 需 paragraph_index 与 replacement，且仅在用户明确要求整段重写/列表化/重组段落时使用，否则优先 replace。',
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
      ...applied,
    })
  }

  return results
}

export async function runDocxMcpApplySmokeTest(options: {
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<DocxReviewApplyResult> {
  const noopEmit = () => {}

  const createTool =
    findDocxMcpToolName(options.tools, 'create_document') ??
    findDocxMcpToolName(options.tools, 'read_document')
  if (!createTool) {
    throw new Error('DOCX MCP 缺少 create_document 工具')
  }

  await executeToolCall(
    createTool,
    JSON.stringify({
      file_path: options.workingPath,
      title: 'Smoke Test',
      content: '这是一段需要审查的测试文本，包含错别字。',
    }),
    options.toolContext,
  )

  const issues: DocxReviewIssue[] = [
    {
      id: 'smoke-replace',
      severity: 'high',
      category: 'error',
      action: 'replace',
      anchorText: '错别字',
      replacement: '测试修正',
      comment: '自动替换测试',
    },
    {
      id: 'smoke-comment',
      severity: 'medium',
      category: 'wording',
      action: 'comment',
      anchorText: '测试文本',
      comment: '建议进一步润色',
    },
  ]

  const applied = await applyDocxReviewIssues({
    issues,
    workingCopy: {
      sourcePath: options.workingPath,
      workingPath: options.workingPath,
      fileName: 'smoke.docx',
    },
    tools: options.tools,
    toolContext: options.toolContext,
    emitToolUpdate: noopEmit,
  })

  const readTool = findDocxMcpToolName(options.tools, 'read_document')
  if (!readTool) {
    throw new Error('DOCX MCP 缺少 read_document 工具')
  }

  const readResult = await executeToolCall(
    readTool,
    JSON.stringify({ file_path: options.workingPath }),
    options.toolContext,
  )

  if (!readResult.includes('测试修正')) {
    throw new Error(`read_document 未包含替换结果：${readResult.slice(0, 200)}`)
  }

  return {
    fileName: 'smoke.docx',
    workingPath: options.workingPath,
    issues,
    parseWarnings: [],
    ...applied,
  }
}
