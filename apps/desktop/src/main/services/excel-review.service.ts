import { randomUUID } from 'node:crypto'
import { extractLlmJsonArray, toErrorMessage } from '@toolman/shared'

import type { ChatMessage, ToolDefinition } from '@toolman/model-gateway'
import { createModelGateway, type ProviderConfig } from '@toolman/model-gateway'
import type { ContentBlock } from '@toolman/shared'

import {
  findExcelMcpToolName,
  type ExcelReadSnapshot,
  type ExcelWorkingCopy,
} from './excel-mcp-task.service'
import { executeToolCall, type ToolExecutionContext } from './tool-executor.service'
import {
  countExcelToolApplyResult,
  DOCUMENT_REVIEW_SEVERITIES,
  parseDocumentReviewSeverity,
  type DocumentReviewIssueSeverity,
} from './document-review.util'

const gateway = createModelGateway()

export type ExcelReviewIssueAction = 'modify' | 'highlight'
export type ExcelReviewIssueSeverity = DocumentReviewIssueSeverity

export interface ExcelReviewIssue {
  id: string
  severity: ExcelReviewIssueSeverity
  category: string
  action: ExcelReviewIssueAction
  sheet: string
  cell: string
  value?: string | number | boolean | null
  comment?: string
  color?: string
}

export interface ExcelReviewApplyResult {
  fileName: string
  workingPath: string
  issues: ExcelReviewIssue[]
  parseWarnings: string[]
  modifiesRequested: number
  modifiesApplied: number
  modifiesFailed: number
  highlightsRequested: number
  highlightsApplied: number
  highlightsFailed: number
  errors: string[]
}

const VALID_ACTIONS = new Set<ExcelReviewIssueAction>(['modify', 'highlight'])
const VALID_SEVERITIES = DOCUMENT_REVIEW_SEVERITIES

export function requestsExcelDirectFix(userRequest: string): boolean {
  const text = (userRequest || '审查表格错误并生成修订版').trim()
  return /修正|修改|纠正|更正|改过来|改正|修订|fix|correct|revise|生成修订版|审查.*错误/i.test(text)
}

function parseAmountFromComment(comment: string): number | null {
  const match = comment.match(/[\$€£]?\s*([\d,]+\.\d{2})/)
  if (!match?.[1]) return null
  const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const USD_ONES = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
]
const USD_TEENS = [
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
]
const USD_TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
]

function usdUnder100(n: number): string {
  if (n === 0) return ''
  if (n < 10) return USD_ONES[n]!
  if (n < 20) return USD_TEENS[n - 10]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones ? `${USD_TENS[tens]}-${USD_ONES[ones]}` : USD_TENS[tens]!
}

