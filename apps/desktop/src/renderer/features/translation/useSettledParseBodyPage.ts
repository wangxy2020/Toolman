import { useEffect, useRef, useState } from 'react'
import { PARSE_BODY_SETTLE_MS } from './document-page-preview-policy'

/** First paint of a document is settled immediately; later page turns wait for scroll to stop. */
export function useSettledParseBodyPage(
  isPdf: boolean,
  currentPage: number,
  documentId: string | null,
): number | null {
  const [settledPage, setSettledPage] = useState<number | null>(currentPage)
  const documentIdRef = useRef(documentId)

  if (documentIdRef.current !== documentId) {
    documentIdRef.current = documentId
    if (settledPage !== currentPage) {
      setSettledPage(currentPage)
    }
  }

  useEffect(() => {
    if (!isPdf) {
      setSettledPage(currentPage)
      return
    }

    let alreadySettled = false
    setSettledPage((previous) => {
      alreadySettled = previous === currentPage
      return alreadySettled ? previous : null
    })
    if (alreadySettled) return

    const timer = window.setTimeout(() => {
      setSettledPage(currentPage)
    }, PARSE_BODY_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [currentPage, documentId, isPdf])

  return settledPage
}
