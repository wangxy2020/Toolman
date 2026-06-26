import { randomUUID } from 'node:crypto'
import { extractLlmJsonArray, toErrorMessage } from '@toolman/shared'
import { basename, normalize } from 'node:path'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'
import type { ContentBlock } from '@toolman/shared'

import type { OfficeToDocxMethod } from './office-to-docx.service'
import {
  findDocxMcpToolName,
  requestsDocxParagraphRewrite,
  type DocxWorkingCopy,
} from './docx-mcp-task.service'
import { resolveMcpShortToolName } from './document-mcp-task.util'
import { DOCX_MCP_SERVER_ID } from '@toolman/shared'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  clampDocumentToolBatchStats,
  isDocumentToolHardFailure,
  parseDocumentReviewSeverity,
  type DocumentReviewIssueSeverity,
  type DocumentToolBatchStats,
} from './document-review.util'

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
export type DocxReviewIssueSeverity = DocumentReviewIssueSeverity
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
  conversionMethod?: Exclude<OfficeToDocxMethod, 'copy'>
  errors: string[]
}

const gateway = createModelGateway()
const ADD_COMMENTS_BATCH_SIZE = 20
/** 单条批注最多尝试的锚点候选数，避免模型锚点偏差时刷屏式重试 */
const MAX_COMMENT_ANCHOR_ATTEMPTS = 10
/** search_text 反查锚点时使用的 seed 上限（按长度优先） */
const MAX_COMMENT_SEARCH_SEEDS = 24

const VALID_ACTIONS = new Set<DocxReviewIssueAction>(['comment', 'replace', 'edit_paragraph'])
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
    '你是 Word 文档审查助手。根据下方 read_document 工具输出中的文档正文与用户要求，输出结构化审查 issue 列表。',
    '**主题保真**：必须尊重文档原有主题、体裁与领域（学习笔记、技术说明、报告、叙事文本等均可），不得臆造与原文无关的内容，不得将正文替换为其他主题或体裁。',
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
    '- **定位规则（重要）**：每项 issue 必须填写 paragraph_index（read_document 的 block 索引），系统据此锁定段落',
    '- anchor_text 必须是该 paragraph_index 对应段落内的**原样连续子串**（建议 8～48 字、含足够区分度的关键词），禁止省略号「…」「...」、禁止概括或改写原文用语',
    '- 不要用整段超长文字作 anchor_text；不要用截断概括代替原文',
    '- comment 批注应挂在**与批注主题同一 paragraph_index 的段落**上，不要将某段的批注挂到其他段',
    '- edit_paragraph 时 anchor_text 可填该段简短摘要；replace/comment 仍须用可精确匹配的子串',
    '- paragraph_index 必须来自 read_document 输出中的段落索引',
    '- 对 replace / edit_paragraph，若需说明修改理由，填写 comment（会在替换前写入 Word 批注，锚点为 anchor_text 原文）',
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
    `文档正文见上方 read_document 工具输出（含 paragraph_index）。请**仅依据该输出与上述用户要求**列出全部 issue，勿引入对话外的假设。${actionHint}`,
  ].join('\n')
}

function normalizeDocxPath(path: string): string {
  return normalize(path.trim()).replace(/\\/g, '/')
}

function isReadDocumentToolName(toolName: string): boolean {
  return (
    resolveMcpShortToolName(toolName, DOCX_MCP_SERVER_ID, '__docx_audit_batch__') ===
    'read_document'
  )
}

/** Extract read_document tool output for a working copy from chat messages. */
export function resolveDocxReadDocumentContent(
  chatMessages: readonly ChatMessage[],
  workingPath: string,
): string | null {
  const normalizedWorking = normalizeDocxPath(workingPath)
  const toolResults = new Map<string, string>()

  for (const message of chatMessages) {
    if (message.role === 'tool' && message.tool_call_id && message.content?.trim()) {
      toolResults.set(message.tool_call_id, message.content)
    }
  }

  let fallback: string | null = null

  for (const message of chatMessages) {
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue

    for (const call of message.tool_calls) {
      if (!isReadDocumentToolName(call.name)) continue

      let filePath = ''
      try {
        const parsed = JSON.parse(call.arguments ?? '{}') as { file_path?: string }
        filePath = parsed.file_path?.trim() ?? ''
      } catch {
        continue
      }

      const content = toolResults.get(call.id)?.trim()
      if (!content) continue

      if (filePath && normalizeDocxPath(filePath) === normalizedWorking) {
        return content
      }

      fallback ??= content
    }
  }

  return fallback
}