function usdUnder1000(n: number): string {
  if (n === 0) return ''
  if (n < 100) return usdUnder100(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const head = `${USD_ONES[hundreds]} HUNDRED`
  return rest ? `${head} ${usdUnder100(rest)}` : head
}

function usdIntegerWords(n: number): string {
  if (n === 0) return 'ZERO'
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (billions) parts.push(`${usdUnder1000(billions)} BILLION`)
  if (millions) parts.push(`${usdUnder1000(millions)} MILLION`)
  if (thousands) parts.push(`${usdUnder1000(thousands)} THOUSAND`)
  if (rest) parts.push(usdUnder1000(rest))
  return parts.join(' ')
}

export function formatUsdAmountInWords(amount: number): string {
  const safe = Math.round(amount * 100) / 100
  const dollars = Math.floor(safe)
  const cents = Math.round((safe - dollars) * 100)
  const dollarWords = usdIntegerWords(dollars)
  if (cents === 0) return `SAY U.S. DOLLARS ${dollarWords} ONLY.`
  return `SAY U.S. DOLLARS ${dollarWords} AND ${usdUnder100(cents)} CENTS ONLY.`
}

export function buildAmountInWordsCellValue(existingText: string, amount: number): string {
  const wordsLine = formatUsdAmountInWords(amount)
  const trimmed = existingText.trim()
  if (!trimmed) return wordsLine

  if (/AMOUNT\s+IN\s+WORDS/i.test(trimmed)) {
    const sayIndex = trimmed.search(/SAY\s+U\.?S\.?\s+DOLLARS/i)
    if (sayIndex >= 0) {
      return `${trimmed.slice(0, sayIndex)}${wordsLine}`
    }
    const prefix = trimmed.match(/^([\s\S]*?AMOUNT\s+IN\s+WORDS\s*:?\s*)/i)?.[1]
    if (prefix) return `${prefix}${wordsLine}`
    return `${trimmed}\n${wordsLine}`
  }

  if (/SAY\s+U\.?S\.?\s+DOLLARS/i.test(trimmed)) return wordsLine
  return wordsLine
}

function isAmountInWordsIssue(
  issue: ExcelReviewIssue,
  sheet: string,
  snapshot?: ExcelReadSnapshot,
): boolean {
  const comment = issue.comment ?? ''
  const value = String(issue.value ?? '')
  const cellText = snapshot?.cellsBySheet[sheet]?.[issue.cell.toUpperCase()] ?? ''
  return /SAY\s+U\.?S\.?\s+DOLLARS|金额\s*大写|AMOUNT\s+IN\s+WORDS|大写金额|in\s+words/i.test(
    `${comment}\n${value}\n${cellText}`,
  )
}

function scoreAmountInWordsCellText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  let score = 0
  if (/AMOUNT\s+IN\s+WORDS/i.test(text)) score += 100
  if (/SAY\s+U\.?S\.?\s+DOLLARS/i.test(text)) score += 80
  if (
    /\b(?:ONE|HUNDRED|THOUSAND)\b/i.test(text) &&
    /CENTS?\s+ONLY/i.test(text)
  ) {
    score += 20
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) score -= 100
  if (/^=/.test(trimmed)) score -= 50
  if (/^Total overdue interest/i.test(trimmed)) score -= 30
  return score
}

export function findAmountInWordsCellFromSnapshot(
  sheet: string,
  snapshot?: ExcelReadSnapshot,
): string | null {
  const cells = snapshot?.cellsBySheet[sheet]
  if (!cells) return null

  let best: string | null = null
  let bestScore = 0
  for (const [addr, text] of Object.entries(cells)) {
    const score = scoreAmountInWordsCellText(text)
    if (score > bestScore) {
      bestScore = score
      best = addr
    }
  }
  return bestScore > 0 ? best : null
}

function parseCellRow(address: string): string | null {
  const match = address.toUpperCase().match(/^[A-Z]+(\d+)$/)
  return match?.[1] ?? null
}

function enrichUsdAmountModifyValue(
  issue: ExcelReviewIssue,
  snapshot?: ExcelReadSnapshot,
): ExcelReviewIssue {
  if (issue.action !== 'modify') return issue
  if (issue.value != null && issue.value !== '' && !isAmountInWordsIssue(issue, issue.sheet, snapshot)) {
    return issue
  }

  const comment = issue.comment ?? ''
  const cellText = snapshot?.cellsBySheet[issue.sheet]?.[issue.cell] ?? ''
  if (!isAmountInWordsIssue(issue, issue.sheet, snapshot)) return issue

  const amount = parseAmountFromComment(comment)
  if (amount == null) return issue

  const existingText =
    cellText ||
    Object.values(snapshot?.cellsBySheet[issue.sheet] ?? {}).find((text) =>
      /SAY\s+U\.?S\.?\s+DOLLARS|AMOUNT\s+IN\s+WORDS/i.test(text),
    ) ||
    ''

  return { ...issue, value: buildAmountInWordsCellValue(existingText, amount) }
}

function snapCellViaMerges(sheet: string, cell: string, snapshot?: ExcelReadSnapshot): string {
  const merges = snapshot?.mergesBySheet[sheet] ?? []
  const match = cell.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) return cell
  const colLetters = match[1]!
  const row = Number.parseInt(match[2]!, 10)
  let col = 0
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }

  for (const merge of merges) {
    const parts = merge.split(':')
    const startMatch = (parts[0] ?? merge).toUpperCase().match(/^([A-Z]+)(\d+)$/)
    const endMatch = (parts[1] ?? parts[0] ?? merge).toUpperCase().match(/^([A-Z]+)(\d+)$/)
    if (!startMatch || !endMatch) continue
    const startCol = lettersToCol(startMatch[1]!)
    const startRow = Number.parseInt(startMatch[2]!, 10)
    const endCol = lettersToCol(endMatch[1]!)
    const endRow = Number.parseInt(endMatch[2]!, 10)
    if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
      return `${startMatch[1]}${startMatch[2]}`
    }
  }
  return cell
}

