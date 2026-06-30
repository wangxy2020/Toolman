use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcAlignmentRequest {
    pub master_price_path: String,
    pub ipc_root_path: String,
    pub period: String,
    pub data_dir: String,
}

/// 工作 4：工作区 IPC 进度款工程量统计（自然语言 / 快捷短语 / epc ipc4 to boq）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIpcWorkflowRequest {
    pub workspace_root: String,
    #[serde(default)]
    pub period: Option<String>,
    #[serde(default)]
    pub master_price_path: Option<String>,
    pub data_dir: String,
    #[serde(default)]
    pub ignore_revisions: Option<bool>,
}

/// 工作 1：合同价格表检查与格式化
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBoqFormatWorkflowRequest {
    pub workspace_root: String,
    pub data_dir: String,
}

/// 工作 1 步骤 1 文件队列
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BoqFormatFileQueue {
    /// 待格式化（未在账本 SUCCESS，或 FAILED 可重试）
    PendingProcess,
    /// 账本已 SUCCESS 且 MD5 未变
    AlreadyProcessed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoqFormatDiscoveredWorkbook {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub role_reason: String,
    pub project_name: Option<String>,
    pub queue: BoqFormatFileQueue,
    pub in_ledger: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_processed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoqFormatSheetResult {
    pub sheet_name: String,
    pub row_check_errors: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sum_check_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declared_total: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub computed_sum: Option<f64>,
    pub dropped_empty_item: u32,
    pub dropped_note: u32,
    pub dropped_subtotal: u32,
    pub dropped_duplicate: u32,
    pub output_row_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoqFormatFileResult {
    pub file_name: String,
    pub file_path: String,
    pub status: IpcFileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_csv_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sheets: Vec<BoqFormatSheetResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoqFormatWorkflowReport {
    pub processed_at: String,
    pub workspace_root: String,
    pub success_count: u32,
    pub skipped_count: u32,
    pub failed_count: u32,
    pub discovered_files: Vec<BoqFormatDiscoveredWorkbook>,
    pub files: Vec<BoqFormatFileResult>,
    pub output_paths: Vec<String>,
    /// `{工作区}/boq_format_process_log.txt`
    pub boq_format_process_log_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoqFormatWorkflowResponse {
    pub ok: bool,
    pub report: Option<BoqFormatWorkflowReport>,
    pub error_code: Option<ErrorCode>,
    pub error_message: Option<String>,
}

/// 工作 2：海运商业发票 → 进度款格式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceShippingCiWorkflowRequest {
    pub workspace_root: String,
    pub data_dir: String,
    /// 为 true 时引擎不写入 SUCCESS 账本（待主进程 exceljs 等步骤全部完成后再 commit）
    #[serde(default)]
    pub defer_ledger_success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiLedgerCommitEntry {
    pub file_name: String,
    pub md5: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitShippingCiLedgerRequest {
    pub workspace_root: String,
    pub data_dir: String,
    pub successes: Vec<ShippingCiLedgerCommitEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShippingCiFileQueue {
    PendingProcess,
    AlreadyProcessed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiDiscoveredFile {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub role_reason: String,
    pub ipc_period: String,
    pub sch_digit: u8,
    pub queue: ShippingCiFileQueue,
    pub in_ledger: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_processed_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShippingCiMismatchKind {
    /// Item 与 Description 均未在 BOQ 中找到
    ItemNotFound,
    /// Description 可对应 BOQ，但 Item 编号不一致（疑为格式/录入错误）
    DescriptionMatchItemMismatch,
    /// 未找到 BOQ_aligned / BOQ.xlsx，无法对照
    BoqNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiMismatchRow {
    pub kind: ShippingCiMismatchKind,
    pub item: String,
    pub description: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_item: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiFileResult {
    pub file_name: String,
    pub file_path: String,
    pub status: IpcFileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    pub mismatch_count: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mismatches: Vec<ShippingCiMismatchRow>,
    /// 步骤 2：Item 与 BOQ 对照是否全部通过
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_ok: Option<bool>,
    /// 步骤 2：参与对照的有效行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_row_count: Option<u32>,
    /// 步骤 2：Item 与 BOQ 完全对应的行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_row_count: Option<u32>,
    /// 步骤 2：Description 可对应但 Item 不一致的行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_match_count: Option<u32>,
    /// 步骤 2：Item 与 Description 均未匹配的行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_row_error_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_reference_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_reference_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_schedule_digit: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedIpcWriteRow {
    pub item: String,
    pub unit_price: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedIpcWriteJob {
    pub master_path: String,
    pub worksheet_name: String,
    pub period_column_header: String,
    pub rows: Vec<AlignedIpcWriteRow>,
}

/// 进度款商业发票行（主进程 exceljs 写入，保留模板格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressCiWriteRow {
    pub item: String,
    pub description: String,
    pub unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub est_qty: Option<f64>,
    pub unit_price: f64,
    pub previous: f64,
    pub current: f64,
    pub end_total: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proportion: Option<f64>,
    pub current_total_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressCiWriteJob {
    pub output_path: String,
    pub period_column_header: String,
    /// 目标 Schedule 分项号（用于更新发票内 SCHEDULE 标题等）
    pub sch_digit: u8,
    /// 货币代码（来自 BOQ 分表名，如 Schedule1-USD → USD）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    /// SCHn-IPCx 文件夹中的批次号（如 2025004，用于推导 Invoice No）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_number: Option<String>,
    pub rows: Vec<ProgressCiWriteRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiWorkflowReport {
    pub processed_at: String,
    pub workspace_root: String,
    pub success_count: u32,
    pub skipped_count: u32,
    pub failed_count: u32,
    pub discovered_files: Vec<ShippingCiDiscoveredFile>,
    pub files: Vec<ShippingCiFileResult>,
    pub output_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aligned_ipc_write_jobs: Vec<AlignedIpcWriteJob>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub progress_ci_write_jobs: Vec<ProgressCiWriteJob>,
    pub shipping_ci_process_log_path: String,
    /// defer_ledger_success 时由主进程在全部步骤成功后提交
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pending_ledger_commits: Vec<ShippingCiLedgerCommitEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShippingCiWorkflowResponse {
    pub ok: bool,
    pub report: Option<ShippingCiWorkflowReport>,
    pub error_code: Option<ErrorCode>,
    pub error_message: Option<String>,
}

/// 工作区进度款支付工作流（工作 5）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePaymentWorkflowRequest {
    pub workspace_root: String,
    #[serde(default)]
    pub period: Option<String>,
    pub data_dir: String,
    #[serde(default)]
    pub ignore_revisions: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRowMatchDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub substation_lot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipc_no: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDataPatchDto {
    #[serde(rename = "match")]
    pub match_keys: PaymentRowMatchDto,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_key: Option<String>,
    pub values: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub lock: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendPaymentDataPatchRequest {
    pub workspace_root: String,
    pub patch: PaymentDataPatchDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyPaymentDataOverridesRequest {
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropagatePmDataAfterEditRequest {
    pub workspace_root: String,
    pub edited_file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropagatePmDataResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleOkResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkbookFileRole {
    /// 合同价格母表（含 Schedule 分项）
    MasterContract,
    /// 待合并的进度款 IPC 申报表
    IpcProgress,
    /// 原始工程量清单 BOQ（本步骤不写入母表）
    BoqSource,
    /// 无关或无法识别的表格
    Ignored,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IpcFileStatus {
    Success,
    Skipped,
    Failed,
}

/// 步骤 1「工作区文件识别情况」中的展示分组
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiscoveredFileQueue {
    /// 合同母表
    MasterContract,
    /// 待处理（已识别、不在执行记录、且具备项目名称与期数）
    PendingProcess,
    /// 无需处理（缺项目/期数、BOQ、无关文件等）
    NotRequired,
    /// 已在执行记录中处理过
    AlreadyProcessed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredWorkbook {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub role: WorkbookFileRole,
    pub role_reason: String,
    pub project_name: Option<String>,
    pub period_code: Option<String>,
    pub queue: DiscoveredFileQueue,
    pub in_ledger: bool,
    pub ledger_processed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcFileResult {
    pub file_name: String,
    pub file_path: String,
    pub status: IpcFileStatus,
    pub md5: Option<String>,
    pub error_message: Option<String>,
    pub skipped_reason: Option<String>,
    /// 步骤 2 工程量清单分析是否通过
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_ok: Option<bool>,
    /// 步骤 4 写入母表是否通过（分析失败时为 None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_ok: Option<bool>,
    /// 步骤 2 清洗后有效行数（Item + 本期完成金额）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleaned_row_count: Option<u32>,
    /// 步骤 2 清洗后本期完成金额之和
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleaned_total_amount: Option<f64>,
    /// 步骤 2 本期完成金额货币代码（USD/TZS 等）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleaned_currency: Option<String>,
    /// 步骤 2 表内行级校验错误数（已跳过错误行）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_row_error_count: Option<u32>,
    /// 步骤 3 明细合计与 BOQ Value 是否一致（无 BOQ Value 行时为 None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reconciliation_ok: Option<bool>,
    /// 步骤 3 IPC 表 BOQ Value 总金额
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boq_value_total: Option<f64>,
    /// 步骤 4 成功写入母表的行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_matched_rows: Option<u32>,
    /// 步骤 4 写入的母表 Schedule 工作表名
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_target_sheet: Option<String>,
    /// 步骤 4 写入的期数列名
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_period_column: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcAlignmentReport {
    pub processed_at: String,
    pub ipc_root_path: String,
    pub master_price_path: String,
    pub period: String,
    pub success_count: u32,
    pub skipped_count: u32,
    pub failed_count: u32,
    /// 步骤 1：穿透子文件夹后的文件角色识别
    pub discovered_files: Vec<DiscoveredWorkbook>,
    pub files: Vec<IpcFileResult>,
    pub output_master_path: Option<String>,
    /// 本次写出的所有母表路径（多母表场景下含多项）
    pub output_master_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    AuthExpired,
    InvalidArgs,
    InternalError,
    FileLocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcAlignmentResponse {
    pub ok: bool,
    pub report: Option<IpcAlignmentReport>,
    pub error_code: Option<ErrorCode>,
    pub error_message: Option<String>,
}

/// 工作 5 步骤 1：aligned 母表识别队列
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PaymentAlignedQueue {
    /// 待写入/更新支付汇总
    PendingProcess,
    /// ipc_payment_log 中对应期数已全部 SUCCESS
    AlreadyProcessed,
    /// 无指定期数 IPC 列或前置条件不满足
    NotReady,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredAlignedWorkbook {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub queue: PaymentAlignedQueue,
    pub role_reason: String,
    /// 本期内参与统计的 Schedule 工作表数量
    pub schedule_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipc_period: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_processed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentIncompleteUnit {
    pub file_name: String,
    pub sheet_name: String,
    pub ipc_column: String,
    pub project_id: String,
    pub schedule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentFileResult {
    pub file_name: String,
    pub file_path: String,
    pub status: IpcFileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipc_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipc_column: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentWorkflowReport {
    pub processed_at: String,
    pub workspace_root: String,
    pub period: String,
    pub success_count: u32,
    pub skipped_count: u32,
    pub failed_count: u32,
    /// 账本已 SUCCESS 但汇总表缺列时自动补齐的次数
    #[serde(default)]
    pub backfill_count: u32,
    /// 流程结束后仍缺失的 IPC 统计单元数（应写入 project_ipc_data / ipc_payment_data）
    #[serde(default)]
    pub incomplete_count: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub incomplete_units: Vec<PaymentIncompleteUnit>,
    /// 步骤 1：按 aligned xlsx 去重后的识别清单
    pub discovered_aligned_files: Vec<DiscoveredAlignedWorkbook>,
    pub files: Vec<PaymentFileResult>,
    pub ipc_process_log_path: String,
    pub ipc_payment_data_path: String,
    pub project_ipc_data_path: String,
    pub ipc_payment_log_path: String,
    pub output_csv_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentWorkflowResponse {
    pub ok: bool,
    pub report: Option<PaymentWorkflowReport>,
    pub error_code: Option<ErrorCode>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportErrorAuditRequest {
    pub data_dir: String,
    pub period: String,
    pub output_path: String,
    pub errors: Vec<AuditErrorRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditErrorRow {
    pub file_name: String,
    pub file_path: String,
    pub sheet_name: Option<String>,
    pub row_hint: Option<String>,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportErrorAuditResponse {
    pub ok: bool,
    pub output_path: Option<String>,
    pub error_message: Option<String>,
}
