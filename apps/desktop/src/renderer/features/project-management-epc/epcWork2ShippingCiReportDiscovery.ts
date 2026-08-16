import type { ShippingCiFileQueue, ShippingCiWorkflowReport } from '@toolman/shared'

import { formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'
import {
  formatBoldStepStatus,
  formatLedgerProcessedAtDisplay,
  type StepFooterParts,
} from './epcCommercialReportUtils'

export type { StepFooterParts }

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

export const isWork2Step1ScanSuccess = (report: ShippingCiWorkflowReport): boolean =>
  getWork2Step1FooterParts(report).ok

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