function lettersToCol(letters: string): number {
  let col = 0
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  return col
}

function snapCellToRowContent(
  sheet: string,
  cell: string,
  snapshot?: ExcelReadSnapshot,
  issue?: ExcelReviewIssue,
): string {
  if (issue && isAmountInWordsIssue(issue, sheet, snapshot)) {
    const wordsCell = findAmountInWordsCellFromSnapshot(sheet, snapshot)
    if (wordsCell) return wordsCell
  }

  if (!snapshot) return cell
  const cells = snapshot.cellsBySheet[sheet]
  if (!cells) return cell
  const upper = cell.toUpperCase()
  if (cells[upper]?.trim()) return upper

  const row = parseCellRow(upper)
  if (!row) return upper

  let best = upper
  let bestScore = 0
  for (const [addr, text] of Object.entries(cells)) {
    if (parseCellRow(addr) !== row) continue
    const score = text.trim().length
    if (score > bestScore) {
      bestScore = score
      best = addr
    }
  }
  return best
}

function normalizeSheetName(sheet: string, sheetNames: string[]): string {
  if (sheetNames.includes(sheet)) return sheet
  const caseInsensitive = sheetNames.find((name) => name.toLowerCase() === sheet.toLowerCase())
  if (caseInsensitive) return caseInsensitive
  if ((sheet === 'Sheet1' || sheet === 'sheet1') && sheetNames.length === 1) {
    return sheetNames[0]!
  }
  return sheet
}

export function normalizeExcelReviewIssues(
  issues: ExcelReviewIssue[],
  options: { userRequest: string; snapshot?: ExcelReadSnapshot },
): ExcelReviewIssue[] {
  const sheetNames = options.snapshot?.sheetNames ?? []
  const preferModify = requestsExcelDirectFix(options.userRequest)

  return issues.map((issue) => {
    let sheet = issue.sheet
    if (sheetNames.length > 0) {
      sheet = normalizeSheetName(issue.sheet, sheetNames)
    }
    let cell = issue.cell.toUpperCase()
    cell = snapCellViaMerges(sheet, cell, options.snapshot)

    let action = issue.action
    const value = issue.value
    const comment = issue.comment

    const draftIssue = { ...issue, sheet, cell, action, value, comment }
    if (isAmountInWordsIssue(draftIssue, sheet, options.snapshot)) {
      const wordsCell = findAmountInWordsCellFromSnapshot(sheet, options.snapshot)
      if (wordsCell) cell = wordsCell
    } else {
      cell = snapCellToRowContent(sheet, cell, options.snapshot, draftIssue)
    }

    if (
      preferModify &&
      action === 'highlight' &&
      (issue.category === 'error' || issue.severity === 'high') &&
      comment &&
      /金额|大写|SAY U\.S\. DOLLARS|不符|应改为|修正为|应修正/i.test(comment)
    ) {
      const cellText = options.snapshot?.cellsBySheet[sheet]?.[cell] ?? ''
      if (
        (/SAY\s+U\.?S\.?\s+DOLLARS|AMOUNT\s+IN\s+WORDS/i.test(cellText) ||
          /金额|大写/i.test(comment)) &&
        /[\d,]+\.\d{2}/.test(comment)
      ) {
        action = 'modify'
      }
    }

    const enriched = enrichUsdAmountModifyValue(
      {
        ...issue,
        sheet,
        cell,
        action,
        value,
        comment,
      },
      options.snapshot,
    )

    return enriched
  })
}
export function buildExcelAuditSystemPrompt(options?: { userRequest?: string }): string {
  const fixMode = requestsExcelDirectFix(options?.userRequest ?? '')
  const fixRules = fixMode
    ? [
        '**修正模式（重要）**：用户要求审查错误并生成修订版。凡能确定正确单元格完整文本的 factual error（含金额大写 SAY U.S. DOLLARS ... ONLY 与合计不符、错别字、留空应填项），**必须** action=modify 并填写 value 为替换后的整段文本；modify 可同时填写 comment 作为批注说明。',
    '- 金额大写（SAY U.S. DOLLARS ... ONLY / NET PAYABLE AMOUNT IN WORDS）必须修改**含该英文大写句子的单元格**（通常在 AMOUNT IN WORDS 行，如 A26），**禁止**改合计数字列（如 H22/H23）',
    '- 金额大写 modify 的 value 须保留原有标题行（如 NET PAYABLE AMOUNT IN WORDS:），仅替换 SAY U.S. DOLLARS ... ONLY 部分',
        'highlight **仅**用于无法确定替换文案、需人工判断的提醒；**禁止**用 highlight 代替本应 modify 的确定错误。',
      ]
    : []

  return [
    '你是 Excel 表格审查助手。根据 read_excel / review_excel 工具输出与用户要求，输出结构化 issue JSON 数组。',
    '**只输出 JSON 数组**，不要 Markdown 代码块、不要解释、不要伪工具调用、不要模拟下载链接。',
    '每个 issue 对象格式：',
    '{',
    '  "id": "1",',
    '  "severity": "high|medium|low",',
    '  "category": "error|wording|formula|format|other",',
    '  "action": "modify|highlight",',
    '  "sheet": "工作表名称（必须与 read_excel 返回的 name 完全一致）",',
    '  "cell": "B12",',
    '  "value": "修正后的单元格文本或数值（action=modify 时必填）",',
    '  "comment": "批注说明（highlight 必填；modify 建议填写修改理由）",',
    '  "color": "FFFF00"',
    '}',
    '规则：',
    '- 发现需要改正单元格内容（如金额大写与合计不符、错别字、应填项留空）时，使用 action=modify 并填写 value',
    '- 仅需标黄提示、不需改正文时，使用 action=highlight，填写 comment，color 默认 FFFF00',
    '- sheet 名称与 cell 地址必须来自 read_excel 输出；合并区域请使用含文本的主单元格地址',
    '- 列出用户关心的全部问题，不要只给一条',
    '- 禁止输出假想的工具执行结果或下载链接',
    ...fixRules,
  ].join('\n')
}

