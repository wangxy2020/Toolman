import {
  EPC_COMMERCIAL_AGENT_NARRATION_MARKER,
  EPC_COMMERCIAL_COMMAND_TEMPLATE,
  EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID,
  EPC_COMMERCIAL_IPC_REPORT_MARKER,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE,
  EPC_COMMERCIAL_REPORT_TITLE,
  EPC_COMMERCIAL_WORKFLOW_STEPS,
  type IpcAlignmentReport
} from '@shared/epcCommercialTypes'
import {
  EPC_STEP1_SCAN_INTRO,
  EPC_STEP2_INTRO,
  EPC_STEP3_PURPOSE,
  EPC_STEP4_PURPOSE,
  formatDiscoveredTablesMarkdown,
  formatStep1FooterLine,
  formatWork4NarrationHints,
  formatWorkflowStepsMarkdown,
  isStep1ScanSuccess,
  work4RequiresDiagnosticAnalysis
} from './epcCommercialReportUtils'

export {
  EPC_COMMERCIAL_COMMAND_DESCRIPTION,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE,
  EPC_COMMERCIAL_REPORT_TITLE,
  EPC_COMMERCIAL_WORKFLOW_STEPS
} from '@shared/epcCommercialTypes'

export { EPC_COMMERCIAL_COMMAND_TEMPLATE } from '@shared/epcCommercialTypes'

/** epc <ipcx|ipc4|schx-ipc4> to boq */
const EPC_COMMAND_LINE_PATTERN = /^epc\s+(\S+)\s+to\s+boq\s*$/i

/** 旧版：epc <project_id> <schx-ipcx> to boq */
const LEGACY_EPC_COMMAND_LINE_PATTERN = /^epc\s+\S+\s+(schx-ipc[\w-]+)\s+to\s+boq\s*$/i

const PLACEHOLDER_IPC_TOKENS = new Set(['ipcx', 'schx-ipcx', 'ipc_x', 'ipc-x'])

/** 将命令中的 IPC 令牌解析为期数列名（如 IPC4） */
export const ipcTokenToPeriod = (ipcToken: string): string | undefined => {
  const token = ipcToken.trim()
  if (!token || PLACEHOLDER_IPC_TOKENS.has(token.toLowerCase())) {
    return undefined
  }

  const schxMatch = token.match(/^schx-ipc([\w-]+)$/i)
  if (schxMatch?.[1]) {
    const suffix = schxMatch[1].replace(/-/g, '').toUpperCase()
    return suffix ? `IPC${suffix}` : undefined
  }

  const plainMatch = token.match(/^ipc[_-]?(\d+)$/i)
  if (plainMatch?.[1]) {
    return `IPC${plainMatch[1]}`
  }

  if (/^ipc[\w-]+$/i.test(token)) {
    const suffix = token.replace(/^ipc/i, '').replace(/-/g, '').toUpperCase()
    return suffix ? `IPC${suffix}` : undefined
  }

  return undefined
}

export const normalizeEpcSlashCommandInput = (command: string): string => {
  const firstLine = command.trim().split('\n')[0]?.trim().replace(/^\//, '') ?? ''
  const legacy = firstLine.match(LEGACY_EPC_COMMAND_LINE_PATTERN)
  if (legacy?.[1]) {
    const ipcToken = legacy[1].replace(/^schx-/i, '')
    return `epc ${ipcToken} to boq`
  }
  return firstLine
}

export const isEpcCommercialCommand = (text: string): boolean => {
  const firstLine = normalizeEpcSlashCommandInput(text)
  return EPC_COMMAND_LINE_PATTERN.test(firstLine)
}

/** @deprecated 使用 ipcTokenToPeriod */
export const schxTokenToPeriod = ipcTokenToPeriod

/** 是否为工作 4 斜杠命令（含模板与 `epc … to boq` 变体） */
export const isEpcWork4IpcSlashCommand = (command: string): boolean => {
  const normalized = normalizeEpcSlashCommandInput(command)
  if (!normalized) {
    return false
  }
  if (normalized === normalizeEpcSlashCommandInput(EPC_COMMERCIAL_COMMAND_TEMPLATE)) {
    return true
  }
  return EPC_COMMAND_LINE_PATTERN.test(normalized)
}

/** 斜杠命令选中后填入输入框（仅命令，简洁展示；回车后再按快捷短语工作流执行） */
export const buildEpcWork4IpcSlashCommandFillText = (): string => EPC_COMMERCIAL_COMMAND_TEMPLATE

/**
 * 发给引擎与智能体汇报的「用户请求」：快捷短语全量工作流用内置正文；数据表更新类指令不在此处理。
 */
export const getEpcCommercialWorkflowUserRequest = (
  rawText: string,
  options?: { quickPhraseId?: string }
): string => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  const trimmed = rawText.trim()
  if (isEpcCommercialWorkflowInput(trimmed, options)) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  if (parseEpcCommercialCommandInput(trimmed).matched) {
    return EPC_COMMERCIAL_QUICK_PHRASE_CONTENT
  }
  return trimmed
}

