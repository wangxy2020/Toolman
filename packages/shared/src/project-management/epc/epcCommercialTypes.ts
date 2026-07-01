/** 工作 4：进度款工程量数据统计 — 斜杠命令（发送时触发本地 Rust 引擎，结果交 LLM 分步展示） */
export const EPC_COMMERCIAL_COMMAND_TEMPLATE = '/epc ipcx to boq'

/** 工作 1：合同价格表检查与格式化 — 斜杠命令 */
export const EPC_WORK1_BOQ_FORMAT_COMMAND_TEMPLATE = '/epc boq format'

/** 工作 2：海运商业发票 → 进度款格式 — 斜杠命令 */
export const EPC_WORK2_SHIPPING_CI_COMMAND_TEMPLATE = '/epc shipping ci to progress ci and ipc'

/** 工作 5：进度款支付信息统计 — 斜杠命令 */
export const EPC_WORK5_PAYMENT_COMMAND_TEMPLATE = '/epc ipcx to payment'

export const EPC_WORK1_BOQ_FORMAT_COMMAND_DESCRIPTION =
  '合同价格表检查与格式化：扫描工作区 BOQ 表并输出标准格式（或使用同名快捷短语）'

export const EPC_WORK2_SHIPPING_CI_COMMAND_DESCRIPTION =
  '进度款商业发票和工程量清单编制：将海运商业发票转为进度款格式（或使用同名快捷短语）'

export const EPC_WORK5_PAYMENT_COMMAND_DESCRIPTION =
  '进度款申请与支付数据统计：将 ipcx 改为 IPC 期数（如 /epc ipc4 to payment）后回车；或使用同名快捷短语'

/** 智能体 API 上下文中用于识别工作 1「合同价格表格式化」回合 */
export const EPC_WORK1_BOQ_FORMAT_AGENT_NARRATION_MARKER = 'EPC_WORK1_BOQ_FORMAT_NARRATION'

/** 智能体 API 上下文中用于识别工作 2「商业发票编制」回合 */
export const EPC_WORK2_SHIPPING_CI_AGENT_NARRATION_MARKER = 'EPC_WORK2_SHIPPING_CI_NARRATION'

/** 智能体 API 上下文中用于识别工作 5「进度款支付」回合 */
export const EPC_WORK5_PAYMENT_AGENT_NARRATION_MARKER = 'EPC_WORK5_PAYMENT_NARRATION'

/** 对话框汇报固定标题（工作 1） */
export const EPC_WORK1_BOQ_FORMAT_REPORT_TITLE = '合同价格表检查和处理'

/** 对话框汇报固定标题（工作 2） */
export const EPC_WORK2_SHIPPING_CI_REPORT_TITLE = '进度款商业发票和工程量清单编制'

/** 对话框汇报固定标题（工作 5） */
export const EPC_WORK5_PAYMENT_REPORT_TITLE = '进度款申请与支付数据统计'

/** 写入助手消息块，供 MainTextBlock 渲染工作 5 报告卡片 */
export const EPC_WORK5_PAYMENT_REPORT_MARKER = '<<<EPC_WORK5_PAYMENT_REPORT>>>'

/** 工作 1 五条业务线 */
export const EPC_WORK1_BOQ_FORMAT_WORKFLOW_STEPS = [
  '多层穿透与匹配',
  '数据检查',
  '数据处理',
  '生成合同价格表',
  '输出执行结果'
] as const

/** 工作 2 五条业务线 */
export const EPC_WORK2_SHIPPING_CI_WORKFLOW_STEPS = [
  '多层穿透与匹配',
  '数据检查',
  '文件处理',
  '商业发票和工程量清单文件',
  '输出执行结果'
] as const

/** 工作 5 五条业务线（第 5 步仅展示 Excel 汇总表路径） */
export const EPC_WORK5_PAYMENT_WORKFLOW_STEPS = [
  '多层穿透与匹配',
  '数据获取和添加',
  '进度款指标计算',
  '写入汇总表',
  '输出执行结果'
] as const

export const EPC_COMMERCIAL_COMMAND_DESCRIPTION =
  '进度款工程量数据统计：将 ipcx 改为 IPC 期数（如 /epc ipc4 to boq）后回车；或使用同名快捷短语'

/** 仅传给智能体 API、不在用户气泡中展示的上下文块 */
export const EPC_COMMERCIAL_AGENT_CONTEXT_METADATA_KEY = 'epcAgentContextOnly'

