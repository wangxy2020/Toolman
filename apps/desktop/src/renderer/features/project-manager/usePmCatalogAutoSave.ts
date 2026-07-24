import { useEffect, useRef } from 'react'

/**
 * Flush dirty catalog edits when the edit scope changes or the panel unmounts
 * (e.g. switching sidebar menus / projects).
 *
 * Only `scopeKey` rebinds the effect. `flush` is sampled at effect setup so a
 * project switch still persists against the previous scope.
 */
export function usePmCatalogAutoSave(options: {
  scopeKey: string
  dirty: boolean
  /** Persist dirty rows for the active scope. Avoid setState (may run after unmount). */
  flush: () => void | Promise<void>
}): void {
  const dirtyRef = useRef(options.dirty)
  const latestFlushRef = useRef(options.flush)
  dirtyRef.current = options.dirty
  latestFlushRef.current = options.flush

  useEffect(() => {
    const flushForScope = latestFlushRef.current
    return () => {
      if (!dirtyRef.current) return
      try {
        void flushForScope()
      } catch {
        // Best-effort leave save.
      }
    }
    // Intentionally only scopeKey: flush identity churn (e.g. projects reload) must not re-flush.
  }, [options.scopeKey])
}