/** @deprecated 使用 getEpcCommercialWorkflowUserRequest */
export const getEpcCommercialCanonicalUserVisibleText = getEpcCommercialWorkflowUserRequest

/** 解析工作 4 执行命令（可在多行正文中任意一行） */
export const parseEpcCommercialCommandInput = (
  rawText: string
): { matched: boolean; period?: string; masterPricePath?: string; usesPlaceholders?: boolean } => {
  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let ipcToken: string | undefined
  for (const line of lines) {
    const normalized = normalizeEpcSlashCommandInput(line)
    const match = normalized.match(EPC_COMMAND_LINE_PATTERN)
    if (match) {
      ipcToken = match[1]
      break
    }
  }

  if (!ipcToken) {
    return { matched: false }
  }

  const period = ipcTokenToPeriod(ipcToken)
  const usesPlaceholders = PLACEHOLDER_IPC_TOKENS.has(ipcToken.toLowerCase())

  let masterPricePath: string | undefined
  for (const line of lines) {
    const masterMatch = line.match(/^(?:母表[:：]\s*)(.+)$/i)
    if (masterMatch) {
      masterPricePath = masterMatch[1].trim()
    }
  }

  return {
    matched: true,
    period,
    masterPricePath,
    usesPlaceholders
  }
}

export interface EpcCommercialWorkLaunch {
  matched: boolean
  period?: string
  masterPricePath?: string
  /** 对话框用户气泡展示（斜杠命令保持简洁原文） */
  visibleUserRequest: string
  /** 引擎 + 智能体汇报用的任务说明（与快捷短语正文一致） */
  workflowUserRequest: string
}

/** 斜杠命令与快捷短语共用：解析期数/母表并决定是否启动工作 4 */
export const resolveEpcCommercialWorkLaunch = (
  rawText: string,
  options?: { quickPhraseId?: string }
): EpcCommercialWorkLaunch => {
  const trimmed = rawText.trim()
  if (!isEpcCommercialWorkInput(trimmed, options)) {
    return { matched: false, visibleUserRequest: trimmed, workflowUserRequest: trimmed }
  }

  const command = parseEpcCommercialCommandInput(trimmed)
  const workflow = parseEpcCommercialWorkflowInput(trimmed, options)

  const period =
    command.matched && !command.usesPlaceholders
      ? (command.period ?? workflow.period)
      : workflow.period
  const masterPricePath = command.masterPricePath ?? workflow.masterPricePath

  return {
    matched: true,
    period,
    masterPricePath,
    visibleUserRequest: trimmed,
    workflowUserRequest: getEpcCommercialWorkflowUserRequest(trimmed, options)
  }
}

/** @deprecated 使用 parseEpcCommercialCommandInput */
export const parseEpcCommercialSlashInput = parseEpcCommercialCommandInput

const normalizeWorkflowText = (text: string): string => text.trim().replace(/\r\n/g, '\n')

/** 是否为内置 EPC 工作 4 快捷短语（按 ID，不依赖正文措辞） */
export const isBuiltinEpcCommercialQuickPhraseId = (phraseId: string | undefined): boolean =>
  phraseId === EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID

/** 是否匹配工作 4 快捷短语 / 自然语言工作流说明（勿依赖全文与 CONTENT 相等，便于改展示文案） */
export const isEpcCommercialWorkflowInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return true
  }

  const trimmed = normalizeWorkflowText(text)
  if (!trimmed) {
    return false
  }

  if (trimmed.includes(EPC_COMMERCIAL_QUICK_PHRASE_TITLE)) {
    return true
  }

  return (
    trimmed.includes('工程量清单') &&
    trimmed.includes('进度款') &&
    (trimmed.includes('各文件夹') || trimmed.includes('工作区'))
  )
}

