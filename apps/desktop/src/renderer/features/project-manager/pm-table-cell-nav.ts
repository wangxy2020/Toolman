/** Arrow-key navigation between spreadsheet-like table / gantt grid cells. */

export type PmCellNavDirection = 'left' | 'right' | 'up' | 'down'

const FOCUSABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
  'select:not([disabled])',
  'button.tm-pm-resource-table-type-trigger:not([disabled])',
  'button.tm-pm-gantt-resource-cell-trigger:not([disabled])',
].join(', ')

const OPEN_MENU_SELECTOR = [
  '.tm-pm-resource-type-cell-menu',
  '.tm-pm-resource-custom-submenu',
  '.tm-pm-gantt-resource-select-menu',
  '.tm-pm-gantt-resource-select-submenu',
  '.tm-pm-gantt-view-panel',
  '.tm-pm-gantt-col-menu',
  '.tm-group-context-menu',
].join(', ')

function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false
  const style = window.getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

function findCell(el: HTMLElement): HTMLElement | null {
  return el.closest('td, th, .tm-pm-gantt-col')
}

function findRow(cell: HTMLElement): HTMLElement | null {
  return cell.closest('tr, .tm-pm-gantt-grid-row')
}

function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

function navigableCellsInRow(row: HTMLElement): HTMLElement[] {
  const cells =
    row.tagName === 'TR'
      ? Array.from(row.querySelectorAll<HTMLElement>(':scope > td, :scope > th'))
      : Array.from(row.querySelectorAll<HTMLElement>(':scope > .tm-pm-gantt-col'))
  return cells.filter((cell) => focusablesIn(cell).length > 0 && isVisible(cell))
}

function navigableRows(row: HTMLElement): HTMLElement[] {
  if (row.tagName === 'TR') {
    const body = row.parentElement
    if (!body) return [row]
    return Array.from(body.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        el.tagName === 'TR' &&
        navigableCellsInRow(el).length > 0 &&
        isVisible(el),
    )
  }
  const body = row.parentElement
  if (!body) return [row]
  return Array.from(body.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.classList.contains('tm-pm-gantt-grid-row') &&
      navigableCellsInRow(el).length > 0 &&
      isVisible(el),
  )
}

function caretAllowsLeave(
  el: HTMLElement,
  direction: PmCellNavDirection,
): boolean {
  if (el instanceof HTMLSelectElement) {
    // Native select uses ↑/↓ to change options.
    return direction === 'left' || direction === 'right'
  }

  if (el instanceof HTMLTextAreaElement) {
    const value = el.value
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (start !== end) return false
    if (direction === 'left') return start === 0
    if (direction === 'right') return start === value.length
    if (direction === 'up') {
      const before = value.slice(0, start)
      return !before.includes('\n')
    }
    if (direction === 'down') {
      const after = value.slice(end)
      return !after.includes('\n')
    }
    return true
  }

  if (el instanceof HTMLInputElement) {
    // Prefer cell movement for number/date (browser steals ↑/↓ for spinning).
    if (el.type === 'number' || el.type === 'date' || el.type === 'time') {
      return true
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start == null || end == null) return true
    if (start !== end) return false
    if (direction === 'left') return start === 0
    if (direction === 'right') return start === el.value.length
    // ↑/↓ always leave single-line text inputs.
    return true
  }

  // Buttons / other focusables: always leave.
  return true
}

function findNeighborFocusable(
  from: HTMLElement,
  direction: PmCellNavDirection,
): HTMLElement | null {
  const cell = findCell(from)
  if (!cell) return null
  const inCell = focusablesIn(cell)
  const idxInCell = inCell.indexOf(from)

  if (direction === 'left' || direction === 'right') {
    if (idxInCell >= 0) {
      const nextInCell = inCell[idxInCell + (direction === 'right' ? 1 : -1)]
      if (nextInCell) return nextInCell
    }
    const row = findRow(cell)
    if (!row) return null
    const cells = navigableCellsInRow(row)
    const cellIdx = cells.indexOf(cell)
    if (cellIdx < 0) return null
    const nextCell = cells[cellIdx + (direction === 'right' ? 1 : -1)]
    if (!nextCell) return null
    const nextFocusables = focusablesIn(nextCell)
    if (nextFocusables.length === 0) return null
    return direction === 'right'
      ? nextFocusables[0]!
      : nextFocusables[nextFocusables.length - 1]!
  }

  const row = findRow(cell)
  if (!row) return null
  const rows = navigableRows(row)
  const rowIdx = rows.indexOf(row)
  if (rowIdx < 0) return null
  const nextRow = rows[rowIdx + (direction === 'down' ? 1 : -1)]
  if (!nextRow) return null
  const cells = navigableCellsInRow(row)
  const cellIdx = cells.indexOf(cell)
  const nextCells = navigableCellsInRow(nextRow)
  if (nextCells.length === 0) return null
  const targetCell =
    cellIdx >= 0
      ? (nextCells[Math.min(cellIdx, nextCells.length - 1)] ?? null)
      : nextCells[0]!
  if (!targetCell) return null
  const nextFocusables = focusablesIn(targetCell)
  if (nextFocusables.length === 0) return null
  const prefer = idxInCell >= 0 ? idxInCell : 0
  return nextFocusables[Math.min(prefer, nextFocusables.length - 1)]!
}

function keyToDirection(key: string): PmCellNavDirection | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

/**
 * Handle arrow keys for cell-to-cell focus movement.
 * Returns true when the event was handled (caller should preventDefault).
 */
export function handlePmTableCellNavKeyDown(
  event: Pick<
    KeyboardEvent,
    'key' | 'target' | 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey'
  > & { preventDefault: () => void },
): boolean {
  if (event.altKey || event.metaKey || event.ctrlKey) return false
  const direction = keyToDirection(event.key)
  if (!direction) return false

  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (!target.matches(FOCUSABLE_SELECTOR) && !target.closest(FOCUSABLE_SELECTOR)) {
    return false
  }
  const focusEl =
    target.matches(FOCUSABLE_SELECTOR)
      ? target
      : (target.closest(FOCUSABLE_SELECTOR) as HTMLElement | null)
  if (!focusEl) return false

  if (document.querySelector(OPEN_MENU_SELECTOR)) return false
  if (!caretAllowsLeave(focusEl, direction)) return false

  const next = findNeighborFocusable(focusEl, direction)
  if (!next || next === focusEl) return false

  event.preventDefault()
  next.focus()
  if (
    (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) &&
    typeof next.select === 'function' &&
    next.type !== 'number' &&
    next.type !== 'date' &&
    next.type !== 'time' &&
    (direction === 'up' || direction === 'down')
  ) {
    try {
      next.select()
    } catch {
      // Some input types throw on select().
    }
  }
  return true
}
