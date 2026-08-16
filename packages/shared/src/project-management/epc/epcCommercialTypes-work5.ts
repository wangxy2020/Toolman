import type { EpcPaymentDataPatch } from './epcDataUpdate.js'
import type { EpcWorkflowWorkKind } from './epcWorkflowLog.js'
import type { EpcCommercialErrorCode, IpcFileProcessStatus } from './epcCommercialTypes-commands.js'

/** 工作 5：进度款支付数据统计工作流 */
export interface WorkspacePaymentWorkflowParams {
  workspaceRoot: string
  /** 可选；省略时从 aligned 文件名推断 */
  period?: string
  /** 用户明确要求强制重算时忽略修订层 */
  ignoreRevisions?: boolean
}

export interface EpcWorkflowLogParams {
  workspaceRoot: string
  work: EpcWorkflowWorkKind
}

export interface EpcWorkflowLogAppendParams extends EpcWorkflowLogParams {
  content: string
}

export interface EpcPaymentDataPatchParams {
  workspaceRoot: string
  patch: EpcPaymentDataPatch
}

export interface EpcSimpleOkResponse {
  ok: boolean
  errorMessage?: string
}

export interface PropagatePmDataParams {
  workspaceRoot: string
  editedFilePath: string
}

export interface PropagatePmDataResponse {
  ok: boolean
  actions?: string[]
  errorMessage?: string
}

export type PaymentAlignedQueue = 'pendingProcess' | 'alreadyProcessed' | 'notReady'

export interface DiscoveredAlignedWorkbook {
  fileName: string
  filePath: string
  relativePath: string
  folderPath: string
  queue: PaymentAlignedQueue
  roleReason: string
  scheduleCount: number
  ipcPeriod?: string
  ledgerProcessedAt?: string
}

export interface PaymentFileResult {
  fileName: string
  filePath: string
  status: IpcFileProcessStatus
  errorMessage?: string
  skippedReason?: string
  reviewedOnly?: boolean
  ipcAmount?: number
  ipcColumn?: string
}

export interface PaymentIncompleteUnit {
  fileName: string
  sheetName: string
  ipcColumn: string
  projectId: string
  schedule: string
}

export interface PaymentWorkflowReport {
  processedAt: string
  workspaceRoot: string
  period: string
  successCount: number
  skippedCount: number
  failedCount: number
  /** 账本已记录但汇总表缺列时自动补齐的次数 */
  backfillCount?: number
  /** 流程结束后仍未能写入汇总表的 IPC 统计单元数 */
  incompleteCount?: number
  incompleteUnits?: PaymentIncompleteUnit[]
  /** 步骤 1：按 aligned xlsx 去重（非 Schedule 行数） */
  discoveredAlignedFiles: DiscoveredAlignedWorkbook[]
  files: PaymentFileResult[]
  /** `{工作区}/ipc_process_log.txt` */
  ipcProcessLogPath: string
  ipcPaymentDataPath: string
  projectIpcDataPath: string
  /** `{工作区}/ipc_payment_log.txt` */
  ipcPaymentLogPath: string
  outputCsvPaths: string[]
}

export interface PaymentWorkflowExecuteResponse {
  ok: boolean
  report?: PaymentWorkflowReport
  errorCode?: EpcCommercialErrorCode
  errorMessage?: string
}

