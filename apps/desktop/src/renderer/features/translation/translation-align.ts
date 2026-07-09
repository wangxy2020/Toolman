export const TRANSLATION_PARAGRAPH_GAP_PX = 16

/** Pad only the target side so source spacing stays stable (gap comes from CSS). */
export function alignTargetParagraphsToSource(
  sourceCol: HTMLElement,
  targetCol: HTMLElement,
): void {
  const sourceNodes = [...sourceCol.querySelectorAll<HTMLElement>(':scope > [data-para-index]')]
  const targetNodes = [...targetCol.querySelectorAll<HTMLElement>(':scope > [data-para-index]')]

  for (const node of sourceNodes) {
    node.style.marginBottom = ''
    delete node.dataset.gapLocked
  }

  for (const node of targetNodes) {
    node.style.marginBottom = ''
  }

  const count = Math.min(sourceNodes.length, targetNodes.length)
  for (let index = 0; index < count; index += 1) {
    const sourceNode = sourceNodes[index]!
    const targetNode = targetNodes[index]!
    const sourceHeight = sourceNode.getBoundingClientRect().height
    const targetHeight = targetNode.getBoundingClientRect().height
    const extra = Math.max(0, sourceHeight - targetHeight)
    targetNode.style.marginBottom = extra > 0 ? `${extra}px` : ''
  }
}
