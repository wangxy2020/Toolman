import {
  EPC_WORK5_PAYMENT_AGENT_NARRATION_MARKER,
  EPC_WORK5_PAYMENT_COMMAND_TEMPLATE,
  EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT,
  EPC_WORK5_PAYMENT_QUICK_PHRASE_TITLE,
  EPC_WORK5_PAYMENT_REPORT_MARKER,
  EPC_WORK5_PAYMENT_REPORT_TITLE,
  EPC_WORK5_PAYMENT_WORKFLOW_STEPS,
  EPC_WORK5_DATA_OVERRIDES_RELATIVE,
  type PaymentWorkflowReport
} from '@shared/epcCommercialTypes'
import { ipcTokenToPeriod } from './epcCommercialMessage'
import {
  EPC_WORK5_STEP1_INTRO,
  formatWork5NarrationHints,
  formatWork5Step1Section,
  formatWork5Steps2to5Markdown,
  work5RequiresDiagnosticAnalysis
} from './epcWork5PaymentReportUtils'

export {
  EPC_WORK5_PAYMENT_COMMAND_DESCRIPTION,
  EPC_WORK5_PAYMENT_COMMAND_TEMPLATE,
  EPC_WORK5_PAYMENT_REPORT_TITLE
} from '@shared/epcCommercialTypes'

/** epc <ipcx|ipc4|…> to payment */
const EPC_WORK5_COMMAND_LINE_PATTERN = /^epc\s+(\S+)\s+to\s+payment\s*$/i

const PLACEHOLDER_IPC_TOKENS = new Set(['ipcx', 'schx-ipcx', 'ipc_x', 'ipc-x'])

export const normalizeEpcWork5CommandInput = (command: string): string =>
  command.trim().split('\n')[0]?.trim().replace(/^\//, '') ?? ''

export const isEpcWork5PaymentCommand = (text: string): boolean =>
  EPC_WORK5_COMMAND_LINE_PATTERN.test(normalizeEpcWork5CommandInput(text))

export const isEpcWork5PaymentSlashCommand = (command: string): boolean => {
  const normalized = normalizeEpcWork5CommandInput(command)
  if (!normalized) return false
  if (normalized === normalizeEpcWork5CommandInput(EPC_WORK5_PAYMENT_COMMAND_TEMPLATE)) return true
  return EPC_WORK5_COMMAND_LINE_PATTERN.test(normalized)
}

/** 斜杠命令选中后填入输入框（仅命令，简洁展示） */
export const buildEpcWork5PaymentSlashCommandFillText = (): string => EPC_WORK5_PAYMENT_COMMAND_TEMPLATE

/** 是否为内置工作 5 快捷短语（按 ID） */
export const isBuiltinEpcWork5PaymentQuickPhraseId = (phraseId: string | undefined): boolean =>
  phraseId === EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID

const normalizeText = (text: string): string => text.trim().replace(/\r\n/g, '\n')

/** 是否匹配工作 5 快捷短语 / 自然语言工作流说明 */
export const isEpcWork5PaymentWorkflowInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork5PaymentQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = normalizeText(text)
  if (!trimmed) return false
  if (trimmed.includes(EPC_WORK5_PAYMENT_QUICK_PHRASE_TITLE)) return true
  return (
    trimmed.includes('进度款') &&
    trimmed.includes('支付') &&
    (trimmed.includes('应付金额') || trimmed.includes('支付日期') || trimmed.includes('预付款'))
  )
}

/** 斜杠命令或快捷短语：同一套进度款支付信息统计工作 */
export const isEpcWork5PaymentWorkInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork5PaymentQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isEpcWork5PaymentCommand(trimmed)) return true
  return isEpcWork5PaymentWorkflowInput(trimmed, options)
}

/** 解析工作 5 执行命令 */
export const parseEpcWork5PaymentCommandInput = (
  rawText: string
): { matched: boolean; period?: string; usesPlaceholders?: boolean } => {
  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let ipcToken: string | undefined
  for (const line of lines) {
    const normalized = normalizeEpcWork5CommandInput(line)
    const match = normalized.match(EPC_WORK5_COMMAND_LINE_PATTERN)
    if (match) {
      ipcToken = match[1]
      break
    }
  }

  if (!ipcToken) return { matched: false }

  const period = ipcTokenToPeriod(ipcToken)
  const usesPlaceholders = PLACEHOLDER_IPC_TOKENS.has(ipcToken.toLowerCase())

  return { matched: true, period, usesPlaceholders }
}

