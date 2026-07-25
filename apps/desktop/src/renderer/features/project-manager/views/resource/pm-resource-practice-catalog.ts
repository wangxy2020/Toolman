/**
 * Resource-management「实务」catalog — independent from 资源列表 and 计划管理-实务.
 * Stored in localStorage only (empty by default).
 */

import {
  buildResourceSaveMetadata,
  readResourceLastSavedAt,
  readResourceSaveHistory,
  readResourceVersion,
  removeResourceSaveHistoryEntry,
} from '@toolman/shared'

import {
  fingerprintResourceCatalog,
  parseResourceRows,
  reindexResourceRows,
  toResourceCatalogSnapshot,
  type PmResourceRow,
} from './pm-resource-catalog'

function practiceCatalogStorageKey(workspaceId: string, scopeId: string): string {
  return `toolman.pm.resourcePractice.catalog.${workspaceId}.${scopeId}`
}

function practiceMetaStorageKey(workspaceId: string, scopeId: string): string {
  return `toolman.pm.resourcePractice.meta.${workspaceId}.${scopeId}`
}

export function readPracticeSaveMeta(
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

export function writePracticeSaveMeta(
  workspaceId: string,
  scopeId: string,
  metadata: Record<string, unknown>,
): void {
  localStorage.setItem(practiceMetaStorageKey(workspaceId, scopeId), JSON.stringify(metadata))
}

export function readPracticeCatalog(workspaceId: string, scopeId: string): PmResourceRow[] {
  try {
    const raw = localStorage.getItem(practiceCatalogStorageKey(workspaceId, scopeId))
    if (!raw) return []
    const parsed = parseResourceRows(JSON.parse(raw) as unknown)
    return parsed ? reindexResourceRows(parsed) : []
  } catch {
    return []
  }
}

export function writePracticeCatalog(
  workspaceId: string,
  scopeId: string,
  rows: readonly PmResourceRow[],
): void {
  localStorage.setItem(
    practiceCatalogStorageKey(workspaceId, scopeId),
    JSON.stringify(reindexResourceRows([...rows])),
  )
}

export function readPracticeVersion(workspaceId: string, scopeId: string): number {
  return readResourceVersion(readPracticeSaveMeta(workspaceId, scopeId))
}

export function readPracticeLastSavedAt(workspaceId: string, scopeId: string): number | null {
  return readResourceLastSavedAt(readPracticeSaveMeta(workspaceId, scopeId))
}

export function readPracticeSaveHistory(workspaceId: string, scopeId: string) {
  return readResourceSaveHistory(readPracticeSaveMeta(workspaceId, scopeId))
}

export function recordPracticeSaveMeta(
  workspaceId: string,
  scopeId: string,
  rows: readonly PmResourceRow[],
  options?: { savedAt?: number; bumpVersion?: boolean; note?: string },
): Record<string, unknown> {
  const next = buildResourceSaveMetadata(readPracticeSaveMeta(workspaceId, scopeId), {
    resourceCount: rows.length,
    contentFingerprint: fingerprintResourceCatalog(rows),
    savedAt: options?.savedAt ?? Date.now(),
    catalog: toResourceCatalogSnapshot(rows),
    bumpVersion: options?.bumpVersion ?? false,
    ...(options?.note?.trim() ? { note: options.note.trim() } : {}),
  })
  writePracticeSaveMeta(workspaceId, scopeId, next)
  return next
}

export function removePracticeSaveHistoryEntry(
  workspaceId: string,
  scopeId: string,
  version: number,
): Record<string, unknown> {
  const next = removeResourceSaveHistoryEntry(readPracticeSaveMeta(workspaceId, scopeId), version)
  writePracticeSaveMeta(workspaceId, scopeId, next)
  return next
}
