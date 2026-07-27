/** Pure helpers for ProjectResourceTablePanel — no React, no module-level state. */

import type { readResourceVersionCatalog } from '@toolman/shared'

import type { ResourcePracticeQuotaView } from '../files/ProjectFeaturesMenuBar'
import type { ResourceViewFilter } from './ProjectResourceMenuBar'
import {
  buildBaselinePriceIndex,
  computeResourceBaselineRatio,
  encodeCustomTypeSelectValue,
  formatResourceBaselineRatio,
  isPmResourceType,
  isResourceBaselineRatioOff,
  lookupBaselineUnitPrice,
  parseCustomResourceViewFilter,
  type PmResourceRow,
  type PmResourceType,
} from './pm-resource-catalog'

/** Resolve the type (and custom-type name) used for newly added/inserted rows from the active view filter. */
export function resolveAddType(
  viewFilter: ResourceViewFilter,
  selectedType: PmResourceType,
  selectedCustomTypeName: string,
): { addType: PmResourceType; addCustomTypeName: string } {
  const viewCustomName = parseCustomResourceViewFilter(viewFilter)
  const addType: PmResourceType =
    viewFilter === 'all'
      ? selectedType
      : viewCustomName != null
        ? 'custom'
        : isPmResourceType(viewFilter)
          ? viewFilter
          : selectedType
  const addCustomTypeName =
    viewCustomName != null ? viewCustomName : addType === 'custom' ? selectedCustomTypeName : ''
  return { addType, addCustomTypeName }
}

/** `<select>` value for a row's type, encoding named custom types distinctly from the bare `custom` option. */
export function typeSelectValueForRow(row: Pick<PmResourceRow, 'type' | 'customTypeName'>): string {
  if (row.type === 'custom') {
    const name = row.customTypeName.trim()
    return name ? encodeCustomTypeSelectValue(name) : 'custom'
  }
  return row.type
}

/** Practice variant only exposes labor/material/equipment quota views; anything else falls back to labor. */
export function resolvePracticeQuotaView(viewFilter: ResourceViewFilter): ResourcePracticeQuotaView {
  return viewFilter === 'material' || viewFilter === 'equipment' ? viewFilter : 'labor'
}

/** Expand a delete request to include descendants whose parent chain is also being removed. */
export function expandDeleteIds(rows: PmResourceRow[], ids: Set<string>): Set<string> {
  const remove = new Set(ids)
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (remove.has(row.id)) continue
      if (row.parentId && remove.has(row.parentId)) {
        remove.add(row.id)
        changed = true
      }
    }
  }
  return remove
}

/** Convert a saved version snapshot back into editable rows (pricing-unit rules differ for the practice variant). */
export function snapshotToRows(
  snapshot: NonNullable<ReturnType<typeof readResourceVersionCatalog>>,
  isPractice: boolean,
): PmResourceRow[] {
  return snapshot
    .filter((row) => isPmResourceType(row.type))
    .map((row) => {
      const rawPricing = row.pricingUnit?.trim() ?? ''
      const pricingUnit = isPractice
        ? rawPricing !== '' && Number.isFinite(Number(rawPricing))
          ? rawPricing
          : ''
        : rawPricing
          ? rawPricing
          : row.unit
      return {
        id: row.id,
        type: row.type as PmResourceType,
        customTypeName: row.customTypeName ?? '',
        name: row.name,
        spec: row.spec ?? '',
        unit: row.unit,
        pricingUnit,
        unitPrice: row.unitPrice,
        applicable: row.applicable,
        note: row.note ?? '',
        sortOrder: row.sortOrder,
        parentId: row.parentId,
      }
    })
}

export type ResourceBaselineDisplay = {
  ratio: number | null
  label: string
  off: boolean
}

/** Derive the baseline-price ratio label/flag shown in the baseline column for a row. */
export function computeResourceBaselineDisplay(
  row: PmResourceRow,
  baselinePriceIndex: ReturnType<typeof buildBaselinePriceIndex> | null,
  isAllScope: boolean,
): ResourceBaselineDisplay {
  const ratio = isAllScope
    ? 1
    : computeResourceBaselineRatio(
        row.unitPrice,
        baselinePriceIndex ? lookupBaselineUnitPrice(row, baselinePriceIndex) : null,
      )
  const label = ratio == null ? '—' : formatResourceBaselineRatio(ratio)
  const off = !isAllScope && isResourceBaselineRatioOff(ratio)
  return { ratio, label, off }
}

export type MenuViewport = { width: number; height: number }

/** Position a context menu near the pointer, flipping to stay inside the viewport. */
export function computeRowContextMenuPosition(
  clientX: number,
  clientY: number,
  viewport: MenuViewport,
  options?: { menuWidth?: number; menuHeight?: number; margin?: number },
): { left: number; top: number } {
  const margin = options?.margin ?? 8
  const menuWidth = options?.menuWidth ?? 200
  const menuHeight = options?.menuHeight ?? 160
  let left = clientX
  let top = clientY
  if (left + menuWidth > viewport.width - margin) {
    left = Math.max(margin, clientX - menuWidth)
  }
  if (top + menuHeight > viewport.height - margin) {
    top = Math.max(margin, clientY - menuHeight)
  }
  return { left, top }
}

/** Position the column-visibility menu near the pointer, flipping to stay inside the viewport. */
export function computeColumnMenuPosition(
  clientX: number,
  clientY: number,
  viewport: MenuViewport,
  options?: { menuWidth?: number; menuHeight?: number; boundary?: number; gap?: number },
): { left: number; top: number } {
  const boundary = options?.boundary ?? 8
  const gap = options?.gap ?? 4
  const menuWidth = options?.menuWidth ?? 200
  const menuHeight = options?.menuHeight ?? 280
  let left = clientX + gap
  let top = clientY + gap
  if (left + menuWidth > viewport.width - boundary) {
    left = Math.max(boundary, clientX - menuWidth - gap)
  }
  if (top + menuHeight > viewport.height - boundary) {
    top = Math.max(boundary, clientY - menuHeight)
  }
  return { left, top }
}

/** Re-clamp an already-rendered menu (known width/height) fully inside the viewport. */
export function clampRenderedMenuToViewport(
  rect: { left: number; top: number; width: number; height: number },
  viewport: MenuViewport,
  margin = 8,
): { left: number; top: number } {
  let left = rect.left
  let top = rect.top
  if (left + rect.width > viewport.width - margin) {
    left = Math.max(margin, viewport.width - rect.width - margin)
  }
  if (top + rect.height > viewport.height - margin) {
    top = Math.max(margin, rect.top - rect.height)
  }
  top = Math.max(margin, Math.min(top, viewport.height - rect.height - margin))
  left = Math.max(margin, Math.min(left, viewport.width - rect.width - margin))
  return { left, top }
}
