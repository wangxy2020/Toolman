import { isPdfPageMarkerOnly, stripPdfPageMarkers } from './pdf-page-markers.js'

function normalizeLineForDedupe(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase()
}

function htmlFragmentToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|td|th|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Plain text extracted from ODL HTML/markdown fragments (for anomaly detection). */
export function odlContentToPlainText(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed
  return htmlFragmentToPlain(trimmed)
}

/** Page footer / version stamp mis-assigned into table cells by ODL layout. */
export function isLikelyPageFooterLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^page\s+\d+(?:\s*\/\s*\d+)?(?:\s*of\s*\d+)?\.?$/i.test(trimmed)) return true
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*,?\s+\d{4}\s+version\.?$/i.test(trimmed)) {
    return true
  }
  if (/^version\s+\d+/i.test(trimmed)) return true
  if (/^\d{4}\s+version\.?$/i.test(trimmed)) return true
  return false
}

function collapseRepeatedHtmlElements(content: string, tag: 'tr' | 'p' | 'li'): string {
  const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
  const matches = [...content.matchAll(pattern)]
  if (matches.length < 4) return content

  const replacements = new Map<string, string>()
  let lastKey = ''
  let runLength = 0
  let keptInRun = 0

  for (const match of matches) {
    const element = match[0]!
    const key = normalizeLineForDedupe(htmlFragmentToPlain(element))
    const isShort = key.length <= 5

    if (isShort && key === lastKey) {
      runLength += 1
      if (runLength >= 4 && keptInRun >= 1) {
        replacements.set(element, '')
        continue
      }
      keptInRun += 1
    } else {
      lastKey = key
      runLength = 1
      keptInRun = 1
    }
  }

  if (replacements.size === 0) return content
  let next = content
  for (const [element, replacement] of replacements) {
    next = next.replace(element, replacement)
  }
  return next.replace(/\n{3,}/g, '\n\n')
}

/** Collapse OCR noise expressed as repeated HTML rows/paragraphs (e.g. many `<tr><td>27</td></tr>`). */
export function collapseRepeatedOdlHtmlNoise(content: string): string {
  if (!/<(?:table|tr|td|p|li|br)\b/i.test(content)) return content

  let next = content
  next = collapseRepeatedHtmlElements(next, 'tr')
  next = collapseRepeatedHtmlElements(next, 'p')
  next = collapseRepeatedHtmlElements(next, 'li')

  // Drop tables whose body is entirely short numeric noise rows.
  next = next.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rows = [...tableHtml.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)]
    if (rows.length < 4) return tableHtml
    const rowKeys = rows.map((row) => normalizeLineForDedupe(htmlFragmentToPlain(row[0]!)))
    const nonEmpty = rowKeys.filter(Boolean)
    if (nonEmpty.length === 0) return ''
    const allShortNumeric = nonEmpty.every((key) => /^\d{1,4}$/.test(key))
    const unique = new Set(nonEmpty)
    if (allShortNumeric && unique.size <= 1 && nonEmpty.length >= 4) return ''
    return tableHtml
  })

  return next
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Move footer/version/page-number lines out of the last table row into trailing paragraphs. */
export function relocateOdlTableFooters(content: string): string {
  if (!/<table[\s>]/i.test(content)) return content

  return content.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    if (rowMatches.length === 0) return tableHtml

    const lastRow = rowMatches[rowMatches.length - 1]!
    const footers: string[] = []

    const rebuiltRow = lastRow[0].replace(
      /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi,
      (_full, tag: string, attrs: string, inner: string) => {
        const lines = htmlFragmentToPlain(inner)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        const kept: string[] = []
        for (const line of lines) {
          if (isLikelyPageFooterLine(line)) footers.push(line)
          else kept.push(line)
        }
        if (kept.length === 0) return `<${tag}${attrs}></${tag}>`
        return `<${tag}${attrs}>${kept.map((line) => escapeHtml(line)).join('<br>')}</${tag}>`
      },
    )

    const rowHasBody = htmlFragmentToPlain(rebuiltRow).trim().length > 0
    let nextTable = tableHtml
    if (rowHasBody) {
      nextTable = nextTable.replace(lastRow[0], rebuiltRow)
    } else {
      nextTable = nextTable.replace(lastRow[0], '')
    }

    const uniqueFooters = [...new Set(footers)]
    if (uniqueFooters.length === 0) return nextTable

    const footerBlock = `<p>${uniqueFooters.map((line) => escapeHtml(line)).join('<br>')}</p>`
    return nextTable.replace(/<\/table>/i, `</table>\n${footerBlock}`)
  })
}

