/** Pure helpers local to `ProjectCostTablePanel` (not shared across other panels). */

import type { readCostVersionCatalog } from '@toolman/shared'

import { isPmCostType, type PmCostRow, type PmCostType } from './pm-cost-catalog'

/** Grow feature-description textareas to fit wrapped content (Excel-like row height). */
export function syncFeatureDescriptionHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`
}

/** Map a saved-version snapshot back into editable cost rows. */
export function snapshotToRows(
  snapshot: NonNullable<ReturnType<typeof readCostVersionCatalog>>,
): PmCostRow[] {
  return snapshot
    .filter((row) => isPmCostType(row.type))
    .map((row) => ({
      id: row.id,
      type: row.type as PmCostType,
      code: row.code ?? '',
      name: row.name,
      featureDescription: row.featureDescription ?? '',
      unit: row.unit,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      applicable: row.applicable,
      note: row.note ?? '',
      sectionalWork: row.sectionalWork ?? '',
      sectionCode: row.sectionCode ?? '',
      sectionNote: row.sectionNote ?? '',
      sectionName: row.sectionName ?? '',
      sectionFeatureDescription: row.sectionFeatureDescription ?? '',
      sectionTotalFormula: row.sectionTotalFormula ?? '',
      sortOrder: row.sortOrder,
      parentId: row.parentId,
    }))
}

/** Map a horizontal-track pointer ratio (0-1) to `scrollLeft`, honoring thumb size. */
export function scrollLeftForThumbRatio(
  el: { scrollWidth: number; clientWidth: number },
  ratio: number,
): number {
  const thumbSize = Math.min(1, el.clientWidth / el.scrollWidth)
  const travel = 1 - thumbSize
  const clamped = Math.max(0, Math.min(travel, ratio))
  const maxScroll = el.scrollWidth - el.clientWidth
  return travel <= 0 ? 0 : (clamped / travel) * maxScroll
}

export type PmCostPanelMenuPosition = { left: number; top: number }
export type PmCostPanelViewportSize = { width: number; height: number }

/** Position for the column-visibility menu (opens near the cursor, flips to fit). */
export function computeColumnMenuPosition(
  clientX: number,
  clientY: number,
  viewport: PmCostPanelViewportSize,
): PmCostPanelMenuPosition {
  const menuWidth = 200
  const menuHeight = 280
  const gap = 4
  const margin = 8
  let left = clientX + gap
  let top = clientY + gap
  if (left + menuWidth > viewport.width - margin) {
    left = Math.max(margin, clientX - menuWidth - gap)
  }
  if (top + menuHeight > viewport.height - margin) {
    top = Math.max(margin, clientY - menuHeight)
  }
  return { left, top }
}

/** Position for the row context menu (opens at the cursor, flips to fit). */
export function computeRowContextMenuPosition(
  clientX: number,
  clientY: number,
  viewport: PmCostPanelViewportSize,
): PmCostPanelMenuPosition {
  const menuWidth = 200
  const menuHeight = 160
  const margin = 8
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

/** Re-clamp an already-positioned menu once its measured size is known. */
export function clampMenuToViewport(
  position: PmCostPanelMenuPosition,
  size: { width: number; height: number },
  viewport: PmCostPanelViewportSize,
  margin = 8,
): PmCostPanelMenuPosition {
  let { left, top } = position
  if (left + size.width > viewport.width - margin) {
    left = Math.max(margin, viewport.width - size.width - margin)
  }
  if (top + size.height > viewport.height - margin) {
    top = Math.max(margin, position.top - size.height)
  }
  top = Math.max(margin, Math.min(top, viewport.height - size.height - margin))
  left = Math.max(margin, Math.min(left, viewport.width - size.width - margin))
  return { left, top }
}
