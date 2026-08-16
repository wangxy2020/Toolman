import type { IpcAlignmentReport } from '@toolman/shared'
import { EPC_COMMERCIAL_WORKFLOW_STEPS } from '@toolman/shared'

import { formatBoldStepStatus } from './epcCommercialDiscoveryReportUtils'
import {
  EPC_STEP2_INTRO,
  EPC_STEP3_PURPOSE,
  EPC_STEP4_PURPOSE,
  EPC_STEP5_PURPOSE,
  isWork4NoPendingIdleRun,
  type StepFooterParts,
} from './epcCommercialWorkflowStepReportShared'
import {
  formatStep5OutputFilesMarkdown,
  getStep2FooterParts,
  getStep3FooterParts,
  getStep4FooterParts,
  getStep5FooterParts,
} from './epcCommercialWorkflowStepReportFooters'

export {
  EPC_STEP2_INTRO,
  EPC_STEP3_PURPOSE,
  EPC_STEP4_PURPOSE,
  EPC_STEP5_PURPOSE,
  getPipelineIpcFiles,
  WORK4_IDLE_STEPS_DETAIL,
  isWork4NoPendingIdleRun,
  type StepFooterParts,
} from './epcCommercialWorkflowStepReportShared'

export {
  formatStep2FileLine,
  formatStep3FileLine,
  formatStep4FileLine,
} from './epcCommercialWorkflowStepReportFormat'

export {
  getStep2FooterParts,
  getStep3FooterParts,
  getStep4FooterParts,
  getStep5FooterParts,
  getStep5OutputPaths,
  formatStep5OutputFilesMarkdown,
} from './epcCommercialWorkflowStepReportFooters'

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
