/**
 * Cost-management「实务」catalog — independent from 价格表, 资源实务, and 计划实务.
 * Stored in localStorage only (empty by default).
 */

import {
  buildCostSaveMetadata,
  readCostLastSavedAt,
  readCostSaveHistory,
  readCostVersion,
  removeCostSaveHistoryEntry,
} from '@toolman/shared'

import {
  fingerprintCostCatalog,
  parseCostRows,
  reindexCostRows,
  toCostCatalogSnapshot,
  type PmCostRow,
} from './pm-cost-catalog'

function practiceCatalogStorageKey(workspaceId: string, scopeId: string): string {
  return `toolman.pm.costPractice.catalog.${workspaceId}.${scopeId}`
}

function practiceMetaStorageKey(workspaceId: string, scopeId: string): string {
  return `toolman.pm.costPractice.meta.${workspaceId}.${scopeId}`
}

export function readCostPracticeSaveMeta(
  workspaceId: string,
  scopeId: string,
): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(practiceMetaStorageKey(workspaceId, scopeId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writeCostPracticeSaveMeta(
  workspaceId: string,
  scopeId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(practiceMetaStorageKey(workspaceId, scopeId), JSON.stringify(metadata))
}

export function readCostPracticeCatalog(workspaceId: string, scopeId: string): PmCostRow[] {
  try {
    const raw = localStorage.getItem(practiceCatalogStorageKey(workspaceId, scopeId))
    if (!raw) return []
    const parsed = parseCostRows(JSON.parse(raw) as unknown)
    return parsed ? reindexCostRows(parsed) : []
  } catch {
    return []
  }
}

export function writeCostPracticeCatalog(
  workspaceId: string,
  scopeId: string,
  rows: readonly PmCostRow[],
): void {
  localStorage.setItem(
    practiceCatalogStorageKey(workspaceId, scopeId),
    JSON.stringify(reindexCostRows([...rows])),
  )
}

export function readCostPracticeVersion(workspaceId: string, scopeId: string): number {
  return readCostVersion(readCostPracticeSaveMeta(workspaceId, scopeId))
}

export function readCostPracticeLastSavedAt(workspaceId: string, scopeId: string): number | null {
  return readCostLastSavedAt(readCostPracticeSaveMeta(workspaceId, scopeId))
}

export function readCostPracticeSaveHistory(workspaceId: string, scopeId: string) {
  return readCostSaveHistory(readCostPracticeSaveMeta(workspaceId, scopeId))
}

export function recordCostPracticeSaveMeta(
  workspaceId: string,
  scopeId: string,
  rows: readonly PmCostRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildCostSaveMetadata(readCostPracticeSaveMeta(workspaceId, scopeId), {
    costCount: rows.length,
    contentFingerprint: fingerprintCostCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toCostCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writeCostPracticeSaveMeta(workspaceId, scopeId, next)
  return next
}

export function removeCostPracticeSaveHistoryEntry(
  workspaceId: string,
  scopeId: string,
  version: number,
): Record<string, unknown> {
  const next = removeCostSaveHistoryEntry(readCostPracticeSaveMeta(workspaceId, scopeId), version)
  writeCostPracticeSaveMeta(workspaceId, scopeId, next)
  return next
}
