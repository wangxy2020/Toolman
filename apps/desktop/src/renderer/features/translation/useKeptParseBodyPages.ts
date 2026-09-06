import { useEffect, useRef, useState } from 'react'
import { resolveKeptParseBodyPages } from './document-page-preview-policy'

/** Remember pages whose saved body is already mounted until they leave the window. */
export function useKeptParseBodyPages(
  startPage: number,
  endPage: number,
  attachingPage: number | null,
  resetKey: string | null = null,
): number[] {
  const [kept, setKept] = useState<number[]>([])
  const resetKeyRef = useRef(resetKey)

  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey
    if (kept.length > 0) setKept([])
  }

  useEffect(() => {
    setKept((previous) => resolveKeptParseBodyPages(startPage, endPage, previous, attachingPage))
  }, [attachingPage, endPage, startPage, resetKey])

  return kept
}
