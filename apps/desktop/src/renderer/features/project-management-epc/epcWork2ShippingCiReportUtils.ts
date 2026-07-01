import type {
  ShippingCiFileQueue,
  ShippingCiWorkflowReport
} from '@toolman/shared'
import { EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS } from '@toolman/shared'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'
import {
  formatBoldStepStatus,
  formatLedgerProcessedAtDisplay,
  type StepFooterParts
} from './epcCommercialReportUtils'

export const EPC_WORK2_STEP1_INTRO =
  '读取或初始化 shipping_ci_process_log.txt，递归扫描工作区（含 substation_lot/SCHn-IPCx/ 嵌套目录）内的海运商业发票 xlsx：文件名含 FOB/CIF/CIP 或 Commercial Invoice 即可（期号取自 SCHn-IPCx 文件夹）；排除 Packing List；同一 SCHn-IPCx 下多份 CIP/CIF 发票合并为一张进度款商业发票。账本仅当全部 5 步成功后才记为「已处理」，否则仍为「待处理」。'

export const EPC_WORK2_STEP2_INTRO =
  '将文件夹内各海运商业发票的 Item No 与 BOQ_aligned（或 BOQ.xlsx）对应 Schedule 分表的 Item No 逐行对照：全部对应则进入后续步骤；若 Description 可对应但 Item 不一致，视为编号格式/录入问题并提示人工核对；若 Item 与 Description 均无法对应则失败。'

export const EPC_WORK2_STEP3_INTRO =
  '从 BOQ_aligned 提取明细写入进度款格式表；CI 数量写入 Current；Previous 取自 aligned 已有 IPC 列或 0；计算 Period-End 与 Completed Settlement Proportion、Current Total Price。'

export const EPC_WORK2_STEP4_INTRO =
  '生成 project_id-substation_lot-SCHx-IPCx.xlsx（供工作 4 处理）：优先复制 SCHn-IPCx 或 File Templates 中的进度款商业发票模板，经 exceljs 清空日期/编号/明细后填入本期数据（保留版式）；无模板时由引擎生成简易表。若存在 BOQ_aligned 则另通过 exceljs 原地增量写入 IPC 期数列。'

export const EPC_WORK2_STEP5_INTRO =
  '汇总本次写出的进度款工程量清单路径与 shipping_ci_process_log.txt 执行记录。'

export const WORK2_IDLE_STEPS_DETAIL = '本次无待处理海运商业发票；步骤 2～5 已跳过（无需重复处理）'

const QUEUE_LABELS: Record<ShippingCiFileQueue, string> = {
  pendingProcess: '待处理',
  alreadyProcessed: '已处理'
}

const formatDiscoveryDescription = (
  file: ShippingCiWorkflowReport['discoveredFiles'][number]
): string => {
  const at = formatLedgerProcessedAtDisplay(file.ledgerProcessedAt)
  if (file.queue === 'alreadyProcessed') {
    return at ? `处理完成：${at}` : '处理完成时间未记录'
  }
  return [file.ipcPeriod, `SCH${file.schDigit}`, file.folderPath, file.roleReason]
    .filter(Boolean)
    .join(' · ')
}

export const formatShippingCiDiscoveredTableHtml = (
  files: ShippingCiWorkflowReport['discoveredFiles'] | undefined
): string[] => {
  const list = files ?? []
  if (list.length === 0) {
    return ['未发现待处理海运商业发票']
  }
  return formatEpcDiscoveryTableHtml(
    list.map((file) => ({
      fileName: file.fileName,
      queueLabel: QUEUE_LABELS[file.queue],
      description: formatDiscoveryDescription(file)
    }))
  )
}

const logStatus = (report: ShippingCiWorkflowReport): string =>
  report.shippingCiProcessLogPath?.trim()
    ? 'shipping_ci_process_log.txt：已读取'
    : 'shipping_ci_process_log.txt：未找到（将新建）'

export const formatShippingCiDiscoveredSummaryTags = (report: ShippingCiWorkflowReport): string => {
  const discovered = report.discoveredFiles ?? []
  const pending = discovered.filter((f) => f.queue === 'pendingProcess').length
  const already = discovered.filter((f) => f.queue === 'alreadyProcessed').length
  return [
    logStatus(report),
    `${discovered.length} 个海运商业发票`,
    `待处理 ${pending}`,
    `已处理 ${already}`
  ].join(' · ')
}

export const isWork2Step1ScanSuccess = (report: ShippingCiWorkflowReport): boolean =>
  getWork2Step1FooterParts(report).ok

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

