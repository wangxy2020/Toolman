/**
 * 项目管理模块统一修订层（工作区级）
 * 路径：{workspace}/.cherry-studio/project-management/revisions.json
 *
 * 原则：大模型/用户对数据表的修改记入修订层；Rust 全量引擎与快捷短语不得覆盖已 lock 的字段/单元格，
 * 除非用户明确要求强制重算（见 isExplicitEngineOverwriteRequest）。
 */

export const PM_REVISIONS_RELATIVE = '.cherry-studio/project-management/revisions.json'

/** @deprecated 迁移来源；新写入请使用 PM_REVISIONS_RELATIVE */
export const PM_LEGACY_PAYMENT_OVERRIDES_RELATIVE = 'IPC_Payment_data/data_overrides.json'

export type PmRevisionDomain = 'cost_epc_payment' | 'cost_epc_aligned' | 'progress_plan'

export type PmRevisionSource = 'user' | 'llm' | 'system'

export interface PmPaymentRowMatch {
  project_id?: string
  substation_lot?: string
  schedule?: string
  ipc_no?: string
}

export interface PmPaymentDataPatch {
  match: PmPaymentRowMatch
  /** 与 ipc_payment_data.xlsx 行主键一致：project_id|substation_lot|schedule|ipc_no（仅锁定该行） */
  rowKey?: string
  values: Record<string, string>
  /** 引擎重跑时不得覆盖的列名（仅对 rowKey 对应行生效） */
  lock?: string[]
  source?: PmRevisionSource
  note?: string
  at?: string
}

/** aligned / 母表：按工作表行列锁定单元格 */
export interface PmAlignedCellLock {
  relativePath: string
  sheet: string
  row: number
  col: number
  value: string
  lock?: boolean
  source?: PmRevisionSource
  at?: string
}

/** 计划管理（后续 Rust 引擎接入） */
export interface PmProgressPlanPatch {
  /** 业务主键，由计划引擎定义 */
  recordKey: string
  values: Record<string, string>
  lock?: string[]
  source?: PmRevisionSource
  note?: string
  at?: string
}

export interface PmCostEpcPaymentDomain {
  patches: PmPaymentDataPatch[]
}

export interface PmCostEpcAlignedDomain {
  cellLocks: PmAlignedCellLock[]
}

export interface PmProgressPlanDomain {
  patches: PmProgressPlanPatch[]
}

export interface PmRevisionDomains {
  cost_epc_payment: PmCostEpcPaymentDomain
  cost_epc_aligned: PmCostEpcAlignedDomain
  progress_plan: PmProgressPlanDomain
}

export interface PmRevisionsFile {
  version: number
  domains: PmRevisionDomains
}

export const emptyPmRevisionsFile = (): PmRevisionsFile => ({
  version: 1,
  domains: {
    cost_epc_payment: { patches: [] },
    cost_epc_aligned: { cellLocks: [] },
    progress_plan: { patches: [] }
  }
})

export const pmRevisionsPath = (workspaceRoot: string): string =>
  `${workspaceRoot.replace(/\/+$/, '')}/${PM_REVISIONS_RELATIVE}`

const normalizeSlashes = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

const normalizePathKeyLower = (p: string): string => normalizeSlashes(p).toLowerCase()

const resolveUnderWorkspace = (workspaceRoot: string, filePath: string): string => {
  const root = normalizeSlashes(workspaceRoot)
  const raw = filePath.trim().replace(/\\/g, '/')
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    return normalizeSlashes(raw)
  }
  return normalizeSlashes(`${root}/${raw}`)
}

export const relativePathInWorkspace = (workspaceRoot: string, absoluteOrRelative: string): string => {
  const rootKey = normalizePathKeyLower(workspaceRoot)
  const target = resolveUnderWorkspace(workspaceRoot, absoluteOrRelative)
  const targetKey = normalizePathKeyLower(target)
  const root = normalizeSlashes(workspaceRoot)
  if (targetKey === rootKey) {
    return ''
  }
  if (targetKey.startsWith(`${rootKey}/`)) {
    return target.slice(root.length + 1)
  }
  return absoluteOrRelative.replace(/\\/g, '/')
}

