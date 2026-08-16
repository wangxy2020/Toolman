import type { EpcCommercialErrorCode, IpcFileProcessStatus } from './epcCommercialTypes-commands.js'

export interface IpcFileResult {
  fileName: string
  filePath: string
  status: IpcFileProcessStatus
  md5?: string
  errorMessage?: string
  skippedReason?: string
  /** 步骤 2：工程量清单分析（表内校验与清洗） */
  analysisOk?: boolean
  /** 步骤 4：写入合同母表 */
  mergeOk?: boolean
  /** 步骤 2 清洗后有效行数 */
  cleanedRowCount?: number
  /** 步骤 2 清洗后本期完成金额之和 */
  cleanedTotalAmount?: number
  /** 步骤 2 本期完成金额货币（USD/TZS 等） */
  cleanedCurrency?: string
  /** 步骤 2 表内行级校验错误数 */
  analysisRowErrorCount?: number
  /** 步骤 3 明细合计与 BOQ Value 是否一致 */
  reconciliationOk?: boolean
  /** 步骤 3 BOQ Value 总金额 */
  boqValueTotal?: number
  /** 步骤 4 写入母表行数 */
  mergeMatchedRows?: number
  /** 步骤 4 母表工作表 */
  mergeTargetSheet?: string
  /** 步骤 4 期数列名 */
  mergePeriodColumn?: string
}


/** 工作区穿透扫描后的文件角色（步骤 1） */
export type WorkbookFileRole = 'masterContract' | 'ipcProgress' | 'boqSource' | 'ignored'

export type DiscoveredFileQueue = 'masterContract' | 'pendingProcess' | 'notRequired' | 'alreadyProcessed'

export interface DiscoveredWorkbook {
  fileName: string
  filePath: string
  relativePath: string
  folderPath: string
  role: WorkbookFileRole
  roleReason: string
  projectName?: string
  periodCode?: string
  queue: DiscoveredFileQueue
  inLedger: boolean
  ledgerProcessedAt?: string
}

export interface IpcAlignmentReport {
  processedAt: string
  ipcRootPath: string
  masterPricePath: string
  period: string
  successCount: number
  skippedCount: number
  failedCount: number
  /** 穿透子文件夹后的角色识别结果 */
  discoveredFiles?: DiscoveredWorkbook[]
  files: IpcFileResult[]
  outputMasterPath?: string
  /** 本次写出的所有母表路径（多母表场景含多项） */
  outputMasterPaths?: string[]
}

export interface IpcAlignmentExecuteResponse {
  ok: boolean
  report?: IpcAlignmentReport
  errorCode?: EpcCommercialErrorCode
  errorMessage?: string
}

export interface EpcCommercialMachineInfo {
  machineId: string
}

export interface EpcCommercialLicenseStatus {
  valid: boolean
  machineId: string
  expiresAt?: string
  message?: string
}

export interface AuditErrorRow {
  fileName: string
  filePath: string
  sheetName?: string
  rowHint?: string
  errorMessage: string
}

export interface ExportErrorAuditParams {
  dataDir: string
  period: string
  outputPath: string
  errors: AuditErrorRow[]
}

export interface ExportErrorAuditResponse {
  ok: boolean
  outputPath?: string
  errorMessage?: string
}
