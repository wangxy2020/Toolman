import type { NoteToolbarActionKey } from './NotesEditorToolbar'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyInlineMarkdown(line: string): string {
  const underlineSlots: string[] = []
  const fontSlots: string[] = []
  let work = line.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner: string) => {
    const token = `\u0000U${underlineSlots.length}\u0000`
    underlineSlots.push(`<u>${escapeHtml(inner)}</u>`)
    return token
  })
  work = work.replace(
    /<span\s+style=["']font-size:\s*([^"']+)["']>([\s\S]*?)<\/span>/gi,
    (_, size: string, inner: string) => {
      const token = `\u0000F${fontSlots.length}\u0000`
      fontSlots.push(`<span style="font-size: ${escapeHtml(size.trim())}">${escapeHtml(inner)}</span>`)
      return token
    },
  )

  work = escapeHtml(work)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')

  underlineSlots.forEach((html, index) => {
    work = work.replace(`\u0000U${index}\u0000`, html)
  })
  fontSlots.forEach((html, index) => {
    work = work.replace(`\u0000F${index}\u0000`, html)
  })

  return work
}

function isListLine(line: string): boolean {
  return /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^- \[[ xX]\]\s+/.test(line)
}

function listItemMarkdown(line: string): string {
  const task = line.match(/^- \[([ xX])\]\s+(.*)$/)
  if (task) {
    const checked = task[1]?.toLowerCase() === 'x' ? 'x' : ' '
    return `- [${checked}] ${applyInlineMarkdown(task[2] ?? '')}`
  }
  const bullet = line.match(/^[-*+]\s+(.*)$/)
  if (bullet) return applyInlineMarkdown(bullet[1] ?? '')
  const ordered = line.match(/^\d+\.\s+(.*)$/)
  if (ordered) return applyInlineMarkdown(ordered[1] ?? '')
  return applyInlineMarkdown(line)
}

export function markdownToEditorHtml(markdown: string): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  const parts: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      const code = escapeHtml(codeLines.join('\n'))
      const langAttr = language ? ` data-language="${escapeHtml(language)}"` : ''
      parts.push(`<pre${langAttr}><code>${code}</code></pre>`)
      index += 1
      continue
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      const tag = `h${Math.min(level, 3)}`
      const text = line.replace(/^#{1,3}\s+/, '')
      parts.push(`<${tag}>${applyInlineMarkdown(text)}</${tag}>`)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      parts.push(`<blockquote><div>${applyInlineMarkdown(line.slice(2))}</div></blockquote>`)
      index += 1
      continue
    }

    if (isListLine(line)) {
      const ordered = /^\d+\.\s+/.test(line)
      const items: string[] = []
      while (index < lines.length && isListLine(lines[index] ?? '')) {
        const current = lines[index] ?? ''
        items.push(`<li>${listItemMarkdown(current.replace(/^(\d+\.\s+|[-*+]\s+|- \[[ xX]\]\s+)/, ''))}</li>`)
        index += 1
      }
      parts.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }

    if (!line.trim()) {
      parts.push('<div><br></div>')
      index += 1
      continue
    }

    parts.push(`<div>${applyInlineMarkdown(line)}</div>`)
    index += 1
  }

  return parts.join('')
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const inner = Array.from(el.childNodes).map(serializeInline).join('')

  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return `**${inner}**`
    case 'EM':
    case 'I':
      return `*${inner}*`
    case 'U':
      return `<u>${inner}</u>`
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return `~~${inner}~~`
    case 'CODE':
      return `\`${inner}\``
    case 'BR':
      return '\n'
    case 'A': {
      const href = el.getAttribute('href') ?? ''
      return `[${inner}](${href})`
    }
    case 'IMG': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? '图片'
      return `![${alt}](${src})`
    }
    case 'SPAN': {
      const fontSize = el.style.fontSize?.trim()
      if (fontSize) return `<span style="font-size: ${fontSize}">${inner}</span>`
      return inner
    }
    default:
      return inner
  }
}

