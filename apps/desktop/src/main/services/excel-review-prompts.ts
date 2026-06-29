import type { ContentBlock } from '@toolman/shared'

import type { ExcelReviewApplyResult } from './excel-review-types'
import { requestsExcelDirectFix } from './excel-review-types'
import type { ExcelReadSnapshot } from './excel-mcp-task.service'

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