export function buildExcelAuditUserMessage(options: {
  userRequest: string
  workingPath: string
  fileName: string
  snapshot?: ExcelReadSnapshot
}): string {
  const fixMode = requestsExcelDirectFix(options.userRequest)
  const sheetHint =
    options.snapshot?.sheetNames.length
      ? `工作表名称（必须使用）：${options.snapshot.sheetNames.join('、')}`
      : '工作表名称见 read_excel 输出中的 name 字段'
  const actionHint = fixMode
    ? '用户要求生成修订版并修正错误：可确定正确值的 error 必须用 modify + value；金额大写须写出完整英文 SAY U.S. DOLLARS ... ONLY 句子。'
    : '可改正文用 modify，仅提醒用 highlight。'

  return [
    '请审查以下 Excel 并输出 JSON issue 数组。',
    `用户要求：${options.userRequest.trim() || '审查表格错误并生成修订版'}`,
    `修订版文件：${options.fileName}`,
    `修订版绝对路径：${options.workingPath}`,
    sheetHint,
    `表格内容见上方 read_excel / review_excel 工具输出。请基于该输出列出全部 issue。${actionHint}`,
  ].join('\n')
}

export function buildExcelFinalSummaryPrompt(results: ExcelReviewApplyResult[]): string {
  const lines = results.map((result) => {
    const parts = [
      `- 文件：${result.fileName}`,
      `- 修订版路径：${result.workingPath}`,
      `- 识别问题：${result.issues.length} 项`,
      `- 已修改单元格：${result.modifiesApplied}/${result.modifiesRequested}`,
      `- 已高亮批注：${result.highlightsApplied}/${result.highlightsRequested}`,
    ]
    if (result.errors.length) {
      parts.push(`- 部分失败：${result.errors.slice(0, 3).join('；')}`)
    }
    return parts.join('\n')
  })

  return [
    'Excel 结构化审查与修订已完成。请向用户输出简洁中文总结，包含：',
    '1. 主要发现（按严重级别归纳）',
    '2. 已写入修订版的修改与高亮数量',
    '3. 若有未成功项，简要说明原因',
    '**禁止**手写 Markdown 下载链接、禁止写「模拟链接」或「假设工具已执行」。',
    '修订版文件链接将由应用在消息末尾自动附上，你无需提供 URL。',
    '',
    '执行结果：',
    lines.join('\n\n'),
  ].join('\n')
}

