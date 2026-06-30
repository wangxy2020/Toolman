import type {
  BoqFormatFileQueue,
  BoqFormatFileResult,
  BoqFormatWorkflowReport
} from '@shared/epcCommercialTypes'
import { EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS } from '@shared/epcCommercialTypes'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'
import {
  formatBoldStepStatus,
  formatLedgerProcessedAtDisplay,
  type StepFooterParts
} from './epcCommercialReportUtils'

export const EPC_WORK1_STEP1_INTRO =
  '读取 boq_format_process_log.txt，扫描 *_original.xlsx 源表与配对输出（去掉 _original 后缀，如 SSLOT1-IRI-BOQ_original → SSLOT1-IRI-BOQ.xlsx）。仅当账本 SUCCESS、源表 MD5 未变且配对输出文件存在时记为「已处理」，否则为「待处理」。表格「说明」：已处理=处理完成时间，待处理=识别说明。'

export const EPC_WORK1_STEP2_INTRO =
  '校验各 Schedule：行级 Total Price ≈ Unit Price × Est. Qty；明细合计与 TOTAL SCHEDULE 行。'

export const EPC_WORK1_STEP3_INTRO =
  '序号列文本化并自然排序；保留章节标题与分项名（含 1.0 等无 Unit 行）；表尾无 Unit 且无 Unit Price 的说明行剔除；Est. Qty 整数不带小数、Unit/数量列居中。'

export const EPC_WORK1_STEP4_INTRO =
  '写出格式化 BOQ.xlsx 与同名的 BOQ.csv（首行冻结、列宽优化；Total Price 与合计行保留公式）。'

export const EPC_WORK1_STEP5_INTRO =
  '汇总本次写出的 BOQ.xlsx 路径与 boq_format_process_log.txt 执行记录。'

/** 步骤 1 无待处理源表、且本次未进入流水线时，步骤 2～5 视为正常跳过（非失败） */
export const WORK1_IDLE_STEPS_DETAIL = '本次无待处理合同价格表；步骤 2～5 已跳过（无需重复处理）'

const BOQ_FORMAT_QUEUE_LABELS: Record<BoqFormatFileQueue, string> = {
  pendingProcess: '待处理',
  alreadyProcessed: '已处理'
}

/** 步骤 1 表格「说明」列（与工作 4 对齐：已处理=完成时间） */
const formatBoqFormatDiscoveryDescription = (file: BoqFormatWorkflowReport['discoveredFiles'][number]): string => {
  const at = formatLedgerProcessedAtDisplay(file.ledgerProcessedAt)
  if (file.queue === 'alreadyProcessed') {
    return at ? `处理完成：${at}` : '处理完成时间未记录'
  }
  const parts = [file.projectName?.trim(), file.folderPath?.trim(), file.roleReason?.trim()].filter(Boolean)
  return parts.join(' · ') || '—'
}

export const formatBoqFormatDiscoveredTableHtml = (
  files: BoqFormatWorkflowReport['discoveredFiles'] | undefined
): string[] => {
  const list = files ?? []
  if (list.length === 0) {
    return ['未发现 *_original.xlsx']
  }
  return formatEpcDiscoveryTableHtml(
    list.map((file) => ({
      fileName: file.fileName,
      queueLabel: BOQ_FORMAT_QUEUE_LABELS[file.queue],
      description: formatBoqFormatDiscoveryDescription(file)
    }))
  )
}

const boqFormatLogStatus = (report: BoqFormatWorkflowReport): string => {
  if (report.boqFormatProcessLogPath?.trim()) {
    return 'boq_format_process_log.txt：已读取'
  }
  return 'boq_format_process_log.txt：未找到（将新建）'
}

/** 步骤 1 一行统计（与工作 4/5 对齐） */
export const formatBoqFormatDiscoveredSummaryTags = (report: BoqFormatWorkflowReport): string => {
  const discovered = report.discoveredFiles ?? []
  const pending = discovered.filter((f) => f.queue === 'pendingProcess').length
  const already = discovered.filter((f) => f.queue === 'alreadyProcessed').length
  return [
    boqFormatLogStatus(report),
    `${discovered.length} 个合同价格表`,
    `待处理 ${pending}`,
    `已处理 ${already}`
  ].join(' · ')
}

export const isWork1Step1ScanSuccess = (report: BoqFormatWorkflowReport): boolean =>
  getWork1Step1FooterParts(report).ok

const actionablePipelineFiles = (report: BoqFormatWorkflowReport): BoqFormatFileResult[] =>
  report.files.filter((f) => f.status === 'success' || f.status === 'failed')

