import {
  canonicalizeResourceName,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog-types'
import { applyDefaultUnitPrices, reindexResourceRows } from './pm-resource-catalog-rows'

/** Names that belong under「辅材」even if older catalogs stored them as material. */
const AUXILIARY_RESOURCE_NAMES: ReadonlySet<string> = new Set(['模板', '方木', '脚手架'])

/** Legacy「资金」named rows that become dedicated budget types. */
const BUDGET_TYPE_BY_NAME: Readonly<Record<string, PmResourceType>> = {
  投资估算: 'investment',
  设计概算: 'designEstimate',
  施工预算: 'constructionBudget',
  成本预算: 'costBudget',
}

/**
 * Move formwork / timber / scaffold into「辅材」and drop duplicate material rows.
 */
export function applyAuxiliaryResourceMigration(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const result: PmResourceRow[] = []
  const seenAuxiliary = new Set<string>()

  for (const row of rows) {
    const name = canonicalizeResourceName(row.name)
    if (!AUXILIARY_RESOURCE_NAMES.has(name)) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }

    if (seenAuxiliary.has(name)) {
      changed = true
      continue
    }
    seenAuxiliary.add(name)
    if (row.type !== 'auxiliary' || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: 'auxiliary' })
    } else {
      result.push(row)
    }
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: result, changed: true }
}

/**
 * Promote legacy funds rows (投资估算等) into dedicated budget resource types.
 */
export function applyBudgetTypeMigration(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const result: PmResourceRow[] = []
  const seenBudget = new Set<string>()

  for (const row of rows) {
    const name = canonicalizeResourceName(row.name)
    const budgetType = BUDGET_TYPE_BY_NAME[name]
    if (!budgetType) {
      if (name !== row.name.trim()) {
        changed = true
        result.push({ ...row, name })
      } else {
        result.push(row)
      }
      continue
    }

    if (seenBudget.has(budgetType)) {
      changed = true
      continue
    }
    seenBudget.add(budgetType)
    if (row.type !== budgetType || name !== row.name.trim()) {
      changed = true
      result.push({ ...row, name, type: budgetType })
    } else {
      result.push(row)
    }
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: result, changed: true }
}

export function rawCatalogNeedsLegacyRewrite(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false
    const row = entry as { name?: unknown; type?: unknown; unit?: unknown; pricingUnit?: unknown }
    const name = typeof row.name === 'string' ? row.name : ''
    const canonical = canonicalizeResourceName(name)
    if (canonical !== name.trim()) return true
    if (row.type === 'labor' && typeof row.unit === 'string' && row.unit.trim() === '工日') return true
    if (row.type === 'labor' && typeof row.pricingUnit === 'string' && row.pricingUnit.trim() === '人') {
      return true
    }
    const unit = typeof row.unit === 'string' ? row.unit.trim() : ''
    if (
      (row.type === 'equipment' || row.type === 'device' || row.type === 'instrument') &&
      unit === '台班'
    ) {
      return true
    }
    if (row.type === 'instrument' && unit === '天') return true
    if (typeof row.pricingUnit !== 'string') return true
    if (canonical && AUXILIARY_RESOURCE_NAMES.has(canonical) && row.type !== 'auxiliary') return true
    const budgetType = BUDGET_TYPE_BY_NAME[canonical]
    return Boolean(budgetType && row.type !== budgetType)
  })
}

/**
 * Rename aliased resource names and drop duplicates created by the rename
 * (prefer the first row for each type+name).
 */
export function applyResourceNameAliases(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const nextName = canonicalizeResourceName(row.name)
    if (nextName !== row.name) {
      changed = true
      return { ...row, name: nextName }
    }
    return row
  })

  const seen = new Set<string>()
  const deduped: PmResourceRow[] = []
  for (const row of mapped) {
    const name = row.name.trim()
    if (!name) {
      deduped.push(row)
      continue
    }
    const key = `${row.type}::${name}`
    if (seen.has(key)) {
      changed = true
      continue
    }
    seen.add(key)
    deduped.push(row)
  }

  if (!changed) return { rows: [...rows], changed: false }
  return { rows: reindexResourceRows(deduped), changed: true }
}

/** Labor measurement unit is headcount — normalize legacy 工日 → 人 (not pricing). */
export function canonicalizeLaborUnit(type: PmResourceType, unit: string): string {
  if (type !== 'labor') return unit
  return unit.trim() === '工日' ? '人' : unit
}

export function applyLaborUnitAliases(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const nextUnit = canonicalizeLaborUnit(row.type, row.unit)
    if (nextUnit !== row.unit) {
      changed = true
      return { ...row, unit: nextUnit }
    }
    return row
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

/**
 * Labor pricing is per 工日. Rewrite legacy synced「人」pricing units.
 * Machine types: measurement「台班」/「天」→「台」, keep旧值 as pricing when synced.
 */
export function applyResourceUnitConventions(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    let next = row

    if (row.type === 'labor') {
      const pricing = row.pricingUnit.trim()
      if (!pricing || pricing === '人') {
        next = { ...next, pricingUnit: '工日' }
      }
    }

    if (row.type === 'equipment' || row.type === 'device' || row.type === 'instrument') {
      const measure = next.unit.trim()
      const shouldRewriteMeasure =
        measure === '台班' || (row.type === 'instrument' && measure === '天')
      if (shouldRewriteMeasure) {
        const pricing = next.pricingUnit.trim()
        next = {
          ...next,
          unit: '台',
          pricingUnit: !pricing || pricing === measure ? '台班' : pricing,
        }
      }
    }

    if (next.unit !== row.unit || next.pricingUnit !== row.pricingUnit) {
      changed = true
    }
    return next
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

/** Apply name / measure / pricing-unit conventions used when reading catalogs. */
export function normalizeResourceCatalogRows(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  const aliased = applyResourceNameAliases(rows)
  const auxiliary = applyAuxiliaryResourceMigration(aliased.rows)
  const budget = applyBudgetTypeMigration(auxiliary.rows)
  const measured = applyLaborUnitAliases(budget.rows)
  const conventioned = applyResourceUnitConventions(measured.rows)
  const pricedUnits = applyDefaultPricingUnits(conventioned.rows)
  const priced = applyDefaultUnitPrices(pricedUnits.rows)
  return {
    rows: priced.rows,
    changed:
      aliased.changed ||
      auxiliary.changed ||
      budget.changed ||
      measured.changed ||
      conventioned.changed ||
      pricedUnits.changed ||
      priced.changed,
  }
}

/** Fill missing/blank pricing units from type conventions. */
export function applyDefaultPricingUnits(
  rows: readonly PmResourceRow[],
): { rows: PmResourceRow[]; changed: boolean } {
  let changed = false
  const mapped = rows.map((row) => {
    const pricing = row.pricingUnit.trim()
    if (pricing) return row
    changed = true
    const fallback =
      row.type === 'labor'
        ? '工日'
        : row.type === 'equipment' || row.type === 'device' || row.type === 'instrument'
          ? '台班'
          : row.unit
    return { ...row, pricingUnit: fallback }
  })
  if (!changed) return { rows: [...rows], changed: false }
  return { rows: mapped, changed: true }
}

