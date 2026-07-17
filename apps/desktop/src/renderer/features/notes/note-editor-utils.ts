export function detectSlashQuery(
  value: string,
  cursor: number,
): { query: string; replaceStart: number } | null {
  const before = value.slice(0, cursor)
  const match = before.match(/(^|\n)\/([^\n]*)$/)
  if (!match || match.index === undefined) return null
  const query = `/${match[2] ?? ''}`
  const replaceStart = match.index + (match[1] === '\n' ? 1 : 0)
  return { query, replaceStart }
}

export function countNoteCharacters(title: string, content: string): number {
  return [...`${title}${content}`].length
}

export function syncTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px'
  textarea.style.height = `${textarea.scrollHeight}px`
}
