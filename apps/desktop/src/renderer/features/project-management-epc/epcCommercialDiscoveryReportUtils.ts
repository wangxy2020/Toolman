import type { DiscoveredFileQueue, DiscoveredWorkbook } from '@toolman/shared'

import { EPC_DISCOVERY_QUEUE_COLUMN_WIDTH_PX, formatEpcDiscoveryTableHtml } from './epcDiscoveryTable'

const QUEUE_SORT: Record<DiscoveredFileQueue, number> = {
  masterContract: 0,
  pendingProcess: 1,
  notRequired: 2,
  alreadyProcessed: 3,
}

export const DISCOVERED_QUEUE_LABELS: Record<DiscoveredFileQueue, string> = {
  masterContract: '母表',
  pendingProcess: '待处理',
  notRequired: '无需处理',
  alreadyProcessed: '已处理',
}

/** @deprecated 使用 EPC_DISCOVERY_QUEUE_COLUMN_WIDTH_PX */
export const DISCOVERED_QUEUE_COLUMN_WIDTH = EPC_DISCOVERY_QUEUE_COLUMN_WIDTH_PX

export interface DiscoveredScanSummary {
  folderCount: number
  xlsxCount: number
  masterCount: number
  pendingCount: number
  notRequiredCount: number
  alreadyProcessedCount: number
  masterFileNames: string[]
  pendingFileNames: string[]
}

/** 展示顺序：母表 → 待处理 → 无需处理 → 已处理 */
export const sortDiscoveredForDisplay = (files: DiscoveredWorkbook[]): DiscoveredWorkbook[] =>
  [...files].sort(
    (a, b) =>
      QUEUE_SORT[a.queue] - QUEUE_SORT[b.queue] ||
      a.folderPath.localeCompare(b.folderPath) ||
      a.fileName.localeCompare(b.fileName),
  )

export const getDiscoveredQueueLabel = (queue: DiscoveredFileQueue): string =>
  DISCOVERED_QUEUE_LABELS[queue] ?? queue

export const summarizeDiscoveredFiles = (files: DiscoveredWorkbook[] | undefined): DiscoveredScanSummary => {
  const list = files ?? []
  const folders = new Set<string>()
  for (const file of list) {
    if (file.folderPath && file.folderPath !== '.') {
      folders.add(file.folderPath)
    }
  }

  const countBy = (queue: DiscoveredFileQueue) => list.filter((f) => f.queue === queue).length

  return {
    folderCount: folders.size,
    xlsxCount: list.length,
    masterCount: countBy('masterContract'),
    pendingCount: countBy('pendingProcess'),
    notRequiredCount: countBy('notRequired'),
    alreadyProcessedCount: countBy('alreadyProcessed'),
    masterFileNames: list.filter((f) => f.queue === 'masterContract').map((f) => f.fileName),
    pendingFileNames: list.filter((f) => f.queue === 'pendingProcess').map((f) => f.fileName),
  }
}

/** 将账本 UTC 时间格式化为本地可读时间 */
export const formatLedgerProcessedAtDisplay = (processedAt?: string): string | undefined => {
  if (!processedAt?.trim()) {
    return undefined
  }
  const date = new Date(processedAt)
  if (Number.isNaN(date.getTime())) {
    return processedAt.trim()
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

/** 步骤 1 表格「说明」列：已处理=完成时间；无需处理=上次处理日期（有账本时） */
export const formatDiscoveredFileDescription = (file: DiscoveredWorkbook): string => {
  const at = formatLedgerProcessedAtDisplay(file.ledgerProcessedAt)

  if (file.queue === 'alreadyProcessed') {
    return at ? `处理完成：${at}` : '处理完成时间未记录'
  }

  if (file.queue === 'notRequired') {
    return at ? `上一次处理：${at}` : file.roleReason
  }

  return file.roleReason
}

/** 步骤 1 穿透表（HTML，列宽由 .epc-discovery-table 统一控制） */
export const formatDiscoveredTablesMarkdown = (files: DiscoveredWorkbook[] | undefined): string[] => {
  const sorted = sortDiscoveredForDisplay(files ?? [])
  return formatEpcDiscoveryTableHtml(
    sorted.map((file) => ({
      fileName: file.fileName,
      queueLabel: getDiscoveredQueueLabel(file.queue),
      description: formatDiscoveredFileDescription(file),
    })),
  )
}

export const EPC_STEP1_SCAN_INTRO =
  '以下为工作区穿透扫描与 ipc_process_log.txt 执行记录比对结果（仅 SUCCESS 视为已处理，FAILED 可重试）。若账本为 SUCCESS 但对应 *_aligned.xlsx 已删除，该 IPC 与缺失的合并母表会标为「待处理」并重新执行步骤 2–4。表格「说明」：无需处理=上一次处理日期（有记录时），已处理=处理完成时间，其余分类为识别说明。'

/** 步骤 1 一行统计 */
export const formatDiscoveredSummaryTags = (files: DiscoveredWorkbook[] | undefined): string => {
  const s = summarizeDiscoveredFiles(files)
  return `${s.folderCount} 个文件夹 · ${s.xlsxCount} 个 xlsx 文件 · 母表 ${s.masterCount} · 待处理 ${s.pendingCount} · 无需处理 ${s.notRequiredCount} · 已处理 ${s.alreadyProcessedCount}`
}

export const isStep1ScanSuccess = (discoveredFiles: DiscoveredWorkbook[] | undefined): boolean =>
  (discoveredFiles?.length ?? 0) > 0

export const getStep1FooterParts = (
  discoveredFiles: DiscoveredWorkbook[] | undefined,
  workflowError?: string,
): { ok: boolean; detail: string } => {
  if (!isStep1ScanSuccess(discoveredFiles)) {
    return { ok: false, detail: workflowError ?? '未完成工作区穿透扫描' }
  }
  return { ok: true, detail: formatDiscoveredSummaryTags(discoveredFiles) }
}

/** 步骤 1 表格下方：粗体状态 + 统计（或失败原因） */
export const formatStep1FooterLine = (
  discoveredFiles: DiscoveredWorkbook[] | undefined,
  workflowError?: string,
): string => {
  const { ok, detail } = getStep1FooterParts(discoveredFiles, workflowError)
  return `${formatBoldStepStatus(ok)} ${detail}`
}

export const formatBoldStepStatus = (success: boolean): string => (success ? '**成功。**' : '**失败。**')
