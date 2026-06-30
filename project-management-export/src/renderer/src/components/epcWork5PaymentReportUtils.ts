import type {
  DiscoveredAlignedWorkbook,
  PaymentAlignedQueue,
  PaymentFileResult,
  PaymentWorkflowReport
} from '@shared/epcCommercialTypes'
import { EPC_WORK5_PAYMENT_WORKFLOW_STEPS } from '@shared/epcCommercialTypes'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'

export interface StepFooterParts {
  ok: boolean
  detail: string
}

const formatBoldStepStatus = (ok: boolean): string => (ok ? '**成功。**' : '**失败。**')

export const EPC_WORK5_STEP1_INTRO =
  '读取工作区 ipc_process_log.txt 与 ipc_payment_log.txt，确认「进度款工程量数据统计」已产出 aligned 母表且本期支付统计可继续；再扫描 *_aligned.xlsx（按文件去重，不按 Schedule 行数）。'

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

export const getDiscoveredAlignedWorkbooks = (report: PaymentWorkflowReport): DiscoveredAlignedWorkbook[] =>
  report.discoveredAlignedFiles ?? []

export const isWork5Step1ScanSuccess = (report: PaymentWorkflowReport): boolean =>
  getWork5Step1FooterParts(report).ok

export const EPC_WORK5_STEP2_INTRO =
  '从各 aligned 工程量清单读取指定期数 IPC 列总金额，解析项目、标段、Schedule、货币与期号。'

export const EPC_WORK5_STEP3_INTRO =
  '从 aligned 读取本期 IPC 申报金额（ipc_application），并按规则重算预付款扣回、其他预留与应付总额（ipc_amount_due）。调价、分期应付、生效/账期/应支付/实际支付日期等列无法从工程量清单得出，工作 5 保留表中已有值（含大模型修订层 lock），不覆盖。'

export const EPC_WORK5_STEP4_INTRO =
  '将明细写入工作区 IPC_Payment_data 目录下的 ipc_payment_data.xlsx 与 project_ipc_data.xlsx。'

export const EPC_WORK5_STEP5_INTRO =
  '汇总本次写出的 Excel 文件路径；CSV 与处理日志仅供引擎内部使用，不在本步骤展示。'

const isXlsxPath = (path: string): boolean => /\.xlsx$/i.test(path.trim())

/** 步骤 5 仅列出两个 Excel 汇总表（不含 csv、log.txt） */
export const getWork5Step5OutputPaths = (report: PaymentWorkflowReport): string[] => {
  const collected = [report.ipcPaymentDataPath, report.projectIpcDataPath]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p) && isXlsxPath(p))
  return [...new Set(collected)]
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

const pipelineFiles = (report: PaymentWorkflowReport): PaymentFileResult[] => report.files

const actionablePipelineFiles = (report: PaymentWorkflowReport): PaymentFileResult[] =>
  pipelineFiles(report).filter((f) => f.status === 'success' || f.status === 'failed')

/** 步骤 1 有待处理 aligned 为 0、且本次未进入流水线时，步骤 2～5 视为正常跳过 */
export const WORK5_IDLE_STEPS_DETAIL = '本次无待处理 aligned 文件；步骤 2～5 已跳过（无需重复处理）'

export const isWork5NoPendingIdleRun = (report: PaymentWorkflowReport): boolean => {
  if (report.failedCount > 0) {
    return false
  }
  if (!isWork5Step1ScanSuccess(report)) {
    return false
  }
  const discovered = getDiscoveredAlignedWorkbooks(report)
  const pending = discovered.filter((f) => f.queue === 'pendingProcess').length
  if (pending > 0) {
    return false
  }
  return actionablePipelineFiles(report).length === 0
}

const resolveWork5IdleSteps2to5 = (report: PaymentWorkflowReport): StepFooterParts | null => {
  if (!isWork5NoPendingIdleRun(report)) {
    return null
  }
  return { ok: true, detail: WORK5_IDLE_STEPS_DETAIL }
}