export interface EpcWork5PaymentWorkLaunch {
  matched: boolean
  period?: string
  /** 对话框用户气泡展示（斜杠命令保持简洁原文） */
  visibleUserRequest: string
  /** 引擎 + 智能体汇报用的任务说明（与快捷短语正文一致） */
  workflowUserRequest: string
}

export const getEpcWork5PaymentWorkflowUserRequest = (
  rawText: string,
  options?: { quickPhraseId?: string }
): string => {
  if (
    isBuiltinEpcWork5PaymentQuickPhraseId(options?.quickPhraseId) ||
    isEpcWork5PaymentWorkflowInput(rawText, options) ||
    parseEpcWork5PaymentCommandInput(rawText).matched
  ) {
    return EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT
  }
  return rawText.trim()
}

/** 斜杠命令与快捷短语共用：解析期数并决定是否启动工作 5 */
export const resolveEpcWork5PaymentWorkLaunch = (
  rawText: string,
  options?: { quickPhraseId?: string }
): EpcWork5PaymentWorkLaunch => {
  const trimmed = rawText.trim()
  if (!isEpcWork5PaymentWorkInput(trimmed, options)) {
    return { matched: false, visibleUserRequest: trimmed, workflowUserRequest: trimmed }
  }

  const command = parseEpcWork5PaymentCommandInput(trimmed)
  const period = command.matched && !command.usesPlaceholders ? command.period : undefined

  return {
    matched: true,
    period,
    visibleUserRequest: trimmed,
    workflowUserRequest: getEpcWork5PaymentWorkflowUserRequest(trimmed, options)
  }
}

/** 传给智能体 API 的本地执行上下文（用户气泡中不展示） */
export const buildEpcWork5PaymentAgentContextContent = (params: {
  workspaceRoot: string
  visibleUserRequest: string
  period?: string
  report?: PaymentWorkflowReport
  errorMessage?: string
  placeholderHint?: string
}): string => {
  const formatReport = (report: PaymentWorkflowReport, workflowError?: string): string => {
    const hintLines = formatWork5NarrationHints(report, workflowError)
    return [
      `# ${EPC_WORK5_PAYMENT_REPORT_TITLE}`,
      '',
      formatWork5Step1Section(report, workflowError),
      '',
      formatWork5Steps2to5Markdown(report, workflowError).join('\n'),
      ...(hintLines.length > 0 ? ['', ...hintLines] : [])
    ].join('\n')
  }

  const buildWork5DiagnosticInstructions = (): string => {
    const needsDiagnostic = params.report
      ? work5RequiresDiagnosticAnalysis(params.report, params.errorMessage)
      : Boolean(params.errorMessage?.trim())

    if (!needsDiagnostic) {
      return `**诊断分析与人工修复建议**：
- **不要输出**该章节（本次各步成功，或步骤 1 待处理 aligned 为 0 导致步骤 2～5 正常跳过）。
- 勿凭空编造支付指标或写出路径问题。`
    }

    return `**诊断分析与人工修复建议**（须在报告末尾单独成章）：
- 仅在有步骤 **失败** 或引擎报错时输出可执行的人工修复建议。
- 指出失败文件、缺失 IPC 列或汇总表写出不完整等原因。
- 你不直接修改文件，也不运行脚本。`
  }

  let engineSection = ''
  if (params.placeholderHint) {
    engineSection = params.placeholderHint
  } else if (params.report) {
    engineSection = formatReport(params.report, params.errorMessage)
  } else if (params.errorMessage) {
    engineSection = `执行失败：${params.errorMessage}`
  } else {
    engineSection = '（无执行结果）'
  }

  const periodInfo = params.period ? `\n期数：${params.period}` : ''

  return `${EPC_WORK5_PAYMENT_AGENT_NARRATION_MARKER}

你是成本智能体。用户已发起「进度款申请与支付数据统计」；本地 Rust 引擎已执行完毕。

**回复格式要求**：
- 正文标题：\`# ${EPC_WORK5_PAYMENT_REPORT_TITLE}\`。
- 按五条业务线顺序汇报：${EPC_WORK5_PAYMENT_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('；')}。
- **步骤 1**：先写引导句「${EPC_WORK5_STEP1_INTRO}」，**原样输出**引擎 HTML 穿透表（\`class="epc-discovery-table"\`，与工作 4 相同列宽），表格下方写「**成功。**」或「**失败。**」+ 一行统计（用「·」分隔）；**勿**把 Schedule 行数或 \`files\` 条数当作文件个数。
- **步骤 2～5**：必须**分五条**汇报（「### 步骤 2：…」…「### 步骤 5：…」），每步先写一步说明段落，再写粗体「**成功。**」或「**失败。**」+ 该步详情；**禁止**在任一步失败时写「成功」。
- 若执行结果标明「待处理为 0、步骤 2～5 已跳过」，这些步骤须写 **成功。** 并说明已跳过，**不得**写成失败。
- 若执行结果含「诊断说明：本次无需输出」，**不要**写「诊断分析与人工修复建议」章节。
- **步骤 5**：存在 \`failedCount > 0\` 时必须失败；**有待处理且成功**时先写「**成功。**」，下一行起**仅**列出两个 Excel 完整路径（每行 \`- \`完整路径\`\`），**空一行**后单独写统计句；**无待处理、已跳过**时只写一行「**成功。**」+「无新增写出 Excel 汇总表」，**勿**列出路径或编造统计。
- 路径与统计须与「本地 Rust 引擎执行结果」中步骤 5 **完全一致**（原样复制，勿自行编造）。

${buildWork5DiagnosticInstructions()}

**禁止**：调用 Bash/Shell、运行脚本、Write/Edit 文件。

## 用户请求
${params.visibleUserRequest}

## 数据表覆盖记录
\`${params.workspaceRoot}/${EPC_WORK5_DATA_OVERRIDES_RELATIVE}\` — 用户/大模型修改并已 \`lock\` 的列，下次工作 5 全量统计时不会被引擎覆盖。

## 工作区根目录
${params.workspaceRoot}${periodInfo}

## 本地 Rust 引擎执行结果
${engineSection}`
}

