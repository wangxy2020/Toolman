export type EditResult = {
  next: string
  cursorStart?: number
  cursorEnd?: number
  cursor?: number
}

export function getCurrentLine(textarea: HTMLTextAreaElement): {
  lineStart: number
  lineEnd: number
  line: string
  cursor: number
} {
  const cursor = textarea.selectionStart
  const value = textarea.value
  const lineStart = value.lastIndexOf('\n', cursor - 1) + 1
  const lineEndIndex = value.indexOf('\n', cursor)
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
  return {
    lineStart,
    lineEnd,
    line: value.slice(lineStart, lineEnd),
    cursor,
  }
}

export function stripLinePrefix(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^- \[[xX ]\]\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
}

export function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = '文本',
): EditResult {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end) || placeholder
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
  const cursorStart = start + before.length
  const cursorEnd = cursorStart + selected.length
  return { next, cursorStart, cursorEnd }
}

export function toggleWrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = '文本',
): EditResult {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end)

  if (selected.length > 0) {
    if (selected.startsWith(before) && selected.endsWith(after)) {
      const inner = selected.slice(before.length, selected.length - after.length)
      return {
        next: `${value.slice(0, start)}${inner}${value.slice(end)}`,
        cursorStart: start,
        cursorEnd: start + inner.length,
      }
    }
    return wrapSelection(textarea, before, after, placeholder)
  }

  const beforeText = value.slice(Math.max(0, start - before.length), start)
  const afterText = value.slice(end, end + after.length)
  if (beforeText === before && afterText === after) {
    const innerStart = start - before.length
    const innerEnd = end + after.length
    return {
      next: `${value.slice(0, innerStart)}${value.slice(innerEnd)}`,
      cursor: innerStart,
    }
  }

  return wrapSelection(textarea, before, after, placeholder)
}

export function insertAtCursor(textarea: HTMLTextAreaElement, text: string): EditResult {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`
  return { next, cursor: start + text.length }
}

export function setLinePrefix(
  textarea: HTMLTextAreaElement,
  prefix: string,
  options?: { toggle?: boolean },
): EditResult {
  const { lineStart, lineEnd, line, cursor } = getCurrentLine(textarea)
  const value = textarea.value
  const stripped = stripLinePrefix(line)

  if (options?.toggle && line.startsWith(prefix)) {
    const next = `${value.slice(0, lineStart)}${stripped}${value.slice(lineEnd)}`
    const offset = cursor - lineStart
    return { next, cursor: lineStart + Math.min(offset - prefix.length, stripped.length) }
  }

  const nextLine = `${prefix}${stripped}`
  const next = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
  const offset = cursor - lineStart
  return { next, cursor: lineStart + prefix.length + Math.min(offset, stripped.length) }
}

export function clearLinePrefix(textarea: HTMLTextAreaElement): EditResult {
  const { lineStart, lineEnd, line, cursor } = getCurrentLine(textarea)
  const value = textarea.value
  const cleaned = stripLinePrefix(line)
  const next = `${value.slice(0, lineStart)}${cleaned}${value.slice(lineEnd)}`
  const offset = cursor - lineStart
  return { next, cursor: lineStart + Math.min(offset, cleaned.length) }
}

export function getOrderedListPrefix(value: string, lineStart: number): string {
  const before = value.slice(0, lineStart)
  const lines = before.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? ''
    const match = line.match(/^(\d+)\.\s/)
    if (match) {
      return `${Number(match[1]) + 1}. `
    }
    if (line.trim()) break
  }
  return '1. '
}

export function insertOrderedListPrefix(textarea: HTMLTextAreaElement): EditResult {
  const { lineStart, lineEnd, line, cursor } = getCurrentLine(textarea)
  const value = textarea.value
  const prefix = getOrderedListPrefix(value, lineStart)
  const stripped = stripLinePrefix(line)

  if (line.match(/^\d+\.\s/)) {
    const next = `${value.slice(0, lineStart)}${stripped}${value.slice(lineEnd)}`
    const offset = cursor - lineStart
    const removed = line.length - stripped.length
    return { next, cursor: lineStart + Math.max(0, offset - removed) }
  }

  const nextLine = `${prefix}${stripped}`
  const next = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
  const offset = cursor - lineStart
  return { next, cursor: lineStart + prefix.length + Math.min(offset, stripped.length) }
}

export function insertCodeBlock(textarea: HTMLTextAreaElement, language = ''): EditResult {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end) || '代码'
  const fence = language ? `\`\`\`${language}\n` : '```\n'
  const block = `${fence}${selected}\n\`\`\``

  const needsLeadingNewline = start > 0 && value[start - 1] !== '\n'
  const needsTrailingNewline = end < value.length && value[end] !== '\n'
  const text = `${needsLeadingNewline ? '\n' : ''}${block}${needsTrailingNewline ? '\n' : ''}`
  const insertAt = start
  const next = `${value.slice(0, insertAt)}${text}${value.slice(end)}`
  const cursor = insertAt + text.length
  return { next, cursor }
}

