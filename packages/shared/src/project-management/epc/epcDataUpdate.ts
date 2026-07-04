/**
 * @deprecated 成本 EPC 数据更新类型已迁至 projectManagementRevision.ts；此处保留 re-export 以兼容旧 import。
 */
export {
  emptyPmRevisionsFile as emptyWork5DataOverrides,
  isExplicitEngineOverwriteRequest,
  isProjectManagementDataPath,
  PM_LEGACY_PAYMENT_OVERRIDES_RELATIVE as EPC_WORK5_DATA_OVERRIDES_RELATIVE,
  PM_REVISION_AGENT_INSTRUCTIONS,
  PM_REVISIONS_RELATIVE,
  pmRevisionsPath as work5DataOverridesPath,
  type PmPaymentDataPatch as EpcPaymentDataPatch,
  type PmPaymentRowMatch as EpcPaymentRowMatch,
  type PmCostEpcPaymentDomain as EpcWork5DataOverridesFile
} from './projectManagementRevision.js'
