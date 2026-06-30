import {
  EPC_WORK2_SHIPPING_CI_AGENT_NARRATION_MARKER,
  EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE,
  EPC_WORK2_SHIPPING_CI_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT,
  EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_TITLE,
  EPC_WORK2_SHIPPING_CI_REPORT_TITLE,
  EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS,
  type ShippingCiWorkflowReport
} from '@shared/epcCommercialTypes'

import {
  EPC_WORK2_STEP1_INTRO,
  formatWork2NarrationHints,
  formatWork2Step1Section,
  formatWork2Steps2to5Markdown,
  work2RequiresDiagnosticAnalysis
} from './epcWork2ShippingCiReportUtils'

export {
  EPC_WORK2_SHIPPING_CI_COMMAND_DESCRIPTION,
  EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE,
  EPC_WORK2_SHIPPING_CI_REPORT_TITLE
} from '@shared/epcCommercialTypes'

const COMMAND_PATTERN = /^epc\s+shipping\s+ci\s+to\s+progress\s+ci\s+and\s+ipc\s*$/i

export const normalizeEpcWork2CommandInput = (command: string): string =>
  command.trim().split('\n')[0]?.trim().replace(/^\//, '') ?? ''

export const isEpcWork2ShippingCiCommand = (text: string): boolean =>
  COMMAND_PATTERN.test(normalizeEpcWork2CommandInput(text))

export const isEpcWork2ShippingCiSlashCommand = (command: string): boolean => {
  const normalized = normalizeEpcWork2CommandInput(command)
  if (!normalized) return false
  if (normalized === normalizeEpcWork2CommandInput(EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE)) return true
  return COMMAND_PATTERN.test(normalized)
}

export const buildEpcWork2ShippingCiSlashCommandFillText = (): string =>
  EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE

export const isBuiltinEpcWork2ShippingCiQuickPhraseId = (phraseId: string | undefined): boolean =>
  phraseId === EPC_WORK2_SHIPPING_CI_DEFAULT_QUICK_PHRASE_ID

export const isEpcWork2ShippingCiWorkflowInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork2ShippingCiQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = text.trim().replace(/\r\n/g, '\n')
  if (!trimmed) return false
  if (trimmed.includes(EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_TITLE)) return true
  const builtin = EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT.trim()
  if (builtin && trimmed.includes(builtin)) return true
  return (
    trimmed.includes('商业发票') &&
    (trimmed.includes('海运') || trimmed.includes('进度款') || trimmed.includes('工程量清单'))
  )
}

export const isEpcWork2ShippingCiWorkInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork2ShippingCiQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isEpcWork2ShippingCiCommand(trimmed)) return true
  return isEpcWork2ShippingCiWorkflowInput(trimmed, options)
}

export const getEpcWork2ShippingCiWorkflowUserRequest = (
  rawText: string,
  options?: { quickPhraseId?: string }
): string => {
  if (
    isBuiltinEpcWork2ShippingCiQuickPhraseId(options?.quickPhraseId) ||
    isEpcWork2ShippingCiWorkflowInput(rawText, options) ||
    isEpcWork2ShippingCiCommand(rawText)
  ) {
    return EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT
  }
  return rawText.trim()
}

export interface EpcWork2ShippingCiWorkLaunch {
  matched: boolean
  visibleUserRequest: string
  workflowUserRequest: string
}

export const resolveEpcWork2ShippingCiWorkLaunch = (
  rawText: string,
  options?: { quickPhraseId?: string }
): EpcWork2ShippingCiWorkLaunch => {
  const trimmed = rawText.trim()
  if (!isEpcWork2ShippingCiWorkInput(trimmed, options)) {
    return { matched: false, visibleUserRequest: trimmed, workflowUserRequest: trimmed }
  }
  return {
    matched: true,
    visibleUserRequest: trimmed,
    workflowUserRequest: getEpcWork2ShippingCiWorkflowUserRequest(trimmed, options)
  }
}

export const buildEpcWork2ShippingCiAgentContextContent = (params: {
  workspaceRoot: string
  visibleUserRequest: string
  report?: ShippingCiWorkflowReport
  errorMessage?: string
  placeholderHint?: string
}): string => {
  const formatReport = (report: ShippingCiWorkflowReport, workflowError?: string): string => {
    const hints = formatWork2NarrationHints(report, workflowError)
    return [
      `# ${EPC_WORK2_SHIPPING_CI_REPORT_TITLE}`,
      '',
      formatWork2Step1Section(report, workflowError),
      '',
      formatWork2Steps2to5Markdown(report, workflowError).join('\n\n'),
      ...(hints.length > 0 ? ['', ...hints] : [])
    ].join('\n')
  }

  const diagnosticBlock = (): string => {
    const needs = params.report
      ? work2RequiresDiagnosticAnalysis(params.report, params.errorMessage)
      : Boolean(params.errorMessage?.trim())
    if (!needs) {
      return `**诊断分析与人工修复建议**：
- **不要输出**该章节（本次各步成功，或步骤 1 待处理为 0 导致步骤 2～5 正常跳过）。`
    }
    return `**诊断分析与人工修复建议**（须在报告末尾单独成章）：
- 仅在有步骤 **失败** 或引擎报错时输出可执行的人工修复建议。
- 指出 Item 不对应、缺少 BOQ_aligned、或 Excel 文件被占用（FILE_LOCKED）等原因。
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

  return `${EPC_WORK2_SHIPPING_CI_AGENT_NARRATION_MARKER}

你是成本智能体。用户已发起「进度款商业发票和工程量清单编制」；本地引擎已执行完毕。

**回复格式要求**：
- 正文标题：\`# ${EPC_WORK2_SHIPPING_CI_REPORT_TITLE}\`。
- 按五条业务线顺序汇报：${EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('；')}。
- **步骤 1**：先写「${EPC_WORK2_STEP1_INTRO}」，**原样输出**引擎 HTML 穿透表，表格下方写「**成功。**」或「**失败。**」+ 统计（含 shipping_ci_process_log.txt）。
- **步骤 2**：先写数据检查说明，再按文件列出对照结果（参与行数、Item 对应行数、BOQ 来源）；失败时**原样输出**对照差异 HTML 表，Description 可对应但 Item 不一致时提示人工核对。
- **步骤 3～5**：分条汇报；无待处理时步骤 2～5 写 **成功。** 并说明已跳过。
- **步骤 5**：有待处理且成功时先写「**成功。**」，下列输出文件路径，再写统计与执行记录；无新写出时勿编造路径。

${diagnosticBlock()}

**禁止**：调用 Bash/Shell、Write/Edit 文件。

## 用户请求
${params.visibleUserRequest}

## 工作区根目录
${params.workspaceRoot}

## 本地 Rust 引擎执行结果
${engineSection}`
}
