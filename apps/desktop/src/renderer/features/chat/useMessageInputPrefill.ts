import { useEffect } from 'react'
import type { PendingAttachment } from './chat-attachments'

export function useMessageInputPrefill({
  prefillText,
  prefillAttachments,
  prefillRevision = 0,
  onPrefillConsumed,
  setText,
  setPendingAttachments,
  textareaRef,
}: {
  prefillText?: string | null
  prefillAttachments?: PendingAttachment[] | null
  prefillRevision?: number
  onPrefillConsumed?: () => void
  setText: (value: string) => void
  setPendingAttachments: (attachments: PendingAttachment[]) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  useEffect(() => {
    if (prefillRevision <= 0) return
    if (prefillText == null && !prefillAttachments?.length) return

    if (prefillText != null) {
      setText(prefillText)
    }
    if (prefillAttachments?.length) {
      setPendingAttachments(prefillAttachments)
    }
    textareaRef.current?.focus()
    onPrefillConsumed?.()
  }, [
    onPrefillConsumed,
    prefillAttachments,
    prefillRevision,
    prefillText,
    setPendingAttachments,
    setText,
    textareaRef,
  ])
}