/** Pick the longest non-marker-only body from ODL output candidates. */
export function pickLongestUsableOdlBody(...sources: Array<string | undefined | null>): string {
  let best = ''
  for (const source of sources) {
    if (!source?.trim()) continue
    const cleaned = stripPdfPageMarkers(source)
    if (!cleaned || isPdfPageMarkerOnly(cleaned)) continue
    if (cleaned.length > best.length) best = cleaned
  }
  return best
}

export function hasUsableOdlPreviewContent(text: string | undefined | null): boolean {
  return pickLongestUsableOdlBody(text).length > 0
}

/** Remove consecutive duplicate lines while preserving blank-line paragraph breaks. */
export function collapseConsecutiveDuplicateLines(text: string): string {
  const lines = text.split('\n')
  const seen = new Set<string>()
  const out: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      seen.clear()
      continue
    }
    const key = normalizeLineForDedupe(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function isShortNumericNoiseLine(line: string): boolean {
  return /^\d{1,4}$/.test(line.trim())
}

/**
 * When one line dominates the page (common ODL noise on sparse scans), keep a single copy.
 */
function collapseDominantRepeatedLine(text: string): string {
  const nonEmpty = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (nonEmpty.length < 4) return text

  const counts = new Map<string, number>()
  for (const line of nonEmpty) {
    const key = normalizeLineForDedupe(line)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let dominantKey = ''
  let dominantCount = 0
  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominantCount = count
      dominantKey = key
    }
  }

  const ratio = dominantCount / nonEmpty.length
  const numericNoise =
    isShortNumericNoiseLine(dominantKey) && dominantCount >= 4 && ratio >= 0.35
  if (!numericNoise && ratio < 0.45) return text

  const out: string[] = []
  let dominantKept = false
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      continue
    }
    const key = normalizeLineForDedupe(trimmed)
    if (key === dominantKey) {
      if (dominantKept) continue
      dominantKept = true
    }
    out.push(trimmed)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Clean OpenDataLoader preview text: drop scan/OCR repetition noise before display. */
export function sanitizeOdlPreviewContent(text: string): string {
  const trimmed = stripPdfPageMarkers(text)
  if (!trimmed) return ''
  const htmlCollapsed = collapseRepeatedOdlHtmlNoise(trimmed)
  return collapseDominantRepeatedLine(collapseConsecutiveDuplicateLines(htmlCollapsed))
}

/** Full ODL preview cleanup: layout fixes + HTML/scan noise removal. */
export function postProcessOdlPreviewContent(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const relocated = relocateOdlTableFooters(trimmed)
  return sanitizeOdlPreviewContent(relocated)
}

/**
 * Pick the best ODL page body after anomaly interception — never prefer raw length over cleaned quality.
 */
export function pickBestSanitizedOdlBody(
  ...sources: Array<string | undefined | null>
): string {
  let best = ''
  let bestScore = Number.NEGATIVE_INFINITY

  for (const source of sources) {
    if (!source?.trim()) continue
    const cleaned = postProcessOdlPreviewContent(stripPdfPageMarkers(source))
    if (!cleaned || isPdfPageMarkerOnly(cleaned)) continue

    const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)
    const uniqueLineRatio = lines.length > 0 ? new Set(lines).size / lines.length : 1
    const score = cleaned.length * uniqueLineRatio
    if (score > bestScore) {
      bestScore = score
      best = cleaned
    }
  }

  return best
}