/** 斜杠命令或快捷短语：同一套进度款工程量数据统计工作 */
export const isEpcCommercialWorkInput = (text: string, options?: { quickPhraseId?: string }): boolean => {
  if (isBuiltinEpcCommercialQuickPhraseId(options?.quickPhraseId)) {
    return true
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  if (parseEpcCommercialCommandInput(trimmed).matched) {
    return true
  }
  return isEpcCommercialWorkflowInput(trimmed, options)
}

const formatSteps2to5Section = (report: IpcAlignmentReport, workflowError?: string): string =>
  formatWorkflowStepsMarkdown(report, workflowError).join('\n')

const formatStep1Section = (report: IpcAlignmentReport, workflowError?: string): string => {
  const tableLines = formatDiscoveredTablesMarkdown(report.discoveredFiles)
  const footer = formatStep1FooterLine(report.discoveredFiles, workflowError)

  const lines = ['### 步骤 1：多层穿透与匹配', '', EPC_STEP1_SCAN_INTRO, '']

  if (isStep1ScanSuccess(report.discoveredFiles)) {
    lines.push(...tableLines, '', footer)
  } else {
    lines.push(footer)
  }

  return lines.join('\n')
}

const formatReportStepsMarkdown = (report: IpcAlignmentReport, workflowError?: string): string => {
  const hintLines = formatWork4NarrationHints(report, workflowError)
  return [
    `# ${EPC_COMMERCIAL_REPORT_TITLE}`,
    '',
    formatStep1Section(report, workflowError),
    '',
    formatSteps2to5Section(report, workflowError),
    ...(hintLines.length > 0 ? ['', ...hintLines] : [])
  ].join('\n')
}

const buildWork4DiagnosticInstructions = (report?: IpcAlignmentReport, errorMessage?: string): string => {
  const needsDiagnostic = report
    ? work4RequiresDiagnosticAnalysis(report, errorMessage)
    : Boolean(errorMessage?.trim())

  if (!needsDiagnostic) {
    return `**诊断分析与人工修复建议**：
- **不要输出**该章节（本次各步成功，或步骤 1 待处理为 0 导致步骤 2～5 正常跳过）。
- 勿凭空编造清洗、合并或校验问题。`
  }

  return `**诊断分析与人工修复建议**（须在报告末尾单独成章）：
- 仅在有步骤 **失败** 或引擎报错时输出；逐步成功（含「无待处理、已跳过」）时勿写本章。
- 解释 Item 对应不上的可能原因（编号格式差异等）。
- 建议如何修改原始 IPC 文件（如 1.2a 改为 1.2A）。
- 列出清洗遗漏行的具体原因（数量×单价、格式等）。
- 你不直接修改文件，也不生成/写入新的 CSV；只输出人工可操作的建议。`
}

/** 传给智能体 API 的本地执行上下文（用户气泡中不展示） */
export const buildEpcCommercialAgentContextContent = (params: {
  workspaceRoot: string
  visibleUserRequest: string
  report?: IpcAlignmentReport
  errorMessage?: string
  placeholderHint?: string
}): string => {
  let engineSection = ''
  if (params.placeholderHint) {
    engineSection = params.placeholderHint
  } else if (params.report) {
    engineSection = formatReportStepsMarkdown(params.report, params.errorMessage)
  } else if (params.errorMessage) {
    engineSection = `执行失败：${params.errorMessage}`
  } else {
    engineSection = '（无执行结果）'
  }

  return `${EPC_COMMERCIAL_AGENT_NARRATION_MARKER}

你是成本智能体。用户已发起「进度款工程量数据统计」；本地 Rust 引擎已执行完毕。

**回复格式要求**：
- 正文标题：\`# ${EPC_COMMERCIAL_REPORT_TITLE}\`。
- 按五条业务线顺序汇报：${EPC_COMMERCIAL_WORKFLOW_STEPS.map((s, i) => `${i + 1}. ${s}`).join('；')}。
- **步骤 1**：先写引导句「${EPC_STEP1_SCAN_INTRO}」，**原样输出**引擎给出的 HTML 穿透表（\`class="epc-discovery-table"\`，三列：文件名 / 分类 / 说明；说明列：无需处理=上一次处理日期，已处理=处理完成时间；**勿**改成纯 Markdown 表或调整列宽），表格下方写「**成功。**」或「**失败。**」+ 统计（勿写「状态：」前缀）。
- **步骤 2～5**：必须**分五条**汇报（「### 步骤 2：工程量清单分析」…「### 步骤 5：…」），每步先写一步说明段落，再写粗体「**成功。**」或「**失败。**」+ 该步详情；**禁止**在任一步失败时写「成功」。
- 若执行结果标明「待处理为 0、步骤 2～5 已跳过」，这些步骤须写 **成功。** 并说明无需处理，**不得**写成失败。
- 若执行结果含「诊断说明：本次无需输出」，**不要**写「诊断分析与人工修复建议」章节。
- **步骤 2～4**：每步先一行汇总（如「2 个文件完成表内校验」），再列要点（• 文件名：…），**勿**重复长段说明或逐条展开全部金额。
- **步骤 2**：引导句「${EPC_STEP2_INTRO}」；要点格式「• {fileName}：{cleanedRowCount} 行，无行级错误」。
- **步骤 3**：${EPC_STEP3_PURPOSE} 要点「• {fileName}：与 BOQ Value 一致/不一致」。
- **步骤 4**：${EPC_STEP4_PURPOSE} 成功时「• {fileName}：{mergeTargetSheet} · 列 {mergePeriodColumn} · N 行」；\`mergeOk\` 为 false 则失败。
- **步骤 5**：存在 \`failedCount > 0\` 时必须失败；**成功**时先写「**成功。**」，下一行起逐条列出输出母表完整路径（每行 \`- \`完整路径\`\`，勿另写文件名），**空一行**后单独写成功/跳过统计（如「成功 **4** · 跳过 **7**」），**勿**把统计粘在最后一个路径行后面；路径须与「本地 Rust 引擎执行结果」中步骤 5 一致。

${buildWork4DiagnosticInstructions(params.report, params.errorMessage)}

**禁止**：调用 Bash/Shell、运行 python3 或其它脚本、Write/Edit 文件、重新 Glob/Read 扫描工作区。若引擎报错：开发环境请用 pnpm dev 启动；生产环境将 license.key 放到用户数据目录/epc-commercial/。

## 用户请求
${params.visibleUserRequest}

## 工作区根目录
${params.workspaceRoot}

## 本地 Rust 引擎执行结果
${engineSection}`
}

export const parseEpcCommercialWorkflowInput = (
  rawText: string,
  options?: { quickPhraseId?: string }
): { matched: boolean; period?: string; masterPricePath?: string } => {
  if (!isEpcCommercialWorkflowInput(rawText, options)) {
    return { matched: false }
  }

  const lines = rawText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let period: string | undefined
  let masterPricePath: string | undefined

  for (const line of lines) {
    const periodMatch = line.match(/^期数[:：]\s*(\S+)/i)
    if (periodMatch) {
      period = ipcTokenToPeriod(periodMatch[1]) ?? periodMatch[1].trim().toUpperCase()
    }
    const masterMatch = line.match(/^(?:母表[:：]\s*)(.+)$/i)
    if (masterMatch) {
      masterPricePath = masterMatch[1].trim()
    }
  }

  return { matched: true, period, masterPricePath }
}

export const buildIpcAlignmentReportMessageContent = (report: IpcAlignmentReport): string => {
  return `${EPC_COMMERCIAL_IPC_REPORT_MARKER}\n${JSON.stringify(report)}`
}

/** 仅引擎写入的 marker+JSON 块（非大模型混排正文）才渲染结构化卡片 */
export const isEpcCommercialStructuredReportContent = (content: string): boolean => {
  if (!content.startsWith(EPC_COMMERCIAL_IPC_REPORT_MARKER)) {
    return false
  }
  const body = content.slice(EPC_COMMERCIAL_IPC_REPORT_MARKER.length).trim()
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

export type EpcCommercialReportPayload =
  | { kind: 'report'; report: IpcAlignmentReport }
  | { kind: 'error'; errorMessage: string; report?: IpcAlignmentReport }

export const buildEpcCommercialErrorContent = (errorMessage: string, report?: IpcAlignmentReport): string => {
  return `${EPC_COMMERCIAL_IPC_REPORT_MARKER}\n${JSON.stringify({ errorMessage, ...report })}`
}

export const parseEpcCommercialPayloadFromContent = (content: string): EpcCommercialReportPayload | null => {
  if (!isEpcCommercialStructuredReportContent(content)) {
    return null
  }
  const json = content.slice(EPC_COMMERCIAL_IPC_REPORT_MARKER.length).trim()
  try {
    const parsed = JSON.parse(json) as IpcAlignmentReport & { errorMessage?: string }
    if (parsed.errorMessage) {
      const hasStep1 = (parsed.discoveredFiles?.length ?? 0) > 0
      return {
        kind: 'error',
        errorMessage: parsed.errorMessage,
        report: hasStep1 ? (parsed as IpcAlignmentReport) : undefined
      }
    }
    return { kind: 'report', report: parsed as IpcAlignmentReport }
  } catch {
    return null
  }
}
