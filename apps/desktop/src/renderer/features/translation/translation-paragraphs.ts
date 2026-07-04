/** Split text into paragraphs for side-by-side alignment. */
export function splitTranslationParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.trim()) return ['']

  if (/\n\s*\n/.test(normalized)) {
    return normalized.split(/\n\s*\n+/).map((part) => part.replace(/\s+$/g, ''))
  }

  return normalized.split('\n').map((part) => part.replace(/\s+$/g, ''))
}

export function joinTranslationParagraphs(paragraphs: string[]): string {
  // Word lists (one token per paragraph) keep single newlines — one model call, easy alignment.
  const allSingleLine = paragraphs.every((part) => !part.includes('\n'))
  return paragraphs.join(allSingleLine ? '\n' : '\n\n')
}

export function alignTranslationParagraphs(
  sourceText: string,
  targetText: string,
): Array<{ source: string; target: string }> {
  const sourceParas = splitTranslationParagraphs(sourceText)
  const targetParas = splitTranslationParagraphs(targetText)
  const count = Math.max(sourceParas.length, targetParas.length, 1)

  return Array.from({ length: count }, (_, index) => ({
    source: sourceParas[index] ?? '',
    target: targetParas[index] ?? '',
  }))
}
