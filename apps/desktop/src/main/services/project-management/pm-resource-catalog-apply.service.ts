import {
  normalizeResourceCatalogPatchTarget,
  parseSharedResourceCatalogRows,
  PmApplyResourceCatalogPatchInputSchema,
  PM_PROJECT_RESOURCE_CATALOG_KEY,
  removeResourceCatalogRows,
  resolvePmAgentResourceTypeLabel,
  upsertSharedResourceCatalogRows,
  type PmResourceCatalogPatch,
  type PmSharedResourceCatalogRow,
} from '@toolman/shared'
import { PmProjectRepository } from '@toolman/db'
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../bootstrap/database'
import { updatePmProject } from './pm-project.service'
import {
  getSharedResourceCatalog,
  setSharedResourceCatalog,
} from './pm-shared-resource-catalog.service'

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function resolveRemoves(
  removes: PmResourceCatalogPatch['removes'],
): Array<{ type?: PmSharedResourceCatalogRow['type']; name: string }> {
  return removes.map((entry) => ({
    type:
      entry.type ??
      (entry.typeLabel ? resolvePmAgentResourceTypeLabel(entry.typeLabel) ?? undefined : undefined),
    name: entry.name,
  }))
}

function findProject(
  workspaceId: string,
  target: string,
): ReturnType<PmProjectRepository['listByWorkspace']>[number] | null {
  const projects = getProjectRepo().listByWorkspace(workspaceId, { limit: 500 })
  const byId = projects.find((project) => project.id === target)
  if (byId) return byId
  const normalized = target.trim().toLowerCase()
  return (
    projects.find((project) => project.code.trim().toLowerCase() === normalized) ?? null
  )
}

function applyPatchToRows(
  base: readonly PmSharedResourceCatalogRow[],
  patch: PmResourceCatalogPatch,
  applicable: string,
): { rows: PmSharedResourceCatalogRow[]; changed: boolean; upserted: number; removed: number } {
  const removed = removeResourceCatalogRows(base, resolveRemoves(patch.removes))
  const upserted = upsertSharedResourceCatalogRows(removed.rows, patch.upserts, () => randomUUID())
  const rows = upserted.rows.map((row) => ({ ...row, applicable }))
  return {
    rows,
    changed: removed.changed || upserted.changed,
    upserted: patch.upserts.length,
    removed: removed.removedCount,
  }
}

export function applyPmResourceCatalogPatches(input: unknown) {
  const data = PmApplyResourceCatalogPatchInputSchema.parse(input)
  const results: Array<{
    target: string
    scope: 'shared' | 'project'
    projectId?: string
    projectCode?: string
    changed: boolean
    upserted: number
    removed: number
    rowCount: number
  }> = []

  let sharedChanged = false

  for (const patch of data.patches) {
    const target = normalizeResourceCatalogPatchTarget(String(patch.target))
    if (target === 'shared') {
      const current = getSharedResourceCatalog(data.workspaceId)
      const applied = applyPatchToRows(current.rows, patch, 'all')
      if (applied.changed || current.isDefault) {
        setSharedResourceCatalog(data.workspaceId, applied.rows)
        sharedChanged = true
      }
      results.push({
        target: '全部项目',
        scope: 'shared',
        changed: applied.changed || current.isDefault,
        upserted: applied.upserted,
        removed: applied.removed,
        rowCount: applied.rows.length,
      })
      continue
    }

    const project = findProject(data.workspaceId, target)
    if (!project) {
      results.push({
        target,
        scope: 'project',
        changed: false,
        upserted: 0,
        removed: 0,
        rowCount: 0,
      })
      continue
    }

    const owned = parseSharedResourceCatalogRows(
      project.metadata?.[PM_PROJECT_RESOURCE_CATALOG_KEY],
    )
    const base =
      owned ??
      getSharedResourceCatalog(data.workspaceId).rows.map((row) => ({
        ...row,
        id: randomUUID(),
        applicable: project.id,
      }))
    const applied = applyPatchToRows(base, patch, project.id)
    if (applied.changed || owned == null) {
      updatePmProject({
        id: project.id,
        metadata: {
          ...(project.metadata ?? {}),
          [PM_PROJECT_RESOURCE_CATALOG_KEY]: applied.rows,
        },
      })
    }
    results.push({
      target: project.code,
      scope: 'project',
      projectId: project.id,
      projectCode: project.code,
      changed: applied.changed || owned == null,
      upserted: applied.upserted,
      removed: applied.removed,
      rowCount: applied.rows.length,
    })
  }

  return {
    workspaceId: data.workspaceId,
    sharedChanged,
    results,
    changedCount: results.filter((entry) => entry.changed).length,
  }
}