export function buildIsolatedDocxAuditMessages(options: {
  userRequest: string
  workingCopy: DocxWorkingCopy
  documentContent: string
  retryHint?: string
}): ChatMessage[] {
  const readCallId = 'docx-audit-read'
  const userContent = [
    buildDocxAuditUserMessage({
      userRequest: options.userRequest,
      workingPath: options.workingCopy.workingPath,
      fileName: options.workingCopy.fileName,
    }),
    options.retryHint?.trim(),
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    { role: 'system', content: buildDocxAuditSystemPrompt({ userRequest: options.userRequest }) },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: readCallId,
          name: 'read_document',
          arguments: JSON.stringify({ file_path: options.workingCopy.workingPath }),
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: readCallId,
      content: options.documentContent,
    },
    { role: 'user', content: userContent },
  ]
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
  const conversionWarnings =
    result.conversionMethod === 'plaintext'
      ? [
          '源文件以纯文本方式转换，目录、大纲级别与原有格式已丢失。本机未安装 Word 时可安装 LibreOffice 保留格式，或在 Word/WPS 中另存为 .docx 后重新上传。',
        ]
      : undefined
  const parseWarnings = [
    ...(result.parseWarnings ?? []),
    ...(conversionWarnings ?? []),
  ]

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
    conversionMethod: result.conversionMethod,
    errors: result.errors.length > 0 ? result.errors : undefined,
    parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
  }
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

  const severity = parseDocumentReviewSeverity(item.severity)
  const category = String(item.category ?? 'other').toLowerCase() as DocxReviewIssueCategory
  const comment = String(item.comment ?? '').trim()
  const replacement = String(item.replacement ?? item.replace ?? item.new_text ?? '').trim()
  const paragraphIndex = parseParagraphIndex(item.paragraph_index ?? item.paragraphIndex)

  if (action === 'comment' && !comment) return null
  if (action === 'replace' && !replacement) return null
  if (action === 'edit_paragraph' && (!replacement || paragraphIndex === undefined)) return null

  return {
    id: String(item.id ?? index + 1),
    severity,
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
  const parsed = extractLlmJsonArray(raw)
  if (!parsed) {
    return { issues: [], warnings: ['模型未返回 JSON 数组格式的 issue 列表'] }
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
}

export function chunkReviewCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[][] {
  const commentIssues = issues.filter((issue) => issue.action === 'comment')
  const batches: DocxReviewIssue[][] = []
  for (let i = 0; i < commentIssues.length; i += ADD_COMMENTS_BATCH_SIZE) {
    batches.push(commentIssues.slice(i, i + ADD_COMMENTS_BATCH_SIZE))
  }
  return batches
}

export type DocxToolBatchStats = DocumentToolBatchStats

export const isDocxToolHardFailure = isDocumentToolHardFailure

export function parseDocxCommentsBatchResult(result: string, requested: number): DocxToolBatchStats {
  if (isDocumentToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  const summaryMatch = result.match(/(\d+)\s+added,\s*(\d+)\s+failed/i)
  if (summaryMatch) {
    const applied = Number.parseInt(summaryMatch[1] ?? '0', 10)
    const failed = Number.parseInt(summaryMatch[2] ?? '0', 10)
    return clampDocumentToolBatchStats(requested, applied, failed)
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const succeeded = Number(
      parsed.succeeded ?? parsed.success_count ?? parsed.added ?? parsed.success ?? NaN,
    )
    const failed = Number(parsed.failed ?? parsed.failure_count ?? parsed.failures ?? NaN)
    if (Number.isFinite(succeeded) && Number.isFinite(failed)) {
      return clampDocumentToolBatchStats(requested, succeeded, failed)
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
  if (isDocumentToolHardFailure(result)) return false
  if (
    /0\s*replacement|未找到|not found|no match|no occurrences|0\s*occurrences/i.test(result)
  ) {
    return false
  }
  return true
}

export function parseDocxReplaceTextsBatchResult(
  result: string,
  requested: number,
): DocxToolBatchStats {
  if (isDocumentToolHardFailure(result)) {
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
  if (isDocumentToolHardFailure(result)) {
    return { applied: 0, failed: requested }
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const edited = Number(parsed.edited ?? parsed.succeeded ?? parsed.success_count ?? NaN)
    if (Number.isFinite(edited)) {
      const applied = Math.max(0, Math.min(requested, edited))
      return clampDocumentToolBatchStats(requested, applied, requested - applied)
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

function normalizeAnchorText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function dedupeAnchorTexts(values: Iterable<string>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of values) {
    const normalized = normalizeAnchorText(value)
    if (normalized.length < 2 || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

export function isCommentAnchorNotFoundFailure(result: string): boolean {
  return /ANCHOR_NOT_FOUND|未找到|not found|Anchor text not found/i.test(result)
}

export function buildCommentAnchorCandidates(anchorText: string): string[] {
  const seeds = new Set<string>()
  const normalized = normalizeAnchorText(anchorText)
  if (normalized) seeds.add(normalized)

  for (const part of anchorText.split(/\n+/)) {
    const line = normalizeAnchorText(part)
    if (line.length >= 2) seeds.add(line)
  }

  const candidates: string[] = []
  for (const seed of seeds) {
    candidates.push(seed)
    if (seed.length > 60) candidates.push(seed.slice(0, 60))
    if (seed.length > 40) candidates.push(seed.slice(0, 40))
    if (seed.length > 24) candidates.push(seed.slice(0, 24))
    if (seed.length > 12) candidates.push(seed.slice(0, 12))
    if (seed.length > 8) candidates.push(seed.slice(0, 8))
    if (seed.length > 6) candidates.push(seed.slice(0, 6))
    if (seed.length > 4) candidates.push(seed.slice(0, 4))
  }

  return [...new Set(candidates.filter((candidate) => candidate.length >= 2))]
}

/** 当模型 anchor 在文档中不存在时，用子串 / 分词 seed 通过 search_text 反查真实锚点 */
export function buildCommentSearchSeeds(anchorText: string): string[] {
  const seeds = new Set<string>()

  for (const candidate of buildCommentAnchorCandidates(anchorText)) {
    seeds.add(candidate)
  }

  const normalized = normalizeAnchorText(anchorText)
  for (const part of normalized.split(/[，。；：、！？（）()\[\]《》""''\s]+/)) {
    const clause = part.trim()
    if (clause.length < 2) continue
    seeds.add(clause)
    for (const len of [16, 12, 8, 6, 4, 3, 2]) {
      if (clause.length >= len) seeds.add(clause.slice(0, len))
    }
  }

  const han = normalized.replace(/[^\u4e00-\u9fff]/g, '')
  for (const len of [6, 5, 4, 3, 2]) {
    for (let i = 0; i <= han.length - len; i++) {
      seeds.add(han.slice(i, i + len))
    }
  }

  return [...seeds].sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'))
}

export function parseFailedBatchCommentAnchors(result: string): string[] {
  const failed: string[] = []
  for (const match of result.matchAll(/\[FAIL\]\s+"([^"]+)"/g)) {
    if (match[1]) failed.push(match[1])
  }
  return failed
}

function extractSearchTextPayload(result: string): {
  matches?: Array<{ blockIndex?: number; fullText?: string; context?: string }>
} | null {
  const jsonMatch = result.match(/<json>\s*([\s\S]*?)\s*<\/json>/i)
  if (!jsonMatch?.[1]) return null
  try {
    return JSON.parse(jsonMatch[1]) as {
      matches?: Array<{ blockIndex?: number; fullText?: string; context?: string }>
    }
  } catch {
    return null
  }
}

function stripContextEllipsis(context: string): string {
  return normalizeAnchorText(context.replace(/^\.\.\./, '').replace(/\.\.\.$/, ''))
}

export function parseReadDocumentBlockLine(line: string): { blockIndex: number; text: string } | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^\[(\d+)\]\s*(?:\([^)]*\)\s*)*(?:\[[^\]]*\]\s*)*(.*)$/)
  if (!match?.[1]) return null
  const text = normalizeAnchorText(match[2] ?? '')
  if (!text) return null
  return { blockIndex: Number.parseInt(match[1], 10), text }
}

function collectAnchorsFromBlockText(fullText: string, query: string): string[] {
  const anchors = new Set<string>()
  const segments = new Set<string>([fullText])

  for (const line of fullText.split(/\n+/)) {
    segments.add(line)
    for (const cell of line.split(/\|/)) {
      segments.add(cell)
    }
  }

  for (const segment of segments) {
    const normalizedSegment = normalizeAnchorText(segment)
    if (normalizedSegment.length < 2) continue

    for (const lineAnchor of pickLineAnchorsFromBlockText(normalizedSegment, query)) {
      anchors.add(lineAnchor)
    }

    for (const snippet of buildAnchorSnippetsFromBlock(normalizedSegment, query)) {
      anchors.add(snippet)
    }

    const picked =
      pickAnchorFromDocumentText(normalizedSegment, query) ??
      pickAnchorFromDocumentText(normalizedSegment, normalizeAnchorText(query))
    if (picked) anchors.add(picked)

    if (normalizedSegment.length <= 48) {
      anchors.add(normalizedSegment)
    }
  }

  return [...anchors].filter((anchor) => anchor.length >= 2)
}

function orderCommentAnchorCandidates(
  candidates: Iterable<string>,
  preferredFirst: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const preferred of preferredFirst) {
    const normalized = normalizeAnchorText(preferred)
    if (normalized.length >= 2 && !seen.has(normalized)) {
      seen.add(normalized)
      ordered.push(normalized)
    }
  }

  const rest = [...new Set([...candidates].map((item) => normalizeAnchorText(item)).filter(Boolean))]
    .filter((candidate) => candidate.length >= 2 && !seen.has(candidate))
    .sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh-CN'))

  for (const candidate of rest) {
    seen.add(candidate)
    ordered.push(candidate)
  }

  return ordered
}

function orderVerifiedCommentAnchors(
  candidates: Iterable<string>,
  preferredFirst: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const preferred of preferredFirst) {
    const normalized = normalizeAnchorText(preferred)
    if (normalized.length >= 2 && !seen.has(normalized)) {
      seen.add(normalized)
      ordered.push(normalized)
    }
  }

  const rest = [...new Set([...candidates].map((item) => normalizeAnchorText(item)).filter(Boolean))]
    .filter((candidate) => candidate.length >= 2 && !seen.has(candidate))
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'))

  for (const candidate of rest) {
    seen.add(candidate)
    ordered.push(candidate)
  }

  return ordered
}

async function readDocumentBlockText(options: {
  workingPath: string
  blockIndex: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string | null> {
  const readTool = findDocxMcpToolName(options.tools, 'read_document')
  if (!readTool) return null

  try {
    const result = await executeToolCall(
      readTool,
      JSON.stringify({
        file_path: options.workingPath,
        start_paragraph: options.blockIndex,
        end_paragraph: options.blockIndex + 1,
      }),
      options.toolContext,
    )

    for (const line of result.split('\n')) {
      const parsed = parseReadDocumentBlockLine(line)
      if (parsed?.blockIndex === options.blockIndex) {
        return parsed.text
      }
    }
  } catch {
    return null
  }

  return null
}

async function collectVerifiedCommentAnchors(options: {
  workingPath: string
  searchQueries: readonly string[]
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<Set<string>> {
  const verified = new Set<string>()
  const searchTool = findDocxMcpToolName(options.tools, 'search_text')
  if (!searchTool) return verified

  if (options.paragraphIndex != null && options.paragraphIndex >= 0) {
    const blockText = await readDocumentBlockText({
      workingPath: options.workingPath,
      blockIndex: options.paragraphIndex,
      tools: options.tools,
      toolContext: options.toolContext,
    })
    if (blockText) {
      for (const query of options.searchQueries) {
        for (const anchor of collectAnchorsFromBlockText(blockText, query)) {
          verified.add(anchor)
        }
      }
    }
  }

  for (const query of options.searchQueries) {
    if (query.length < 2) continue

    try {
      const result = await executeToolCall(
        searchTool,
        JSON.stringify({
          file_path: options.workingPath,
          query,
          case_sensitive: false,
        }),
        options.toolContext,
      )
      if (/no matches found/i.test(result)) continue

      const payload = extractSearchTextPayload(result)
      const matches = payload?.matches ?? []

      for (const match of matches.slice(0, 3)) {
        if (match.context) {
          const context = stripContextEllipsis(match.context)
          for (const anchor of collectAnchorsFromBlockText(context, query)) {
            verified.add(anchor)
          }
        }

        if (match.fullText) {
          for (const anchor of collectAnchorsFromBlockText(match.fullText, query)) {
            verified.add(anchor)
          }
        }

        if (match.blockIndex != null) {
          const blockText = await readDocumentBlockText({
            workingPath: options.workingPath,
            blockIndex: match.blockIndex,
            tools: options.tools,
            toolContext: options.toolContext,
          })
          if (blockText) {
            for (const anchor of collectAnchorsFromBlockText(blockText, query)) {
              verified.add(anchor)
            }
          }
        }
      }
    } catch {
      // try next query seed
    }
  }

  return verified
}

/** 决定 add_comment 的锚点尝试顺序：已通过 search_text 验证的候选优先，未验证截断放最后 */
export function buildCommentAnchorAttemptOrder(options: {
  anchorText: string
  strictCandidates: readonly string[]
  verifiedAnchors: Iterable<string>
}): string[] {
  const verified = new Set<string>()
  for (const anchor of options.verifiedAnchors) {
    const normalized = normalizeAnchorText(anchor)
    if (normalized.length >= 2) verified.add(normalized)
  }

  const strict = dedupeAnchorTexts(options.strictCandidates)
  const normalizedOriginal = normalizeAnchorText(options.anchorText)

  if (verified.size === 0) {
    return dedupeAnchorTexts([normalizedOriginal, ...strict]).slice(0, MAX_COMMENT_ANCHOR_ATTEMPTS)
  }

  const strictVerified = strict.filter((anchor) => verified.has(anchor))
  const strictUnverified = strict.filter((anchor) => !verified.has(anchor))

  const preferred: string[] = [...strictVerified]
  if (normalizedOriginal.length >= 2 && verified.has(normalizedOriginal)) {
    if (!preferred.includes(normalizedOriginal)) preferred.push(normalizedOriginal)
  }

  const verifiedOrdered = orderVerifiedCommentAnchors(verified, preferred)
  const fallbacks = orderCommentAnchorCandidates(
    strictUnverified,
    normalizedOriginal.length >= 2 && !verified.has(normalizedOriginal) ? [normalizedOriginal] : [],
  ).slice(0, 6)

  return dedupeAnchorTexts([...verifiedOrdered, ...fallbacks]).slice(0, MAX_COMMENT_ANCHOR_ATTEMPTS)
}

export async function resolveCommentAnchorCandidates(options: {
  workingPath: string
  anchorText: string
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string[]> {
  const strict = buildCommentAnchorCandidates(options.anchorText)
  const searchSeeds = buildCommentSearchSeeds(options.anchorText).slice(0, MAX_COMMENT_SEARCH_SEEDS)

  const verified = await collectVerifiedCommentAnchors({
    workingPath: options.workingPath,
    searchQueries: searchSeeds,
    paragraphIndex: options.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })

  return buildCommentAnchorAttemptOrder({
    anchorText: options.anchorText,
    strictCandidates: strict,
    verifiedAnchors: verified,
  })
}

export async function resolveCommentAnchorText(options: {
  workingPath: string
  anchorText: string
  paragraphIndex?: number
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
}): Promise<string> {
  const candidates = await resolveCommentAnchorCandidates(options)
  return candidates[0] ?? options.anchorText
}

function pickAnchorFromDocumentText(fullText: string, query: string): string | null {
  const normalizedFull = normalizeAnchorText(fullText)
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return null

  const directIdx = normalizedFull.indexOf(normalizedQuery)
  if (directIdx >= 0) {
    return normalizedFull.slice(directIdx, directIdx + normalizedQuery.length)
  }

  const lowerFull = normalizedFull.toLowerCase()
  const lowerQuery = normalizedQuery.toLowerCase()
  const idx = lowerFull.indexOf(lowerQuery)
  if (idx < 0) return null

  return normalizedFull.slice(idx, idx + normalizedQuery.length)
}

function buildAnchorSnippetsFromBlock(fullText: string, query: string): string[] {
  const normalizedFull = normalizeAnchorText(fullText)
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return []

  const lowerFull = normalizedFull.toLowerCase()
  const idx = lowerFull.indexOf(normalizedQuery.toLowerCase())
  if (idx < 0) return []

  const snippets = new Set<string>()
  for (const len of [normalizedQuery.length, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2]) {
    if (len < 2 || len > normalizedFull.length) continue
    const end = Math.min(normalizedFull.length, idx + len)
    snippets.add(normalizedFull.slice(idx, end))
  }

  return [...snippets].filter((snippet) => snippet.length >= 2)
}

function pickLineAnchorsFromBlockText(fullText: string, query: string): string[] {
  const normalizedQuery = normalizeAnchorText(query)
  if (!normalizedQuery) return []

  const lines = fullText
    .split(/\n+/)
    .map((line) => normalizeAnchorText(line))
    .filter((line) => line.length >= 2)

  const lowerQuery = normalizedQuery.toLowerCase()
  const matchingLines = lines.filter((line) => line.toLowerCase().includes(lowerQuery))
  const seeds = matchingLines.length > 0 ? matchingLines : lines

  const anchors = new Set<string>()
  for (const line of seeds) {
    anchors.add(line)
    for (const snippet of buildAnchorSnippetsFromBlock(line, normalizedQuery)) {
      anchors.add(snippet)
    }
  }

  return [...anchors]
}

function summarizeCommentAnchorRetries(retryNotes: readonly string[]): string {
  if (retryNotes.length === 0) return ''
  const preview = retryNotes.slice(0, 3).join('；')
  const suffix = retryNotes.length > 3 ? ` 等 ${retryNotes.length} 个` : ''
  return `前 ${retryNotes.length} 个锚点未命中（${preview}${suffix}），已自动换锚重试。`
}

function summarizeReplaceSearchRetries(retryNotes: readonly string[]): string {
  if (retryNotes.length === 0) return ''
  const preview = retryNotes.slice(0, 3).join('；')
  const suffix = retryNotes.length > 3 ? ` 等 ${retryNotes.length} 个` : ''
  return `前 ${retryNotes.length} 个 search 未命中（${preview}${suffix}），已自动换定位重试。`
}

function buildReplaceToolArgs(options: {
  workingPath: string
  search: string
  replace: string
  toolName: string
}): string {
  if (options.toolName.includes('replace_texts')) {
    return JSON.stringify({
      file_path: options.workingPath,
      items: [{ search: options.search, replace: options.replace }],
      track_changes: true,
      author: 'Toolman',
    })
  }

  return JSON.stringify({
    file_path: options.workingPath,
    search: options.search,
    replace: options.replace,
    track_changes: true,
    author: 'Toolman',
  })
}

function replaceToolCallSucceeded(result: string, toolName: string): boolean {
  if (toolName.includes('replace_texts')) {
    return parseDocxReplaceTextsBatchResult(result, 1).applied > 0
  }
  return parseDocxSingleReplaceResult(result)
}

async function applySingleReplaceWithCandidates(options: {
  issue: DocxReviewIssue
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  toolName: string
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
  idPrefix: string
}): Promise<boolean> {
  const searchCandidates = await resolveCommentAnchorCandidates({
    workingPath: options.workingPath,
    anchorText: options.issue.anchorText,
    paragraphIndex: options.issue.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })
  if (searchCandidates.length === 0) return false

  const toolName =
    findDocxMcpToolName(options.tools, 'replace_text') ??
    findDocxMcpToolName(options.tools, 'replace_texts') ??
    options.toolName

  const callId = `${options.idPrefix}-${randomUUID()}`
  const retryNotes: string[] = []
  let lastResult = ''

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    arguments: buildReplaceToolArgs({
      workingPath: options.workingPath,
      search: options.issue.anchorText,
      replace: options.issue.replacement ?? '',
      toolName,
    }),
    status: 'running',
  })

  for (const search of searchCandidates) {
    const args = buildReplaceToolArgs({
      workingPath: options.workingPath,
      search,
      replace: options.issue.replacement ?? '',
      toolName,
    })

    try {
      const result = await executeToolCall(toolName, args, options.toolContext)
      lastResult = result
      if (replaceToolCallSucceeded(result, toolName)) {
        const retrySummary = summarizeReplaceSearchRetries(retryNotes)
        options.emitToolUpdate({
          toolCallId: callId,
          name: toolName,
          arguments: args,
          result: retrySummary ? `${retrySummary}\n${result.slice(0, 600)}` : result.slice(0, 800),
          status: 'done',
        })
        return true
      }
      if (isCommentAnchorNotFoundFailure(result)) {
        retryNotes.push(search.length > 48 ? `${search.slice(0, 48)}…` : search)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: result.slice(0, 800),
        status: 'failed',
      })
      return false
    } catch (error) {
      const message = toErrorMessage(error, 'replace_text 失败')
      lastResult = `Error: ${message}`
      if (isCommentAnchorNotFoundFailure(lastResult)) {
        retryNotes.push(search.length > 48 ? `${search.slice(0, 48)}…` : search)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: lastResult,
        status: 'failed',
      })
      return false
    }
  }

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    result:
      lastResult.slice(0, 800) ||
      `未找到可替换文本（已尝试 ${searchCandidates.length} 个 search 候选）`,
    status: 'failed',
  })
  return false
}

async function applySingleCommentWithCandidates(options: {
  issue: DocxReviewIssue
  workingPath: string
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  toolName: string
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
  idPrefix: string
}): Promise<boolean> {
  const anchorCandidates = await resolveCommentAnchorCandidates({
    workingPath: options.workingPath,
    anchorText: options.issue.anchorText,
    paragraphIndex: options.issue.paragraphIndex,
    tools: options.tools,
    toolContext: options.toolContext,
  })
  if (anchorCandidates.length === 0) return false

  const toolName =
    findDocxMcpToolName(options.tools, 'add_comment') ??
    findDocxMcpToolName(options.tools, 'add_comments') ??
    options.toolName

  const callId = `${options.idPrefix}-${randomUUID()}`
  const retryNotes: string[] = []
  let lastResult = ''

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    arguments: buildCommentToolArgs({
      workingPath: options.workingPath,
      anchorText: options.issue.anchorText,
      commentText: options.issue.comment ?? '',
      toolName,
    }),
    status: 'running',
  })

  for (const anchorText of anchorCandidates) {
    const args = buildCommentToolArgs({
      workingPath: options.workingPath,
      anchorText,
      commentText: options.issue.comment ?? '',
      toolName,
    })

    try {
      const result = await executeToolCall(toolName, args, options.toolContext)
      lastResult = result
      const itemFailed = commentToolCallFailed(result, toolName)
      if (!itemFailed) {
        const retrySummary = summarizeCommentAnchorRetries(retryNotes)
        options.emitToolUpdate({
          toolCallId: callId,
          name: toolName,
          arguments: args,
          result: retrySummary ? `${retrySummary}\n${result.slice(0, 600)}` : result.slice(0, 800),
          status: 'done',
        })
        return true
      }
      if (isCommentAnchorNotFoundFailure(result)) {
        retryNotes.push(anchorText.length > 48 ? `${anchorText.slice(0, 48)}…` : anchorText)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: result.slice(0, 800),
        status: 'failed',
      })
      return false
    } catch (error) {
      const message = toErrorMessage(error, 'add_comment 失败')
      lastResult = `Error: ${message}`
      if (isCommentAnchorNotFoundFailure(lastResult)) {
        retryNotes.push(anchorText.length > 48 ? `${anchorText.slice(0, 48)}…` : anchorText)
        continue
      }

      options.emitToolUpdate({
        toolCallId: callId,
        name: toolName,
        arguments: args,
        result: lastResult,
        status: 'failed',
      })
      return false
    }
  }

  options.emitToolUpdate({
    toolCallId: callId,
    name: toolName,
    result:
      lastResult.slice(0, 800) ||
      `未找到可用锚点（已尝试 ${anchorCandidates.length} 个候选）`,
    status: 'failed',
  })
  return false
}

