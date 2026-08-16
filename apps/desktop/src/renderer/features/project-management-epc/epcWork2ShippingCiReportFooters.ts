import type { ShippingCiWorkflowReport } from '@toolman/shared'
import { EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS } from '@toolman/shared'

import { formatBoldStepStatus, type StepFooterParts } from './epcCommercialReportUtils'
import {
  WORK2_IDLE_STEPS_DETAIL,
  formatWork2Step2FileLine,
  formatWork2Step2MismatchTableHtml,
  getWork2Step1FooterParts,
  getWork2WorkflowStepIntro,
  isWork2Step1ScanSuccess,
} from './epcWork2ShippingCiReportDiscovery'

const actionableFiles = (report: ShippingCiWorkflowReport) =>
  report.files.filter((f) => f.status === 'success' || f.status === 'failed')

const pipelineAttempted = (report: ShippingCiWorkflowReport) =>
  report.files.filter((f) => f.status === 'success' || f.status === 'failed')

const buildStepBulletDetail = (summary: string, bullets: string[]): string =>
  bullets.length > 0 ? `${summary}\n${bullets.join('\n')}` : summary

const step2Summary = (okCount: number, total: number, okLabel: string, failLabel: string): string =>
  okCount === total
    ? `${total} 个海运商业发票${okLabel}`
    : `${okCount}/${total} 个海运商业发票${okLabel}，${total - okCount} 个${failLabel}`

export const isWork2NoPendingIdleRun = (report: ShippingCiWorkflowReport): boolean => {
  if (report.failedCount > 0) return false
  if (!isWork2Step1ScanSuccess(report)) return false
  const pending = (report.discoveredFiles ?? []).filter((f) => f.queue === 'pendingProcess').length
  if (pending > 0) return false
  return actionableFiles(report).length === 0
}

const resolveIdle = (report: ShippingCiWorkflowReport): StepFooterParts | null => {
  if (!isWork2NoPendingIdleRun(report)) return null
  return { ok: true, detail: WORK2_IDLE_STEPS_DETAIL }
}

export const hasWork2Step2ComparableSuccess = (report: ShippingCiWorkflowReport): boolean =>
  pipelineAttempted(report).some((f) => f.analysisOk === true)

export const getWork2Step2FooterParts = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveIdle(report)
  if (idle) return idle
  const attempted = pipelineAttempted(report)
  if (attempted.length === 0) {
    if (workflowError?.trim()) return { ok: false, detail: workflowError.trim() }
    return { ok: false, detail: '无待处理海运商业发票' }
  }
  const okFiles = attempted.filter((f) => f.analysisOk === true)
  const bullets = attempted.map(formatWork2Step2FileLine)
  const hasDescMismatch = attempted.some((f) => (f.descriptionMatchCount ?? 0) > 0)
  const partial = okFiles.length > 0 && okFiles.length < attempted.length
  if (okFiles.length < attempted.length) {
    const summary = buildStepBulletDetail(
      step2Summary(
        okFiles.length,
        attempted.length,
        '完成 Item 对照',
        partial ? '无法对照或未通过数据检查' : '未通过数据检查'
      ),
      bullets
    )
    const manualHint = hasDescMismatch
      ? '\n\n> **人工修复**：存在 Description 已对应但 Item 编号不一致的行，请核对海运发票与 BOQ 的 Item No 格式后重试。'
      : ''
    return { ok: okFiles.length > 0, detail: `${summary}${manualHint}` }
  }
  return {
    ok: true,
    detail: buildStepBulletDetail(
      step2Summary(okFiles.length, attempted.length, '完成 Item 对照', ''),
      bullets
    )
  }
}

export const formatWork2Step2ExtraLines = (report: ShippingCiWorkflowReport): string[] => {
  const table = formatWork2Step2MismatchTableHtml(report.files)
  if (table.length === 0) {
    return []
  }
  return ['', '**对照差异明细**', '', ...table]
}