export function formatExcelReviewReport(result: ExcelReviewApplyResult): string {
  if (result.issues.length === 0) {
    return [
      `## Excel 审查（${result.fileName}）`,
      '',
      '未从模型输出中解析到有效 issue。',
      '',
      '修订版文件见下方「修订版路径」与「打开文件」。',
      '',
    ].join('\n')
  }

  const issueLines = result.issues
    .slice(0, 30)
    .map(
      (issue) =>
        `- [${issue.severity}/${issue.category}] ${issue.action === 'modify' ? '修改' : '高亮'} ${issue.sheet}!${issue.cell}：${issue.comment ?? String(issue.value ?? '')}`,
    )
    .join('\n')
  const more =
    result.issues.length > 30 ? `\n- … 另有 ${result.issues.length - 30} 项` : ''

  return [
    `## Excel 审查结果（${result.fileName}）`,
    '',
    `- 修订版文件：见下方「修订版路径」与「打开文件」`,
    `- 已修改：${result.modifiesApplied}/${result.modifiesRequested} · 已高亮：${result.highlightsApplied}/${result.highlightsRequested}`,
    '',
    '### 问题清单（摘要）',
    issueLines + more,
    '',
  ].join('\n')
}

export function buildExcelReviewSummaryBlock(
  result: ExcelReviewApplyResult,
): Extract<ContentBlock, { type: 'docx_review_summary' }> {
  return {
    type: 'docx_review_summary',
    fileName: result.fileName,
    workingPath: result.workingPath,
    issuesFound: result.issues.length,
    commentsRequested: result.highlightsRequested,
    commentsApplied: result.highlightsApplied,
    commentsFailed: result.highlightsFailed,
    replacementsRequested: result.modifiesRequested,
    replacementsApplied: result.modifiesApplied,
    replacementsFailed: result.modifiesFailed,
    paragraphEditsRequested: 0,
    paragraphEditsApplied: 0,
    paragraphEditsFailed: 0,
    errors: result.errors,
    parseWarnings: result.parseWarnings,
  }
}

export function parseExcelReviewIssues(raw: string): {
  issues: ExcelReviewIssue[]
  warnings: string[]
} {
  const warnings: string[] = []
  const parsed = extractLlmJsonArray(raw)
  if (!parsed) {
    warnings.push('模型输出不是有效 JSON 数组')
    return { issues: [], warnings }
  }

  const issues: ExcelReviewIssue[] = []
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const action = String(row.action ?? '').toLowerCase() as ExcelReviewIssueAction
    const severity = parseDocumentReviewSeverity(row.severity)
    const sheet = String(row.sheet ?? row.sheetName ?? '').trim()
    const cell = String(row.cell ?? row.address ?? '')
      .trim()
      .toUpperCase()
    if (!VALID_ACTIONS.has(action) || !sheet || !cell) {
      warnings.push(`跳过无效 issue #${index + 1}`)
      continue
    }
    if (!VALID_SEVERITIES.has(severity)) {
      warnings.push(`issue #${index + 1} severity 无效，已用 medium`)
    }
    issues.push({
      id: String(row.id ?? index + 1),
      severity,
      category: String(row.category ?? 'other'),
      action,
      sheet,
      cell,
      value:
        row.value === null
          ? null
          : typeof row.value === 'string' ||
              typeof row.value === 'number' ||
              typeof row.value === 'boolean'
            ? row.value
            : row.value != null
              ? String(row.value)
              : undefined,
      comment: row.comment != null ? String(row.comment) : undefined,
      color: row.color != null ? String(row.color) : undefined,
    })
  }

  return { issues, warnings }
}

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

