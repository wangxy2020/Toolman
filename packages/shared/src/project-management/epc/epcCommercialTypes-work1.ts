import type { EpcCommercialErrorCode, IpcFileProcessStatus } from './epcCommercialTypes-commands.js'

export const EPC_WORK1_BOQ_FORMAT_PROCESS_LOG_FILE = 'boq_format_process_log.txt'

/** 工作 1：合同价格表检查与格式化 */
export interface WorkspaceBoqFormatWorkflowParams {
  workspaceRoot: string
}

export type BoqFormatFileQueue = 'pendingProcess' | 'alreadyProcessed'

export interface BoqFormatDiscoveredWorkbook {
  fileName: string
  filePath: string
  relativePath: string
  folderPath: string
  roleReason: string
  projectName?: string
  queue: BoqFormatFileQueue
  inLedger: boolean
  ledgerProcessedAt?: string
}

export interface BoqFormatSheetResult {
  sheetName: string
  rowCheckErrors: number
  sumCheckOk?: boolean
  declaredTotal?: number
  computedSum?: number
  droppedEmptyItem: number
  droppedNote: number
  droppedSubtotal: number
  droppedDuplicate: number
  outputRowCount: number
}

export interface BoqFormatFileResult {
  fileName: string
  filePath: string
  status: IpcFileProcessStatus
  errorMessage?: string
  skippedReason?: string
  outputPath?: string
  outputCsvPath?: string
  sheets?: BoqFormatSheetResult[]
}

export interface BoqFormatWorkflowReport {
  processedAt: string
  workspaceRoot: string
  successCount: number
  skippedCount: number
  failedCount: number
  discoveredFiles: BoqFormatDiscoveredWorkbook[]
  files: BoqFormatFileResult[]
  outputPaths: string[]
  /** `{工作区}/boq_format_process_log.txt` */
  boqFormatProcessLogPath: string
}

export interface BoqFormatWorkflowExecuteResponse {
  ok: boolean
  report?: BoqFormatWorkflowReport
  errorCode?: EpcCommercialErrorCode
  errorMessage?: string
}

/** 工作 2 执行账本（工作区根目录） */
