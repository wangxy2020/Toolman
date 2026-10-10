/**
 * Turn inline LaTeX into readable chemistry and math text.
 * The web and mobile chat renderer has no KaTeX, so `$\\text{Fe}$` would otherwise show as source.
 */

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉'
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

const NAMED: Record<string, string> = {
  rightarrow: '→',
  longrightarrow: '→',
  to: '→',
  leftarrow: '←',
  longleftarrow: '←',
  leftrightarrow: '↔',
  rightleftharpoons: '⇌',
  leftrightharpoons: '⇌',
  uparrow: '↑',
  downarrow: '↓',
  times: '×',
  cdot: '·',
  pm: '±',
  mp: '∓',
  degree: '°',
  circ: '°',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  pi: 'π',
  theta: 'θ',
  infty: '∞',
  leq: '≤',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  percent: '%',
}

const WRAPPERS = new Set([
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'operatorname',
  'ce',
])

function scriptDigits(value: string, digits: string): string {
  return value
    .replace(/\d/g, (digit) => digits[Number(digit)] ?? digit)
    .replace(/\+/g, '⁺')
    .replace(/-/g, '⁻')
}

function readGroup(source: string, index: number): { body: string; next: number } | null {
  if (source[index] !== '{') return null
  let depth = 0
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1
    else if (source[cursor] === '}') {
      depth -= 1
      if (depth === 0) return { body: source.slice(index + 1, cursor), next: cursor + 1 }
    }
  }
  return null
}

function convertLatex(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    if (source[index] === '\\') {
      const named = /^\\([a-zA-Z]+)/.exec(source.slice(index))
      if (named?.[1]) {
        const command = named[1]
        const next = index + 1 + command.length
        if (WRAPPERS.has(command)) {
          const group = readGroup(source, next)
          if (group) {
            out += convertLatex(group.body)
            index = group.next
            continue
          }
        }
        if (command === 'frac') {
          const numerator = readGroup(source, next)
          const denominator = numerator ? readGroup(source, numerator.next) : null
          if (numerator && denominator) {
            out += `${convertLatex(numerator.body)}/${convertLatex(denominator.body)}`
            index = denominator.next
            continue
          }
        }
        if (command === 'sqrt') {
          const group = readGroup(source, next)
          if (group) {
            out += `√${convertLatex(group.body)}`
            index = group.next
            continue
          }
        }
        const symbol = NAMED[command]
        if (symbol) {
          out += symbol
          index = next
          continue
        }
        if (command === 'quad' || command === 'qquad') {
          out += ' '
          index = next
          continue
        }
        out += command
        index = next
        continue
      }
      const escaped = source[index + 1]
      if (escaped === ',' || escaped === ';' || escaped === ' ' || escaped === ':') {
        out += escaped === ':' ? '' : ' '
        index += 2
        continue
      }
      if (escaped === '%') {
        out += '%'
        index += 2
        continue
      }
      index += 1
      continue
    }

    if (source[index] === '_' || source[index] === '^') {
      const superscript = source[index] === '^'
      index += 1
      const group = source[index] === '{' ? readGroup(source, index) : null
      const raw = group ? convertLatex(group.body) : (source[index] ?? '')
      if (!group && raw) index += 1
      if (group) index = group.next
      out += superscript ? scriptDigits(raw, SUPERSCRIPT) : scriptDigits(raw, SUBSCRIPT)
      continue
    }

    if (source[index] === '{' || source[index] === '}') {
      index += 1
      continue
    }
    out += source[index]
    index += 1
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

function looksLikeLatex(inner: string): boolean {
  return /[\\_^]/.test(inner)
}

/** Replace `$...$` / `$$...$$` chemistry and math with plain readable text. */
export function replaceLatexMath(text: string): string {
  const swap = (inner: string, original: string) => {
    if (!looksLikeLatex(inner)) return original
    const plain = convertLatex(inner)
    return plain || original
  }
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (original, inner: string) => swap(inner, original))
    .replace(/\\\[([\s\S]+?)\\\]/g, (original, inner: string) => swap(inner, original))
    .replace(/\\\(([\s\S]+?)\\\)/g, (original, inner: string) => swap(inner, original))
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (original, inner: string) => swap(inner, original))
}