function isBlankBlock(el: HTMLElement): boolean {
  if ((el.textContent ?? '').replace(/\u00a0/g, '').trim()) return false
  const children = Array.from(el.childNodes)
  return (
    children.length === 0 ||
    children.every(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        ['BR', 'WBR'].includes((node as HTMLElement).tagName),
    )
  )
}

function serializeBlock(el: HTMLElement): string {
  const tag = el.tagName
  const inline = Array.from(el.childNodes).map(serializeInline).join('')

  if (tag === 'H1') return `# ${inline}`
  if (tag === 'H2') return `## ${inline}`
  if (tag === 'H3') return `### ${inline}`
  if (tag === 'BLOCKQUOTE') {
    const line = Array.from(el.querySelectorAll('div, p'))
      .map((node) => Array.from(node.childNodes).map(serializeInline).join(''))
      .join('\n')
    return `> ${line || inline}`
  }
  if (tag === 'LI') return inline
  if (tag === 'PRE') {
    const code = el.querySelector('code')
    const language = el.getAttribute('data-language')?.trim()
    const body = code?.textContent ?? el.textContent ?? ''
    return language ? `\`\`\`${language}\n${body}\n\`\`\`` : `\`\`\`\n${body}\n\`\`\``
  }
  if (tag === 'DIV' || tag === 'P') {
    if (isBlankBlock(el)) return ''
    return inline
  }
  return inline
}

export function editorHtmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = []

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text.trim()) lines.push(text)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const el = child as HTMLElement
    if (el.tagName === 'UL') {
      for (const li of Array.from(el.children)) {
        if (li instanceof HTMLElement) lines.push(`- ${serializeBlock(li)}`)
      }
      continue
    }
    if (el.tagName === 'OL') {
      Array.from(el.children).forEach((li, index) => {
        if (li instanceof HTMLElement) lines.push(`${index + 1}. ${serializeBlock(li)}`)
      })
      continue
    }
    lines.push(serializeBlock(el))
  }

  return normalizeEditorMarkdown(lines.join('\n'))
}

export function normalizeEditorMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const normalized: string[] = []
  let blankRun = 0

  for (const line of lines) {
    if (!line.trim()) {
      blankRun += 1
      if (blankRun <= 1) normalized.push('')
      continue
    }
    blankRun = 0
    normalized.push(line)
  }

  return normalized.join('\n').replace(/^\n+/, '')
}

export function getMarkdownSelectionOffset(root: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return 0

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return 0

  const prefix = document.createElement('div')
  const prefixRange = range.cloneRange()
  prefixRange.selectNodeContents(root)
  prefixRange.setEnd(range.startContainer, range.startOffset)
  prefix.appendChild(prefixRange.cloneContents())
  return editorHtmlToMarkdown(prefix).length
}

export function setMarkdownSelectionOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return

  const target = Math.max(0, offset)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let consumed = 0
  let node = walker.nextNode()

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (consumed + text.length >= target) {
        const range = document.createRange()
        range.setStart(node, target - consumed)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      consumed += text.length
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
      if (consumed + 1 >= target) {
        const range = document.createRange()
        range.setStartBefore(node)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      consumed += 1
    }
    node = walker.nextNode()
  }

  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function surroundSelection(tag: string, placeholder = '文本') {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return

  const range = selection.getRangeAt(0)
  const element = document.createElement(tag)

  if (range.collapsed) {
    element.textContent = placeholder
    range.insertNode(element)
    const next = document.createRange()
    next.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(next)
    return
  }

  try {
    range.surroundContents(element)
  } catch {
    element.appendChild(range.extractContents())
    range.insertNode(element)
  }

  const next = document.createRange()
  next.selectNodeContents(element)
  next.collapse(false)
  selection.removeAllRanges()
  selection.addRange(next)
}

function runExec(command: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(command, false, value)
}

const RERENDER_MARKDOWN_ACTIONS = new Set<NoteToolbarActionKey>(['codeblock', 'math', 'table'])

export function shouldRerenderEditorAfterAction(key: NoteToolbarActionKey): boolean {
  return RERENDER_MARKDOWN_ACTIONS.has(key)
}

