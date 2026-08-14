import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { app } from 'electron'

import {
  createDefaultSharedResourceCatalogRows,
  parseSharedResourceCatalogRows,
  PmSharedResourceCatalogGetInputSchema,
  PmSharedResourceCatalogSetInputSchema,
  PmSharedResourceCatalogUpsertInputSchema,
  upsertSharedResourceCatalogRows,
  type PmSharedResourceCatalogRow,
} from '@toolman/shared'

const CATALOG_FILE = 'pm-shared-resource-catalog.json'

type CatalogStore = Record<string, PmSharedResourceCatalogRow[]>

function catalogPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, CATALOG_FILE)
}

function readStore(): CatalogStore {
  try {
    const raw = readFileSync(catalogPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const store: CatalogStore = {}
    for (const [workspaceId, value] of Object.entries(parsed)) {
      const rows = parseSharedResourceCatalogRows(value)
      if (rows) store[workspaceId] = rows
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: CatalogStore): void {
  writeFileSync(catalogPath(), JSON.stringify(store, null, 2), 'utf8')
}

/** Durable「全部项目」catalog. Missing key returns built-in defaults until the user saves. */
export function getSharedResourceCatalog(workspaceId: string): {
  rows: PmSharedResourceCatalogRow[]
  isDefault: boolean
} {
  const store = readStore()
  const stored = store[workspaceId]
  if (stored) {
    const migratedAux = migrateAuxiliaryResources(stored)
    const migratedBudget = migrateBudgetResources(migratedAux.rows)
    const ensured = ensureMissingDefaultTypes(migratedBudget.rows)
    const stripped = stripRetiredBudgetDefaults(ensured.rows)
    if (
      migratedAux.changed ||
      migratedBudget.changed ||
      ensured.changed ||
      stripped.changed
    ) {
      const rows = stripped.rows
      setSharedResourceCatalog(workspaceId, rows)
      return { rows, isDefault: false }
    }
    return { rows: stored, isDefault: false }
  }
  return { rows: createDefaultSharedResourceCatalogRows(), isDefault: true }
}

const AUXILIARY_RESOURCE_NAMES = new Set(['模板', '方木', '脚手架'])

function canonicalizeSharedResourceName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '方林') return '方木'
  if (trimmed === '施工图预算') return '施工预算'
  return trimmed
}

/** Reclassify formwork / timber / scaffold as「辅材」. */
function migrateAuxiliaryResources(rows: PmSharedResourceCatalogRow[]): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  let changed = false
  const result: PmSharedResourceCatalogRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = canonicalizeSharedResourceName(row.name)
    if (!AUXILIARY_RESOURCE_NAMES.has(name)) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }
    if (seen.has(name)) {
      changed = true
      continue
    }
    seen.add(name)
    if (row.type !== 'auxiliary' || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: 'auxiliary' })
    } else {
      result.push(row)
    }
  }
  if (!changed) return { rows, changed: false }
  return { rows: result.map((row, index) => ({ ...row, sortOrder: index })), changed: true }
}

const BUDGET_TYPE_BY_NAME: Readonly<
  Record<string, PmSharedResourceCatalogRow['type']>
> = {
  投资估算: 'investment',
  设计概算: 'designEstimate',
  施工预算: 'constructionBudget',
  成本预算: 'costBudget',
}

/** Promote legacy funds named rows into dedicated budget types. */
function migrateBudgetResources(rows: PmSharedResourceCatalogRow[]): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  let changed = false
  const result: PmSharedResourceCatalogRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = canonicalizeSharedResourceName(row.name)
    const budgetType = BUDGET_TYPE_BY_NAME[name]
    if (!budgetType) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }
    if (seen.has(budgetType)) {
      changed = true
      continue
    }
    seen.add(budgetType)
    if (row.type !== budgetType || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: budgetType })
    } else {
      result.push(row)
    }
  }
  if (!changed) return { rows, changed: false }
  return { rows: result.map((row, index) => ({ ...row, sortOrder: index })), changed: true }
}

