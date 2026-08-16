import type {
  DiscoveredAlignedWorkbook,
  PaymentAlignedQueue,
  PaymentWorkflowReport
} from '@toolman/shared'
import { EPC_WORK5_PAYMENT_WORKFLOW_STEPS } from '@toolman/shared'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'

export interface StepFooterParts {
  ok: boolean
  detail: string
}

export const formatBoldStepStatus = (ok: boolean): string => (ok ? '**成功。**' : '**失败。**')

export const EPC_WORK5_STEP1_INTRO =
  '读取工作区 ipc_process_log.txt 与 ipc_payment_log.txt，确认「进度款工程量数据统计」已产出 aligned 母表且本期支付统计可继续；再扫描 *_aligned.xlsx（按文件去重，不按 Schedule 行数）。'

export const EPC_WORK5_STEP2_INTRO =
  '从各 aligned 工程量清单读取指定期数 IPC 列总金额，解析项目、标段、Schedule、货币与期号。'

export const EPC_WORK5_STEP3_INTRO =
  '从 aligned 读取本期 IPC 申报金额（ipc_application），并按规则重算预付款扣回、其他预留与应付总额（ipc_amount_due）。调价、分期应付、生效/账期/应支付/实际支付日期等列无法从工程量清单得出，工作 5 保留表中已有值（含大模型修订层 lock），不覆盖。'

export const EPC_WORK5_STEP4_INTRO =
  '将明细写入工作区 IPC_Payment_data 目录下的 ipc_payment_data.xlsx 与 project_ipc_data.xlsx。'

export const EPC_WORK5_STEP5_INTRO =
  '汇总本次写出的 Excel 文件路径；CSV 与处理日志仅供引擎内部使用，不在本步骤展示。'

export const PAYMENT_ALIGNED_QUEUE_LABELS: Record<PaymentAlignedQueue, string> = {
  pendingProcess: '待处理',
  alreadyProcessed: '已处理',
  notReady: '暂不可处理'
}

const ALIGNED_QUEUE_SORT: Record<PaymentAlignedQueue, number> = {
  pendingProcess: 0,
  alreadyProcessed: 1,
  notReady: 2
}

export const sortDiscoveredAlignedForDisplay = (
  files: DiscoveredAlignedWorkbook[]
): DiscoveredAlignedWorkbook[] =>
  [...files].sort(
    (a, b) =>
      ALIGNED_QUEUE_SORT[a.queue] - ALIGNED_QUEUE_SORT[b.queue] ||
      a.folderPath.localeCompare(b.folderPath) ||
      a.fileName.localeCompare(b.fileName)
  )

export const getDiscoveredAlignedWorkbooks = (report: PaymentWorkflowReport): DiscoveredAlignedWorkbook[] =>
  report.discoveredAlignedFiles ?? []

const countProcessLogSuccess = (report: PaymentWorkflowReport): string => {
  if (!report.ipcProcessLogPath?.trim()) {
    return 'ipc_process_log：未找到'
  }
  return 'ipc_process_log：已读取'
}

const countPaymentLogStatus = (report: PaymentWorkflowReport): string => {
  if (!report.ipcPaymentLogPath?.trim()) {
    return 'ipc_payment_log：未找到（将新建）'
  }
  return 'ipc_payment_log：已读取'
}

/** 步骤 1 一行统计（与工作 4 formatDiscoveredSummaryTags 对齐） */
export const formatDiscoveredAlignedSummaryTags = (report: PaymentWorkflowReport): string => {
  const discovered = getDiscoveredAlignedWorkbooks(report)
  const pending = discovered.filter((f) => f.queue === 'pendingProcess').length
  const already = discovered.filter((f) => f.queue === 'alreadyProcessed').length
  const notReady = discovered.filter((f) => f.queue === 'notReady').length
  return [
    countProcessLogSuccess(report),
    countPaymentLogStatus(report),
    `${discovered.length} 个 aligned 工程量清单`,
    `待处理 ${pending}`,
    `已处理 ${already}`,
    `暂不可处理 ${notReady}`
  ].join(' · ')
}

export const getWork5Step1FooterParts = (report: PaymentWorkflowReport): StepFooterParts => {
  const discovered = getDiscoveredAlignedWorkbooks(report)
  const workbookCount = discovered.length

  if (workbookCount === 0) {
    return {
      ok: false,
      detail: `${countProcessLogSuccess(report)}\n${countPaymentLogStatus(report)}\n未发现 *_aligned.xlsx，请先执行「进度款工程量数据统计」`
    }
  }

  const notReady = discovered.filter((f) => f.queue === 'notReady').length
  const actionable = workbookCount - notReady

  if (actionable === 0) {
    return {
      ok: false,
      detail: [
        countProcessLogSuccess(report),
        countPaymentLogStatus(report),
        `发现 **${workbookCount}** 个 aligned 文件，但均无当前期数 IPC 列可处理`
      ].join('\n')
    }
  }

  return {
    ok: true,
    detail: formatDiscoveredAlignedSummaryTags(report)
  }
}

export const isWork5Step1ScanSuccess = (report: PaymentWorkflowReport): boolean =>
  getWork5Step1FooterParts(report).ok

export const formatDiscoveredAlignedMarkdown = (files: DiscoveredAlignedWorkbook[]): string[] => {
  const sorted = sortDiscoveredAlignedForDisplay(files)
  if (sorted.length === 0) {
    return ['（未发现 *_aligned.xlsx）']
  }
  return formatEpcDiscoveryTableHtml(
    sorted.map((file) => ({
      fileName: file.fileName,
      queueLabel: PAYMENT_ALIGNED_QUEUE_LABELS[file.queue],
      description: file.roleReason.replace(/\n/g, ' ')
    }))
  )
}

export const formatWork5Step1FooterLine = (
  report: PaymentWorkflowReport,
  workflowError?: string
): string => {
  const { ok, detail } = getWork5Step1FooterParts(report)
  if (workflowError && !ok) {
    return `${formatBoldStepStatus(ok)} ${workflowError}`
  }
  return `${formatBoldStepStatus(ok)} ${detail}`
}

export const formatWork5Step1Section = (
  report: PaymentWorkflowReport,
  workflowError?: string
): string => {
  const title = EPC_WORK5_PAYMENT_WORKFLOW_STEPS[0]
  const lines = [`### 步骤 1：${title}`, '', EPC_WORK5_STEP1_INTRO, '']

  if (isWork5Step1ScanSuccess(report)) {
    lines.push(
      ...formatDiscoveredAlignedMarkdown(getDiscoveredAlignedWorkbooks(report)),
      '',
      formatWork5Step1FooterLine(report, workflowError)
    )
  } else {
    lines.push(formatWork5Step1FooterLine(report, workflowError))
  }

  return lines.join('\n')
}
