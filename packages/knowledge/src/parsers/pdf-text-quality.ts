/**
 * Broken CJK text layers (CID / scan leftovers) drop many glyphs and insert spaces,
 * e.g. 「第2    析中的 本因素」 instead of 「第二章 分析中的基本因素」.
 * English-majority pages with a few leftover CJK glyphs are ignored.
 */
export function isGappyCjkExtractedText(text: string): boolean {
  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? []
  const cjkCount = runs.reduce((count, run) => count + run.length, 0)
  if (cjkCount < 80) return false

  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0
  if (latinCount > 0 && cjkCount / (cjkCount + latinCount) < 0.45) return false

  const averageRun = cjkCount / runs.length
  if (averageRun >= 3.5) return false

  const longRunChars = runs.reduce((count, run) => (run.length >= 4 ? count + run.length : count), 0)
  return longRunChars / cjkCount < 0.45
}

export function isPdfExtractedTextInsufficient(text: string, pageCount = 1): boolean {
  const normalized = text.trim()
  if (!normalized) return true

  const pages = Math.max(1, pageCount)
  const meaningful = normalized.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (meaningful.length < 80) return true

  const readable = normalized.match(/[\u4e00-\u9fffA-Za-z0-9]/g)?.length ?? 0
  if (readable / normalized.length < 0.12 && normalized.length < 600) return true

  if (pages > 1 && normalized.length / pages < 60) return true

  // 疑似乱码/占位文本层：字符重复度过高
  if (meaningful.length > 120) {
    const uniqueChars = new Set([...meaningful]).size
    if (uniqueChars / meaningful.length < 0.12) return true
  }

  // 大量不可见/替换字符，常见于损坏的文字层
  const suspicious = normalized.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0
  if (suspicious > 0 && suspicious / normalized.length > 0.02) return true

  if (isGappyCjkExtractedText(normalized)) return true

  return false
}