export const getWork2Step3FooterParts = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveIdle(report)
  if (idle) return idle
  if (!hasWork2Step2ComparableSuccess(report)) {
    if (workflowError?.trim()) return { ok: false, detail: workflowError.trim() }
    return { ok: false, detail: '无通过数据检查的海运发票，无法进入明细汇总' }
  }
  const ok = report.outputPaths.length > 0 || report.skippedCount > 0
  return {
    ok,
    detail: ok
      ? `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
      : '无成功处理的商业发票'
  }
}

export const getWork2Step4FooterParts = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveIdle(report)
  if (idle) return idle
  if (workflowError?.trim()) return { ok: false, detail: workflowError.trim() }
  const wrote = report.outputPaths.length > 0
  return {
    ok: wrote || (report.skippedCount > 0 && report.failedCount === 0),
    detail: wrote
      ? `已写出 **${report.successCount}** 个进度款格式文件（路径见步骤 5）`
      : report.skippedCount > 0
        ? '（无新写出；均已处理）'
        : '（未写出文件）'
  }
}

export const getWork2Step5FooterParts = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  if (isWork2NoPendingIdleRun(report)) {
    return { ok: true, detail: '本次无待处理海运商业发票，无新增写出进度款文件' }
  }
  if (workflowError?.trim()) return { ok: false, detail: workflowError.trim() }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
    }
  }
  return {
    ok: true,
    detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
  }
}

export const getWork2WorkflowStepFooterParts = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  switch (stepNum) {
    case 1:
      return getWork2Step1FooterParts(report, workflowError)
    case 2:
      return getWork2Step2FooterParts(report, workflowError)
    case 3:
      return getWork2Step3FooterParts(report, workflowError)
    case 4:
      return getWork2Step4FooterParts(report, workflowError)
    case 5:
      return getWork2Step5FooterParts(report, workflowError)
    default:
      return { ok: false, detail: '未知步骤' }
  }
}

export const formatWork2Step5OutputFilesMarkdown = (report: ShippingCiWorkflowReport): string[] => {
  const paths = report.outputPaths.map((p) => p.trim()).filter(Boolean)
  if (paths.length === 0) return []
  return paths.map((path) => `- \`${path}\``)
}

export const formatWork2WorkflowStepFooterMarkdown = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: ShippingCiWorkflowReport,
  workflowError?: string
): string[] => {
  const { ok, detail } = getWork2WorkflowStepFooterParts(stepNum, report, workflowError)
  if (stepNum === 5 && ok && !isWork2NoPendingIdleRun(report)) {
    const lines = [formatBoldStepStatus(ok)]
    const fileLines = formatWork2Step5OutputFilesMarkdown(report)
    if (fileLines.length > 0) lines.push(...fileLines)
    const tail = [detail, '执行记录：shipping_ci_process_log.txt'].filter(Boolean).join('\n')
    if (tail) {
      if (fileLines.length > 0) lines.push('')
      lines.push(tail)
    }
    return lines
  }
  return [`${formatBoldStepStatus(ok)} ${detail}`]
}

export const work2RequiresDiagnosticAnalysis = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): boolean => {
  if (workflowError?.trim()) return true
  if (report.failedCount > 0) return true
  return getWork2WorkflowStepFooterParts(2, report, workflowError).ok === false
}

export const formatWork2NarrationHints = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): string[] => {
  if (isWork2NoPendingIdleRun(report)) {
    return ['**诊断说明**：本次无需输出「诊断分析与人工修复建议」章节。']
  }
  if (!work2RequiresDiagnosticAnalysis(report, workflowError)) {
    return ['**诊断说明**：本次无需输出「诊断分析与人工修复建议」章节。']
  }
  return []
}

export const formatWork2Steps2to5Markdown = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): string[] => {
  const lines: string[] = []
  const steps: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5]
  for (const stepNum of steps) {
    const title = EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS[stepNum - 1]
    lines.push(`### 步骤 ${stepNum}：${title}`, '', getWork2WorkflowStepIntro(stepNum), '')
    lines.push(...formatWork2WorkflowStepFooterMarkdown(stepNum, report, workflowError), '')
    if (stepNum === 2) {
      lines.push(...formatWork2Step2ExtraLines(report))
    }
    lines.push('')
  }
  return lines
}
