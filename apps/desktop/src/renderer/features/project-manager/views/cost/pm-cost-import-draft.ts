/** Draft row helpers for cost import. */

import {
  createEmptyCostRow,
  reindexCostRows,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog'
import {
  mapHeaderToField,
  resolveImportCostType,
  type CostImportHeaderField,
} from './pm-cost-import-types'

export type DraftRow = {
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

export function emptyDraft(fallbackType: PmCostType): DraftRow {
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

export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/,/g, '')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function cellText(value: unknown): string {
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

export function applyField(draft: DraftRow, field: CostImportHeaderField, raw: unknown) {
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

export function draftFromLooseFields(
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