async function applyExcelReviewIssues(options: {
  issues: ExcelReviewIssue[]
  workingCopy: ExcelWorkingCopy
  tools: ToolDefinition[]
  toolContext: ToolExecutionContext
  emitToolUpdate: (update: {
    toolCallId: string
    name: string
    arguments?: string
    result?: string
    status: 'running' | 'done' | 'failed'
  }) => void
}): Promise<{
  modifiesRequested: number
  modifiesApplied: number
  modifiesFailed: number
  highlightsRequested: number
  highlightsApplied: number
  highlightsFailed: number
  errors: string[]
}> {
  const modifyTool = findExcelMcpToolName(options.tools, 'modify_excel_cells')
  const highlightTool = findExcelMcpToolName(options.tools, 'highlight_excel_cells')
  const modifyIssues = options.issues.filter((issue) => issue.action === 'modify')
  const highlightIssues = options.issues.filter((issue) => issue.action === 'highlight')
  const errors: string[] = []

  let modifiesApplied = 0
  let modifiesFailed = 0
  let highlightsApplied = 0
  let highlightsFailed = 0

  if (modifyIssues.length > 0) {
    if (!modifyTool) {
      modifiesFailed = modifyIssues.length
      errors.push('未找到 modify_excel_cells 工具')
    } else {
      const callId = `excel-review-modify-${randomUUID()}`
      const args = JSON.stringify({
        filePath: options.workingCopy.workingPath,
        changes: modifyIssues.map((issue) => ({
          sheet: issue.sheet,
          cell: issue.cell,
          value: issue.value,
          comment: issue.comment,
        })),
      })
      options.emitToolUpdate({ toolCallId: callId, name: modifyTool, arguments: args, status: 'running' })
      try {
        const result = await executeToolCall(modifyTool, args, options.toolContext)
        const counts = countExcelToolApplyResult(result, 'modify')
        modifiesApplied = counts.applied
        modifiesFailed = modifyIssues.length - counts.applied
        if (modifiesFailed > 0) errors.push(`部分单元格修改失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: modifyTool,
          arguments: args,
          result: result.slice(0, 800),
          status: modifiesFailed === modifyIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        modifiesFailed = modifyIssues.length
        errors.push(toErrorMessage(error, 'modify_excel_cells 失败'))
        options.emitToolUpdate({
          toolCallId: callId,
          name: modifyTool,
          arguments: args,
          result: errors[errors.length - 1],
          status: 'failed',
        })
      }
    }
  }

  if (highlightIssues.length > 0) {
    if (!highlightTool) {
      highlightsFailed = highlightIssues.length
      errors.push('未找到 highlight_excel_cells 工具')
    } else {
      const callId = `excel-review-highlight-${randomUUID()}`
      const args = JSON.stringify({
        filePath: options.workingCopy.workingPath,
        highlights: highlightIssues.map((issue) => ({
          sheet: issue.sheet,
          cell: issue.cell,
          color: issue.color ?? 'FFFF00',
          comment: issue.comment ?? issue.category,
        })),
      })
      options.emitToolUpdate({
        toolCallId: callId,
        name: highlightTool,
        arguments: args,
        status: 'running',
      })
      try {
        const result = await executeToolCall(highlightTool, args, options.toolContext)
        const counts = countExcelToolApplyResult(result, 'highlight')
        highlightsApplied = counts.applied
        highlightsFailed = highlightIssues.length - counts.applied
        if (highlightsFailed > 0) errors.push(`部分高亮失败：${result.slice(0, 200)}`)
        options.emitToolUpdate({
          toolCallId: callId,
          name: highlightTool,
          arguments: args,
          result: result.slice(0, 800),
          status: highlightsFailed === highlightIssues.length ? 'failed' : 'done',
        })
      } catch (error) {
        highlightsFailed = highlightIssues.length
        errors.push(toErrorMessage(error, 'highlight_excel_cells 失败'))
        options.emitToolUpdate({
          toolCallId: callId,
          name: highlightTool,
          arguments: args,
          result: errors[errors.length - 1],
          status: 'failed',
        })
      }
    }
  }

  return {
    modifiesRequested: modifyIssues.length,
    modifiesApplied,
    modifiesFailed,
    highlightsRequested: highlightIssues.length,
    highlightsApplied,
    highlightsFailed,
    errors,
  }
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
