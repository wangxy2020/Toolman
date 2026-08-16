/** Cost import types, header aliases, and field mapping. */

import { isPmCostType, type PmCostRow, type PmCostType } from './pm-cost-catalog'

export type CostImportFormat =
  | 'excel'
  | 'csv'
  | 'xml'
  | 'gbq'
  | 'gzb'
  | 'gtb'
  | 'gtj'
  | 'unknown'

export type CostImportResult = {
  rows: PmCostRow[]
  format: CostImportFormat
  sourceName: string
  warnings: string[]
}

export type CostImportError = {
  code: 'unsupported' | 'empty' | 'parse'
  message: string
}

export type CostImportHeaderField = keyof Pick<
  PmCostRow,
  | 'code'
  | 'name'
  | 'featureDescription'
  | 'unit'
  | 'quantity'
  | 'unitPrice'
  | 'sectionalWork'
  | 'type'
  | 'note'
>

export const HEADER_ALIASES: Record<CostImportHeaderField, readonly string[]> = {
  code: ['编码', '项目编码', '清单编码', '定额编码', 'code', 'itemcode', 'item_code'],
  name: [
    '名称',
    '工作名称',
    '项目名称',
    '清单名称',
    '定额名称',
    '工程名称',
    'name',
    'itemname',
    'item_name',
  ],
  featureDescription: [
    '特征描述',
    '项目特征',
    '项目特征描述',
    '特征',
    '描述',
    'featuredescription',
    'description',
    'spec',
  ],
  unit: ['单位', '计量单位', 'unit'],
  quantity: ['数量', '工程量', 'qty', 'quantity', 'amount'],
  unitPrice: ['单价', '综合单价', '预算单价', 'unitprice', 'price', 'rate'],
  sectionalWork: [
    '分部工程',
    '分部',
    '单位工程',
    '单项工程',
    '章节',
    'sectionalwork',
    'section',
  ],
  type: ['类型', '费用类型', '费用名称', 'type', 'costtype'],
  note: ['备注', '说明', '附注', 'note', 'remark', 'comments'],
}

const TYPE_LABEL_TO_ID: Record<string, PmCostType> = {
  人力: 'labor',
  人工: 'labor',
  辅材: 'auxiliary',
  材料: 'material',
  机械: 'equipment',
  设备: 'device',
  仪器: 'instrument',
  管理费: 'management',
  规费: 'fees',
  综合单价: 'comprehensive',
  措施费: 'measures',
  税金: 'tax',
  投资估算: 'investment',
  设计概算: 'designEstimate',
  施工预算: 'constructionBudget',
  成本预算: 'costBudget',
  资金: 'funds',
  其他费: 'other',
  其他: 'other',
  labor: 'labor',
  auxiliary: 'auxiliary',
  material: 'material',
  equipment: 'equipment',
  device: 'device',
  instrument: 'instrument',
  management: 'management',
  fees: 'fees',
  comprehensive: 'comprehensive',
  measures: 'measures',
  tax: 'tax',
  investment: 'investment',
  designestimate: 'designEstimate',
  constructionbudget: 'constructionBudget',
  costbudget: 'costBudget',
  funds: 'funds',
  other: 'other',
}

export function detectCostImportFormat(fileName: string): CostImportFormat {
  const ext = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
    : ''
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return 'excel'
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  if (ext === 'xml') return 'xml'
  if (ext === 'gbq' || ext === 'gbq4' || ext === 'gbq5' || ext === 'gbq6') return 'gbq'
  if (ext === 'gzb' || ext === 'gzb4' || ext === 'gzb5') return 'gzb'
  if (ext === 'gtb' || ext === 'gtb4' || ext === 'gtb5') return 'gtb'
  if (ext === 'gtj' || ext === 'gtj2018' || ext === 'gcl') return 'gtj'
  return 'unknown'
}

export function normalizeImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()【】\[\]：:]/g, '')
}

export function mapHeaderToField(header: string): CostImportHeaderField | null {
  const normalized = normalizeImportHeader(header)
  if (!normalized) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [CostImportHeaderField, readonly string[]]
  >) {
    if (aliases.some((alias) => normalizeImportHeader(alias) === normalized)) {
      return field
    }
  }
  return null
}

export function resolveImportCostType(
  raw: unknown,
  fallback: PmCostType = 'comprehensive',
): PmCostType {
  if (isPmCostType(raw)) return raw
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  if (isPmCostType(trimmed)) return trimmed
  const mapped = TYPE_LABEL_TO_ID[trimmed] ?? TYPE_LABEL_TO_ID[trimmed.toLowerCase()]
  return mapped ?? fallback
}
