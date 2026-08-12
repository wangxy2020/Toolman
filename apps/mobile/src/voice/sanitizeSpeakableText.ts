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

/**
 * Symbols allowed for math / physics / chemistry speech
 * (operators, units, reaction arrows; Greek letters already covered by \p{L}).
 */
const MATH_PHYS_CHEM_SYMBOLS =
  /[+\-−–±∓×÷·･⋅=≈≠≡≤≥<>≤≥*/^_()[\]{}|\\:°%‰√∞∑∫∏∂∆∇℃℉ÅμµΩωπΠΣΔδαβγθλφρτσ→←↑↓⇒⇔⇌↔↦]/u

/** Sentence punctuation kept for natural pauses (not read as “冒号/破折号” noise when doubled). */
const SENTENCE_PUNCT = /[。，、；.!?'"‘’“”…]/u

/**
 * Strip markdown / decorative symbols for TTS.
 * Keep letters, numbers, math·physics·chemistry symbols, and light sentence punctuation.
 * Other symbols (list markers, markdown noise, ornate brackets, etc.) are removed.
 */
export function sanitizeSpeakableText(text: string): string {
  let next = text.replace(/\r\n/g, '\n')

  // Fenced code blocks → drop (often noisy for speech)
  next = next.replace(/```[\s\S]*?```/g, ' ')
  // Inline code — keep inner text (may contain formulas)
  next = next.replace(/`([^`]+)`/g, '$1')
  // Images / links keep label text
  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // Headings / emphasis markers
  next = next.replace(/^#{1,6}\s+/gm, '')
  next = next.replace(/(\*\*|__)(.*?)\1/g, '$2')
  next = next.replace(/(\*|_)(.*?)\1/g, '$2')
  // Strikethrough / leftover md
  next = next.replace(/~~(.*?)~~/g, '$1')

  // List markers at line start
  next = next.replace(/^\s*[-*+•▪▫]\s+/gm, '')
  next = next.replace(/^\s*\d+[.)、]\s+/gm, '')

  // Icons / emoji — never speak
  next = next.replace(EMOJI_RE, ' ')
  next = next.replace(DECORATIVE_ICON_RE, ' ')

  // Structural Chinese colon → brief pause (avoid reading “冒号”)
  next = next.replace(/：/g, '，')
  // Em dashes / decorative dashes → pause
  next = next.replace(/[—―～〜]+/g, '，')

  // Strip remaining symbols that are neither letters/numbers/whitespace,
  // sentence punctuation, nor math/physics/chemistry symbols.
  next = next
    .split('')
    .map((ch) => {
      if (/[\p{L}\p{N}\s]/u.test(ch)) return ch
      if (SENTENCE_PUNCT.test(ch)) return ch
      if (MATH_PHYS_CHEM_SYMBOLS.test(ch)) return ch
      return ' '
    })
    .join('')

  // Drop punctuation-only lines
  next = next
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed || isSpeakableUtterance(trimmed)
    })
    .join('\n')

  next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  next = next.replace(/[ \t]{2,}/g, ' ')
  return next.trim()
}