export const isWork1NoPendingIdleRun = (report: BoqFormatWorkflowReport): boolean => {
  if (report.failedCount > 0) {
    return false
  }
  if (!isWork1Step1ScanSuccess(report)) {
    return false
  }
  const pending = (report.discoveredFiles ?? []).filter((f) => f.queue === 'pendingProcess').length
  if (pending > 0) {
    return false
  }
  return actionablePipelineFiles(report).length === 0
}

const resolveWork1IdleSteps2to5 = (report: BoqFormatWorkflowReport): StepFooterParts | null => {
  if (!isWork1NoPendingIdleRun(report)) {
    return null
  }
  return { ok: true, detail: WORK1_IDLE_STEPS_DETAIL }
}

export const getWork1Step1FooterParts = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const discovered = report.discoveredFiles ?? []
  if (discovered.length > 0) {
    return { ok: true, detail: formatBoqFormatDiscoveredSummaryTags(report) }
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  return {
    ok: false,
    detail: `${boqFormatLogStatus(report)}\n未发现 *_original.xlsx 原始合同价格表`
  }
}

export const formatWork1Step1FooterLine = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): string => {
  const { ok, detail } = getWork1Step1FooterParts(report, workflowError)
  return `${formatBoldStepStatus(ok)} ${detail}`
}

const formatSheetChecks = (file: BoqFormatFileResult): string => {
  if (file.status === 'skipped') {
    return file.skippedReason ?? '账本已处理，跳过检查'
  }
  const sheets = file.sheets ?? []
  if (sheets.length === 0) {
    return '（无分表明细）'
  }
  return sheets
    .map((s) => {
      const issues: string[] = []
      if (s.rowCheckErrors > 0) {
        issues.push(`行级公式偏差 ${s.rowCheckErrors}`)
      }
      if (s.sumCheckOk === false) {
        issues.push('合计行不一致')
      }
      const issueText = issues.length > 0 ? issues.join('；') : '通过'
      return `- ${s.sheetName}：${issueText}，${s.outputRowCount} 行`
    })
    .join('\n')
}

export const getWork1Step2FooterParts = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveWork1IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  const attempted = actionablePipelineFiles(report)
  if (attempted.length === 0) {
    return { ok: false, detail: '无待处理合同价格表' }
  }
  const checkBlocks = attempted
    .map((f) => `**${f.fileName}**（${f.status}）\n${formatSheetChecks(f)}`)
    .join('\n\n')
  const allOk = attempted.every(
    (f) =>
      f.status === 'skipped' ||
      (f.sheets?.every((s) => s.rowCheckErrors === 0 && s.sumCheckOk !== false) ?? true)
  )
  return {
    ok: allOk,
    detail: checkBlocks || '检查完成，详见各分表统计。'
  }
}

export const getWork1Step3FooterParts = (report: BoqFormatWorkflowReport, workflowError?: string): StepFooterParts => {
  const idle = resolveWork1IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  const hasWork = report.successCount > 0 || report.skippedCount > 0
  return {
    ok: hasWork,
    detail: `本次新格式化 **${report.successCount}** 个；跳过 **${report.skippedCount}** 个（账本 SUCCESS）。`
  }
}

export const getWork1Step4FooterParts = (report: BoqFormatWorkflowReport, workflowError?: string): StepFooterParts => {
  const idle = resolveWork1IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  const wrote = getWork1Step5OutputPaths(report).length > 0
  const ok = wrote || (report.skippedCount > 0 && report.failedCount === 0)
  let detail: string
  if (report.skippedCount > 0 && !wrote) {
    detail = '（无新写出；均已处理）'
  } else if (wrote) {
    detail = `已写出 **${report.successCount}** 套 BOQ（.xlsx + .csv，路径见步骤 5）`
  } else {
    detail = '（未写出文件）'
  }
  return { ok, detail }
}

export const getWork1Step5FooterParts = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveWork1IdleSteps2to5(report)
  if (idle) {
    return { ok: true, detail: '本次无待处理合同价格表，无新增写出格式化 BOQ' }
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
    }
  }
  if (report.successCount === 0 && report.skippedCount === 0) {
    return { ok: false, detail: workflowError ?? '无成功处理的合同价格表' }
  }
  return {
    ok: true,
    detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
  }
}

export const getWork1WorkflowStepFooterParts = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: BoqFormatWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  switch (stepNum) {
    case 1:
      return getWork1Step1FooterParts(report, workflowError)
    case 2:
      return getWork1Step2FooterParts(report, workflowError)
    case 3:
      return getWork1Step3FooterParts(report, workflowError)
    case 4:
      return getWork1Step4FooterParts(report, workflowError)
    case 5:
      return getWork1Step5FooterParts(report, workflowError)
    default:
      return { ok: false, detail: '未知步骤' }
  }
}

