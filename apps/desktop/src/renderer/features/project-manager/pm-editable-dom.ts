/** True when the event originated from an editable cell (native cut/copy/paste must work). */
export function isPmEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select'))
}

/**
 * Keep-alive panels stay mounted under `.tm-pm-view-hidden`. Shortcut handlers must
 * ignore those hidden roots so only the visible editor receives undo/redo.
 */
export function isPmPanelDomActive(root: HTMLElement | null): boolean {
  if (!root) return false
  if (root.closest('.tm-pm-view-hidden')) return false
  return root.getClientRects().length > 0
}