/** Roll newly introduced built-in types / named rows into an already-persisted catalog. */
function ensureMissingDefaultTypes(rows: PmSharedResourceCatalogRow[]): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  const ensureTypes: ReadonlyArray<PmSharedResourceCatalogRow['type']> = [
    'auxiliary',
    'device',
    'instrument',
  ]
  const ensureNames: ReadonlyArray<{ type: PmSharedResourceCatalogRow['type']; name: string }> = [
    { type: 'instrument', name: '全站仪' },
    { type: 'instrument', name: '水准仪' },
    { type: 'instrument', name: '塔尺' },
    { type: 'auxiliary', name: '模板' },
    { type: 'auxiliary', name: '方木' },
    { type: 'auxiliary', name: '脚手架' },
    { type: 'material', name: '砌块/砖' },
    { type: 'material', name: '防水卷材' },
    { type: 'material', name: '预拌砂浆' },
    { type: 'material', name: '电缆' },
    { type: 'material', name: '钢管' },
  ]
  const presentTypes = new Set(rows.filter((row) => row.name.trim()).map((row) => row.type))
  const presentKeys = new Set(
    rows
      .filter((row) => row.name.trim())
      .map((row) => `${row.type}::${row.name.trim().toLowerCase()}`),
  )
  const defaults = createDefaultSharedResourceCatalogRows()
  const additions: PmSharedResourceCatalogRow[] = []

  for (const row of defaults) {
    if (!ensureTypes.includes(row.type) || presentTypes.has(row.type)) continue
    const key = `${row.type}::${row.name.trim().toLowerCase()}`
    if (presentKeys.has(key)) continue
    presentKeys.add(key)
    additions.push(row)
  }
  for (const named of ensureNames) {
    const key = `${named.type}::${named.name.trim().toLowerCase()}`
    if (presentKeys.has(key)) continue
    const def = defaults.find(
      (row) => row.type === named.type && row.name.trim() === named.name.trim(),
    )
    if (!def) continue
    presentKeys.add(key)
    additions.push({ ...def, id: `default-resource-${Date.now()}-${additions.length}` })
  }

  if (additions.length === 0) return { rows, changed: false }
  return {
    rows: [...rows, ...additions].map((row, index) => ({ ...row, sortOrder: index })),
    changed: true,
  }
}

const RETIRED_SHARED_BUDGET_DEFAULTS = new Set([
  'investment::投资估算',
  'designEstimate::设计概算',
  'constructionBudget::施工预算',
  'costBudget::成本预算',
])

function stripRetiredBudgetDefaults(rows: PmSharedResourceCatalogRow[]): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  const next = rows.filter((row) => {
    const name = canonicalizeSharedResourceName(row.name)
    return !RETIRED_SHARED_BUDGET_DEFAULTS.has(`${row.type}::${name}`)
  })
  if (next.length === rows.length) return { rows, changed: false }
  return {
    rows: next.map((row, index) => ({ ...row, sortOrder: index })),
    changed: true,
  }
}

export function setSharedResourceCatalog(
  workspaceId: string,
  rows: PmSharedResourceCatalogRow[],
): PmSharedResourceCatalogRow[] {
  const store = readStore()
  const normalized = rows.map((row, index) => ({
    ...row,
    applicable: 'all',
    sortOrder: index,
  }))
  store[workspaceId] = normalized
  writeStore(store)
  return normalized
}

export function upsertSharedResourceCatalog(
  workspaceId: string,
  upserts: ReadonlyArray<{
    type: PmSharedResourceCatalogRow['type']
    name: string
    unit?: string
    pricingUnit?: string
    unitPrice?: number | null
    spec?: string
    note?: string
  }>,
): { rows: PmSharedResourceCatalogRow[]; changed: boolean } {
  const current = getSharedResourceCatalog(workspaceId)
  const merged = upsertSharedResourceCatalogRows(current.rows, upserts, () => randomUUID())
  if (merged.changed || current.isDefault) {
    setSharedResourceCatalog(workspaceId, merged.rows)
    return { rows: merged.rows, changed: true }
  }
  return merged
}

export function getSharedResourceCatalogIpc(rawInput: unknown): {
  rows: PmSharedResourceCatalogRow[]
  isDefault: boolean
} {
  const input = PmSharedResourceCatalogGetInputSchema.parse(rawInput)
  return getSharedResourceCatalog(input.workspaceId)
}

export function setSharedResourceCatalogIpc(rawInput: unknown): {
  rows: PmSharedResourceCatalogRow[]
} {
  const input = PmSharedResourceCatalogSetInputSchema.parse(rawInput)
  return { rows: setSharedResourceCatalog(input.workspaceId, input.rows) }
}

export function upsertSharedResourceCatalogIpc(rawInput: unknown): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  const input = PmSharedResourceCatalogUpsertInputSchema.parse(rawInput)
  return upsertSharedResourceCatalog(input.workspaceId, input.upserts)
}
