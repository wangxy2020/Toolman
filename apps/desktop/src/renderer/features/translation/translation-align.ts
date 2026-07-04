const PARAGRAPH_GAP_PX = 16

/** Pad only the target side so source spacing stays stable. */
export function alignTargetParagraphsToSource(
  sourceCol: HTMLElement,
  targetCol: HTMLElement,
): void {
  const sourceNodes = [...sourceCol.querySelectorAll<HTMLElement>('[data-para-index]')]
  const targetNodes = [...targetCol.querySelectorAll<HTMLElement>('[data-para-index]')]

  for (const node of sourceNodes) {
    if (node.dataset.gapLocked !== '1') {
      node.style.marginBottom = `${PARAGRAPH_GAP_PX}px`
      node.dataset.gapLocked = '1'
    }
  }

  for (const node of targetNodes) {
    node.style.marginBottom = `${PARAGRAPH_GAP_PX}px`
  }

  const count = Math.min(sourceNodes.length, targetNodes.length)
  for (let index = 0; index < count; index += 1) {
    const sourceNode = sourceNodes[index]!
    const targetNode = targetNodes[index]!
    const sourceHeight = sourceNode.getBoundingClientRect().height
    const targetHeight = targetNode.getBoundingClientRect().height
    const extra = Math.max(0, sourceHeight - targetHeight)
    targetNode.style.marginBottom = `${extra + PARAGRAPH_GAP_PX}px`
  }
}