export function insertMath(textarea: HTMLTextAreaElement): EditResult {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end)

  if (selected.includes('\n')) {
    const block = `$$\n${selected || '公式'}\n$$`
    const needsLeadingNewline = start > 0 && value[start - 1] !== '\n'
    const text = `${needsLeadingNewline ? '\n' : ''}${block}\n`
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`
    return { next, cursor: start + text.length }
  }

  return toggleWrapSelection(textarea, '$', '$', '公式')
}

export function insertTable(textarea: HTMLTextAreaElement, rows = 3, cols = 3): EditResult {
  const headers = Array.from({ length: cols }, (_, index) => `列 ${index + 1}`).join(' | ')
  const divider = Array.from({ length: cols }, () => '---').join(' | ')
  const body = Array.from({ length: rows - 1 }, () =>
    Array.from({ length: cols }, () => '内容').join(' | '),
  ).join('\n| ')
  const table = `| ${headers} |\n| ${divider} |\n| ${body} |`
  const { lineStart } = getCurrentLine(textarea)
  const value = textarea.value
  const needsLeadingNewline = lineStart > 0 && value[lineStart - 1] !== '\n'
  const text = `${needsLeadingNewline ? '\n' : ''}${table}\n`
  return insertAtCursor(textarea, text)
}

export function insertImageMarkdown(
  textarea: HTMLTextAreaElement,
  filePath: string,
  alt?: string,
): EditResult {
  const name = alt ?? filePath.split(/[/\\]/).pop() ?? '图片'
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
  return insertAtCursor(textarea, `![${name}](${uri})`)
}

export function insertLinkMarkdown(textarea: HTMLTextAreaElement, url: string): EditResult {
  const trimmed = url.trim()
  if (!trimmed) return { next: textarea.value, cursor: textarea.selectionStart }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = textarea.value
  const selected = value.slice(start, end) || '链接文本'
  const next = `${value.slice(0, start)}[${selected}](${trimmed})${value.slice(end)}`
  const cursor = start + `[${selected}](${trimmed})`.length
  return { next, cursor }
}

export function applyEdit(
  textarea: HTMLTextAreaElement,
  result: EditResult,
  onContentChange: (value: string) => void,
) {
  onContentChange(result.next)
  requestAnimationFrame(() => {
    textarea.focus()
    if (result.cursorStart !== undefined && result.cursorEnd !== undefined) {
      textarea.setSelectionRange(result.cursorStart, result.cursorEnd)
    } else if (result.cursor !== undefined) {
      textarea.setSelectionRange(result.cursor, result.cursor)
    }
  })
}

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

export function scrollTextareaToLine(textarea: HTMLTextAreaElement, lineIndex: number) {
  const lines = textarea.value.split('\n')
  let offset = 0
  for (let i = 0; i < lineIndex && i < lines.length; i += 1) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  textarea.focus()
  textarea.setSelectionRange(offset, offset)

  const style = getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.7
  textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 3)
}

export function syncTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px'
  textarea.style.height = `${textarea.scrollHeight}px`
}