/** 步骤 2：单文件一行要点（对齐工作 4 步骤 2 风格） */
export const formatWork2Step2FileLine = (file: ShippingCiWorkflowReport['files'][number]): string => {
  const name = file.fileName
  const boqMissing = file.mismatches?.some((m) => m.kind === 'boqNotFound')
  if (boqMissing) {
    const reason =
      file.mismatches?.find((m) => m.kind === 'boqNotFound')?.reason ??
      '未找到 BOQ_aligned 或 BOQ.xlsx'
    return `• ${name}：无法对照 — ${reason}`
  }
  if (file.analysisOk === false) {
    const checked = file.checkedRowCount ?? 0
    const matched = file.matchedRowCount ?? 0
    const descMismatch = file.descriptionMatchCount ?? 0
    const hardErr = file.analysisRowErrorCount ?? 0
    const parts: string[] = []
    if (checked > 0) {
      parts.push(`对照 **${checked}** 行，Item 对应 **${matched}** 行`)
    }
    if (descMismatch > 0) {
      parts.push(`**${descMismatch}** 处 Description 可对应但 Item 不一致（需人工核对）`)
    }
    if (hardErr > 0) {
      parts.push(`**${hardErr}** 处 Item 与 Description 均未匹配`)
    }
    const boqHint =
      file.boqReferenceKind && file.boqScheduleDigit != null
        ? ` · BOQ：${file.boqReferenceKind} Schedule${file.boqScheduleDigit}`
        : ''
    return `• ${name}：数据检查未通过 — ${parts.join('；')}${boqHint}`
  }
  if (file.status === 'skipped') {
    return `• ${name}：已跳过`
  }
  const rows = file.matchedRowCount ?? file.checkedRowCount ?? 0
  const checked = file.checkedRowCount ?? rows
  const boqHint =
    file.boqReferenceKind && file.boqScheduleDigit != null
      ? `，对照 ${file.boqReferenceKind} Schedule${file.boqScheduleDigit}`
      : ''
  const errText =
    (file.analysisRowErrorCount ?? 0) > 0 || (file.descriptionMatchCount ?? 0) > 0
      ? '存在未对应行'
      : 'Item 与 BOQ 全部对应'
  return `• ${name}：**${checked}** 行参与对照，**${rows}** 行 Item 完全对应${boqHint}，${errText}`
}

export const formatWork2Step2MismatchTableHtml = (
  files: ShippingCiWorkflowReport['files'] | undefined
): string[] => {
  const rows =
    files
      ?.filter((f) => (f.mismatches?.length ?? 0) > 0)
      .flatMap((f) =>
        (f.mismatches ?? []).map((m) => ({
          fileName: f.fileName,
          ...m
        }))
      ) ?? []
  if (rows.length === 0) {
    return []
  }
  return formatEpcDiscoveryTableHtml(
    rows.map((row) => {
      const kindLabel =
        row.kind === 'boqNotFound'
          ? '缺少 BOQ 对照表'
          : row.kind === 'descriptionMatchItemMismatch'
            ? 'Item 不一致（Description 可对应）'
            : '均未匹配'
      const mapping =
        row.kind === 'descriptionMatchItemMismatch' && row.boqItem
          ? `海运 Item **${row.item}** → BOQ Item **${row.boqItem}**`
          : `Item **${row.item}**`
      const desc = [kindLabel, mapping, row.description ? `Description：${row.description}` : '']
        .filter(Boolean)
        .join(' · ')
      return {
        fileName: row.fileName,
        queueLabel: kindLabel,
        description: desc
      }
    })
  )
}

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

export const getWork2Step1FooterParts = (
  report: ShippingCiWorkflowReport,
  workflowError?: string
): StepFooterParts => {
  const discovered = report.discoveredFiles ?? []
  if (discovered.length > 0) {
    return { ok: true, detail: formatShippingCiDiscoveredSummaryTags(report) }
  }
  if (workflowError?.trim()) {
    return { ok: false, detail: workflowError.trim() }
  }
  return {
    ok: false,
    detail:
      '未发现海运商业发票：请放在 substation_lot/SCHn-IPCx/ 下，文件名含 FOB/CIF/CIP 或 Commercial Invoice'
  }
}

export const formatWork2Step1Section = (report: ShippingCiWorkflowReport, workflowError?: string): string => {
  const lines = ['### 步骤 1：多层穿透与匹配', '', EPC_WORK2_STEP1_INTRO, '']
  if (isWork2Step1ScanSuccess(report)) {
    lines.push(...formatShippingCiDiscoveredTableHtml(report.discoveredFiles), '')
    lines.push(`${formatBoldStepStatus(true)} ${formatShippingCiDiscoveredSummaryTags(report)}`)
  } else {
    lines.push(`${formatBoldStepStatus(false)} ${getWork2Step1FooterParts(report, workflowError).detail}`)
  }
  return lines.join('\n')
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

export const getWork2WorkflowStepIntro = (stepNum: 2 | 3 | 4 | 5): string => {
  switch (stepNum) {
    case 2:
      return EPC_WORK2_STEP2_INTRO
    case 3:
      return EPC_WORK2_STEP3_INTRO
    case 4:
      return EPC_WORK2_STEP4_INTRO
    case 5:
      return EPC_WORK2_STEP5_INTRO
    default:
      return ''
  }
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
