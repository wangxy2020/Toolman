/**
 * @deprecated 成本 EPC 数据更新类型已迁至 projectManagementRevision.ts；此处保留 re-export 以兼容旧 import。
 */
export {
  emptyPmRevisionsFile as emptyWork5DataOverrides,
  isEpcEditableDataFilePath,
  isExplicitEngineOverwriteRequest,
  isProjectManagementDataPath,
  PM_LEGACY_PAYMENT_OVERRIDES_RELATIVE as EPC_WORK5_DATA_OVERRIDES_RELATIVE,
  PM_REVISION_AGENT_INSTRUCTIONS,
  PM_REVISIONS_RELATIVE,
  pmRevisionsPath as work5DataOverridesPath,
  type PmPaymentDataPatch as EpcPaymentDataPatch,
  type PmPaymentRowMatch as EpcPaymentRowMatch,
  type PmCostEpcPaymentDomain as EpcWork5DataOverridesFile
} from './projectManagementRevision'

/** @deprecated 不再用于门控发送流程；任意对话均可改表，修订层自动优先 */
export const EPC_DATA_UPDATE_AGENT_MARKER = 'EPC_DATA_TABLE_UPDATE_TURN'

/** @deprecated */
export const EPC_WORK4_DATA_OVERRIDES_FILE = 'epc_work4_data_overrides.json'

/** @deprecated 始终 false — 不再拦截工作流 */
export const isEpcDataTableUpdateRequest = (_text: string): boolean => false

/** @deprecated 始终 false */
export const isEpcDataUpdateExclusiveRequest = (_text: string, _options?: unknown): boolean => false

/** @deprecated 自然语言解析补丁由工具写入修订层替代 */
export const parsePaymentPatchFromUserText = (_text: string): null => null
