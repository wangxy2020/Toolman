import type { ExcelReadSnapshot } from './excel-mcp-task.service'
import {
  enrichUsdAmountModifyValue,
  findAmountInWordsCellFromSnapshot,
  isAmountInWordsIssue,
} from './excel-review-amount-words'
import { type ExcelReviewIssue, requestsExcelDirectFix } from './excel-review-types'

function parseCellRow(address: string): string | null {
  const match = address.toUpperCase().match(/^[A-Z]+(\d+)$/)
  return match?.[1] ?? null
}

function lettersToCol(letters: string): number {
  let col = 0
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }
  return col
}

function snapCellViaMerges(sheet: string, cell: string, snapshot?: ExcelReadSnapshot): string {
  const merges = snapshot?.mergesBySheet[sheet] ?? []
  const match = cell.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) return cell
  const colLetters = match[1]!
  const row = Number.parseInt(match[2]!, 10)
  let col = 0
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64)
  }

  for (const merge of merges) {
    const parts = merge.split(':')
    const startMatch = (parts[0] ?? merge).toUpperCase().match(/^([A-Z]+)(\d+)$/)
    const endMatch = (parts[1] ?? parts[0] ?? merge).toUpperCase().match(/^([A-Z]+)(\d+)$/)
    if (!startMatch || !endMatch) continue
    const startCol = lettersToCol(startMatch[1]!)
    const startRow = Number.parseInt(startMatch[2]!, 10)
    const endCol = lettersToCol(endMatch[1]!)
    const endRow = Number.parseInt(endMatch[2]!, 10)
    if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
      return `${startMatch[1]}${startMatch[2]}`
    }
  }
  return cell
}

function snapCellToRowContent(
  sheet: string,
  cell: string,
  snapshot?: ExcelReadSnapshot,
  issue?: ExcelReviewIssue,
): string {
  if (issue && isAmountInWordsIssue(issue, sheet, snapshot)) {
    const wordsCell = findAmountInWordsCellFromSnapshot(sheet, snapshot)
    if (wordsCell) return wordsCell
  }

  if (!snapshot) return cell
  const cells = snapshot.cellsBySheet[sheet]
  if (!cells) return cell
  const upper = cell.toUpperCase()
  if (cells[upper]?.trim()) return upper

  const row = parseCellRow(upper)
  if (!row) return upper

  let best = upper
  let bestScore = 0
  for (const [addr, text] of Object.entries(cells)) {
    if (parseCellRow(addr) !== row) continue
    const score = text.trim().length
    if (score > bestScore) {
      bestScore = score
      best = addr
    }
  }
  return best
}

function normalizeSheetName(sheet: string, sheetNames: string[]): string {
  if (sheetNames.includes(sheet)) return sheet
  const caseInsensitive = sheetNames.find((name) => name.toLowerCase() === sheet.toLowerCase())
  if (caseInsensitive) return caseInsensitive
  if ((sheet === 'Sheet1' || sheet === 'sheet1') && sheetNames.length === 1) {
    return sheetNames[0]!
  }
  return sheet
}

export function normalizeExcelReviewIssues(
  issues: ExcelReviewIssue[],
  options: { userRequest: string; snapshot?: ExcelReadSnapshot },
): ExcelReviewIssue[] {
  const sheetNames = options.snapshot?.sheetNames ?? []
  const preferModify = requestsExcelDirectFix(options.userRequest)

  return issues.map((issue) => {
    let sheet = issue.sheet
    if (sheetNames.length > 0) {
      sheet = normalizeSheetName(issue.sheet, sheetNames)
    }
    let cell = issue.cell.toUpperCase()
    cell = snapCellViaMerges(sheet, cell, options.snapshot)

    let action = issue.action
    const value = issue.value
    const comment = issue.comment

    const draftIssue = { ...issue, sheet, cell, action, value, comment }
    if (isAmountInWordsIssue(draftIssue, sheet, options.snapshot)) {
      const wordsCell = findAmountInWordsCellFromSnapshot(sheet, options.snapshot)
      if (wordsCell) cell = wordsCell
    } else {
      cell = snapCellToRowContent(sheet, cell, options.snapshot, draftIssue)
    }

    if (
      preferModify &&
      action === 'highlight' &&
      (issue.category === 'error' || issue.severity === 'high') &&
      comment &&
      /金额|大写|SAY U\.S\. DOLLARS|不符|应改为|修正为|应修正/i.test(comment)
    ) {
      const cellText = options.snapshot?.cellsBySheet[sheet]?.[cell] ?? ''
      if (
        (/SAY\s+U\.?S\.?\s+DOLLARS|AMOUNT\s+IN\s+WORDS/i.test(cellText) ||
          /金额|大写/i.test(comment)) &&
        /[\d,]+\.\d{2}/.test(comment)
      ) {
        action = 'modify'
      }
    }

    const enriched = enrichUsdAmountModifyValue(
      {
        ...issue,
        sheet,
        cell,
        action,
        value,
        comment,
      },
      options.snapshot,
    )

    return enriched
  })
}
