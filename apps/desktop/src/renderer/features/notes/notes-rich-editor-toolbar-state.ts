/** Toolbar format-state queries for the notes rich editor. */

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

export function getActiveBlock(root: HTMLElement): HTMLElement | null {
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