export const getWork5Step2FooterParts = (report: PaymentWorkflowReport): StepFooterParts => {
  const idle = resolveWork5IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  const files = pipelineFiles(report)
  if (files.length === 0) {
    return { ok: false, detail: '无输入文件' }
  }
  const readOk = files.filter((f) => f.status !== 'failed')
  if (readOk.length === 0) {
    return { ok: false, detail: '未能从任何 aligned 文件读取 IPC 列金额' }
  }
  const bullets = readOk.slice(0, 8).map((f) => {
    const amount =
      f.ipcAmount != null ? `金额 **${f.ipcAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}**` : '已读取'
    const col = f.ipcColumn ? ` · 列 ${f.ipcColumn}` : ''
    return `• ${f.fileName}：${amount}${col}`
  })
  const more = readOk.length > 8 ? `\n… 另有 **${readOk.length - 8}** 个文件` : ''
  return {
    ok: readOk.length === files.length,
    detail: [`**${readOk.length}** / **${files.length}** 个文件已读取 IPC 列`, ...bullets].join('\n') + more
  }
}

export const getWork5Step3FooterParts = (report: PaymentWorkflowReport): StepFooterParts => {
  const idle = resolveWork5IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `**${report.failedCount}** 个文件计算失败，请查看处理明细`
    }
  }
  const incompleteHint = formatIncompleteUnitsHint(report)
  if (incompleteHint) {
    return { ok: false, detail: incompleteHint }
  }
  const processed = report.successCount + report.skippedCount
  if (processed === 0) {
    return { ok: false, detail: '无文件完成指标计算' }
  }
  const backfill = report.backfillCount ?? 0
  const backfillNote =
    backfill > 0 ? ` · **${backfill}** 个账本已记录项已补齐汇总列` : ''
  return {
    ok: true,
    detail: `**${report.successCount}** 个文件已写入/更新支付指标 · **${report.skippedCount}** 个仅复核${backfillNote}`
  }
}

export const getWork5Step4FooterParts = (report: PaymentWorkflowReport): StepFooterParts => {
  const idle = resolveWork5IdleSteps2to5(report)
  if (idle) {
    return idle
  }
  const paths = getWork5Step5OutputPaths(report)
  if (paths.length < 2) {
    return { ok: false, detail: 'Excel 汇总表未完整写出' }
  }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `部分文件失败，汇总表可能不完整（失败 **${report.failedCount}**）`
    }
  }
  const incompleteHint = formatIncompleteUnitsHint(report)
  if (incompleteHint) {
    return { ok: false, detail: incompleteHint }
  }
  return { ok: true, detail: '已更新 **ipc_payment_data.xlsx** 与 **project_ipc_data.xlsx**' }
}

export const getWork5Step5FooterParts = (
  report: PaymentWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const idle = resolveWork5IdleSteps2to5(report)
  if (idle) {
    return { ok: true, detail: '本次无待处理 aligned 文件，无新增写出 Excel 汇总表' }
  }
  const xlsxPaths = getWork5Step5OutputPaths(report)
  if (xlsxPaths.length === 0) {
    return { ok: false, detail: workflowError ?? '未生成 Excel 汇总表' }
  }
  if (report.failedCount > 0) {
    return {
      ok: false,
      detail: `成功 **${report.successCount}** · 失败 **${report.failedCount}** · 跳过 **${report.skippedCount}**`
    }
  }
  const incompleteHint = formatIncompleteUnitsHint(report)
  if (incompleteHint) {
    return { ok: false, detail: incompleteHint }
  }
  if (report.successCount === 0 && report.skippedCount === 0) {
    return { ok: false, detail: workflowError ?? '无成功处理的 aligned 文件' }
  }
  return {
    ok: true,
    detail: `已生成 **${xlsxPaths.length}** 个 Excel 汇总表 · 成功处理 **${report.successCount}** 个文件 · 跳过 **${report.skippedCount}**`
  }
}

export const getWork5WorkflowStepIntro = (stepNum: 1 | 2 | 3 | 4 | 5): string => {
  switch (stepNum) {
    case 1:
      return EPC_WORK5_STEP1_INTRO
    case 2:
      return EPC_WORK5_STEP2_INTRO
    case 3:
      return EPC_WORK5_STEP3_INTRO
    case 4:
      return EPC_WORK5_STEP4_INTRO
    case 5:
      return EPC_WORK5_STEP5_INTRO
    default:
      return ''
  }
}

