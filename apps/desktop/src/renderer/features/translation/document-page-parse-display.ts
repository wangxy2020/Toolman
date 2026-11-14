import { coalescePipeTableLines } from './translation-display-table'
import { reflowTranslationDisplayLines } from './translation-paragraphs'
import {
  flattenLayoutHtmlTable,
  hasGfmTableMarkup,
  hasHtmlMarkup,
  htmlPreviewToVisibleText,
  isLayoutGfmTable,
  isLayoutHtmlTable,
  looksLikeProsePipeRow,
  normalizeGfmTableMarkup,
  repairDocumentPreviewTables,
  stripBrokenGfmTableNoise,
} from './translation-page-source-quality'

const GFM_SEP_CELL_RE = /^:?-{3,}:?$/
const GFM_SEP_ROW_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/
const GFM_PIPE_ROW_RE = /^\s*\|.+\|\s*$/

function splitPipeCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/**
 * Flatten 1-column letterhead stubs (`|address|\n|---|`) to prose, but keep
 * multi-column claim/schedule GFM tables as pipes so parse uses the same
 * heading/paragraph/table block layout as translate.
 */
export function prepareParseLayoutPlain(text: string): string {
  // Coalesce soft-wrapped / <br> pipe rows BEFORE normalize so a 4-col claim
  // header is not shredded into a 2-cell fragment.
  const body = normalizeGfmTableMarkup(coalescePipeTableLines(text))
  if (!body.trim()) return ''
  if (!/\|/.test(body)) return reflowTranslationDisplayLines(body)

  const lines = body.split('\n')
  const out: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    const next = lines[index + 1] ?? ''
    if (GFM_PIPE_ROW_RE.test(line.trim()) && GFM_SEP_ROW_RE.test(next.trim())) {
      const headers = splitPipeCells(line)
      const sepCells = splitPipeCells(next)
      const colCount = Math.max(headers.length, sepCells.length, 1)
      index += 2
      const rows: string[][] = []
      const leadingProse: string[] = []
      const trailingProse: string[] = []
      let seenData = false
      while (index < lines.length && GFM_PIPE_ROW_RE.test((lines[index] ?? '').trim())) {
        const cells = splitPipeCells(lines[index]!)
        if (cells.length > 0 && cells.every((cell) => !cell || GFM_SEP_CELL_RE.test(cell))) {
          break
        }
        if (colCount > 1 && looksLikeProsePipeRow(cells, colCount)) {
          const flat = cells
            .map((cell) => cell.replace(/<br\s*\/?>/gi, '\n').trim())
            .filter(Boolean)
            .join(' ')
          if (!seenData) leadingProse.push(flat)
          else trailingProse.push(flat)
          index += 1
          continue
        }
        seenData = true
        rows.push(cells)
        index += 1
      }
      if (colCount <= 1) {
        // Letterhead / layout stub → prose lines (never a fake 1-col table).
        for (const cell of [...headers, ...rows.flat()]) {
          const flat = cell.replace(/<br\s*\/?>/gi, '\n').trim()
          if (flat) out.push(flat)
        }
        continue
      }
      for (const line of leadingProse) if (line) out.push(line)
      // Real data grid — keep GFM pipes for buildTranslationDisplayBlocks.
      out.push(`|${headers.join('|')}|`)
      out.push(`|${Array.from({ length: colCount }, () => '---').join('|')}|`)
      for (const row of rows) {
        const padded = Array.from({ length: colCount }, (_, i) => row[i] ?? '')
        out.push(`|${padded.join('|')}|`)
      }
      for (const line of trailingProse) if (line) out.push(line)
      continue
    }
    out.push(line)
    index += 1
  }

  let plain = out.join('\n')
  if (isLayoutGfmTable(plain) && !hasGfmTableMarkup(plain)) {
    plain = stripBrokenGfmTableNoise(plain)
  }
  // Reflow prose only — never reflow inside pipe rows (would break columns).
  const chunks = plain.replace(/\n{3,}/g, '\n\n').split('\n')
  const reflowed: string[] = []
  let proseBuf: string[] = []
  const flushProse = () => {
    if (proseBuf.length === 0) return
    const block = reflowTranslationDisplayLines(proseBuf.join('\n'))
    if (block) reflowed.push(block)
    proseBuf = []
  }
  for (const line of chunks) {
    if (/^\s*\|/.test(line)) {
      flushProse()
      reflowed.push(line)
      continue
    }
    proseBuf.push(line)
  }
  flushProse()
  return reflowed.join('\n').trim()
}

/** Final parse-preview text for one page (what applyParseResults caches). */
export function resolveParseDisplayContent(
  plain: string,
  markdown: string,
  rawPlain: string,
  rawMarkdown: string,
): { displayPlain: string; displayMarkdown: string } {
  const layoutSource = rawMarkdown.trim() || rawPlain.trim() || markdown.trim() || plain.trim()

  // Real ODL HTML data tables stay as HTML (Markdown renderer). Layout HTML → prose.
  if (hasHtmlMarkup(layoutSource) && /<table\b/i.test(layoutSource)) {
    if (isLayoutHtmlTable(layoutSource)) {
      const flattened = reflowTranslationDisplayLines(flattenLayoutHtmlTable(layoutSource))
      const fullVisible = htmlPreviewToVisibleText(layoutSource)
      if (
        flattened.trim() &&
        Array.from(flattened).length + 40 >= Array.from(fullVisible).length
      ) {
        return { displayPlain: flattened, displayMarkdown: flattened }
      }
      const repaired = repairDocumentPreviewTables(layoutSource)
      return {
        displayPlain: htmlPreviewToVisibleText(repaired),
        displayMarkdown: repaired,
      }
    }
    const repaired = repairDocumentPreviewTables(layoutSource)
    return {
      displayPlain: htmlPreviewToVisibleText(repaired),
      displayMarkdown: repaired,
    }
  }

  // GFM / pipes: same layout input as translate — plain + data pipes, NOT HTML.
  // Converting to <table> here is what mixed letter paragraphs into cells.
  const layoutPlain = prepareParseLayoutPlain(layoutSource)
  return { displayPlain: layoutPlain, displayMarkdown: layoutPlain }
}
