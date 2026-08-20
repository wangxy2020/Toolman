const lastWarnAt = new Map<string, number>()
const DEFAULT_THROTTLE_MS = 30_000

/** Swallow background-task failures; surface them in development, throttled. */
export function ignoreAsyncError(
  task: Promise<unknown>,
  label: string,
  options?: { throttleMs?: number },
): void {
  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS
  void task.catch((error) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return
    const message = error instanceof Error ? error.message : String(error)
    const key = `${label}:${message}`
    const now = Date.now()
    const previous = lastWarnAt.get(key) ?? 0
    if (now - previous < throttleMs) return
    lastWarnAt.set(key, now)
    console.warn(`[toolman] ${label}`, error)
  })
}
