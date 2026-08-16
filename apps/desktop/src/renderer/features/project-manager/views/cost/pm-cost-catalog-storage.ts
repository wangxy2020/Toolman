/** Shared / project cost catalog localStorage + IPC hydrate. */

import {
  buildCostSaveMetadata,
  readCostLastSavedAt,
  readCostSaveHistory,
  readCostVersion,
  removeCostSaveHistoryEntry,
  type PmCostCatalogSnapshotRow,
  type PmCostSaveRecord,
} from '@toolman/shared'

import {
  PM_COST_APPLICABLE_ALL,
  PM_COST_CATALOG_KEY,
  costMatchKey,
  toSharedCostCatalogType,
  type PmCostRow,
  type PmCostType,
} from './pm-cost-catalog-types'
import { fingerprintCostCatalog, parseCostRows, reindexCostRows } from './pm-cost-catalog-rows'

function sharedCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.costCatalog.shared.${workspaceId}`
}

function sharedCatalogMetaStorageKey(workspaceId: string): string {
  return `toolman.pm.costCatalog.sharedMeta.${workspaceId}`
}

export function readSharedCostCatalog(workspaceId: string): {
  rows: PmCostRow[]
  isDefault: boolean
} {
  try {
    const raw = localStorage.getItem(sharedCatalogStorageKey(workspaceId))
    if (!raw) return { rows: [], isDefault: true }
    const parsed = parseCostRows(JSON.parse(raw) as unknown)
    if (!parsed) return { rows: [], isDefault: true }
    return {
      rows: parsed.map((row) => ({ ...row, applicable: PM_COST_APPLICABLE_ALL })),
      isDefault: false,
    }
  } catch {
    return { rows: [], isDefault: true }
  }
}

export function writeSharedCostCatalog(workspaceId: string, rows: PmCostRow[]): Promise<void> {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_COST_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
  // Best-effort durable mirror for agent hints / main-process apply.
  return import('../../pm-api')
    .then(({ pmApi }) =>
      pmApi.setSharedCostCatalog(
        workspaceId,
        normalized.map((row) => ({
          id: row.id,
          type: toSharedCostCatalogType(row.type),
          code: row.code,
          name: row.name,
          featureDescription: row.featureDescription,
          unit: row.unit,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          applicable: row.applicable,
          note: row.note,
          sectionalWork: row.sectionalWork,
          sectionCode: row.sectionCode,
          sectionNote: row.sectionNote,
          sectionName: row.sectionName,
          sectionFeatureDescription: row.sectionFeatureDescription,
          sectionTotalFormula: row.sectionTotalFormula,
          sortOrder: row.sortOrder,
          parentId: row.parentId ?? null,
        })),
      ),
    )
    .then(() => undefined)
    .catch(() => {
      // ignore offline / IPC failures; localStorage remains source for UI
    })
}

/**
 * Pull durable「全部项目」catalog into localStorage when main has a non-default store.
 * If main still has defaults but localStorage already has a saved catalog, push local → main
 * so the agent runtime snapshot can see the same list.
 */
export async function hydrateSharedCostCatalogFromMain(workspaceId: string): Promise<PmCostRow[]> {
  try {
    const { pmApi } = await import('../../pm-api')
    const remote = await pmApi.getSharedCostCatalog(workspaceId)
    if (!remote.isDefault) {
      const mapped: PmCostRow[] = remote.rows.map((row) => ({
        id: row.id,
        type: row.type as PmCostType,
        code: row.code ?? '',
        name: row.name,
        featureDescription: row.featureDescription ?? '',
        unit: row.unit,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        applicable: row.applicable || PM_COST_APPLICABLE_ALL,
        note: row.note ?? '',
        sectionalWork: row.sectionalWork ?? '',
        sectionCode: row.sectionCode ?? '',
        sectionNote: row.sectionNote ?? '',
        sectionName: row.sectionName ?? '',
        sectionFeatureDescription: row.sectionFeatureDescription ?? '',
        sectionTotalFormula: row.sectionTotalFormula ?? '',
        sortOrder: row.sortOrder,
        parentId: row.parentId ?? null,
      }))
      const local = readSharedCostCatalog(workspaceId)
      const remoteIds = new Set(mapped.map((row) => row.id))
      const localExtras = !local.isDefault ? local.rows.filter((row) => !remoteIds.has(row.id)) : []
      const merged = localExtras.length > 0 ? [...mapped, ...localExtras] : mapped
      writeSharedCostCatalog(workspaceId, merged)
      return merged
    }

    const local = readSharedCostCatalog(workspaceId)
    if (!local.isDefault && local.rows.length > 0) {
      writeSharedCostCatalog(workspaceId, local.rows)
      return local.rows
    }
  } catch {
    // fall through to local
  }
  return readSharedCostCatalog(workspaceId).rows
}

export function readProjectCostCatalog(
  metadata: Record<string, unknown> | null | undefined,
): PmCostRow[] | null {
  if (!metadata) return null
  const raw = metadata[PM_COST_CATALOG_KEY]
  return parseCostRows(raw)
}

export function resolveProjectCostCatalog(
  workspaceId: string,
  metadata: Record<string, unknown> | null | undefined,
): { rows: PmCostRow[]; fromShared: boolean } {
  const owned = readProjectCostCatalog(metadata)
  if (owned) return { rows: owned, fromShared: false }
  return { rows: readSharedCostCatalog(workspaceId).rows, fromShared: true }
}

export function upsertSharedCostCatalog(
  sharedRows: readonly PmCostRow[],
  candidates: readonly PmCostRow[],
): { rows: PmCostRow[]; changed: boolean } {
  const next = sharedRows.map((row) => ({ ...row }))
  let changed = false
  for (const candidate of candidates) {
    const name = candidate.name.trim()
    if (!name) continue
    const key = costMatchKey(candidate.type, name)
    const existingIndex = next.findIndex(
      (row) => costMatchKey(row.type, row.name) === key,
    )
    if (existingIndex >= 0) {
      const existing = next[existingIndex]!
      if (
        existing.unit !== candidate.unit ||
        existing.quantity !== candidate.quantity ||
        existing.unitPrice !== candidate.unitPrice ||
        existing.note !== candidate.note ||
        existing.sectionalWork !== candidate.sectionalWork ||
        existing.sectionCode !== candidate.sectionCode ||
        existing.sectionNote !== candidate.sectionNote ||
        existing.sectionName !== candidate.sectionName ||
        existing.sectionFeatureDescription !== candidate.sectionFeatureDescription ||
        existing.sectionTotalFormula !== candidate.sectionTotalFormula
      ) {
        next[existingIndex] = {
          ...existing,
          unit: candidate.unit,
          quantity: candidate.quantity,
          unitPrice: candidate.unitPrice,
          note: candidate.note,
          sectionalWork: candidate.sectionalWork,
          sectionCode: candidate.sectionCode,
          sectionNote: candidate.sectionNote,
          sectionName: candidate.sectionName,
          sectionFeatureDescription: candidate.sectionFeatureDescription,
          sectionTotalFormula: candidate.sectionTotalFormula,
        }
        changed = true
      }
    } else {
      next.push({
        ...candidate,
        id: crypto.randomUUID(),
        applicable: PM_COST_APPLICABLE_ALL,
        parentId: null,
      })
      changed = true
    }
  }
  return { rows: reindexCostRows(next), changed }
}

/** Workspace「全部项目」price-list version / save history (localStorage). */
export function readSharedCostSaveMeta(workspaceId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(sharedCatalogMetaStorageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writeSharedCostSaveMeta(
  workspaceId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(sharedCatalogMetaStorageKey(workspaceId), JSON.stringify(metadata))
}

/** Snapshot shape stored on save-history entries. */
export function toCostCatalogSnapshot(rows: readonly PmCostRow[]): PmCostCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    code: row.code,
    name: row.name,
    featureDescription: row.featureDescription,
    unit: row.unit,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    note: row.note,
    sectionalWork: row.sectionalWork,
    sectionCode: row.sectionCode,
    sectionNote: row.sectionNote,
    sectionName: row.sectionName,
    sectionFeatureDescription: row.sectionFeatureDescription,
    sectionTotalFormula: row.sectionTotalFormula,
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }))
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * Pass `bumpVersion: true` for「另存为新版本」; `false` (default) updates current only
 * (first save still creates v1).
 */
export function recordSharedCostSaveMeta(
  workspaceId: string,
  rows: readonly PmCostRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildCostSaveMetadata(readSharedCostSaveMeta(workspaceId), {
    costCount: rows.length,
    contentFingerprint: fingerprintCostCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toCostCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeSharedCostSaveMeta(workspaceId, next)
  return next
}

export function readSharedCostVersion(workspaceId: string): number {
  return readCostVersion(readSharedCostSaveMeta(workspaceId))
}

export function readSharedCostLastSavedAt(workspaceId: string): number | null {
  return readCostLastSavedAt(readSharedCostSaveMeta(workspaceId))
}

export function readSharedCostSaveHistory(workspaceId: string): PmCostSaveRecord[] {
  return readCostSaveHistory(readSharedCostSaveMeta(workspaceId))
}

export function removeSharedCostSaveHistoryEntry(
  workspaceId: string,
  version: number,
): Record<string, unknown> {
  const next = removeCostSaveHistoryEntry(readSharedCostSaveMeta(workspaceId), version)
  writeSharedCostSaveMeta(workspaceId, next)
  return next
}
