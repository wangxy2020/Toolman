/** Cross-cutting gate so parse apply / heavy preview work yield while the user scrolls. */

let scrollBusy = false
const waiters = new Set<() => void>()

export function setDocumentScrollBusy(busy: boolean): void {
  scrollBusy = busy
  if (!busy) {
    for (const resume of waiters) resume()
    waiters.clear()
  }
}

export function isDocumentScrollBusy(): boolean {
  return scrollBusy
}

/** Resolve on the next idle stretch (or immediately if not scrolling). */
export function waitForDocumentScrollIdle(pollMs = 50): Promise<void> {
  if (!scrollBusy) return Promise.resolve()
  return new Promise((resolve) => {
    const resume = () => {
      window.clearInterval(timer)
      waiters.delete(resume)
      resolve()
    }
    waiters.add(resume)
    const timer = window.setInterval(() => {
      if (!scrollBusy) resume()
    }, pollMs)
  })
}
