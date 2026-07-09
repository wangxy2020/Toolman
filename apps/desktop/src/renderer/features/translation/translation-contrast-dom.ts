/** ContentEditable often leaves a trailing <br> that doubles the first row height. */
export function trimPhantomBreaks(element: HTMLElement): void {
  while (element.lastChild?.nodeName === 'BR' && element.childNodes.length > 1) {
    element.removeChild(element.lastChild)
  }

  if (element.childNodes.length === 1 && element.lastChild?.nodeName === 'BR') {
    element.replaceChildren(document.createTextNode('\u00a0'))
  }
}

export function isContrastParagraphEmpty(element: HTMLElement): boolean {
  return !(element.innerText ?? '').replace(/\u00a0/g, '').trim()
}

export const TRANSLATION_LINE_LABEL_STEP = 5

export function formatContrastLineLabel(lineNumber: number): string | null {
  if (lineNumber <= 0 || lineNumber % TRANSLATION_LINE_LABEL_STEP !== 0) return null
  return String(lineNumber)
}

export function applyContrastLineLabel(element: HTMLElement, lineNumber: number): void {
  const label = formatContrastLineLabel(lineNumber)
  if (label) {
    element.dataset.lineLabel = label
  } else {
    delete element.dataset.lineLabel
  }
}

export function normalizeContrastBlocks(column: HTMLElement, placeholder?: string): void {
  Array.from(column.children).forEach((block, index) => {
    const element = block as HTMLElement
    element.dataset.paraIndex = String(index)
    element.classList.add('tm-translation-contrast-para')
    element.classList.toggle('tm-translation-contrast-para--empty', isContrastParagraphEmpty(element))
    trimPhantomBreaks(element)
    element.classList.toggle('tm-translation-contrast-para--empty', isContrastParagraphEmpty(element))
    applyContrastLineLabel(element, index + 1)
    if (index === 0 && isContrastParagraphEmpty(element) && placeholder) {
      element.dataset.placeholder = placeholder
    } else {
      delete element.dataset.placeholder
    }
  })
}

export function contrastSourceHasContent(column: HTMLElement): boolean {
  return readContrastParagraphs(column).some((paragraph) => paragraph.trim())
}

export function readContrastParagraphs(column: HTMLElement, placeholder?: string): string[] {
  normalizeContrastBlocks(column, placeholder)
  const blocks = Array.from(column.querySelectorAll<HTMLElement>(':scope > [data-para-index]'))
  if (blocks.length === 0) {
    const text = (column.innerText ?? '').replace(/\u00a0/g, '').trimEnd()
    return text ? [text] : ['']
  }
  return blocks.map((node) => (node.innerText ?? '').replace(/\u00a0/g, '').replace(/\n$/, ''))
}
