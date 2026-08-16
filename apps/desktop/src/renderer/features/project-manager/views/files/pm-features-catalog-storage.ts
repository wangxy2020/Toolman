/** Shared / project feature catalog storage and save-meta helpers. */

import {
  buildFeatureSaveMetadata,
  readFeatureLastSavedAt,
  readFeatureSaveHistory,
  readFeatureVersion,
  removeFeatureSaveHistoryEntry,
  type PmFeatureCatalogSnapshotRow,
  type PmFeatureSaveRecord,
} from '@toolman/shared'

import {
  cloneFeatureCatalog,
  createDefaultFeatureCatalog,
  fingerprintFeatureCatalog,
  parseFeatureRows,
  reindexFeatureRows,
} from './pm-features-catalog-rows'
import { stripLiveFeatureRows } from './pm-features-catalog-strip'
import {
  featureMatchKey,
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  type PmFeatureRow,
} from './pm-features-catalog-types'

function sharedCatalogStorageKey(workspaceId: string): string {
  return `toolman.pm.featureCatalog.shared.${workspaceId}`
}

export function readSharedFeatureCatalog(workspaceId: string): {
  rows: PmFeatureRow[]
  isDefault: boolean
} {
  try {
    const raw = localStorage.getItem(sharedCatalogStorageKey(workspaceId))
    if (!raw) {
      return {
        rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const parsed = parseFeatureRows(JSON.parse(raw) as unknown)
    if (!parsed) {
      return {
        rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
        isDefault: true,
      }
    }
    const pruned = stripLiveFeatureRows(
      parsed.map((row) =>
        row.applicable === PM_FEATURE_APPLICABLE_ALL
          ? row
          : { ...row, applicable: PM_FEATURE_APPLICABLE_ALL },
      ),
    )
    if (pruned.changed) {
      writeSharedFeatureCatalog(workspaceId, pruned.rows)
    }
    return {
      rows: pruned.rows,
      isDefault: false,
    }
  } catch {
    return {
      rows: createDefaultFeatureCatalog(PM_FEATURE_APPLICABLE_ALL),
      isDefault: true,
    }
  }
}

export function writeSharedFeatureCatalog(workspaceId: string, rows: PmFeatureRow[]): void {
  const normalized = rows.map((row) => ({
    ...row,
    applicable: PM_FEATURE_APPLICABLE_ALL,
  }))
  localStorage.setItem(sharedCatalogStorageKey(workspaceId), JSON.stringify(normalized))
}

export function mergeSharedIntoProjectFeatureCatalog(
  projectRows: PmFeatureRow[],
  sharedRows: PmFeatureRow[],
): { rows: PmFeatureRow[]; changed: boolean } {
  const existingKeys = new Set<string>()
  for (const row of projectRows) {
    const name = row.name.trim()
    if (!name) continue
    existingKeys.add(featureMatchKey(row.type, name))
  }

  const additions: PmFeatureRow[] = []
  for (const shared of sharedRows) {
    const name = shared.name.trim()
    if (!name) continue
    const key = featureMatchKey(shared.type, name)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push({
      ...shared,
      id: crypto.randomUUID(),
      applicable: PM_FEATURE_APPLICABLE_ALL,
      parentId: null,
    })
  }

  if (additions.length === 0) {
    return { rows: projectRows, changed: false }
  }
  return {
    rows: reindexFeatureRows([...projectRows, ...additions]),
    changed: true,
  }
}

export function resolveProjectFeatureCatalog(
  workspaceId: string,
  _projectId: string,
  metadata: Record<string, unknown> | null | undefined,
): { rows: PmFeatureRow[]; needsPersist: boolean } {
  const shared = readSharedFeatureCatalog(workspaceId)
  const stored = parseFeatureRows(metadata?.[PM_FEATURE_CATALOG_KEY])
  if (stored) {
    const pruned = stripLiveFeatureRows(stored)
    const merged = mergeSharedIntoProjectFeatureCatalog(pruned.rows, shared.rows)
    return {
      rows: merged.rows,
      needsPersist: pruned.changed || merged.changed,
    }
  }

  return {
    rows: cloneFeatureCatalog(shared.rows, PM_FEATURE_APPLICABLE_ALL),
    needsPersist: true,
  }
}

function sharedCatalogMetaStorageKey(workspaceId: string): string {
  return `toolman.pm.featureCatalog.sharedMeta.${workspaceId}`
}

export function readSharedFeatureSaveMeta(workspaceId: string): Record<string, unknown> {
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

export function writeSharedFeatureSaveMeta(
  workspaceId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(sharedCatalogMetaStorageKey(workspaceId), JSON.stringify(metadata))
}

export function toFeatureCatalogSnapshot(rows: readonly PmFeatureRow[]): PmFeatureCatalogSnapshotRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    unit: row.unit,
    pricingUnit: row.pricingUnit,
    purchaseCycle: row.purchaseCycle,
    transportCycle: row.transportCycle,
    quantity: row.quantity,
    remark: row.remark,
    code: row.code,
    featureDescription: row.featureDescription,
    sectionalWork: row.sectionalWork,
    unitPrice: row.unitPrice,
    applicable: row.applicable,
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }))
}

/**
 * Record shared「全部项目」save meta after a catalog save.
 * Pass `bumpVersion: true` for「另存为新版本」; `false` (default) updates current only
 * (first save still creates v1).
 */
export function recordSharedFeatureSaveMeta(
  workspaceId: string,
  rows: readonly PmFeatureRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildFeatureSaveMetadata(readSharedFeatureSaveMeta(workspaceId), {
    featureCount: rows.length,
    contentFingerprint: fingerprintFeatureCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toFeatureCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeSharedFeatureSaveMeta(workspaceId, next)
  return next
}

export function readSharedFeatureVersion(workspaceId: string): number {
  return readFeatureVersion(readSharedFeatureSaveMeta(workspaceId))
}

export function readSharedFeatureLastSavedAt(workspaceId: string): number | null {
  return readFeatureLastSavedAt(readSharedFeatureSaveMeta(workspaceId))
}

export function readSharedFeatureSaveHistory(workspaceId: string): PmFeatureSaveRecord[] {
  return readFeatureSaveHistory(readSharedFeatureSaveMeta(workspaceId))
}

export function removeSharedFeatureSaveHistoryEntry(
  workspaceId: string,
  version: number,
): Record<string, unknown> {
  const next = removeFeatureSaveHistoryEntry(readSharedFeatureSaveMeta(workspaceId), version)
  writeSharedFeatureSaveMeta(workspaceId, next)
  return next
}
