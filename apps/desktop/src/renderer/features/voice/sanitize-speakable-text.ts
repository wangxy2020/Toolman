/** Light cleanup so TTS does not read raw markdown / code fences aloud. */
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
  // Collapse whitespace
  next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return next.trim()
}
