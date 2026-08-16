/** CSP-safe 合价 formula evaluation (+ - * / and parentheses). */

/**
 * CSP-safe arithmetic evaluator (+ - * / and parentheses).
 * Electron's CSP blocks `new Function` / `eval` (`script-src` has no unsafe-eval).
 */
function evaluateArithmeticExpression(input: string): number | null {
  const src = input.replace(/\s+/g, '')
  if (!src) return null
  let i = 0

  const peek = () => src[i] ?? ''
  const consume = (ch: string) => {
    if (peek() !== ch) return false
    i += 1
    return true
  }

  const parseNumber = (): number | null => {
    const start = i
    while (peek() >= '0' && peek() <= '9') i += 1
    if (peek() === '.') {
      i += 1
      while (peek() >= '0' && peek() <= '9') i += 1
    }
    if (i === start) return null
    const value = Number(src.slice(start, i))
    return Number.isFinite(value) ? value : null
  }

  const parseFactor = (): number | null => {
    if (consume('+')) return parseFactor()
    if (consume('-')) {
      const value = parseFactor()
      return value == null ? null : -value
    }
    if (consume('(')) {
      const value = parseExpr()
      if (value == null || !consume(')')) return null
      return value
    }
    return parseNumber()
  }

  const parseTerm = (): number | null => {
    let value = parseFactor()
    if (value == null) return null
    while (peek() === '*' || peek() === '/') {
      const op = peek()
      i += 1
      const right = parseFactor()
      if (right == null) return null
      if (op === '*') value *= right
      else {
        if (right === 0) return null
        value /= right
      }
    }
    return value
  }

  const parseExpr = (): number | null => {
    let value = parseTerm()
    if (value == null) return null
    while (peek() === '+' || peek() === '-') {
      const op = peek()
      i += 1
      const right = parseTerm()
      if (right == null) return null
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  const result = parseExpr()
  if (result == null || i !== src.length || !Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
}

/**
 * Evaluate a 合价 formula.
 * Supports `=工程费+安装`, `=A01+B02` (section code/name/key), plain numbers, and + - * / ( ).
 */
export function evaluateCostFormula(
  formula: string,
  refs: ReadonlyMap<string, number>,
): number | null {
  const trimmed = formula.trim().replace(/＝/g, '=')
  if (!trimmed) return null

  if (!trimmed.startsWith('=') && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed)
    return Number.isFinite(asNumber) ? asNumber : null
  }

  let expr = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed
  if (!expr) return null

  // Normalize full-width operators / spaces users may type with Chinese IME.
  expr = expr
    .replace(/\u3000/g, ' ')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/−/g, '-')
    .replace(/＊/g, '*')
    .replace(/×/g, '*')
    .replace(/／/g, '/')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')

  const keys = [...refs.keys()]
    .filter((key) => key.trim().length > 0)
    .sort((left, right) => right.length - left.length)

  if (keys.length > 0) {
    const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Longest-first alternation so「工程建设其他费」wins over「工程费」.
    const pattern = new RegExp(escaped.join('|'), 'g')
    expr = expr.replace(pattern, (match) => {
      const value = refs.get(match)
      return value != null && Number.isFinite(value) ? `(${value})` : match
    })
  }

  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null
  return evaluateArithmeticExpression(expr)
}

export function addFormulaRefs(
  refs: Map<string, number>,
  value: number | null | undefined,
  ...keys: Array<string | null | undefined>
): void {
  // Missing section amounts count as 0 so formulas like =A+B still resolve.
  const amount = value != null && Number.isFinite(value) ? value : 0
  for (const key of keys) {
    const trimmed = key?.trim()
    if (!trimmed) continue
    if (!refs.has(trimmed)) refs.set(trimmed, amount)
  }
}
