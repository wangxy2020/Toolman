import type { IpcAlignmentReport, IpcFileResult } from '@toolman/shared'
import {
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

export const pipelineAttempted = (report: IpcAlignmentReport): IpcFileResult[] =>
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

export const resolveWork4IdleSteps2to5 = (report: IpcAlignmentReport): StepFooterParts | null => {
  if (!isWork4NoPendingIdleRun(report)) {
    return null
  }
  return { ok: true, detail: WORK4_IDLE_STEPS_DETAIL }
}
