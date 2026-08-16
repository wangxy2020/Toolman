import {
  isRetiredSharedBudgetDefault,
  PM_RESOURCE_APPLICABLE_ALL,
  PM_RESOURCE_CATALOG_KEY,
  resourceMatchKey,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog-types'
import { normalizeResourceCatalogRows, rawCatalogNeedsLegacyRewrite } from './pm-resource-catalog-migrations'
import {
  applyDefaultUnitPrices,
  buildBaselinePriceIndex,
  lookupBaselineUnitPrice,
  reindexResourceRows,
  stripRetiredSharedBudgetDefaults,
} from './pm-resource-catalog-rows'
import {
  parseResourceRows,
  readSharedResourceCatalog,
  writeSharedResourceCatalog,
} from './pm-resource-catalog-storage'

/**
 * Insert shared「全部项目」rows that are missing from a project catalog (match by type+name).
 * Existing project rows keep their own prices / applicable scope.
 */
export function mergeSharedIntoProjectCatalog(
  projectRows: PmResourceRow[],
  sharedRows: PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  const existingKeys = new Set<string>()
  for (const row of projectRows) {
    const name = row.name.trim()
    if (!name) continue
    existingKeys.add(resourceMatchKey(row.type, name, row.customTypeName))
  }

  const additions: PmResourceRow[] = []
  for (const shared of sharedRows) {
    const name = shared.name.trim()
    if (!name) continue
    const key = resourceMatchKey(shared.type, name, shared.customTypeName)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push({
      ...shared,
      id: crypto.randomUUID(),
      parentId: null,
      applicable: PM_RESOURCE_APPLICABLE_ALL,
    })
  }

  if (additions.length === 0) {
    return { rows: projectRows, changed: false }
  }
  return {
    rows: reindexResourceRows([...projectRows, ...additions]),
    changed: true,
  }
}

/** Promote project rows (适用 = 全部项目) into the shared catalog by type+name. */
export function upsertSharedResourceCatalog(
  sharedRows: PmResourceRow[],
  incoming: PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const next = [...sharedRows]
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < next.length; i += 1) {
    const name = next[i]!.name.trim()
    if (!name) continue
    indexByKey.set(resourceMatchKey(next[i]!.type, name, next[i]!.customTypeName), i)
  }

  for (const row of incoming) {
    const name = row.name.trim()
    if (!name) continue
    const key = resourceMatchKey(row.type, name, row.customTypeName)
    const existingIndex = indexByKey.get(key)
    if (existingIndex == null) {
      next.push({
        ...row,
        id: crypto.randomUUID(),
        parentId: null,
        applicable: PM_RESOURCE_APPLICABLE_ALL,
      })
      indexByKey.set(key, next.length - 1)
      changed = true
      continue
    }
    const existing = next[existingIndex]!
    if (
      existing.unit !== row.unit ||
      existing.pricingUnit !== row.pricingUnit ||
      existing.unitPrice !== row.unitPrice ||
      existing.type !== row.type ||
      existing.name !== row.name ||
      existing.spec !== row.spec ||
      existing.note !== row.note
    ) {
      next[existingIndex] = {
        ...existing,
        type: row.type,
        name: row.name,
        spec: row.spec,
        unit: row.unit,
        pricingUnit: row.pricingUnit,
        unitPrice: row.unitPrice,
        applicable: PM_RESOURCE_APPLICABLE_ALL,
        note: row.note,
      }
      changed = true
    }
  }

  return {
    rows: changed ? reindexResourceRows(next) : sharedRows,
    changed,
  }
}

/**
 * Project catalog resolution:
 * - Stored catalog (including explicit `[]`) → use as-is.
 * - No stored catalog → use「全部项目」in memory only (`needsPersist: false`).
 *   Projects without their own list share the workspace catalog until the user saves.
 */
export function resolveProjectResourceCatalog(
  workspaceId: string,
  _projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  _options?: { projectCode?: string | null },
): { rows: PmResourceRow[]; needsPersist: boolean; usesSharedFallback: boolean } {
  const shared = readSharedResourceCatalog(workspaceId)
  const rawCatalog = metadata?.[PM_RESOURCE_CATALOG_KEY]
  const stored = parseResourceRows(rawCatalog)
  if (stored !== null) {
    const priced = applyDefaultUnitPrices(stored)
    return {
      rows: priced.rows,
      needsPersist: priced.changed || rawCatalogNeedsLegacyRewrite(rawCatalog),
      usesSharedFallback: false,
    }
  }

  return {
    rows: shared.rows.map((row) => ({ ...row })),
    needsPersist: false,
    usesSharedFallback: true,
  }
}

/**
 * Catalog used when assigning resources on a schedule: project list if present,
 * otherwise「全部项目」.
 */
/**
 * Project unit price / 全部项目 unit price.
 * Returns null when either side is missing or baseline is zero.
 */
