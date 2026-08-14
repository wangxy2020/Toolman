import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { app } from 'electron'

import {
  createDefaultSharedCostCatalogRows,
  parseSharedCostCatalogRows,
  PmSharedCostCatalogGetInputSchema,
  PmSharedCostCatalogSetInputSchema,
  PmSharedCostCatalogUpsertInputSchema,
  upsertSharedCostCatalogRows,
  type PmSharedCostCatalogRow,
} from '@toolman/shared'

const CATALOG_FILE = 'pm-shared-cost-catalog.json'

type CatalogStore = Record<string, PmSharedCostCatalogRow[]>

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
      const rows = parseSharedCostCatalogRows(value)
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

/** Durable「全部项目」price-list catalog. Missing key returns empty defaults until the user saves. */
export function getSharedCostCatalog(workspaceId: string): {
  rows: PmSharedCostCatalogRow[]
  isDefault: boolean
} {
  const store = readStore()
  const stored = store[workspaceId]
  if (stored) return { rows: stored, isDefault: false }
  return { rows: createDefaultSharedCostCatalogRows(), isDefault: true }
}

export function setSharedCostCatalog(
  workspaceId: string,
  rows: PmSharedCostCatalogRow[],
): PmSharedCostCatalogRow[] {
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

export function upsertSharedCostCatalog(
  workspaceId: string,
  upserts: ReadonlyArray<{
    type: PmSharedCostCatalogRow['type']
    name: string
    code?: string
    unit?: string
    quantity?: number | null
    unitPrice?: number | null
    featureDescription?: string
    note?: string
    sectionalWork?: string
  }>,
): { rows: PmSharedCostCatalogRow[]; changed: boolean } {
  const current = getSharedCostCatalog(workspaceId)
  const merged = upsertSharedCostCatalogRows(current.rows, upserts, () => randomUUID())
  if (merged.changed || current.isDefault) {
    setSharedCostCatalog(workspaceId, merged.rows)
    return { rows: merged.rows, changed: true }
  }
  return merged
}

export function getSharedCostCatalogIpc(rawInput: unknown): {
  rows: PmSharedCostCatalogRow[]
  isDefault: boolean
} {
  const input = PmSharedCostCatalogGetInputSchema.parse(rawInput)
  return getSharedCostCatalog(input.workspaceId)
}

export function setSharedCostCatalogIpc(rawInput: unknown): {
  rows: PmSharedCostCatalogRow[]
} {
  const input = PmSharedCostCatalogSetInputSchema.parse(rawInput)
  return { rows: setSharedCostCatalog(input.workspaceId, input.rows) }
}

export function upsertSharedCostCatalogIpc(rawInput: unknown): {
  rows: PmSharedCostCatalogRow[]
  changed: boolean
} {
  const input = PmSharedCostCatalogUpsertInputSchema.parse(rawInput)
  return upsertSharedCostCatalog(input.workspaceId, input.upserts)
}
