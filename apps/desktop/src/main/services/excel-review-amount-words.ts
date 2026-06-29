import type { ExcelReadSnapshot } from './excel-mcp-task.service'
import type { ExcelReviewIssue } from './excel-review-types'

function parseAmountFromComment(comment: string): number | null {
  const match = comment.match(/[\$€£]?\s*([\d,]+\.\d{2})/)
  if (!match?.[1]) return null
  const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const USD_ONES = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
]
const USD_TEENS = [
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
]
const USD_TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
]

function usdUnder100(n: number): string {
  if (n === 0) return ''
  if (n < 10) return USD_ONES[n]!
  if (n < 20) return USD_TEENS[n - 10]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones ? `${USD_TENS[tens]}-${USD_ONES[ones]}` : USD_TENS[tens]!
}

function usdUnder1000(n: number): string {
  if (n === 0) return ''
  if (n < 100) return usdUnder100(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const head = `${USD_ONES[hundreds]} HUNDRED`
  return rest ? `${head} ${usdUnder100(rest)}` : head
}

function usdIntegerWords(n: number): string {
  if (n === 0) return 'ZERO'
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (billions) parts.push(`${usdUnder1000(billions)} BILLION`)
  if (millions) parts.push(`${usdUnder1000(millions)} MILLION`)
  if (thousands) parts.push(`${usdUnder1000(thousands)} THOUSAND`)
  if (rest) parts.push(usdUnder1000(rest))
  return parts.join(' ')
}

export function formatUsdAmountInWords(amount: number): string {
  const safe = Math.round(amount * 100) / 100
  const dollars = Math.floor(safe)
  const cents = Math.round((safe - dollars) * 100)
  const dollarWords = usdIntegerWords(dollars)
  if (cents === 0) return `SAY U.S. DOLLARS ${dollarWords} ONLY.`
  return `SAY U.S. DOLLARS ${dollarWords} AND ${usdUnder100(cents)} CENTS ONLY.`
}

export function buildAmountInWordsCellValue(existingText: string, amount: number): string {
  const wordsLine = formatUsdAmountInWords(amount)
  const trimmed = existingText.trim()
  if (!trimmed) return wordsLine

  if (/AMOUNT\s+IN\s+WORDS/i.test(trimmed)) {
    const sayIndex = trimmed.search(/SAY\s+U\.?S\.?\s+DOLLARS/i)
    if (sayIndex >= 0) {
      return `${trimmed.slice(0, sayIndex)}${wordsLine}`
    }
    const prefix = trimmed.match(/^([\s\S]*?AMOUNT\s+IN\s+WORDS\s*:?\s*)/i)?.[1]
    if (prefix) return `${prefix}${wordsLine}`
    return `${trimmed}\n${wordsLine}`
  }

  if (/SAY\s+U\.?S\.?\s+DOLLARS/i.test(trimmed)) return wordsLine
  return wordsLine
}

export function isAmountInWordsIssue(
  issue: ExcelReviewIssue,
  sheet: string,
  snapshot?: ExcelReadSnapshot,
): boolean {
  const comment = issue.comment ?? ''
  const value = String(issue.value ?? '')
  const cellText = snapshot?.cellsBySheet[sheet]?.[issue.cell.toUpperCase()] ?? ''
  return /SAY\s+U\.?S\.?\s+DOLLARS|金额\s*大写|AMOUNT\s+IN\s+WORDS|大写金额|in\s+words/i.test(
    `${comment}\n${value}\n${cellText}`,
  )
}

function scoreAmountInWordsCellText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  let score = 0
  if (/AMOUNT\s+IN\s+WORDS/i.test(text)) score += 100
  if (/SAY\s+U\.?S\.?\s+DOLLARS/i.test(text)) score += 80
  if (
    /\b(?:ONE|HUNDRED|THOUSAND)\b/i.test(text) &&
    /CENTS?\s+ONLY/i.test(text)
  ) {
    score += 20
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) score -= 100
  if (/^=/.test(trimmed)) score -= 50
  if (/^Total overdue interest/i.test(trimmed)) score -= 30
  return score
}

export function findAmountInWordsCellFromSnapshot(
  sheet: string,
  snapshot?: ExcelReadSnapshot,
): string | null {
  const cells = snapshot?.cellsBySheet[sheet]
  if (!cells) return null

  let best: string | null = null
  let bestScore = 0
  for (const [addr, text] of Object.entries(cells)) {
    const score = scoreAmountInWordsCellText(text)
    if (score > bestScore) {
      bestScore = score
      best = addr
    }
  }
  return bestScore > 0 ? best : null
}

export function enrichUsdAmountModifyValue(
  issue: ExcelReviewIssue,
  snapshot?: ExcelReadSnapshot,
): ExcelReviewIssue {
  if (issue.action !== 'modify') return issue
  if (issue.value != null && issue.value !== '' && !isAmountInWordsIssue(issue, issue.sheet, snapshot)) {
    return issue
  }

  const comment = issue.comment ?? ''
  const cellText = snapshot?.cellsBySheet[issue.sheet]?.[issue.cell] ?? ''
  if (!isAmountInWordsIssue(issue, issue.sheet, snapshot)) return issue

  const amount = parseAmountFromComment(comment)
  if (amount == null) return issue

  const existingText =
    cellText ||
    Object.values(snapshot?.cellsBySheet[issue.sheet] ?? {}).find((text) =>
      /SAY\s+U\.?S\.?\s+DOLLARS|AMOUNT\s+IN\s+WORDS/i.test(text),
    ) ||
    ''

  return { ...issue, value: buildAmountInWordsCellValue(existingText, amount) }
}
