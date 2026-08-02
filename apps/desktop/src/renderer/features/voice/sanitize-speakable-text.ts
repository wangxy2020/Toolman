/** True when text has at least one letter/number worth speaking (not bare punctuation). */
export function isSpeakableUtterance(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return /[\p{L}\p{N}]/u.test(trimmed)
}

/** Emoji / pictograph sequences (including ZWJ and variation selectors). */
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu

/** Decorative list/icon glyphs models often insert (should not be spoken). */
const DECORATIVE_ICON_RE = /[●○◆◇■□▪▫▶►◀◄★☆✓✔✕✖✗✘➤‣⁃♦♠♣♥※]+/g

/** Light cleanup so TTS does not read raw markdown / code fences / emoji aloud. */
export function sanitizeSpeakableText(text: string): string {
  let next = text.replace(/\r\n/g, '\n')
  // Fenced code blocks → short placeholder
  next = next.replace(/```[\s\S]*?```/g, ' ')
  // Inline code
  next = next.replace(/`([^`]+)`/g, '$1')
  // Images / links keep label text
  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // Headings / emphasis markers
  next = next.replace(/^#{1,6}\s+/gm, '')
  next = next.replace(/(\*\*|__)(.*?)\1/g, '$2')
  next = next.replace(/(\*|_)(.*?)\1/g, '$2')
  // Icons / emoji — never speak
  next = next.replace(EMOJI_RE, ' ')
  next = next.replace(DECORATIVE_ICON_RE, ' ')
  // Drop punctuation-only lines (avoids a final “句号” utterance)
  next = next
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed || isSpeakableUtterance(trimmed)
    })
    .join('\n')
  // Collapse whitespace
  next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  next = next.replace(/[ \t]{2,}/g, ' ')
  return next.trim()
}
