import type { IpcAlignmentReport } from '@toolman/shared'
import {
  pipelineAttempted,
  resolveWork4IdleSteps2to5,
  type StepFooterParts,
} from './epcCommercialWorkflowStepReportShared'
import {
  buildStepBulletDetail,
  formatStep2FileLine,
  formatStep3FileLine,
  formatStep4FileLine,
  stepSummary,
} from './epcCommercialWorkflowStepReportFormat'

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

