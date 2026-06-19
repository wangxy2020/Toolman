import { useCallback, useState } from 'react'

export function useCopyFeedback(timeoutMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = useCallback(
    async (key: string, text: string) => {
      const value = text.trim()
      if (!value) return false

      try {
        await navigator.clipboard.writeText(value)
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current))
      }, timeoutMs)
      return true
    },
    [timeoutMs],
  )

  return { copiedKey, copy, isCopied: (key: string) => copiedKey === key }
}
