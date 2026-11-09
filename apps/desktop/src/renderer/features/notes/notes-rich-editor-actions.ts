/** Toolbar commands and insert helpers for the notes rich editor. */

import type { NoteToolbarActionKey } from './NotesEditorToolbar'
import { editorHtmlToMarkdown } from './notes-rich-editor-markdown'
import { loadLocalImageDataUrl, toFileUrl } from './notes-rich-editor-media'
import { getActiveBlock } from './notes-rich-editor-toolbar-state'

/** Ensure the editor has a caret inside it (toolbar clicks often leave no selection). */
export function ensureEditorSelection(root: HTMLElement): Range {
  root.focus()
  const selection = window.getSelection()
  if (selection?.rangeCount) {
    const current = selection.getRangeAt(0)
    if (root.contains(current.commonAncestorContainer)) return current
  }
  const range = document.createRange()
  if (root.childNodes.length === 0) {
    const spacer = document.createElement('div')
    spacer.appendChild(document.createElement('br'))
    root.appendChild(spacer)
  }
  range.selectNodeContents(root)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  return range
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

const RERENDER_MARKDOWN_ACTIONS = new Set<NoteToolbarActionKey>([
  'codeblock',
  'math',
  'task',
  'table',
])

export function shouldRerenderEditorAfterAction(key: NoteToolbarActionKey): boolean {
  return RERENDER_MARKDOWN_ACTIONS.has(key)
}

/**
 * Insert block-level HTML as siblings under the editor root.
 * Nesting <table>/<ul> inside a contenteditable <div> breaks markdown round-trip
 * (editorHtmlToMarkdown only serializes top-level blocks).
 */
function insertBlockHtml(root: HTMLElement, html: string) {
  ensureEditorSelection(root)
  const block = getActiveBlock(root)
  const template = document.createElement('template')
  template.innerHTML = html
  const nodes = Array.from(template.content.childNodes)
  if (nodes.length === 0) return

  let insertBefore: ChildNode | null = null
  if (block && block !== root && block.parentElement === root) {
    const empty =
      !(block.textContent ?? '').replace(/\u00a0/g, '').trim() &&
      !block.querySelector('img, table, ul, ol, pre')
    if (empty) {
      insertBefore = block.nextSibling
      block.remove()
    } else {
      insertBefore = block.nextSibling
    }
  }

  let last: ChildNode | null = null
  for (const node of nodes) {
    last = root.insertBefore(node, insertBefore)
  }
  if (last) restoreCaretIn(last instanceof HTMLElement ? last : root)
}

function closestTaskItem(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.classList.contains('tm-notes-task-item')) {
      return current
    }
    current = current.parentNode
  }
  return null
}

function createTaskCheckElement(): HTMLElement {
  const check = document.createElement('span')
  check.className = 'tm-notes-task-check'
  check.setAttribute('role', 'checkbox')
  check.setAttribute('aria-checked', 'false')
  check.contentEditable = 'false'
  return check
}

function buildTaskListElement(text: string): { list: HTMLElement; textSpan: HTMLElement } {
  const list = document.createElement('ul')
  list.className = 'tm-notes-task-list'
  list.setAttribute('data-task-list', 'true')
  const li = document.createElement('li')
  li.className = 'tm-notes-task-item'
  li.setAttribute('data-checked', 'false')
  const textSpan = document.createElement('span')
  textSpan.className = 'tm-notes-task-text'
  textSpan.textContent = text || ''
  if (!text) textSpan.appendChild(document.createElement('br'))
  li.append(createTaskCheckElement(), textSpan)
  list.appendChild(li)
  return { list, textSpan }
}

function listItemPlainText(block: HTMLElement): string {
  const textSpan = block.querySelector(':scope > .tm-notes-task-text')
  if (textSpan) return (textSpan.textContent ?? '').replace(/\u00a0/g, '').trim()
  return Array.from(block.childNodes)
    .filter(
      (node) =>
        !(
          node instanceof HTMLElement &&
          (node.tagName === 'INPUT' || node.classList.contains('tm-notes-task-check'))
        ),
    )
    .map((node) => (node.textContent ?? ''))
    .join('')
    .trim()
}

