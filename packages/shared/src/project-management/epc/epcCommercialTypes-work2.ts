import type { EpcCommercialErrorCode, IpcFileProcessStatus } from './epcCommercialTypes-commands.js'

export const EPC_WORK2_SHIPPING_CI_PROCESS_LOG_FILE = 'shipping_ci_process_log.txt'

export type ShippingCiFileQueue = 'pendingProcess' | 'alreadyProcessed'

export interface ShippingCiDiscoveredFile {
  fileName: string
  filePath: string
  relativePath: string
  folderPath: string
  roleReason: string
  ipcPeriod: string
  schDigit: number
  queue: ShippingCiFileQueue
  inLedger: boolean
  ledgerProcessedAt?: string
}

export type ShippingCiMismatchKind = 'itemNotFound' | 'descriptionMatchItemMismatch' | 'boqNotFound'

export interface ShippingCiMismatchRow {
  kind: ShippingCiMismatchKind
  item: string
  description: string
  reason: string
  boqItem?: string
  boqDescription?: string
}

export interface ShippingCiFileResult {
  fileName: string
  filePath: string
  status: IpcFileProcessStatus
  errorMessage?: string
  skippedReason?: string
  outputPath?: string
  mismatchCount: number
  mismatches?: ShippingCiMismatchRow[]
  /** 步骤 2：Item 与 BOQ 对照是否全部通过 */
  analysisOk?: boolean
  /** 步骤 2：参与对照的有效行数 */
  checkedRowCount?: number
  /** 步骤 2：Item 与 BOQ 完全对应的行数 */
  matchedRowCount?: number
  /** 步骤 2：Description 可对应但 Item 不一致的行数 */
  descriptionMatchCount?: number
  /** 步骤 2：均未匹配的行数 */
  analysisRowErrorCount?: number
  boqReferenceKind?: string
  boqReferencePath?: string
  boqScheduleDigit?: number
}

export interface AlignedIpcWriteRow {
  item: string
  unitPrice: number
  amount: number
}

export interface AlignedIpcWriteJob {
  masterPath: string
  worksheetName: string
  periodColumnHeader: string
  rows: AlignedIpcWriteRow[]
}

export interface ProgressCiWriteRow {
  item: string
  description: string
  unit: string
  estQty?: number
  unitPrice: number
  previous: number
  current: number
  endTotal: number
  proportion?: number
  currentTotalPrice: number
}

export interface ProgressCiWriteJob {
  outputPath: string
  periodColumnHeader: string
  /** 目标 Schedule 分项号（更新发票内 SCHEDULE 标题） */
  schDigit: number
  /** 货币代码（来自 BOQ 分表名，如 Schedule1-USD → USD） */
  currency?: string
  /** SCHn-IPCx 文件夹中的批次号（如 2025004，用于推导 Invoice No） */
  batchNumber?: string
  rows: ProgressCiWriteRow[]
}

export interface ShippingCiWorkflowReport {
  processedAt: string
  workspaceRoot: string
  successCount: number
  skippedCount: number
  failedCount: number
  discoveredFiles: ShippingCiDiscoveredFile[]
  files: ShippingCiFileResult[]
  outputPaths: string[]
  alignedIpcWriteJobs?: AlignedIpcWriteJob[]
  progressCiWriteJobs?: ProgressCiWriteJob[]
  shippingCiProcessLogPath: string
  pendingLedgerCommits?: Array<{ fileName: string; md5: string }>
}

export interface CommitShippingCiLedgerParams {
  workspaceRoot: string
  successes: Array<{ fileName: string; md5: string }>
}

export interface WorkspaceShippingCiWorkflowParams {
  workspaceRoot: string
}

export interface ShippingCiWorkflowExecuteResponse {
  ok: boolean
  report?: ShippingCiWorkflowReport
  errorCode?: EpcCommercialErrorCode
  errorMessage?: string
}

