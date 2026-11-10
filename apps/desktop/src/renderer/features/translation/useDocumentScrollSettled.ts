import { useEffect, useState, type RefObject } from 'react'

/** True after scroll stops long enough to allow sharp PDF upgrades and right-pane fit. */
export const DOCUMENT_SCROLL_SETTLE_MS = 140

export function useDocumentScrollSettled(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  settleMs = DOCUMENT_SCROLL_SETTLE_MS,
): boolean {
  const [settled, setSettled] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setSettled(true)
      return
    }
    const root = scrollRootRef.current
    if (!root) return

    let timer = 0
    const onScroll = () => {
      setSettled(false)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        setSettled(true)
      }, settleMs)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
    }
  }, [enabled, scrollRootRef, settleMs])

  return settled
}