/** Add a checkbox to a list item in place — keep the browser's native ol/ul number/bullet. */
function decorateListItemAsTask(li: HTMLElement): HTMLElement {
  if (li.classList.contains('tm-notes-task-item') && li.querySelector('.tm-notes-task-check')) {
    return (li.querySelector('.tm-notes-task-text') as HTMLElement | null) ?? li
  }
  const text = listItemPlainText(li)
  li.classList.add('tm-notes-task-item')
  li.setAttribute('data-checked', 'false')
  while (li.firstChild) li.removeChild(li.firstChild)
  const textSpan = document.createElement('span')
  textSpan.className = 'tm-notes-task-text'
  if (text) textSpan.textContent = text
  else textSpan.appendChild(document.createElement('br'))
  li.append(createTaskCheckElement(), textSpan)
  return textSpan
}

function convertBlockToTaskItem(block: HTMLElement) {
  const parent = block.parentElement

  // Ordered/unordered list items keep their markers; checkbox sits to the left.
  if (
    block.tagName === 'LI' &&
    parent &&
    (parent.tagName === 'UL' || parent.tagName === 'OL')
  ) {
    const textSpan = decorateListItemAsTask(block)
    restoreCaretIn(textSpan)
    return
  }

  const text = (block.textContent ?? '').trim()
  const { list, textSpan } = buildTaskListElement(text)
  block.replaceWith(list)
  restoreCaretIn(textSpan)
}

function createParagraphFromText(text: string): HTMLElement {
  const div = document.createElement('div')
  if (text) div.textContent = text
  else div.appendChild(document.createElement('br'))
  return div
}

function isTaskTextEmpty(taskItem: HTMLElement): boolean {
  const textSpan = taskItem.querySelector('.tm-notes-task-text')
  const text = (textSpan?.textContent ?? '').replace(/[\u00a0\u200b\n\r]/g, '').trim()
  return !text
}

function isCaretAtStartOfTaskText(taskItem: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed) return false
  const textSpan = taskItem.querySelector('.tm-notes-task-text')
  if (!(textSpan instanceof HTMLElement) || !textSpan.contains(selection.anchorNode)) {
    // Caret on the item but not in text (e.g. beside checkbox) counts as start.
    return taskItem.contains(selection.anchorNode)
  }
  const range = selection.getRangeAt(0)
  const prefix = document.createRange()
  prefix.selectNodeContents(textSpan)
  prefix.setEnd(range.startContainer, range.startOffset)
  return prefix.toString().replace(/[\u00a0\u200b]/g, '') === ''
}

/**
 * Backspace/Delete on an empty task (or at the start of a task) removes the checkbox
 * in one keypress instead of leaving a hollow task item behind.
 */
export function handleTaskListKeyDown(root: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed) return false

  const taskItem = closestTaskItem(selection.anchorNode, root)
  if (!taskItem) return false

  const empty = isTaskTextEmpty(taskItem)
  if (event.key === 'Backspace') {
    if (!empty && !isCaretAtStartOfTaskText(taskItem)) return false
    event.preventDefault()
    unwrapTaskItem(taskItem)
    return true
  }

  // Delete on an empty task line: remove the checkbox structure.
  if (empty) {
    event.preventDefault()
    unwrapTaskItem(taskItem)
    return true
  }
  return false
}

