/** Markdown selection offset helpers for the notes rich editor. */

import { editorHtmlToMarkdown } from './notes-rich-editor-markdown'

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