/** 工作 4 内置快捷短语（用户可见入口文案，见 epcCommercialQuickPhrase.ts） */
export {
  EPC_COMMERCIAL_DEFAULT_QUICK_PHRASE_ID,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT,
  EPC_COMMERCIAL_QUICK_PHRASE_CONTENT_REVISION,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE
} from './epcCommercialQuickPhrase.js'

/** 工作 1 内置快捷短语（用户可见入口文案，见 epcWork1BoqFormatQuickPhrase.ts） */
export {
  EPC_WORK1_BOQ_FORMAT_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_CONTENT_REVISION,
  EPC_WORK1_BOQ_FORMAT_QUICK_PHRASE_TITLE
} from './epcWork1BoqFormatQuickPhrase.js'

/** 工作 2 内置快捷短语（用户可见入口文案，见 epcWork2ShippingCiQuickPhrase.ts） */
export {
  EPC_WORK2_SHIPPING_CI_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT,
  EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_CONTENT_REVISION,
  EPC_WORK2_SHIPPING_CI_QUICK_PHRASE_TITLE
} from './epcWork2ShippingCiQuickPhrase.js'

/** 工作 5 内置快捷短语（用户可见入口文案，见 epcWork5PaymentQuickPhrase.ts） */
export {
  EPC_WORK5_PAYMENT_DEFAULT_QUICK_PHRASE_ID,
  EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT,
  EPC_WORK5_PAYMENT_QUICK_PHRASE_CONTENT_REVISION,
  EPC_WORK5_PAYMENT_QUICK_PHRASE_TITLE
} from './epcWork5PaymentQuickPhrase.js'

export type { EpcWorkflowWorkKind } from './epcWorkflowLog.js'
export {
  EPC_DATA_UPDATE_AGENT_MARKER,
  EPC_WORK5_DATA_OVERRIDES_RELATIVE,
  isEpcDataTableUpdateRequest,
  isEpcEditableDataFilePath,
  parsePaymentPatchFromUserText
} from './epcDataUpdate.js'
export {
  EPC_WORK4_WORKFLOW_LOG_FILE,
  buildEffectiveWorkflowUserRequest,
  extractWorkflowInputOverride,
  workflowLogPathForWork
} from './epcWorkflowLog.js'

import type { EpcWorkflowWorkKind } from './epcWorkflowLog.js'

/** 智能体 API 上下文中用于识别「仅汇报引擎结果」回合（主进程可据此拒绝 Bash 等） */
export const EPC_COMMERCIAL_AGENT_NARRATION_MARKER = 'EPC_COMMERCIAL_RUST_ENGINE_NARRATION'

/** 对话框汇报固定标题 */
export const EPC_COMMERCIAL_REPORT_TITLE = '进度款工程量数据统计'

/** 五条业务线（第 1 步含多层穿透与执行记录匹配；命名约定见 packages/epc-commercial-engine/README.md） */
export const EPC_COMMERCIAL_WORKFLOW_STEPS = [
  '多层穿透与匹配',
  '工程量清单分析',
  '进度款数据统计',
  '写入合同母表',
  '输出执行结果'
] as const

/** 写入助手消息块，供 MainTextBlock 渲染对账卡片 */
export const EPC_COMMERCIAL_IPC_REPORT_MARKER = '<<<EPC_COMMERCIAL_IPC_ALIGNMENT_REPORT>>>'

export type EpcCommercialErrorCode =
  | 'AUTH_EXPIRED'
  | 'ENGINE_NOT_FOUND'
  | 'INVALID_ARGS'
  | 'INTERNAL_ERROR'
  | 'FILE_LOCKED'

export interface IpcAlignmentExecuteParams {
  /** 合同母表（含 Schedule1–4）路径；省略时在工作目录中自动查找 */
  masterPricePath?: string
  /** 工作区根目录（递归扫描各文件夹内 xlsx） */
  ipcRootPath: string
  /** 期数列名，如 IPC4；省略时由引擎从 IPC 文件名推断 */
  period?: string
}

/** 自然语言 / 快捷短语工作流：扫描工作区各文件夹 BOQ 并写回母表 */
/** 工作 4：工作区 IPC/进度款工程量统计工作流 */
export interface WorkspaceIpcWorkflowParams {
  workspaceRoot: string
  /** 可选；省略时从 IPC 文件名推断，或在正文附加「期数: ipc4」 */
  period?: string
  masterPricePath?: string
  /** 用户明确要求强制重算时忽略修订层 */
  ignoreRevisions?: boolean
}

/** 工作 1 执行账本（工作区根目录） */
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
  patch: import('./epcDataUpdate').EpcPaymentDataPatch
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

export type IpcFileProcessStatus = 'success' | 'skipped' | 'failed'

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
