/** File-level cost catalog import (zip archives, JSON, binary payload). */

import JSZip from 'jszip'

import type { PmCostType } from './pm-cost-catalog'
import {
  cellText,
  draftFromLooseFields,
  draftsToCostRows,
  type DraftRow,
} from './pm-cost-import-draft'
import { parseDelimitedCostTable, parseExcelCostBuffer } from './pm-cost-import-table'
import {
  detectCostImportFormat,
  type CostImportError,
  type CostImportResult,
} from './pm-cost-import-types'
import { parseXmlCostDocument } from './pm-cost-import-xml'

const ZIP_MAGIC = [0x50, 0x4b] // PK

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

function looksLikeXlsx(bytes: Uint8Array): boolean {
  return isZipBuffer(bytes)
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