function unwrapTaskItem(taskItem: HTMLElement) {
  const textSpan = taskItem.querySelector('.tm-notes-task-text')
  const text = textSpan?.textContent?.replace(/\u00a0/g, '').trim() ?? ''
  const list = taskItem.parentElement

  // Inside a normal ol/ul: drop checkbox, keep the list item + marker.
  if (
    list &&
    (list.tagName === 'UL' || list.tagName === 'OL') &&
    list.getAttribute('data-task-list') !== 'true'
  ) {
    taskItem.classList.remove('tm-notes-task-item')
    taskItem.removeAttribute('data-checked')
    while (taskItem.firstChild) taskItem.removeChild(taskItem.firstChild)
    if (text) taskItem.textContent = text
    else taskItem.appendChild(document.createElement('br'))
    restoreCaretIn(taskItem)
    return
  }

  const div = createParagraphFromText(text)

  // Standalone task list: never leave a <div> inside <ul> (that breaks spacing).
  if (list && list.getAttribute('data-task-list') === 'true') {
    const siblings = Array.from(list.children)
    const index = siblings.indexOf(taskItem)
    const before = siblings.slice(0, index)
    const after = siblings.slice(index + 1)

    if (before.length === 0 && after.length === 0) {
      list.replaceWith(div)
      restoreCaretIn(div)
      return
    }

    const fragment = document.createDocumentFragment()
    if (before.length > 0) {
      const beforeList = list.cloneNode(false) as HTMLElement
      for (const item of before) beforeList.appendChild(item)
      fragment.appendChild(beforeList)
    }
    fragment.appendChild(div)
    if (after.length > 0) {
      const afterList = list.cloneNode(false) as HTMLElement
      for (const item of after) afterList.appendChild(item)
      fragment.appendChild(afterList)
    }
    list.replaceWith(fragment)
    restoreCaretIn(div)
    return
  }

  taskItem.replaceWith(div)
  restoreCaretIn(div)
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
}

function insertPlainText(text: string) {
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
}

export function runRichToolbarAction(
  root: HTMLElement,
  key: NoteToolbarActionKey,
  options?: { fontSizePx?: number },
): boolean {
  ensureEditorSelection(root)

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
      const selection = window.getSelection()
      const taskItem = closestTaskItem(selection?.anchorNode ?? null, root)
      if (taskItem) {
        unwrapTaskItem(taskItem)
        return true
      }
      const block = getActiveBlock(root)
      if (block && block !== root) {
        convertBlockToTaskItem(block)
        return true
      }
      insertBlockHtml(
        root,
        '<ul class="tm-notes-task-list" data-task-list="true"><li class="tm-notes-task-item" data-checked="false"><span class="tm-notes-task-check" role="checkbox" aria-checked="false" contenteditable="false"></span><span class="tm-notes-task-text"><br></span></li></ul>',
      )
      return true
    }
    case 'codeblock': {
      const selection = window.getSelection()
      const selected = selection?.toString() || '代码'
      insertPlainText(`\n\`\`\`\n${selected}\n\`\`\`\n`)
      return true
    }
    case 'math': {
      const selection = window.getSelection()
      const selected = selection?.toString() || '公式'
      insertPlainText(selected.includes('\n') ? `\n$$\n${selected}\n$$\n` : `$${selected}$`)
      return true
    }
    case 'table':
      insertBlockHtml(
        root,
        [
          '<table class="tm-notes-rich-table">',
          '<thead><tr><th>列 1</th><th>列 2</th><th>列 3</th></tr></thead>',
          '<tbody><tr><td>内容</td><td>内容</td><td>内容</td></tr></tbody>',
          '</table>',
          '<div><br></div>',
        ].join(''),
      )
      return true
    default:
      return false
  }
}

export async function insertRichImage(root: HTMLElement, filePath: string, alt?: string) {
  const name = alt ?? filePath.split(/[/\\]/).pop() ?? '图片'
  // Load before touching the selection — awaiting after Range capture detaches it.
  const dataUrl = await loadLocalImageDataUrl(filePath)
  const selection = window.getSelection()
  const range = ensureEditorSelection(root)
  const img = document.createElement('img')
  img.alt = name
  img.className = 'tm-notes-rich-image'
  img.dataset.filePath = filePath
  img.src = dataUrl ?? toFileUrl(filePath)
  range.deleteContents()
  range.insertNode(img)
  const next = document.createRange()
  next.setStartAfter(img)
  next.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(next)
}

export function insertRichLink(root: HTMLElement, url: string) {
  const trimmed = url.trim()
  if (!trimmed) return
  const selection = window.getSelection()
  const label = selection?.toString() || '链接文本'
  const range = ensureEditorSelection(root)
  const anchor = document.createElement('a')
  anchor.href = trimmed
  anchor.textContent = label
  anchor.target = '_blank'
  anchor.rel = 'noreferrer noopener'
  range.deleteContents()
  range.insertNode(anchor)
  const next = document.createRange()
  next.setStartAfter(anchor)
  next.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(next)
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
