import type { AuditErrorRow, IpcAlignmentReport, IpcFileResult } from '@toolman/shared'
import { EPC_COMMERCIAL_WORKFLOW_STEPS } from '@toolman/shared'

import {
  formatBoldStepStatus,
  isStep1ScanSuccess,
  summarizeDiscoveredFiles,
} from './epcCommercialDiscoveryReportUtils'

export const EPC_STEP2_INTRO = '以下是待处理的工程量清单的分析结果：'

export const EPC_STEP3_PURPOSE = '清洗后明细合计与 BOQ Value 核对。'

export const EPC_STEP4_PURPOSE = '按 Item 写入母表期数列，并在合计行汇总本期金额。'

export const EPC_STEP5_PURPOSE = '汇总各 IPC 处理结果，形成执行记录。'

export interface StepFooterParts {
  ok: boolean
  detail: string
}

/** 本次实际参与步骤 2～5 的 IPC（排除步骤 1 穿透跳过项） */
export const getPipelineIpcFiles = (report: IpcAlignmentReport): IpcFileResult[] =>
  report.files.filter((f) => !f.skippedReason?.startsWith('[步骤1-穿透识别]'))

const pipelineAttempted = (report: IpcAlignmentReport): IpcFileResult[] =>
  getPipelineIpcFiles(report).filter((f) => f.status === 'success' || f.status === 'failed')

/** 步骤 1 无待处理 IPC、且本次未进入流水线时，步骤 2～5 视为正常跳过（非失败） */
export const WORK4_IDLE_STEPS_DETAIL = '本次无待处理 IPC；步骤 2～5 已跳过（无需重复处理）'

export const isWork4NoPendingIdleRun = (report: IpcAlignmentReport): boolean => {
  if (report.failedCount > 0) {
    return false
  }
  if (!isStep1ScanSuccess(report.discoveredFiles)) {
    return false
  }
  const { pendingCount } = summarizeDiscoveredFiles(report.discoveredFiles)
  if (pendingCount > 0) {
    return false
  }
  return pipelineAttempted(report).length === 0
}

const resolveWork4IdleSteps2to5 = (report: IpcAlignmentReport): StepFooterParts | null => {
  if (!isWork4NoPendingIdleRun(report)) {
    return null
  }
  return { ok: true, detail: WORK4_IDLE_STEPS_DETAIL }
}

export const work4RequiresDiagnosticAnalysis = (
  report: IpcAlignmentReport,
  workflowError?: string,
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
  if (isWork4NoPendingIdleRun(report)) {
    return false
  }
  const steps: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5]
  return steps.some((step) => !getWorkflowStepFooterParts(step, report, workflowError).ok)
}

export const formatWork4NarrationHints = (
  report: IpcAlignmentReport,
  workflowError?: string,
): string[] => {
  const lines: string[] = []
  if (isWork4NoPendingIdleRun(report)) {
    lines.push(
      '> **执行说明**：步骤 1 待处理为 0，步骤 2～5 无需执行。请逐步写 **成功。** 并说明已跳过；**不要**写成失败，**不要**输出诊断分析。',
    )
  }
  if (work4RequiresDiagnosticAnalysis(report, workflowError)) {
    lines.push('> **诊断说明**：存在失败项，须在报告末尾增加「诊断分析与人工修复建议」章节。')
  } else {
    lines.push('> **诊断说明**：本次无需输出「诊断分析与人工修复建议」。')
  }
  return lines
}

const formatAmount = (amount: number): string =>
  amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatPeriodApplicationAmount = (
  amount: number | undefined,
  currency: string | undefined,
): string | null => {
  if (amount == null) {
    return null
  }
  const code = currency?.trim() || 'USD'
  return `本期完成（申请）金额：${code} ${formatAmount(amount)}`
}

const formatCompactMoney = (amount: number, currency: string | undefined): string => {
  const code = currency?.trim() || 'USD'
  return `${code} ${formatAmount(amount)}`
}

const buildStepBulletDetail = (summary: string, bullets: string[]): string =>
  bullets.length > 0 ? `${summary}\n${bullets.join('\n')}` : summary

/** 步骤 2：单文件一行要点 */
export const formatStep2FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.analysisOk !== true) {
    if (file.errorMessage?.trim()) {
      return `• ${name}：分析失败 — **${file.errorMessage.trim()}**`
    }
    if (file.analysisOk === false) {
      return `• ${name}：分析失败 — **未知**`
    }
  }
  if (file.status === 'skipped') {
    return `• ${name}：已跳过`
  }
  const rows = file.cleanedRowCount ?? 0
  const rowErr = file.analysisRowErrorCount ?? 0
  const errText = rowErr > 0 ? `**${rowErr}** 处行级错误` : '无行级错误'
  return `• ${name}：**${rows}** 行，${errText}`
}

