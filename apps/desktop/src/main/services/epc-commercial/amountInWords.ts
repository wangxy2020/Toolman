/**
 * 商业发票金额英文大写：
 * 306117534.26 → "THREE HUNDRED SIX MILLION ONE HUNDRED SEVENTEEN THOUSAND
 * FIVE HUNDRED AND THIRTY-FOUR AND POINT TWENTY-SIX"
 */

const ONES = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN'
]

const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

const SCALES = ['', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION']

export function twoDigitToWords(n: number): string {
  if (n < 20) {
    return ONES[n]
  }
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]
}

/** 三位组转英文；withAnd 时在 HUNDRED 与余数间加 AND（仅用于最低组，与发票惯例一致） */
const threeDigitToWords = (n: number, withAnd: boolean): string => {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} HUNDRED`)
  }
  if (rest > 0) {
    if (hundreds > 0 && withAnd) {
      parts.push('AND')
    }
    parts.push(twoDigitToWords(rest))
  }
  return parts.join(' ')
}

export function integerToEnglishWords(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) {
    return 'ZERO'
  }
  const groups: number[] = []
  let rest = n
  while (rest > 0) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]
    if (group === 0) {
      continue
    }
    const words = threeDigitToWords(group, i === 0)
    parts.push(i > 0 ? `${words} ${SCALES[i]}` : words)
  }
  return parts.join(' ')
}

/** 金额（含两位小数）转英文，小数部分用 "AND POINT XX" 表示 */
export function amountToEnglishWords(amount: number): string {
  const abs = Math.abs(amount)
  let intPart = Math.floor(abs)
  let cents = Math.round((abs - intPart) * 100)
  if (cents >= 100) {
    intPart += 1
    cents = 0
  }
  let words = integerToEnglishWords(intPart)
  if (cents > 0) {
    words += ` AND POINT ${cents < 10 ? `ZERO ${ONES[cents]}` : twoDigitToWords(cents)}`
  }
  return words
}

const CURRENCY_WORDS: Record<string, string> = {
  USD: 'US DOLLARS',
  TZS: 'TANZANIAN SHILLINGS',
  EUR: 'EUROS',
  CNY: 'CHINESE YUAN',
  RMB: 'CHINESE YUAN'
}

export function currencyWordsFor(code?: string): string | null {
  if (!code) {
    return null
  }
  return CURRENCY_WORDS[code.trim().toUpperCase()] ?? null
}
