import { COST_DATABASE_META_KEY } from '@toolman/shared'

const cache = new Map<string, Record<string, unknown>>()

export function costDatabaseMetaCacheKey(scope: { workspaceId?: string; projectId?: string | null }): string {
  const projectId = scope.projectId?.trim() ?? ''
  if (projectId) return `project:${projectId}`
  const workspaceId = scope.workspaceId?.trim() ?? ''
  return workspaceId ? `workspace:${workspaceId}` : ''
}

export function writeCostDatabaseMetaCache(scopeKey: string, metadata: Record<string, unknown>): void {
  if (!scopeKey) return
  cache.set(scopeKey, metadata)
}

export function readCostDatabaseMetaCache(scopeKey: string): Record<string, unknown> | null {
  if (!scopeKey) return null
  return cache.get(scopeKey) ?? null
}

export function mergeCostDatabaseMetadata(
  fallback: Record<string, unknown> | null | undefined,
  scopeKey: string,
): Record<string, unknown> {
  const base = fallback ?? {}
  const cached = readCostDatabaseMetaCache(scopeKey)
  if (!cached?.[COST_DATABASE_META_KEY]) return base
  return { ...base, ...cached }
}
