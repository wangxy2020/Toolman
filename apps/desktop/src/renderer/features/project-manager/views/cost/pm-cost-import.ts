/** Import price-list rows from Excel / CSV / XML / Glodon-style budget archives. */

import ExcelJS from 'exceljs'
import JSZip from 'jszip'

import {
  createEmptyCostRow,
  isPmCostType,
  reindexCostRows,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'

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

const ZIP_MAGIC = [0x50, 0x4b] // PK

const HEADER_ALIASES: Record<keyof Pick<
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
>, readonly string[]> = {
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

export function mapHeaderToField(
  header: string,
): keyof typeof HEADER_ALIASES | null {
  const normalized = normalizeImportHeader(header)
  if (!normalized) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [keyof typeof HEADER_ALIASES, readonly string[]]
  >) {
    if (aliases.some((alias) => normalizeImportHeader(alias) === normalized)) {
      return field
    }
  }
  return null
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/,/g, '')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
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

type DraftRow = {
  code: string
  name: string
  featureDescription: string
  unit: string
  quantity: number | null
  unitPrice: number | null
  sectionalWork: string
  type: PmCostType
  note: string
}

function emptyDraft(fallbackType: PmCostType): DraftRow {
  return {
    code: '',
    name: '',
    featureDescription: '',
    unit: '',
    quantity: null,
    unitPrice: null,
    sectionalWork: '',
    type: fallbackType,
    note: '',
  }
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && value !== null && 'text' in value) {
    const text = (value as { text?: unknown }).text
    return typeof text === 'string' ? text.trim() : String(text ?? '').trim()
  }
  return String(value).trim()
}

function applyField(draft: DraftRow, field: keyof typeof HEADER_ALIASES, raw: unknown) {
  switch (field) {
    case 'code':
      draft.code = cellText(raw)
      break
    case 'name':
      draft.name = cellText(raw)
      break
    case 'featureDescription':
      draft.featureDescription = cellText(raw)
      break
    case 'unit':
      draft.unit = cellText(raw)
      break
    case 'quantity':
      draft.quantity = parseNumber(raw)
      break
    case 'unitPrice':
      draft.unitPrice = parseNumber(raw)
      break
    case 'sectionalWork':
      draft.sectionalWork = cellText(raw)
      break
    case 'type':
      draft.type = resolveImportCostType(raw, draft.type)
      break
    case 'note':
      draft.note = cellText(raw)
      break
  }
}

export function draftsToCostRows(
  drafts: readonly DraftRow[],
  applicable: string,
): PmCostRow[] {
  const rows: PmCostRow[] = []
  for (const draft of drafts) {
    if (!draft.name.trim() && !draft.code.trim()) continue
    const row = createEmptyCostRow(rows.length, draft.type, null, applicable)
    rows.push({
      ...row,
      code: draft.code,
      name: draft.name || draft.code,
      featureDescription: draft.featureDescription,
      unit: draft.unit,
      quantity: draft.quantity,
      unitPrice: draft.unitPrice,
      note: draft.note,
      sectionalWork: draft.sectionalWork,
    })
  }
  return reindexCostRows(rows)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeTextBuffer(bytes: Uint8Array): string {
  const encodings: string[] = ['utf-8', 'gb18030', 'gbk']
  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(bytes)
      if (text.includes('\uFFFD') && encoding === 'utf-8') continue
      return text.replace(/^\uFEFF/, '')
    } catch {
      // try next
    }
  }
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

function isZipBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1]
}

/** Parse delimiter-separated text into drafts using the first row as headers. */
export function parseDelimitedCostTable(
  text: string,
  options?: { fallbackType?: PmCostType; delimiter?: string },
): DraftRow[] {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter =
    options?.delimiter ??
    (lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(';') ? ';' : ',')

  const splitLine = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    cells.push(current.trim())
    return cells
  }

  const headers = splitLine(lines[0]!).map(mapHeaderToField)
  if (!headers.some(Boolean)) return []

  const drafts: DraftRow[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line)
    const draft = emptyDraft(fallbackType)
    headers.forEach((field, index) => {
      if (!field) return
      applyField(draft, field, cells[index] ?? '')
    })
    drafts.push(draft)
  }
  return drafts
}

function scoreHeaderRow(values: string[]): number {
  return values.reduce((score, value) => (mapHeaderToField(value) ? score + 1 : score), 0)
}

