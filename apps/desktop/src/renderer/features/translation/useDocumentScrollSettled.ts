import { useEffect, useState, type RefObject } from 'react'
import { setDocumentScrollBusy } from './document-scroll-gate'

/**
 * True after scroll stops long enough to allow left-pane preview loads.
 * Sharp upgrades add their own extra delay; this gate only blocks mid-fling IPC.
 *
 * Ignore sub-pixel / layout-fit scroll jitter so right-pane fit after a page
 * flip cannot keep the gate busy forever (that blocked sharp on page 2+).
 */
export const DOCUMENT_SCROLL_SETTLE_MS = 220
const SCROLL_JITTER_PX = 2.5

export function useDocumentScrollSettled(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  settleMs = DOCUMENT_SCROLL_SETTLE_MS,
): boolean {
  const [settled, setSettled] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setSettled(true)
      setDocumentScrollBusy(false)
      return
    }
    const root = scrollRootRef.current
    if (!root) return

    let timer = 0
    let lastTop = root.scrollTop
    const onScroll = () => {
      const top = root.scrollTop
      if (Math.abs(top - lastTop) < SCROLL_JITTER_PX) {
        lastTop = top
        return
      }
      lastTop = top
      setSettled(false)
      setDocumentScrollBusy(true)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        setSettled(true)
        setDocumentScrollBusy(false)
      }, settleMs)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
      setDocumentScrollBusy(false)
    }
  }, [enabled, scrollRootRef, settleMs])

  return settled
}
