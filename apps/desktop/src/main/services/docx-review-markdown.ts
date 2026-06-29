import { basename, normalize } from 'node:path'

import type { ChatMessage } from '@toolman/model-gateway'
import type { ContentBlock } from '@toolman/shared'
import { DOCX_MCP_SERVER_ID } from '@toolman/shared'

import { requestsDocxParagraphRewrite, type DocxWorkingCopy } from './docx-mcp-task.service'
import { resolveMcpShortToolName } from './document-mcp-task.util'
import type { DocxReviewApplyResult } from './docx-review-types'
import { DOCX_FILE_LINK_SCHEME } from './docx-review-types'

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

function readMessageTextContent(content: ChatMessage['content'] | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

/** Extract read_document tool output for a working copy from chat messages. */
export function resolveDocxReadDocumentContent(
  chatMessages: readonly ChatMessage[],
  workingPath: string,
): string | null {
  const normalizedWorking = normalizeDocxPath(workingPath)
  const toolResults = new Map<string, string>()

  for (const message of chatMessages) {
    const text = readMessageTextContent(message.content).trim()
    if (message.role === 'tool' && message.tool_call_id && text) {
      toolResults.set(message.tool_call_id, text)
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