const isWork1BoqCsvOutputPath = (path: string): boolean => /\.csv$/i.test(path.trim())

/** 步骤 5 仅列出 BOQ.xlsx（不含同批写出的 .csv） */
export const getWork1Step5OutputPaths = (report: BoqFormatWorkflowReport): string[] => {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const raw of report.outputPaths) {
    const path = raw.trim()
    if (!path || isWork1BoqCsvOutputPath(path) || seen.has(path)) {
      continue
    }
    seen.add(path)
    paths.push(path)
  }
  for (const file of report.files) {
    const path = file.outputPath?.trim()
    if (!path || isWork1BoqCsvOutputPath(path) || seen.has(path)) {
      continue
    }
    seen.add(path)
    paths.push(path)
  }
  return paths
}

export const formatWork1Step5OutputFilesMarkdown = (report: BoqFormatWorkflowReport): string[] => {
  const paths = getWork1Step5OutputPaths(report)
  if (paths.length === 0) {
    return []
  }
  return paths.map((path) => `- \`${path}\``)
}

export const formatWork1WorkflowStepFooterMarkdown = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: BoqFormatWorkflowReport,
  workflowError?: string
): string[] => {
  const { ok, detail } = getWork1WorkflowStepFooterParts(stepNum, report, workflowError)
  if (stepNum === 5 && ok && !isWork1NoPendingIdleRun(report)) {
    const lines = [formatBoldStepStatus(ok)]
    const fileLines = formatWork1Step5OutputFilesMarkdown(report)
    if (fileLines.length > 0) {
      lines.push(...fileLines)
    }
    const logNote = report.boqFormatProcessLogPath?.trim()
      ? '执行记录：boq_format_process_log.txt'
      : ''
    const tail = [detail, logNote].filter(Boolean).join('\n')
    if (tail) {
      if (fileLines.length > 0) {
        lines.push('')
      }
      lines.push(tail)
    }
    return lines
  }
  return [`${formatBoldStepStatus(ok)} ${detail}`]
}

export const getWork1WorkflowStepIntro = (stepNum: 2 | 3 | 4 | 5): string => {
  switch (stepNum) {
    case 2:
      return EPC_WORK1_STEP2_INTRO
    case 3:
      return EPC_WORK1_STEP3_INTRO
    case 4:
      return EPC_WORK1_STEP4_INTRO
    case 5:
      return EPC_WORK1_STEP5_INTRO
    default:
      return ''
  }
}

export const work1RequiresDiagnosticAnalysis = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): boolean => {
  if (workflowError?.trim()) {
    return true
  }
  if (report.failedCount > 0) {
    return true
  }
  if (report.files.some((f) => f.status === 'failed')) {
    return true
  }
  if (isWork1NoPendingIdleRun(report)) {
    return false
  }
  const steps: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5]
  return steps.some((step) => !getWork1WorkflowStepFooterParts(step, report, workflowError).ok)
}

export const formatWork1NarrationHints = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): string[] => {
  const lines: string[] = []
  if (isWork1NoPendingIdleRun(report)) {
    lines.push(
      '> **执行说明**：步骤 1 待处理为 0，步骤 2～5 无需执行。请逐步写 **成功。** 并说明已跳过；**不要**写成失败，**不要**输出诊断分析。'
    )
  }
  if (work1RequiresDiagnosticAnalysis(report, workflowError)) {
    lines.push('> **诊断说明**：存在失败项，须在报告末尾增加「诊断分析与人工修复建议」章节。')
  } else {
    lines.push('> **诊断说明**：本次无需输出「诊断分析与人工修复建议」。')
  }
  return lines
}

export const formatWork1Step1Section = (report: BoqFormatWorkflowReport, workflowError?: string): string => {
  const title = EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS[0]
  const lines = [`### 步骤 1：${title}`, '', EPC_WORK1_STEP1_INTRO, '']

  if (isWork1Step1ScanSuccess(report)) {
    lines.push(...formatBoqFormatDiscoveredTableHtml(report.discoveredFiles), '', formatWork1Step1FooterLine(report, workflowError))
  } else {
    lines.push(formatWork1Step1FooterLine(report, workflowError))
  }

  return lines.join('\n')
}

export const formatWork1Steps2to5Markdown = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): string[] => {
  const lines: string[] = []
  for (let i = 1; i < EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS.length; i++) {
    const stepNum = (i + 1) as 2 | 3 | 4 | 5
    const title = EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS[i]
    lines.push(`### 步骤 ${stepNum}：${title}`, '', getWork1WorkflowStepIntro(stepNum), '')
    lines.push(...formatWork1WorkflowStepFooterMarkdown(stepNum, report, workflowError), '')
  }
  return lines
}