export async function parseExcelCostBuffer(
  buffer: ArrayBuffer | Uint8Array,
  options?: { fallbackType?: PmCostType },
): Promise<DraftRow[]> {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  const workbook = new ExcelJS.Workbook()
  // ExcelJS accepts Buffer-like inputs; Uint8Array works in renderer.
  await workbook.xlsx.load(buffer as never)
  const sheet =
    workbook.worksheets.find((entry) => entry.actualRowCount > 0) ?? workbook.worksheets[0]
  if (!sheet) return []

  const matrix: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (values.length < colNumber - 1) values.push('')
      values.push(cellText(cell.value))
    })
    if (values.some((value) => value.trim())) matrix.push(values)
  })
  if (matrix.length < 2) return []

  let headerIndex = 0
  let bestScore = scoreHeaderRow(matrix[0] ?? [])
  for (let i = 1; i < Math.min(matrix.length, 12); i += 1) {
    const score = scoreHeaderRow(matrix[i] ?? [])
    if (score > bestScore) {
      bestScore = score
      headerIndex = i
    }
  }
  if (bestScore === 0) return []

  const headerFields = (matrix[headerIndex] ?? []).map(mapHeaderToField)
  const drafts: DraftRow[] = []
  for (const cells of matrix.slice(headerIndex + 1)) {
    const draft = emptyDraft(fallbackType)
    headerFields.forEach((field, index) => {
      if (!field) return
      applyField(draft, field, cells[index] ?? '')
    })
    drafts.push(draft)
  }
  return drafts
}

function collectXmlObjectFields(element: Element): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const attr of Array.from(element.attributes)) {
    fields[attr.name] = attr.value
  }
  for (const child of Array.from(element.children)) {
    if (child.children.length === 0) {
      fields[child.tagName] = child.textContent?.trim() ?? ''
    }
  }
  return fields
}

function extractTagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = []
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'gi')
  let match = pattern.exec(xml)
  while (match) {
    blocks.push(match[1] ?? '')
    match = pattern.exec(xml)
  }
  return blocks
}

function extractChildFieldsFromXmlBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const pattern =
    /<([A-Za-z_\u4e00-\u9fff][\w.\-:\u4e00-\u9fff]*)(?:\s[^>]*)?>([^<]*?)<\/\1>/g
  let match = pattern.exec(block)
  while (match) {
    const tag = match[1] ?? ''
    const value = (match[2] ?? '').trim()
    if (tag && !(tag in fields)) fields[tag] = value
    match = pattern.exec(block)
  }
  return fields
}

function parseXmlCostDocumentWithoutDom(
  xmlText: string,
  fallbackType: PmCostType,
): DraftRow[] {
  const preferTags = [
    '清单项目',
    '分部分项',
    '定额子目',
    '工料机',
    'Item',
    'BQItem',
    'NormItem',
    'Resource',
    'BillItem',
    'ProjectItem',
  ]
  const drafts: DraftRow[] = []
  for (const tag of preferTags) {
    for (const block of extractTagBlocks(xmlText, tag)) {
      const draft = draftFromLooseFields(
        extractChildFieldsFromXmlBlock(block),
        fallbackType,
      )
      if (draft) drafts.push(draft)
    }
    if (drafts.length > 0) return drafts
  }
  return drafts
}

function draftFromLooseFields(
  fields: Record<string, string>,
  fallbackType: PmCostType,
): DraftRow | null {
  const draft = emptyDraft(fallbackType)
  let matched = 0
  for (const [key, value] of Object.entries(fields)) {
    const field = mapHeaderToField(key)
    if (!field) continue
    applyField(draft, field, value)
    matched += 1
  }
  if (matched === 0) return null
  if (!draft.name.trim() && !draft.code.trim()) return null
  return draft
}

/** Extract cost drafts from generic / bidding XML documents. */
export function parseXmlCostDocument(
  xmlText: string,
  options?: { fallbackType?: PmCostType },
): DraftRow[] {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  if (typeof DOMParser === 'undefined') {
    return parseXmlCostDocumentWithoutDom(xmlText, fallbackType)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('XML 解析失败')
  }

  const drafts: DraftRow[] = []
  const seen = new Set<Element>()

  const preferSelectors = [
    '清单项目',
    '分部分项',
    '定额子目',
    '工料机',
    'Item',
    'BQItem',
    'NormItem',
    'Resource',
    'BillItem',
    'ProjectItem',
  ]
  for (const tag of preferSelectors) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) {
      if (seen.has(el)) continue
      seen.add(el)
      const draft = draftFromLooseFields(collectXmlObjectFields(el), fallbackType)
      if (draft) drafts.push(draft)
    }
  }

  if (drafts.length > 0) return drafts

  // Fallback: any element whose children look like a cost row.
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (seen.has(el) || el.children.length === 0) continue
    const fields = collectXmlObjectFields(el)
    const mappedCount = Object.keys(fields).reduce(
      (count, key) => (mapHeaderToField(key) ? count + 1 : count),
      0,
    )
    if (mappedCount < 2) continue
    seen.add(el)
    const draft = draftFromLooseFields(fields, fallbackType)
    if (draft) drafts.push(draft)
  }
  return drafts
}