const formatIncompleteUnitsHint = (report: PaymentWorkflowReport): string => {
  const count = report.incompleteCount ?? 0
  if (count <= 0) {
    return ''
  }
  const samples = (report.incompleteUnits ?? [])
    .slice(0, 5)
    .map((u) => `${u.projectId} · ${u.schedule} · ${u.ipcColumn}（${u.fileName}）`)
  const more =
    count > samples.length ? ` … 另有 **${count - samples.length}** 项` : ''
  return `**${count}** 个 IPC 统计单元未写入汇总表：${samples.join('；')}${more}`
}

export const work5RequiresDiagnosticAnalysis = (
  report: PaymentWorkflowReport,
  workflowError?: string
): boolean => {
  if (workflowError?.trim()) {
    return true
  }
  if (report.failedCount > 0) {
    return true
  }
  if ((report.incompleteCount ?? 0) > 0) {
    return true
  }
  if (report.files.some((f) => f.status === 'failed')) {
    return true
  }
  if (isWork5NoPendingIdleRun(report)) {
    return false
  }
  const steps: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5]
  return steps.some((step) => !getWork5WorkflowStepFooterParts(step, report, workflowError).ok)
}

export const formatWork5NarrationHints = (
  report: PaymentWorkflowReport,
  workflowError?: string
): string[] => {
  const lines: string[] = []
  if (isWork5NoPendingIdleRun(report)) {
    lines.push(
      '> **执行说明**：步骤 1 待处理为 0，步骤 2～5 无需执行。请逐步写 **成功。** 并说明已跳过；**不要**写成失败，**不要**输出诊断分析。'
    )
  }
  if (work5RequiresDiagnosticAnalysis(report, workflowError)) {
    lines.push('> **诊断说明**：存在失败项，须在报告末尾增加「诊断分析与人工修复建议」章节。')
  } else {
    lines.push('> **诊断说明**：本次无需输出「诊断分析与人工修复建议」。')
  }
  return lines
}

export const getWork5WorkflowStepFooterParts = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: PaymentWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  switch (stepNum) {
    case 1:
      return getWork5Step1FooterParts(report)
    case 2:
      return getWork5Step2FooterParts(report)
    case 3:
      return getWork5Step3FooterParts(report)
    case 4:
      return getWork5Step4FooterParts(report)
    case 5:
      return getWork5Step5FooterParts(report, workflowError)
    default:
      return { ok: false, detail: '未知步骤' }
  }
}

export const formatStep5OutputFilesMarkdown = (report: PaymentWorkflowReport): string[] => {
  const paths = getWork5Step5OutputPaths(report)
  if (paths.length === 0) {
    return []
  }
  return paths.map((path) => `- \`${path}\``)
}

export const formatWork5WorkflowStepFooterMarkdown = (
  stepNum: 1 | 2 | 3 | 4 | 5,
  report: PaymentWorkflowReport,
  workflowError?: string
): string[] => {
  const { ok, detail } = getWork5WorkflowStepFooterParts(stepNum, report, workflowError)
  if (stepNum === 5 && ok && !isWork5NoPendingIdleRun(report)) {
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

/** 步骤 1 表格下方：粗体状态 + 统计（或失败原因） */
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

export const formatWork5Steps2to5Markdown = (
  report: PaymentWorkflowReport,
  workflowError?: string
): string[] => {
  const lines: string[] = []
  for (let i = 1; i < EPC_WORK5_PAYMENT_WORKFLOW_STEPS.length; i++) {
    const stepNum = (i + 1) as 2 | 3 | 4 | 5
    const title = EPC_WORK5_PAYMENT_WORKFLOW_STEPS[i]
    lines.push(`### 步骤 ${stepNum}：${title}`, '', getWork5WorkflowStepIntro(stepNum), '')
    lines.push(...formatWork5WorkflowStepFooterMarkdown(stepNum, report, workflowError), '')
  }
  return lines
}

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

/** @deprecated 使用 formatWork5Step1Section + formatWork5Steps2to5Markdown */
export const formatPaymentWorkflowStepsMarkdown = (
  report: PaymentWorkflowReport,
  workflowError?: string
): string[] => [formatWork5Step1Section(report, workflowError), '', ...formatWork5Steps2to5Markdown(report, workflowError)]