/** 步骤 3：金额核对 */
export const formatStep3FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.analysisOk !== true) {
    return `• ${name}：未通过步骤 2`
  }
  if (file.reconciliationOk === true) {
    return `• ${name}：与 BOQ Value 一致`
  }
  if (file.reconciliationOk === false) {
    return `• ${name}：与 BOQ Value 不一致`
  }
  if (file.boqValueTotal == null) {
    return `• ${name}：无 BOQ Value 行，已跳过核对`
  }
  return `• ${name}：核对结果未知`
}

/** 步骤 4：写入母表 */
export const formatStep4FileLine = (file: IpcFileResult): string => {
  const name = file.fileName
  if (file.reconciliationOk === false) {
    return `• ${name}：未通过步骤 3，未写入`
  }
  if (file.mergeOk === true) {
    const sheet = file.mergeTargetSheet ?? '母表'
    const col = file.mergePeriodColumn ?? '期数列'
    const n = file.mergeMatchedRows ?? file.cleanedRowCount ?? 0
    const total =
      file.cleanedTotalAmount != null
        ? `，合计 **${formatCompactMoney(file.cleanedTotalAmount, file.cleanedCurrency)}**`
        : ''
    return `• ${name}：**${sheet}** · 列 **${col}** · **${n}** 行${total}`
  }
  if (file.mergeOk === false) {
    const msg = file.errorMessage ?? '写入失败'
    return `• ${name}：**${msg}**`
  }
  return `• ${name}：未写入`
}

const stepSummary = (okCount: number, total: number, okLabel: string, failLabel: string): string =>
  okCount === total
    ? `${total} 个文件${okLabel}`
    : `${okCount}/${total} 个文件${okLabel}，${total - okCount} 个${failLabel}`

export const getStep2FooterParts = (report: IpcAlignmentReport): StepFooterParts => {
  const idle = resolveWork4IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  const attempted = pipelineAttempted(report)
  if (attempted.length === 0) {
    return { ok: false, detail: '无待处理 IPC' }
  }
  const okFiles = attempted.filter((f) => f.analysisOk === true)
  const bullets = attempted.map(formatStep2FileLine)
  if (okFiles.length < attempted.length) {
    return {
      ok: false,
      detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '完成表内校验', '分析失败'), bullets),
    }
  }
  return {
    ok: true,
    detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '完成表内校验', ''), bullets),
  }
}

export const getStep3FooterParts = (report: IpcAlignmentReport): StepFooterParts => {
  const idle = resolveWork4IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  const step2 = getStep2FooterParts(report)
  if (!step2.ok) {
    return { ok: false, detail: '需先完成步骤 2' }
  }
  const attempted = pipelineAttempted(report).filter((f) => f.analysisOk === true)
  if (attempted.length === 0) {
    return { ok: false, detail: '无可核对数据' }
  }
  const okFiles = attempted.filter((f) => f.reconciliationOk !== false)
  const bullets = attempted.map(formatStep3FileLine)
  if (okFiles.length < attempted.length) {
    return {
      ok: false,
      detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '金额核对通过', '未通过'), bullets),
    }
  }
  return {
    ok: true,
    detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '金额核对通过', ''), bullets),
  }
}

export const getStep4FooterParts = (report: IpcAlignmentReport): StepFooterParts => {
  const idle = resolveWork4IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  const attempted = pipelineAttempted(report).filter((f) => f.analysisOk === true && f.reconciliationOk !== false)
  if (attempted.length === 0) {
    return { ok: false, detail: '无通过步骤 3 的文件' }
  }
  const okFiles = attempted.filter((f) => f.mergeOk === true)
  const bullets = attempted.map(formatStep4FileLine)
  if (okFiles.length < attempted.length) {
    return {
      ok: false,
      detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '已写入母表', '写入失败'), bullets),
    }
  }
  return {
    ok: true,
    detail: buildStepBulletDetail(stepSummary(okFiles.length, attempted.length, '已写入母表', ''), bullets),
  }
}