async function parseZipBudgetArchive(
  bytes: Uint8Array,
  options?: { fallbackType?: PmCostType },
): Promise<{ drafts: DraftRow[]; warnings: string[] }> {
  const warnings: string[] = []
  const zip = await JSZip.loadAsync(bytes)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  const preferred = entries
    .map((entry) => entry.name)
    .sort((left, right) => {
      const rank = (name: string) => {
        const lower = name.toLowerCase()
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 0
        if (lower.endsWith('.xml')) return 1
        if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 2
        if (lower.endsWith('.json')) return 3
        return 9
      }
      return rank(left) - rank(right) || left.localeCompare(right)
    })

  for (const name of preferred) {
    const entry = zip.file(name)
    if (!entry) continue
    const lower = name.toLowerCase()
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
        const content = await entry.async('uint8array')
        const drafts = await parseExcelCostBuffer(content, options)
        if (drafts.length > 0) return { drafts, warnings }
      }
      if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
        const text = await entry.async('string')
        const drafts = parseDelimitedCostTable(text, options)
        if (drafts.length > 0) return { drafts, warnings }
      }
      if (lower.endsWith('.xml')) {
        const text = await entry.async('string')
        const drafts = parseXmlCostDocument(text, options)
        if (drafts.length > 0) return { drafts, warnings }
      }
      if (lower.endsWith('.json')) {
        const text = await entry.async('string')
        const drafts = parseJsonCostDocument(text, options)
        if (drafts.length > 0) return { drafts, warnings }
      }
    } catch (error) {
      warnings.push(
        `${name}: ${error instanceof Error ? error.message : '解析失败'}`,
      )
    }
  }

  return { drafts: [], warnings }
}

function parseJsonCostDocument(
  text: string,
  options?: { fallbackType?: PmCostType },
): DraftRow[] {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  const parsed = JSON.parse(text) as unknown
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed).find((value) => Array.isArray(value))
      : null
  if (!Array.isArray(list)) return []
  const drafts: DraftRow[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      fields[key] = cellText(value)
    }
    const draft = draftFromLooseFields(fields, fallbackType)
    if (draft) drafts.push(draft)
  }
  return drafts
}

/**
 * Import cost rows from a picked file (base64 payload from FileReadBinary).
 */
export async function importCostCatalogFromFile(input: {
  fileName: string
  base64: string
  applicable: string
  fallbackType?: PmCostType
}): Promise<CostImportResult> {
  const format = detectCostImportFormat(input.fileName)
  const fallbackType = input.fallbackType ?? 'comprehensive'
  const bytes = base64ToUint8Array(input.base64)
  const warnings: string[] = []
  let drafts: DraftRow[] = []

  if (format === 'excel' || (format === 'unknown' && isZipBuffer(bytes))) {
    if (format === 'excel' || looksLikeXlsx(bytes)) {
      drafts = await parseExcelCostBuffer(bytes, { fallbackType })
    }
  }

  if (drafts.length === 0 && (format === 'csv' || format === 'unknown')) {
    const text = decodeTextBuffer(bytes)
    if (text.includes(',') || text.includes('\t') || text.includes(';')) {
      drafts = parseDelimitedCostTable(text, { fallbackType })
    }
  }

  if (drafts.length === 0 && (format === 'xml' || format === 'unknown')) {
    const text = decodeTextBuffer(bytes)
    if (text.includes('<')) {
      drafts = parseXmlCostDocument(text, { fallbackType })
    }
  }

  if (
    drafts.length === 0 &&
    (format === 'gbq' ||
      format === 'gzb' ||
      format === 'gtb' ||
      format === 'gtj' ||
      format === 'unknown')
  ) {
    if (isZipBuffer(bytes)) {
      const extracted = await parseZipBudgetArchive(bytes, { fallbackType })
      drafts = extracted.drafts
      warnings.push(...extracted.warnings)
    } else {
      // Some exports are bare XML renamed with a Glodon extension.
      const text = decodeTextBuffer(bytes)
      if (text.trimStart().startsWith('<')) {
        drafts = parseXmlCostDocument(text, { fallbackType })
      }
    }
  }

  const rows = draftsToCostRows(drafts, input.applicable)
  if (rows.length === 0) {
    const hint =
      format === 'gbq' || format === 'gzb' || format === 'gtb' || format === 'gtj'
        ? '未能从该预算文件中识别清单行。可先在计价软件中导出为 Excel 或 XML 后再导入。'
        : '未识别到有效的清单行（需要含名称/编码等列）。'
    throw Object.assign(new Error(hint), {
      code: 'empty',
      message: hint,
    } satisfies CostImportError)
  }

  return {
    rows,
    format,
    sourceName: input.fileName,
    warnings,
  }
}

function looksLikeXlsx(bytes: Uint8Array): boolean {
  return isZipBuffer(bytes)
}

export const COST_IMPORT_DIALOG_FILTERS = [
  {
    name: '预算 / 价格表',
    extensions: [
      'xlsx',
      'xls',
      'xlsm',
      'csv',
      'tsv',
      'xml',
      'gbq',
      'gbq4',
      'gzb',
      'gzb4',
      'gtb',
      'gtb4',
      'gtj',
    ],
  },
  { name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm'] },
  { name: 'XML', extensions: ['xml'] },
  { name: 'CSV', extensions: ['csv', 'tsv'] },
  { name: '广联达计价', extensions: ['gbq', 'gbq4', 'gzb', 'gzb4', 'gtb', 'gtb4'] },
  { name: '广联达算量', extensions: ['gtj'] },
  { name: '所有文件', extensions: ['*'] },
] as const
