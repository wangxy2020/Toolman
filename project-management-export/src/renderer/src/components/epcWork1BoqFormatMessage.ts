import {
  EPC_WORK1_BOQ_FORMAT_AGENT_NARRATION_MARKER,
  EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE,
  EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_TITLE,
  EPC_WORK1_BOQ_FORMAT_REPORT_TITLE,
  EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS,
  type BoqFormatWorkflowReport
} from '@shared/epcCommercialTypes'

import {
  EPC_WORK1_STEP1_INTRO,
  formatWork1NarrationHints,
  formatWork1Step1Section,
  formatWork1Steps2to5Markdown,
  work1RequiresDiagnosticAnalysis
} from './epcWork1BoqFormatReportUtils'

export {
  EPC_WORK1_BOQ_FORMAT_COMMAND_DESCRIPTION,
  EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE,
  EPC_WORK1_BOQ_FORMAT_REPORT_TITLE
} from '@shared/epcCommercialTypes'

const EPC_WORK1_COMMAND_LINE_PATTERN = /^epc\s+boq\s+format\s*$/i

export const normalizeEpcWork1CommandInput = (command: string): string =>
  command.trim().split('\n')[0]?.trim().replace(/^\//, '') ?? ''

export const isEpcWork1BoqFormatCommand = (text: string): boolean =>
  EPC_WORK1_COMMAND_LINE_PATTERN.test(normalizeEpcWork1CommandInput(text))

export const isEpcWork1BoqFormatSlashCommand = (command: string): boolean => {
  const normalized = normalizeEpcWork1CommandInput(command)
  if (!normalized) return false
  if (normalized === normalizeEpcWork1CommandInput(EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE)) return true
  return EPC_WORK1_COMMAND_LINE_PATTERN.test(normalized)
}

export const buildEpcWork1BoqFormatSlashCommandFillText = (): string => EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE

export const isBuiltinEpcWork1BoqFormatQuickPhraseId = (phraseId: string | undefined): boolean =>
  phraseId === EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID

const normalizeText = (text: string): string => text.trim().replace(/\r\n/g, '\n')

export const isEpcWork1BoqFormatWorkflowInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork1BoqFormatQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = normalizeText(text)
  if (!trimmed) return false
  if (trimmed.includes(EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_TITLE)) return true
  const builtinContent = EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT.trim()
  if (builtinContent && trimmed.includes(builtinContent)) return true
  return (
    trimmed.includes('价格表') &&
    (trimmed.includes('检查') || trimmed.includes('处理') || trimmed.includes('格式'))
  )
}

export const isEpcWork1BoqFormatWorkInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcWork1BoqFormatQuickPhraseId(options?.quickPhraseId)) return true
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isEpcWork1BoqFormatCommand(trimmed)) return true
  return isEpcWork1BoqFormatWorkflowInput(trimmed, options)
}

export const getEpcWork1BoqFormatWorkflowUserRequest = (
  rawText: string,
  options?: { quickPhraseId?: string }
): string => {
  if (
    isBuiltinEpcWork1BoqFormatQuickPhraseId(options?.quickPhraseId) ||
    isEpcWork1BoqFormatWorkflowInput(rawText, options) ||
    isEpcWork1BoqFormatCommand(rawText)
  ) {
    return EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT
  }
  return rawText.trim()
}

export interface EpcWork1BoqFormatWorkLaunch {
  matched: boolean
  visibleUserRequest: string
  workflowUserRequest: string
}

export const resolveEpcWork1BoqFormatWorkLaunch = (
  rawText: string,
  options?: { quickPhraseId?: string }
): EpcWork1BoqFormatWorkLaunch => {
  const trimmed = rawText.trim()
  if (!isEpcWork1BoqFormatWorkInput(trimmed, options)) {
    return { matched: false, visibleUserRequest: trimmed, workflowUserRequest: trimmed }
  }
  return {
    matched: true,
    visibleUserRequest: trimmed,
    workflowUserRequest: getEpcWork1BoqFormatWorkflowUserRequest(trimmed, options)
  }
}

