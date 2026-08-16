/** Toolbar commands and insert helpers for the notes rich editor. */

import type { NoteToolbarActionKey } from './NotesEditorToolbar'
import { serializeBlock, editorHtmlToMarkdown } from './notes-rich-editor-markdown'
import { getActiveBlock } from './notes-rich-editor-toolbar-state'

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
