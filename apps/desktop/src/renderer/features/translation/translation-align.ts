function paragraphHasContent(node: HTMLElement): boolean {
  return Boolean((node.innerText ?? '').replace(/\u00a0/g, '').trim())
}

/** Height-matching only works when both sides actually have the same number of paragraphs. */
export function shouldAlignTargetParagraphHeights(
  sourceContentCount: number,
  targetContentCount: number,
): boolean {
  return sourceContentCount > 0 && sourceContentCount === targetContentCount
}

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

  const sourceContentCount = sourceNodes.filter(paragraphHasContent).length
  const targetContentCount = targetNodes.filter(paragraphHasContent).length
  if (!shouldAlignTargetParagraphHeights(sourceContentCount, targetContentCount)) {
    return
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