export const buildEpcWork1BoqFormatAgentContextContent = (params: {
  workspaceRoot: string
  visibleUserRequest: string
  report?: BoqFormatWorkflowReport
  errorMessage?: string
  placeholderHint?: string
}): string => {
  const formatReport = (report: BoqFormatWorkflowReport, workflowError?: string): string => {
    const hintLines = formatWork1NarrationHints(report, workflowError)
    return [
      `# ${EPC_WORK1_BOQ_FORMAT_REPORT_TITLE}`,
      '',
      formatWork1Step1Section(report, workflowError),
      '',
      formatWork1Steps2to5Markdown(report, workflowError).join('\n\n'),
      ...(hintLines.length > 0 ? ['', ...hintLines] : [])
    ].join('\n')
  }

  const buildWork1DiagnosticInstructions = (): string => {
    const needsDiagnostic = params.report
      ? work1RequiresDiagnosticAnalysis(params.report, params.errorMessage)
      : Boolean(params.errorMessage?.trim())

    if (!needsDiagnostic) {
      return `**诊断分析与人工修复建议**：
- **不要输出**该章节（本次各步成功，或步骤 1 待处理为 0 导致步骤 2～5 正常跳过）。
- 勿凭空编造分表检查或写出路径问题。`
    }

    return `**诊断分析与人工修复建议**（须在报告末尾单独成章）：
- 仅在有步骤 **失败** 或引擎报错时输出可执行的人工修复建议。
- 指出失败文件、合计不一致或序号/行剔除异常等原因。
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

  return `${EPC_WORK1_BOQ_FORMAT_AGENT_NARRATION_MARKER}

你是成本智能体。用户已发起「合同价格表检查和处理」；本地 Rust 引擎已执行完毕。

**回复格式要求**：
- 正文标题：\`# ${EPC_WORK1_BOQ_FORMAT_REPORT_TITLE}\`。
- 按五条业务线顺序汇报：${EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('；')}。
- **步骤 1**：先写引导句「${EPC_WORK1_STEP1_INTRO}」，**原样输出**引擎 HTML 穿透表（\`class="epc-discovery-table"\`，三列：文件名 / 分类 / 说明；说明列含项目与文件夹；**勿**改成纯 Markdown 表），表格下方写「**成功。**」或「**失败。**」+ 一行统计（用「·」分隔；须含 boq_format_process_log.txt 状态）。
- **步骤 2～5**：必须**分五条**汇报（「### 步骤 2：…」…「### 步骤 5：…」），每步先写一步说明段落，再写粗体「**成功。**」或「**失败。**」+ 该步详情；**禁止**在任一步失败时写「成功」。
- 若执行结果标明「待处理为 0、步骤 2～5 已跳过」，这些步骤须写 **成功。** 并说明已跳过，**不得**写成失败。
- 若执行结果含「诊断说明：本次无需输出」，**不要**写「诊断分析与人工修复建议」章节。
- **步骤 5**：存在 \`failedCount > 0\` 时必须失败；**有待处理且成功**时先写「**成功。**」，下一行起逐行列出输出 BOQ 完整路径（每行 \`- \`完整路径\`\`），**空一行**后单独写统计句与「执行记录：boq_format_process_log.txt」；**无待处理、已跳过**时只写一行「**成功。**」+「无新增写出格式化 BOQ」，**勿**列出路径或编造统计。步骤 4 不写文件路径。
- 路径与统计须与「本地 Rust 引擎执行结果」中步骤 5 **完全一致**（原样复制，勿自行编造）。

${buildWork1DiagnosticInstructions()}

**禁止**：调用 Bash/Shell、Write/Edit 文件。

## 用户请求
${params.visibleUserRequest}

## 工作区根目录
${params.workspaceRoot}

## 本地 Rust 引擎执行结果
${engineSection}`
}
