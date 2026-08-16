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
  EPC_WORK5_DATA_OVERRIDES_RELATIVE,
} from './epcDataUpdate.js'
export {
  EPC_WORK4_WORKFLOW_LOG_FILE,
  buildEffectiveWorkflowUserRequest,
  extractWorkflowInputOverride,
  workflowLogPathForWork
} from './epcWorkflowLog.js'

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

export type IpcFileProcessStatus = 'success' | 'skipped' | 'failed'
