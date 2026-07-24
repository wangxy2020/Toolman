import { useEffect, useState } from 'react'

export type PmStatusFeedbackTone = 'success' | 'info' | 'muted' | 'error'

export type PmStatusFeedback = {
  text: string
  tone: PmStatusFeedbackTone
}

/** Transient status-bar message that auto-clears after `clearMs`. */
export function usePmStatusFeedback(clearMs = 4500) {
  const [feedback, setFeedback] = useState<PmStatusFeedback | null>(null)

  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => setFeedback(null), clearMs)
    return () => window.clearTimeout(id)
  }, [feedback, clearMs])

  return [feedback, setFeedback] as const
}
