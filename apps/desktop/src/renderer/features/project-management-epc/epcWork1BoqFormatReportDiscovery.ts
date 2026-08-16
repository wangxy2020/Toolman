import type { BoqFormatFileQueue, BoqFormatWorkflowReport } from '@toolman/shared'
import { EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS } from '@toolman/shared'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'
import {
  formatBoldStepStatus,
  formatLedgerProcessedAtDisplay,
  type StepFooterParts,
} from './epcCommercialReportUtils'

export type { StepFooterParts }

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

export const isWork1Step1ScanSuccess = (report: BoqFormatWorkflowReport): boolean =>
  getWork1Step1FooterParts(report).ok

export const formatWork1Step1FooterLine = (
  report: BoqFormatWorkflowReport,
  workflowError?: string
): string => {
  const { ok, detail } = getWork1Step1FooterParts(report, workflowError)
  return `${formatBoldStepStatus(ok)} ${detail}`
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