/** 用户明确要求本次引擎忽略修订层、按引擎结果覆盖 */
export const isExplicitEngineOverwriteRequest = (text: string): boolean => {
  const t = text.trim()
  if (!t) {
    return false
  }
  return /(强制重算|按引擎结果覆盖|忽略已有修改|忽略修订|覆盖已有数据|重新统计并覆盖)/i.test(t)
}

export const isPmIpcCleanedCsvPath = (filePath: string, workspaceRoot: string): boolean => {
  if (!filePath.trim() || !workspaceRoot.trim()) {
    return false
  }
  const rel = relativePathInWorkspace(workspaceRoot, filePath).toLowerCase()
  if (!rel.endsWith('.csv')) {
    return false
  }
  if (rel.includes('ipc_payment_data/')) {
    return false
  }
  return rel.includes('sch') && rel.includes('ipc')
}

export const isPmDataPathForDomain = (
  filePath: string,
  workspaceRoot: string,
  domain: PmRevisionDomain
): boolean => {
  if (!filePath.trim() || !workspaceRoot.trim()) {
    return false
  }
  const rel = relativePathInWorkspace(workspaceRoot, filePath)
  const lower = rel.toLowerCase()
  switch (domain) {
    case 'cost_epc_payment':
      return (
        lower.includes('ipc_payment_data/') ||
        lower.endsWith('ipc_payment_data.xlsx') ||
        lower.endsWith('project_ipc_data.xlsx')
      )
    case 'cost_epc_aligned':
      return lower.endsWith('_aligned.xlsx') || lower.includes('_aligned/')
    case 'progress_plan':
      return lower.includes('.cherry-studio/project-management/progress/')
    default:
      return false
  }
}

/** 大模型可编辑的项目管理数据文件（成本 + 修订清单 + 计划占位目录） */
export const isProjectManagementDataPath = (filePath: string, workspaceRoot: string): boolean => {
  if (!filePath.trim() || !workspaceRoot.trim()) {
    return false
  }
  const target = normalizePathKeyLower(resolveUnderWorkspace(workspaceRoot, filePath))
  const revisions = normalizePathKeyLower(pmRevisionsPath(workspaceRoot))
  if (target === revisions) {
    return true
  }
  return (
    isPmDataPathForDomain(filePath, workspaceRoot, 'cost_epc_payment') ||
    isPmDataPathForDomain(filePath, workspaceRoot, 'cost_epc_aligned') ||
    isPmDataPathForDomain(filePath, workspaceRoot, 'progress_plan') ||
    isPmIpcCleanedCsvPath(filePath, workspaceRoot)
  )
}

/** @deprecated 使用 isProjectManagementDataPath */
export const isEpcEditableDataFilePath = isProjectManagementDataPath

export const PM_REVISION_AGENT_INSTRUCTIONS = `## 项目管理数据修订层（必须遵守）

工作区修订文件：\`.cherry-studio/project-management/revisions.json\`

- 当你修改成本/计划相关的 Excel 数据表时，系统会自动记录已修改单元格并锁定；后续快捷短语与 Rust 统计引擎**不会**覆盖这些单元格，除非用户明确要求「强制重算」或「按引擎结果覆盖」。
- 修改 IPC 清洗 CSV、aligned 母表或 payment 汇总表后，系统会自动向下游同步衍生字段（aligned 合计、payment 预付款/保留金/到期日、project 汇总等）；已 lock 的列不会被覆盖。
- **生效日期、账期、应支付日期**以 \`IPC_Payment_data/ipc_payment_data.xlsx\` 为准；也可改同目录 \`ipc_payment_data.csv\`，保存后系统会自动写入 xlsx 并重算 \`due_date\`（无需再手动 Edit xlsx）。勿只改 IPC 清洗 CSV（\`SCH*IPC*.csv\`）而不更新 payment 表。
- 你仍可直接 Read/Write/Edit 数据表进行增删改查，无需使用特定指令句式。
- 若用户要求强制重算，按用户说明执行即可（引擎将忽略修订层）。`

export const isProjectManagementAgentName = (name: string | undefined | null): boolean => {
  const n = name?.trim()
  if (!n) {
    return false
  }
  return n === '成本智能体' || n === '计划智能体'
}
