import {
  normalizeCostCatalogPatchTarget,
  parseSharedCostCatalogRows,
  PmApplyCostCatalogPatchInputSchema,
  PM_PROJECT_COST_CATALOG_KEY,
  removeCostCatalogRows,
  resolvePmSharedCostCatalogTypeLabel,
  upsertSharedCostCatalogRows,
  type PmCostCatalogPatch,
  type PmSharedCostCatalogRow,
} from '@toolman/shared'
import { PmProjectRepository } from '@toolman/db'
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../bootstrap/database'
import { updatePmProject } from './pm-project.service'
import { getSharedCostCatalog, setSharedCostCatalog } from './pm-shared-cost-catalog.service'

function getProjectRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

function resolveRemoves(
  removes: PmCostCatalogPatch['removes'],
): Array<{ type?: PmSharedCostCatalogRow['type']; name: string }> {
  return removes.map((entry) => ({
    type:
      entry.type ??
      (entry.typeLabel
        ? resolvePmSharedCostCatalogTypeLabel(entry.typeLabel) ?? undefined
        : undefined),
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
  return projects.find((project) => project.code.trim().toLowerCase() === normalized) ?? null
}

function applyPatchToRows(
  base: readonly PmSharedCostCatalogRow[],
  patch: PmCostCatalogPatch,
  applicable: string,
): { rows: PmSharedCostCatalogRow[]; changed: boolean; upserted: number; removed: number } {
  const removed = removeCostCatalogRows(base, resolveRemoves(patch.removes))
  const upserted = upsertSharedCostCatalogRows(removed.rows, patch.upserts, () => randomUUID())
  const rows = upserted.rows.map((row) => ({ ...row, applicable }))
  return {
    rows,
    changed: removed.changed || upserted.changed,
    upserted: patch.upserts.length,
    removed: removed.removedCount,
  }
}

export function applyPmCostCatalogPatches(input: unknown) {
  const data = PmApplyCostCatalogPatchInputSchema.parse(input)
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
    const target = normalizeCostCatalogPatchTarget(String(patch.target))
    if (target === 'shared') {
      const current = getSharedCostCatalog(data.workspaceId)
      const applied = applyPatchToRows(current.rows, patch, 'all')
      if (applied.changed || current.isDefault) {
        setSharedCostCatalog(data.workspaceId, applied.rows)
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

    const owned = parseSharedCostCatalogRows(project.metadata?.[PM_PROJECT_COST_CATALOG_KEY])
    const base =
      owned ??
      getSharedCostCatalog(data.workspaceId).rows.map((row) => ({
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
          [PM_PROJECT_COST_CATALOG_KEY]: applied.rows,
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