function getActiveBlock(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  let node: Node | null = selection.anchorNode
  if (!node) return null
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode
  while (node && node !== root) {
    if (node instanceof HTMLElement && /^(DIV|H1|H2|H3|BLOCKQUOTE|LI|P|PRE)$/.test(node.tagName)) {
      return node
    }
    node = node.parentNode
  }
  return null
}

function restoreCaretIn(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Replace block tag in place — avoids nested headings / growing font from formatBlock. */
function replaceBlockElement(block: HTMLElement, tag: string): HTMLElement {
  const next = document.createElement(tag)
  while (block.firstChild) next.appendChild(block.firstChild)
  block.replaceWith(next)
  restoreCaretIn(next)
  return next
}

function toggleBlockTag(root: HTMLElement, tag: 'h1' | 'h2' | 'h3' | 'blockquote' | 'div') {
  const block = getActiveBlock(root)
  if (!block || block === root) {
    runExec('formatBlock', tag === 'div' ? 'div' : tag)
    return
  }
  if (block.tagName.toLowerCase() === tag) {
    replaceBlockElement(block, 'div')
    return
  }
  replaceBlockElement(block, tag)
}

function applyFontSizePx(root: HTMLElement, px: number) {
  root.focus()
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (range.collapsed) {
    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    span.appendChild(document.createTextNode('\u200b'))
    range.insertNode(span)
    const next = document.createRange()
    next.setStart(span.firstChild ?? span, 1)
    next.collapse(true)
    selection.removeAllRanges()
    selection.addRange(next)
    root.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return
  }
  const span = document.createElement('span')
  span.style.fontSize = `${px}px`
  try {
    range.surroundContents(span)
  } catch {
    span.appendChild(range.extractContents())
    range.insertNode(span)
  }
  const next = document.createRange()
  next.selectNodeContents(span)
  next.collapse(false)
  selection.removeAllRanges()
  selection.addRange(next)
  root.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

export type NotesToolbarFormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  h1: boolean
  h2: boolean
  h3: boolean
  body: boolean
}

function selectionInsideRoot(root: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  const node = selection.anchorNode
  if (!node) return false
  return root.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node)
}

function walkSelectionAncestors(
  root: HTMLElement,
  visit: (el: HTMLElement) => boolean,
): boolean {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  let node: Node | null = selection.anchorNode
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode
  while (node && node !== root) {
    if (node instanceof HTMLElement && visit(node)) return true
    node = node.parentNode
  }
  return false
}

function queryCommandStateSafe(command: string): boolean {
  try {
    return Boolean(document.queryCommandState(command))
  } catch {
    return false
  }
}

function selectionHasInlineFormat(
  root: HTMLElement,
  command: string,
  tags: Set<string>,
  styleMatch: (style: CSSStyleDeclaration) => boolean,
): boolean {
  if (queryCommandStateSafe(command)) return true
  return walkSelectionAncestors(root, (el) => {
    if (tags.has(el.tagName)) return true
    // Prefer inline styles only — computed weight on headings would false-positive Bold.
    return styleMatch(el.style)
  })
}

export function queryNotesToolbarFormatState(root: HTMLElement | null): NotesToolbarFormatState {
  if (!root || !selectionInsideRoot(root)) {
    return {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      h1: false,
      h2: false,
      h3: false,
      body: false,
    }
  }
  const block = getActiveBlock(root)
  const tag = block?.tagName.toLowerCase() ?? ''
  return {
    bold: selectionHasInlineFormat(root, 'bold', new Set(['STRONG', 'B']), (style) => {
      const weight = String(style.fontWeight)
      return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600
    }),
    italic: selectionHasInlineFormat(root, 'italic', new Set(['EM', 'I']), (style) =>
      style.fontStyle === 'italic' || style.fontStyle === 'oblique',
    ),
    underline: selectionHasInlineFormat(root, 'underline', new Set(['U']), (style) =>
      String(style.textDecorationLine || style.textDecoration).includes('underline'),
    ),
    strike: selectionHasInlineFormat(
      root,
      'strikeThrough',
      new Set(['S', 'STRIKE', 'DEL']),
      (style) =>
        String(style.textDecorationLine || style.textDecoration).includes('line-through'),
    ),
    h1: tag === 'h1',
    h2: tag === 'h2',
    h3: tag === 'h3',
    body: tag === 'div' || tag === 'p' || tag === '',
  }
}

