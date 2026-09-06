import { useEffect, useState } from 'react'
import { PARSE_BODY_RICH_MS } from './document-page-preview-policy'

/** Upgrade to markdown only after the left preview is ready and the cheap body is on screen. */
export function useDeferredRichParsePage(attachPage: number | null): number | null {
  const [richPage, setRichPage] = useState<number | null>(null)

  useEffect(() => {
    if (attachPage == null) {
      setRichPage(null)
      return
    }
    const timer = window.setTimeout(() => {
      setRichPage(attachPage)
    }, PARSE_BODY_RICH_MS)
    return () => window.clearTimeout(timer)
  }, [attachPage])

  return richPage
}
