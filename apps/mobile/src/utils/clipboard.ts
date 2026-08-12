import { Platform } from 'react-native'

/** Best-effort clipboard for Expo web + native (no extra dependency). */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.trim()
  if (!value) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fall through
  }
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const el = document.createElement('textarea')
      el.value = value
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
  return false
}
