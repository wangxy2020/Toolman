import type { PmDomain } from './pm-types.js'

export type PmCustomFieldType = 'text' | 'select' | 'number' | 'date'

export type PmCustomFieldDef = {
  key: string
  label: string
  type: PmCustomFieldType
  options?: string[]
}

export const PM_VERTICAL_DOMAINS = [
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
  'key_projects',
  'technical_management',
  'contract_risk_management',
  'operations_management',
] as const satisfies readonly PmDomain[]

export type PmVerticalDomain = (typeof PM_VERTICAL_DOMAINS)[number]

export const PM_DOMAIN_CUSTOM_FIELDS: Partial<Record<PmDomain, PmCustomFieldDef[]>> = {
  resource_management: [
    { key: 'resourceType', label: '资源类型', type: 'select', options: ['人力', '设备', '物料'] },
    { key: 'quantity', label: '数量', type: 'number' },
    { key: 'unit', label: '单位', type: 'text' },
  ],
  security_management: [
    {
      key: 'hazardLevel',
      label: '隐患等级',
      type: 'select',
      options: ['一般', '较大', '重大'],
    },
    { key: 'inspectionDate', label: '检查日期', type: 'date' },
    { key: 'rectificationDeadline', label: '整改期限', type: 'date' },
  ],
  quality_management: [
    {
      key: 'testType',
      label: '试验类型',
      type: 'select',
      options: ['混凝土', '钢筋', '测量', '土工'],
    },
    { key: 'specimenId', label: '试样编号', type: 'text' },
    {
      key: 'result',
      label: '结果',
      type: 'select',
      options: ['合格', '待复检', '不合格'],
    },
  ],
  archive_management: [
    {
      key: 'docCategory',
      label: '文档类别',
      type: 'select',
      options: ['设计', '施工', '竣工', '合同'],
    },
    { key: 'version', label: '版本', type: 'text' },
  ],
  key_projects: [
    { key: 'coordinationLevel', label: '协调级别', type: 'select', options: ['集团', '区域', '项目'] },
    { key: 'stakeholder', label: '牵头方', type: 'text' },
  ],
  technical_management: [
    {
      key: 'techCategory',
      label: '技术类别',
      type: 'select',
      options: ['设计', '工艺', '变更', '方案'],
    },
    { key: 'reviewDate', label: '评审日期', type: 'date' },
  ],
  contract_risk_management: [
    {
      key: 'riskLevel',
      label: '风险等级',
      type: 'select',
      options: ['低', '中', '高'],
    },
    { key: 'contractNo', label: '合同编号', type: 'text' },
    { key: 'claimDeadline', label: '索赔期限', type: 'date' },
  ],
  operations_management: [
    {
      key: 'opsType',
      label: '运营类型',
      type: 'select',
      options: ['运维', '客服', '结算', '巡检'],
    },
    { key: 'slaDue', label: 'SLA 截止', type: 'date' },
  ],
}

export function isPmVerticalDomain(domain: PmDomain): domain is PmVerticalDomain {
  return (PM_VERTICAL_DOMAINS as readonly string[]).includes(domain)
}

export function getPmDomainCustomFields(domain: PmDomain): PmCustomFieldDef[] {
  return PM_DOMAIN_CUSTOM_FIELDS[domain] ?? []
}
