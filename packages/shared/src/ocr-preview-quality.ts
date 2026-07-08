/**
 * OCR collapse detection for ODL preview — shared between main and renderer.
 * Detects pages where OCR outputs high-frequency identical short tokens (e.g. "27").
 */

export interface OcrCollapseDetectionConfig {
  consecutiveDuplicateLines: number
  maxShortLineLength: number
  minUniqueCharRatio: number
}

export const DEFAULT_OCR_COLLAPSE_DETECTION_CONFIG: OcrCollapseDetectionConfig = {
  consecutiveDuplicateLines: 15,
  maxShortLineLength: 5,
  minUniqueCharRatio: 0.05,
}

function normalizeLineKey(line: string): string {
  return line.trim().replace(/\s+/g, '')
}

/** Strip HTML tags for line-based analysis. */
export function odlPreviewToPlainLines(content: string): string[] {
  const plain = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|td|th|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function findMaxConsecutiveDuplicateRun(lines: string[]): number {
  let maxRun = 0
  let run = 0
  let previousKey = ''

  for (const line of lines) {
    const key = normalizeLineKey(line)
    if (key === previousKey) {
      run += 1
    } else {
      run = 1
      previousKey = key
    }
    maxRun = Math.max(maxRun, run)
  }

  return maxRun
}

export function computeUniqueCharRatio(text: string): number {
  const chars = text.replace(/\s+/g, '')
  if (chars.length === 0) return 1
  return new Set(chars).size / chars.length
}

export function detectOcrCollapsedContent(
  text: string,
  config: Partial<OcrCollapseDetectionConfig> = {},
): {
  isCollapsed: boolean
  maxConsecutiveDuplicateRun: number
  uniqueCharRatio: number
} {
  const resolved = { ...DEFAULT_OCR_COLLAPSE_DETECTION_CONFIG, ...config }
  const lines = odlPreviewToPlainLines(text)
  const maxConsecutiveDuplicateRun = findMaxConsecutiveDuplicateRun(lines)
  const uniqueCharRatio = computeUniqueCharRatio(odlPreviewToPlainLines(text).join('\n'))

  let isCollapsed = false
  if (maxConsecutiveDuplicateRun >= resolved.consecutiveDuplicateLines) {
    const dominantKey = normalizeLineKey(lines[lines.length - 1] ?? '')
    if (dominantKey.length <= resolved.maxShortLineLength) {
      isCollapsed = true
    }
  }
  if (
    !isCollapsed &&
    uniqueCharRatio < resolved.minUniqueCharRatio &&
    lines.length >= resolved.consecutiveDuplicateLines
  ) {
    isCollapsed = true
  }

  return { isCollapsed, maxConsecutiveDuplicateRun, uniqueCharRatio }
}

/**
 * Remove collapsed OCR noise runs. Blank lines do NOT break a duplicate run —
 * ODL often emits "27\\n\\n27\\n\\n27" on sparse scan pages.
 */
export function stripOcrCollapsedContent(
  text: string,
  config: Partial<OcrCollapseDetectionConfig> = {},
): string {
  const resolved = { ...DEFAULT_OCR_COLLAPSE_DETECTION_CONFIG, ...config }
  const trimmed = text.trim()
  if (!trimmed) return ''

  const lines = odlPreviewToPlainLines(trimmed)
  if (lines.length === 0) return ''

  let dominantKey = ''
  let dominantRun = 0
  let runKey = ''
  let run = 0

  for (const line of lines) {
    const key = normalizeLineKey(line)
    if (key === runKey) {
      run += 1
    } else {
      if (run > dominantRun) {
        dominantRun = run
        dominantKey = runKey
      }
      runKey = key
      run = 1
    }
  }
  if (run > dominantRun) {
    dominantRun = run
    dominantKey = runKey
  }

  const isNoiseRun =
    dominantRun >= resolved.consecutiveDuplicateLines &&
    dominantKey.length <= resolved.maxShortLineLength

  let kept = lines
  if (isNoiseRun) {
    kept = lines.filter((line) => normalizeLineKey(line) !== dominantKey)
  }

  const hasMeaningful = kept.some(
    (line) =>
      normalizeLineKey(line).length > resolved.maxShortLineLength ||
      !/^\d{1,4}$/.test(normalizeLineKey(line)),
  )

  if (!hasMeaningful) return ''

  if (isNoiseRun) {
    kept = kept.filter((line) => {
      const key = normalizeLineKey(line)
      return !(key.length <= resolved.maxShortLineLength && /^\d{1,4}$/.test(key))
    })
  }

  return kept.join('\n').trim()
}

export function isUsableOdlPreviewContent(text: string, markdown?: string): boolean {
  const md = markdown?.trim() ?? ''
  const plain = text.trim()
  const body = md || plain
  if (!body) return false

  if (detectOcrCollapsedContent(body).isCollapsed) {
    const stripped = stripOcrCollapsedContent(body)
    if (!stripped.trim()) return false
    return !detectOcrCollapsedContent(stripped).isCollapsed
  }

  const letters = body.match(/[A-Za-z\u4e00-\u9fff]/g)?.length ?? 0
  if (letters >= 8) return true

  const digits = body.match(/\d/g)?.length ?? 0
  if (digits >= 8 && letters < 4) return false

  return body.replace(/\s+/g, '').length >= 8
}