export const getStep5FooterParts = (report: IpcAlignmentReport, workflowError?: string): StepFooterParts => {
  const idle = resolveWork4IdleSteps2to5(report)
  if (idle) {
    return {
      ok: true,
      detail: '本次无待处理 IPC，无新增输出母表',
    }
  }
  const attempted = pipelineAttempted(report)
  if (attempted.length === 0) {
    return {
      ok: false,
      detail: workflowError ?? '未处理任何 IPC',
    }
  }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`,
    }
  }
  if (report.successCount === 0) {
    return {
      ok: false,
      detail: workflowError ?? `无成功记录（跳过 **${report.skippedCount}**）`,
    }
  }
  return {
    ok: true,
    detail: `成功 **${report.successCount}** · 跳过 **${report.skippedCount}**`,
  }
}

/** 由合同母表路径推导 canonical aligned 路径（与 Rust canonical_aligned_master_path 一致） */
export const deriveCanonicalAlignedPath = (contractMasterPath: string): string => {
  const trimmed = contractMasterPath.trim()
  if (!trimmed) {
    return trimmed
  }
  const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (slashIndex < 0) {
    const stem = trimmed.replace(/\.xlsx$/i, '').replace(/_aligned(?:_\d+)?$/i, '')
    return `${stem}_aligned.xlsx`
  }
  const dir = trimmed.slice(0, slashIndex + 1)
  const file = trimmed.slice(slashIndex + 1)
  const stem = file.replace(/\.xlsx$/i, '').replace(/_aligned(?:_\d+)?$/i, '')
  return `${dir}${stem}_aligned.xlsx`
}

const isAlignedMasterPath = (path: string): boolean => /_aligned(?:_\d+)?\.xlsx$/i.test(path)

/** 步骤 5 仅列出本次写出的 *_aligned.xlsx（可点击打开），不含合同母表原文件路径 */
export const getStep5OutputPaths = (report: IpcAlignmentReport): string[] => {
  const collected: string[] = []
  for (const path of report.outputMasterPaths ?? []) {
    const trimmed = path?.trim()
    if (trimmed && isAlignedMasterPath(trimmed)) {
      collected.push(trimmed)
    }
  }
  const single = report.outputMasterPath?.trim()
  if (single && isAlignedMasterPath(single)) {
    collected.push(single)
  }
  return [...new Set(collected)]
}

/** 步骤 5 成功时输出文件列表（Markdown，紧接在「**成功。**」之后；每行一条完整路径） */
export const formatStep5OutputFilesMarkdown = (report: IpcAlignmentReport): string[] => {
  const paths = getStep5OutputPaths(report)
  if (paths.length === 0) {
    return []
  }
  return paths.map((path) => `- \`${path}\``)
}

export const WORKFLOW_STEP_PURPOSES = [EPC_STEP3_PURPOSE, EPC_STEP4_PURPOSE, EPC_STEP5_PURPOSE] as const

export const getWorkflowStepIntro = (stepNum: 2 | 3 | 4 | 5): string => {
  if (stepNum === 2) {
    return EPC_STEP2_INTRO
  }
  return WORKFLOW_STEP_PURPOSES[stepNum - 3]
}

export const getWorkflowStepFooterParts = (
  stepIndex: 2 | 3 | 4 | 5,
  report: IpcAlignmentReport,
  workflowError?: string,
): StepFooterParts => {
  switch (stepIndex) {
    case 2:
      return getStep2FooterParts(report)
    case 3:
      return getStep3FooterParts(report)
    case 4:
      return getStep4FooterParts(report)
    case 5:
      return getStep5FooterParts(report, workflowError)
    default:
      return { ok: false, detail: '未知步骤' }
  }
}

export const formatWorkflowStepFooterLine = (
  stepIndex: 2 | 3 | 4 | 5,
  report: IpcAlignmentReport,
  workflowError?: string,
): string => formatWorkflowStepFooterMarkdown(stepIndex, report, workflowError).join('\n')

/** 步骤 5 成功时：先「**成功。**」，再输出文件，最后统计详情 */
export const formatWorkflowStepFooterMarkdown = (
  stepIndex: 2 | 3 | 4 | 5,
  report: IpcAlignmentReport,
  workflowError?: string,
): string[] => {
  const { ok, detail } = getWorkflowStepFooterParts(stepIndex, report, workflowError)
  if (stepIndex === 5 && ok) {
    const lines = [formatBoldStepStatus(ok)]
    const fileLines = formatStep5OutputFilesMarkdown(report)
    if (fileLines.length > 0) {
      lines.push(...fileLines)
    }
    if (detail) {
      if (fileLines.length > 0) {
        lines.push('')
      }
      lines.push(detail)
    }
    return lines
  }
  return [`${formatBoldStepStatus(ok)} ${detail}`]
}

/** @deprecated 使用分步骤 formatWorkflowStepFooterLine */
export const getSteps2to5FooterParts = (report: IpcAlignmentReport): StepFooterParts => getStep2FooterParts(report)

/** @deprecated 使用分步骤 formatWorkflowStepFooterLine */
export const formatSteps2to5FooterLine = (report: IpcAlignmentReport, workflowError?: string): string =>
  formatWorkflowStepFooterLine(2, report, workflowError)

export const formatWorkflowStepsMarkdown = (report: IpcAlignmentReport, workflowError?: string): string[] => {
  const lines: string[] = []
  for (let i = 1; i < EPC_COMMERCIAL_WORKFLOW_STEPS.length; i++) {
    const stepNum = (i + 1) as 2 | 3 | 4 | 5
    const title = EPC_COMMERCIAL_WORKFLOW_STEPS[i]
    lines.push(`### 步骤 ${stepNum}：${title}`, '', getWorkflowStepIntro(stepNum), '')
    lines.push(...formatWorkflowStepFooterMarkdown(stepNum, report, workflowError), '')
  }
  return lines
}

export const buildAuditErrorsFromReport = (report: IpcAlignmentReport): AuditErrorRow[] =>
  report.files
    .filter((file) => file.status === 'failed')
    .map((file) => ({
      fileName: file.fileName,
      filePath: file.filePath,
      errorMessage: file.errorMessage ?? '未知错误',
    }))