function insertPlainText(root: HTMLElement, text: string) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

export function runRichToolbarAction(
  root: HTMLElement,
  key: NoteToolbarActionKey,
  options?: { fontSizePx?: number },
): boolean {
  root.focus()

  switch (key) {
    case 'bold':
      runExec('bold')
      return true
    case 'italic':
      runExec('italic')
      return true
    case 'underline':
      runExec('underline')
      return true
    case 'strike':
      runExec('strikeThrough')
      return true
    case 'code':
      surroundSelection('code', '代码')
      return true
    case 'clearFormat':
      runExec('removeFormat')
      toggleBlockTag(root, 'div')
      return true
    case 'fontSize': {
      const px = options?.fontSizePx
      if (px == null || !Number.isFinite(px)) return false
      applyFontSizePx(root, px)
      return true
    }
    case 'body': {
      const block = getActiveBlock(root)
      if (block && block !== root) replaceBlockElement(block, 'div')
      else runExec('formatBlock', 'div')
      return true
    }
    case 'h1':
      toggleBlockTag(root, 'h1')
      return true
    case 'h2':
      toggleBlockTag(root, 'h2')
      return true
    case 'h3':
      toggleBlockTag(root, 'h3')
      return true
    case 'bullet':
      runExec('insertUnorderedList')
      return true
    case 'ordered':
      runExec('insertOrderedList')
      return true
    case 'quote':
      toggleBlockTag(root, 'blockquote')
      return true
    case 'task': {
      const block = getActiveBlock(root)
      const line = block ? serializeBlock(block) : ''
      const prefix = '- [ ] '
      if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
        insertPlainText(root, '')
        if (block) block.textContent = line.replace(/^- \[[xX ]\]\s+/, '')
      } else if (block) {
        block.textContent = `${prefix}${line}`
      } else {
        insertPlainText(root, prefix)
      }
      return true
    }
    case 'codeblock': {
      const selection = window.getSelection()
      const selected = selection?.toString() || '代码'
      insertPlainText(root, `\n\`\`\`\n${selected}\n\`\`\`\n`)
      return true
    }
    case 'math': {
      const selection = window.getSelection()
      const selected = selection?.toString() || '公式'
      insertPlainText(root, selected.includes('\n') ? `\n$$\n${selected}\n$$\n` : `$${selected}$`)
      return true
    }
    case 'table':
      insertPlainText(
        root,
        '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n',
      )
      return true
    default:
      return false
  }
}

export function insertRichImage(root: HTMLElement, filePath: string, alt?: string) {
  const name = alt ?? filePath.split(/[/\\]/).pop() ?? '图片'
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  const img = document.createElement('img')
  img.alt = name
  img.src = uri
  img.className = 'tm-notes-rich-image'
  range.insertNode(img)
  range.setStartAfter(img)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

export function insertRichLink(root: HTMLElement, url: string) {
  const trimmed = url.trim()
  if (!trimmed) return
  const selection = window.getSelection()
  const label = selection?.toString() || '链接文本'
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  const anchor = document.createElement('a')
  anchor.href = trimmed
  anchor.textContent = label
  anchor.target = '_blank'
  anchor.rel = 'noreferrer noopener'
  range.deleteContents()
  range.insertNode(anchor)
  range.setStartAfter(anchor)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

export function scrollRichEditorToLine(root: HTMLElement, lineIndex: number) {
  const blocks = Array.from(root.children).filter(
    (child) => child instanceof HTMLElement,
  ) as HTMLElement[]
  const target = blocks[lineIndex] ?? blocks[blocks.length - 1]
  if (!target) {
    root.focus()
    return
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(target)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  root.focus()
}

export function richEditorIsEmpty(root: HTMLElement): boolean {
  return !editorHtmlToMarkdown(root).trim()
}