function buildCommentToolArgs(options: {
  workingPath: string
  anchorText: string
  commentText: string
  toolName: string
}): string {
  if (options.toolName.includes('add_comments')) {
    return JSON.stringify({
      file_path: options.workingPath,
      comments: [
        {
          anchor_text: options.anchorText,
          comment_text: options.commentText,
          author: 'Toolman',
        },
      ],
      default_author: 'Toolman',
    })
  }

  return JSON.stringify({
    file_path: options.workingPath,
    anchor_text: options.anchorText,
    comment_text: options.commentText,
    author: 'Toolman',
  })
}

function commentToolCallFailed(result: string, toolName: string): boolean {
  if (isDocxToolHardFailure(result) && !isCommentAnchorNotFoundFailure(result)) return true
  if (isCommentAnchorNotFoundFailure(result)) return true
  if (toolName.includes('add_comments')) {
    return parseDocxCommentsBatchResult(result, 1).applied === 0
  }
  return false
}

function buildCommentAnchorForEditedIssue(issue: DocxReviewIssue): string {
  return issue.anchorText
}

export function collectExplanationCommentIssues(issues: DocxReviewIssue[]): DocxReviewIssue[] {
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
  const requested = options.issues.length
  if (requested === 0) return { applied: 0, failed: 0 }

  const commentTool =
    findDocxMcpToolName(options.tools, 'add_comment') ??
    findDocxMcpToolName(options.tools, 'add_comments')
  if (!commentTool) return { applied: 0, failed: requested }

  let applied = 0
  let failed = 0

  for (const issue of options.issues) {
    const ok = await applySingleCommentWithCandidates({
      issue,
      workingPath: options.workingPath,
      tools: options.tools,
      toolName: commentTool,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
      idPrefix: options.idPrefix,
    })
    if (ok) applied += 1
    else failed += 1
  }

  return { applied, failed }
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
  const preReplaceCommentIssues = [...commentOnlyIssues, ...explanationIssues]

  let commentsRequested = 0
  let commentsApplied = 0
  let commentsFailed = 0

  if (preReplaceCommentIssues.length > 0) {
    const stats = await applyCommentIssueBatches({
      issues: preReplaceCommentIssues,
      workingPath: options.workingCopy.workingPath,
      tools: options.tools,
      toolContext: options.toolContext,
      emitToolUpdate: options.emitToolUpdate,
      idPrefix: 'docx-review-comments',
    })
    commentsRequested += preReplaceCommentIssues.length
    commentsApplied += stats.applied
    commentsFailed += stats.failed
  }

  const replacementsRequested = replaceIssues.length
  let replacementsApplied = 0
  let replacementsFailed = 0
  const paragraphEditsRequested = paragraphIssues.length
  let paragraphEditsApplied = 0
  let paragraphEditsFailed = 0

  if (replaceIssues.length > 0) {
    if (!replaceTextsTool) {
      replacementsFailed = replacementsRequested
      errors.push('未找到 replace_texts / replace_text 工具')
    } else {
      for (const issue of replaceIssues) {
        const ok = await applySingleReplaceWithCandidates({
          issue,
          workingPath: options.workingCopy.workingPath,
          tools: options.tools,
          toolContext: options.toolContext,
          toolName: replaceTextsTool,
          emitToolUpdate: options.emitToolUpdate,
          idPrefix: 'docx-review-replace',
        })
        if (ok) {
          replacementsApplied += 1
        } else {
          replacementsFailed += 1
          errors.push(`替换失败(${issue.id})：${issue.anchorText.slice(0, 40)}`)
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
        const message = toErrorMessage(error, 'edit_paragraphs 失败')
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
          const message = toErrorMessage(error, 'edit_paragraph 失败')
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

  if (commentsFailed > 0 && commentsApplied === 0 && commentsRequested > 0) {
    errors.push('add_comments / add_comment 全部失败')
  } else if (commentsFailed > 0) {
    errors.push(`add_comments 部分失败（${commentsFailed}/${commentsRequested}）`)
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