export function computeResourceBaselineRatio(
  projectUnitPrice: number | null,
  baselineUnitPrice: number | null,
): number | null {
  if (projectUnitPrice == null || !Number.isFinite(projectUnitPrice)) return null
  if (baselineUnitPrice == null || !(baselineUnitPrice > 0)) return null
  return projectUnitPrice / baselineUnitPrice
}

export function formatResourceBaselineRatio(ratio: number): string {
  if (Math.abs(ratio - 1) < 1e-9) return '1'
  const rounded = Math.round(ratio * 1000) / 1000
  return String(rounded)
}

export function isResourceBaselineRatioOff(ratio: number | null): boolean {
  return ratio != null && Math.abs(ratio - 1) > 1e-6
}

/**
 * Project-scope「适用」follows baseline:
 * - baseline ratio === 1 (same unit price as「全部项目」) → 全部项目
 * - otherwise (different price, or no comparable baseline) → this project
 */
export function deriveResourceApplicable(
  row: PmResourceRow,
  baselineIndex: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): string {
  if (!baselineIndex) return projectId
  const ratio = computeResourceBaselineRatio(
    row.unitPrice,
    lookupBaselineUnitPrice(row, baselineIndex),
  )
  if (ratio != null && !isResourceBaselineRatioOff(ratio)) {
    return PM_RESOURCE_APPLICABLE_ALL
  }
  return projectId
}

export function withDerivedResourceApplicable(
  rows: readonly PmResourceRow[],
  baselineIndex: ReturnType<typeof buildBaselinePriceIndex> | null,
  projectId: string,
): PmResourceRow[] {
  return rows.map((row) => {
    const applicable = deriveResourceApplicable(row, baselineIndex, projectId)
    return row.applicable === applicable ? row : { ...row, applicable }
  })
}

export function resolveAssignableResourceCatalog(
  workspaceId: string,
  projectId: string,
  metadata: Record<string, unknown> | null | undefined,
  options?: { projectCode?: string | null },
): PmResourceRow[] {
  return resolveProjectResourceCatalog(workspaceId, projectId, metadata, options).rows
}

function mapRemoteCatalogRow(row: {
  id: string
  type: string
  name: string
  unit: string
  unitPrice: number | null
  applicable: string
  sortOrder: number
  parentId?: string | null
  customTypeName?: unknown
  spec?: unknown
  pricingUnit?: unknown
  note?: unknown
}): PmResourceRow {
  const pricingUnit =
    typeof row.pricingUnit === 'string' && row.pricingUnit.trim() ? row.pricingUnit : ''
  return {
    id: row.id,
    type: row.type as PmResourceType,
    customTypeName: typeof row.customTypeName === 'string' ? row.customTypeName : '',
    name: row.name,
    spec: typeof row.spec === 'string' ? row.spec : '',
    unit: row.unit,
    pricingUnit,
    unitPrice: row.unitPrice,
    applicable: row.applicable || PM_RESOURCE_APPLICABLE_ALL,
    note: typeof row.note === 'string' ? row.note : '',
    sortOrder: row.sortOrder,
    parentId: row.parentId ?? null,
  }
}

/**
 * Pull durable「全部项目」catalog into localStorage when main has a non-default store.
 * If main still has defaults but localStorage already has a saved catalog, push local → main
 * so the agent runtime snapshot can see the same list.
 */
export async function hydrateSharedResourceCatalogFromMain(
  workspaceId: string,
): Promise<PmResourceRow[]> {
  try {
    const { pmApi } = await import('../../pm-api')
    const remote = await pmApi.getSharedResourceCatalog(workspaceId)
    if (!remote.isDefault) {
      const mapped = remote.rows.map(mapRemoteCatalogRow)
      const local = readSharedResourceCatalog(workspaceId)
      const remoteIds = new Set(mapped.map((row) => row.id))
      const localExtras = !local.isDefault
        ? local.rows.filter(
            (row) => !remoteIds.has(row.id) && !isRetiredSharedBudgetDefault(row.type, row.name),
          )
        : []
      const merged = localExtras.length > 0 ? [...mapped, ...localExtras] : mapped
      const stripped = stripRetiredSharedBudgetDefaults(merged)
      const normalized = normalizeResourceCatalogRows(stripped.rows)
      writeSharedResourceCatalog(workspaceId, normalized.rows)
      return normalized.rows
    }

    const local = readSharedResourceCatalog(workspaceId)
    if (!local.isDefault && local.rows.length > 0) {
      const normalized = normalizeResourceCatalogRows(local.rows)
      writeSharedResourceCatalog(workspaceId, normalized.rows)
      return normalized.rows
    }
  } catch {
    // fall through to local
  }
  const local = readSharedResourceCatalog(workspaceId)
  if (!local.isDefault) {
    const normalized = normalizeResourceCatalogRows(local.rows)
    if (normalized.changed) writeSharedResourceCatalog(workspaceId, normalized.rows)
    return normalized.rows
  }
  return local.rows
}
