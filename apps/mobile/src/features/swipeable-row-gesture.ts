export function isHorizontalSwipe(dx: number, dy: number, minDx = 4): boolean {
  return Math.abs(dx) >= minDx && Math.abs(dx) > Math.abs(dy)
}

/** Snap open after a short left drag so mouse users do not need to cross half the action width. */
export function shouldRevealSwipeActions(options: {
  translateX: number
  velocityX: number
  actionsWidth: number
}): boolean {
  const { translateX, velocityX, actionsWidth } = options
  if (actionsWidth <= 0) return false
  const opened = Math.max(0, -translateX)
  const distanceThreshold = Math.min(24, Math.max(16, actionsWidth * 0.12))
  return velocityX < -0.05 || opened >= distanceThreshold
}

export function asDomElement(node: unknown): HTMLElement | null {
  if (!node || typeof HTMLElement === 'undefined') return null
  if (node instanceof HTMLElement) return node
  if (typeof node !== 'object') return null
  const record = node as { _nativeNode?: unknown; getNode?: () => unknown }
  if (record._nativeNode instanceof HTMLElement) return record._nativeNode
  if (typeof record.getNode === 'function') {
    const inner = record.getNode()
    if (inner instanceof HTMLElement) return inner
  }
  return null
}
