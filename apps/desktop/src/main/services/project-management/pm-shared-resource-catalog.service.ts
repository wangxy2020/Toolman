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

/** Durable「全部项目」catalog. Missing key → built-in defaults (not yet persisted). */
export function getSharedResourceCatalog(workspaceId: string): {
  rows: PmSharedResourceCatalogRow[]
  isDefault: boolean
} {
  const store = readStore()
  const stored = store[workspaceId]
  if (stored) {
    const ensured = ensureMissingDefaultTypes(stored)
    if (ensured.changed) {
      setSharedResourceCatalog(workspaceId, ensured.rows)
      return { rows: ensured.rows, isDefault: false }
    }
    return { rows: stored, isDefault: false }
  }
  return { rows: createDefaultSharedResourceCatalogRows(), isDefault: true }
}

/** Roll newly introduced built-in types / named rows into an already-persisted catalog. */
function ensureMissingDefaultTypes(rows: PmSharedResourceCatalogRow[]): {
  rows: PmSharedResourceCatalogRow[]
  changed: boolean
} {
  const ensureTypes: ReadonlyArray<PmSharedResourceCatalogRow['type']> = [
    'device',
    'funds',
    'instrument',
  ]
  const ensureNames: ReadonlyArray<{ type: PmSharedResourceCatalogRow['type']; name: string }> = [
    { type: 'instrument', name: '全站仪' },
    { type: 'instrument', name: '水准仪' },
    { type: 'instrument', name: '塔尺' },
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