export const buildPaymentWorkflowReportMessageContent = (report: PaymentWorkflowReport): string => {
  return `${EPC_WORK5_PAYMENT_REPORT_MARKER}\n${JSON.stringify(report)}`
}

export type EpcWork5PaymentReportPayload =
  | { kind: 'report'; report: PaymentWorkflowReport }
  | { kind: 'error'; errorMessage: string; report?: PaymentWorkflowReport }

export const buildEpcWork5PaymentErrorContent = (
  errorMessage: string,
  report?: PaymentWorkflowReport
): string => {
  return `${EPC_WORK5_PAYMENT_REPORT_MARKER}\n${JSON.stringify({ errorMessage, ...report })}`
}

/** 仅引擎写入的 marker+JSON 块才渲染 PaymentWorkflowReportCard */
export const isEpcWork5PaymentStructuredReportContent = (content: string): boolean => {
  if (!content.startsWith(EPC_WORK5_PAYMENT_REPORT_MARKER)) {
    return false
  }
  const body = content.slice(EPC_WORK5_PAYMENT_REPORT_MARKER.length).trim()
  if (!body.startsWith('{')) {
    return false
  }
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

export const parseEpcWork5PaymentPayloadFromContent = (content: string): EpcWork5PaymentReportPayload | null => {
  if (!isEpcWork5PaymentStructuredReportContent(content)) {
    return null
  }
  const json = content.slice(EPC_WORK5_PAYMENT_REPORT_MARKER.length).trim()
  try {
    const parsed = JSON.parse(json) as PaymentWorkflowReport & { errorMessage?: string }
    if (parsed.errorMessage) {
      const hasReport = (parsed.files?.length ?? 0) > 0 || Boolean(parsed.ipcPaymentDataPath)
      return {
        kind: 'error',
        errorMessage: parsed.errorMessage,
        report: hasReport ? (parsed as PaymentWorkflowReport) : undefined
      }
    }
    return { kind: 'report', report: parsed as PaymentWorkflowReport }
  } catch {
    return null
  }
}
