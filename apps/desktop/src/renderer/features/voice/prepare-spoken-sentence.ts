/**
 * Rewrite a sentence before TTS.
 * Chemical formulas become Chinese names, and a trailing English sentence is dropped.
 */

const CN_COUNT = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const ELEMENTS: Record<string, string> = {
  H: '氢',
  He: '氦',
  Li: '锂',
  Be: '铍',
  B: '硼',
  C: '碳',
  N: '氮',
  O: '氧',
  F: '氟',
  Ne: '氖',
  Na: '钠',
  Mg: '镁',
  Al: '铝',
  Si: '硅',
  P: '磷',
  S: '硫',
  Cl: '氯',
  Ar: '氩',
  K: '钾',
  Ca: '钙',
  Cr: '铬',
  Mn: '锰',
  Fe: '铁',
  Cu: '铜',
  Zn: '锌',
  Br: '溴',
  Ag: '银',
  I: '碘',
  Ba: '钡',
  Sn: '锡',
  Pb: '铅',
  Hg: '汞',
}

const METALS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Cr', 'Mn', 'Fe', 'Cu', 'Zn', 'Ag', 'Ba', 'Sn', 'Pb', 'Hg',
])

const SYMBOLS = Object.keys(ELEMENTS).sort((left, right) => right.length - left.length)

type Polyatomic = {
  ion: string
  salt: string
  charge: number
}

/** Keyed by element symbols and counts in written order, e.g. S1O4. */
const POLYATOMICS: Record<string, Polyatomic> = {
  O1H1: { ion: '氢氧根', salt: '氢氧化', charge: -1 },
  H1O1: { ion: '氢氧根', salt: '氢氧化', charge: -1 },
  S1O4: { ion: '硫酸根', salt: '硫酸', charge: -2 },
  S1O3: { ion: '亚硫酸根', salt: '亚硫酸', charge: -2 },
  N1O3: { ion: '硝酸根', salt: '硝酸', charge: -1 },
  N1O2: { ion: '亚硝酸根', salt: '亚硝酸', charge: -1 },
  C1O3: { ion: '碳酸根', salt: '碳酸', charge: -2 },
  P1O4: { ion: '磷酸根', salt: '磷酸', charge: -3 },
  N1H4: { ion: '铵根', salt: '铵', charge: 1 },
  H1C1O3: { ion: '碳酸氢根', salt: '碳酸氢', charge: -1 },
  H1S1O4: { ion: '硫酸氢根', salt: '硫酸氢', charge: -1 },
  Mn1O4: { ion: '高锰酸根', salt: '高锰酸', charge: -1 },
  C2H3O2: { ion: '醋酸根', salt: '醋酸', charge: -1 },
  Si1O3: { ion: '硅酸根', salt: '硅酸', charge: -2 },
}

const SPECIAL_MOLECULES: Record<string, string> = {
  H2O1: '水',
  H2S1O4: '硫酸',
  H1N1O3: '硝酸',
  H1Cl1: '氯化氢',
  H3P1O4: '磷酸',
  N1H3: '氨',
  C1H4: '甲烷',
}

const DIATOMIC_GAS: Record<string, string> = {
  H: '氢气',
  N: '氮气',
  O: '氧气',
  F: '氟气',
  Cl: '氯气',
  Br: '溴',
  I: '碘',
}

const SKIP_TOKENS = new Set(['OK', 'AI', 'PDF', 'JSON', 'HTTP', 'HTTPS', 'URL', 'TTS', 'APP'])

type ElementPiece = { kind: 'element'; symbol: string; count: number }
type GroupPiece = { kind: 'group'; inner: string; count: number }
type Piece = ElementPiece | GroupPiece

type ElementUnit = { type: 'element'; symbol: string; count: number }
type PolyUnit = { type: 'poly'; info: Polyatomic; count: number }
type Unit = ElementUnit | PolyUnit

const FORMULA_TOKEN =
  /(?<![A-Za-z])[A-Z](?:[A-Za-z0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻^()+\-])*/g

function countWord(count: number): string {
  if (count <= 1) return ''
  return CN_COUNT[count] ?? String(count)
}

/** Nonmetal oxides keep 一, so CO is 一氧化碳 rather than 氧化碳. */
function countWordKeepOne(count: number): string {
  if (count <= 1) return '一'
  return CN_COUNT[count] ?? String(count)
}

function normalizeSubscripts(token: string): string {
  return token.replace(/[₀-₉]/g, (char) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(char)))
}

function superscriptMagnitude(digits: string): number {
  if (!digits) return 1
  const normalized = digits.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(char)))
  const magnitude = Number(normalized)
  return Number.isInteger(magnitude) && magnitude > 0 ? magnitude : 1
}

/** Subscripts are atom counts. Superscripts and a trailing +/− are the ionic charge. */
function splitFormulaCharge(token: string): { body: string; charge: number } {
  const superscript = /^(.*?)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])$/u.exec(token)
  if (superscript?.[1] && superscript[3]) {
    const magnitude = superscriptMagnitude(superscript[2] ?? '')
    const sign = superscript[3] === '⁺' ? 1 : -1
    return { body: normalizeSubscripts(superscript[1]), charge: sign * magnitude }
  }
  const caret = /^(.*?)\^(\d*)([+-])$/u.exec(token)
  if (caret?.[1] && caret[3]) {
    const magnitude = caret[2] ? Number(caret[2]) : 1
    const sign = caret[3] === '+' ? 1 : -1
    return { body: normalizeSubscripts(caret[1]), charge: sign * magnitude }
  }
  const plain = /^(.*)([+-])$/u.exec(token)
  if (plain?.[1] && plain[2]) {
    const head = plain[1]
    const sign = plain[2] === '+' ? 1 : -1
    for (const digits of [1, 2, 0]) {
      if (digits > head.length) continue
      const magnitudeText = digits === 0 ? '' : head.slice(-digits)
      if (digits > 0 && !/^\d+$/.test(magnitudeText)) continue
      const magnitude = magnitudeText ? Number(magnitudeText) : 1
      if (magnitude > 7) continue
      const body = normalizeSubscripts(head.slice(0, head.length - digits))
      if (parsePieces(body)) return { body, charge: sign * magnitude }
    }
  }
  return { body: normalizeSubscripts(token), charge: 0 }
}

function readElement(source: string, index: number): { symbol: string; next: number } | null {
  for (const symbol of SYMBOLS) {
    if (source.startsWith(symbol, index)) return { symbol, next: index + symbol.length }
  }
  return null
}

function readCount(source: string, index: number): { count: number; next: number } {
  let end = index
  while (end < source.length && source[end]! >= '0' && source[end]! <= '9') end += 1
  if (end === index) return { count: 1, next: index }
  const count = Number(source.slice(index, end))
  if (!Number.isInteger(count) || count <= 0) return { count: 1, next: index }
  return { count, next: end }
}

function parsePieces(source: string): Piece[] | null {
  const pieces: Piece[] = []
  let index = 0
  while (index < source.length) {
    if (source[index] === '(') {
      const close = source.indexOf(')', index)
      if (close < 0) return null
      const inner = source.slice(index + 1, close)
      if (!parsePieces(inner)) return null
      const { count, next } = readCount(source, close + 1)
      pieces.push({ kind: 'group', inner, count })
      index = next
      continue
    }
    const element = readElement(source, index)
    if (!element) return null
    const { count, next } = readCount(source, element.next)
    pieces.push({ kind: 'element', symbol: element.symbol, count })
    index = next
  }
  return pieces.length > 0 ? pieces : null
}

function elementSignature(pieces: ElementPiece[]): string {
  return pieces.map((piece) => `${piece.symbol}${piece.count}`).join('')
}

function unitsFromPieces(pieces: Piece[]): Unit[] | null {
  const grouped: Array<ElementPiece | GroupPiece> = pieces

  const units: Unit[] = []
  const pending: ElementPiece[] = []
  const flushPending = (): boolean => {
    let index = 0
    while (index < pending.length) {
      let matched: { info: Polyatomic; length: number } | null = null
      for (let length = pending.length - index; length >= 1; length -= 1) {
        const info = POLYATOMICS[elementSignature(pending.slice(index, index + length))]
        if (!info) continue
        matched = { info, length }
        break
      }
      if (matched && matched.length >= 2) {
        units.push({ type: 'poly', info: matched.info, count: 1 })
        index += matched.length
        continue
      }
      const element = pending[index]
      if (!element) return false
      units.push({ type: 'element', symbol: element.symbol, count: element.count })
      index += 1
    }
    pending.length = 0
    return true
  }

  for (const piece of grouped) {
    if (piece.kind === 'group') {
      if (!flushPending()) return null
      const innerPieces = parsePieces(piece.inner)
      if (!innerPieces || innerPieces.some((item) => item.kind !== 'element')) return null
      const info = POLYATOMICS[elementSignature(innerPieces as ElementPiece[])]
      if (!info) return null
      units.push({ type: 'poly', info, count: piece.count })
      continue
    }
      pending.push(piece)
  }
  if (!flushPending()) return null
  return units.length > 0 ? units : null
}

function cationLabel(symbol: string, oxidation: number): string {
  if (symbol === 'Fe') return oxidation === 2 ? '亚铁' : '铁'
  if (symbol === 'Cu') return oxidation <= 1 ? '亚铜' : '铜'
  return ELEMENTS[symbol] ?? symbol
}

function elementIon(symbol: string, charge: number): string {
  const name = ELEMENTS[symbol] ?? symbol
  if (charge > 0) {
    if (symbol === 'Fe' || symbol === 'Cu') return `${cationLabel(symbol, charge)}离子`
    return `${name}离子`
  }
  return `${name}离子`
}

function oxidationOf(metalCount: number, anionCharge: number, anionCount: number): number {
  if (metalCount <= 0) return 0
  return Math.abs((anionCharge * anionCount) / metalCount)
}

function speakUnits(units: Unit[], charge: number): string | null {
  if (units.length === 1) {
    const only = units[0]!
    if (only.type === 'poly') return `${only.info.ion}离子`
    if (charge !== 0) return elementIon(only.symbol, charge)
    if (only.count === 2 && DIATOMIC_GAS[only.symbol]) return DIATOMIC_GAS[only.symbol]!
    if (only.count === 1) return ELEMENTS[only.symbol] ?? null
    return null
  }

  if (charge !== 0) return null

  if (units.length === 2) {
    const [left, right] = units as [Unit, Unit]
    if (left.type === 'element' && right.type === 'poly' && right.info.charge < 0 && METALS.has(left.symbol)) {
      const ox = oxidationOf(left.count, right.info.charge, right.count)
      return `${right.info.salt}${cationLabel(left.symbol, ox)}`
    }
    if (right.type === 'element' && left.type === 'poly' && left.info.charge > 0) {
      return `${ELEMENTS[right.symbol] ?? right.symbol}化${left.info.salt}`
    }
    if (left.type === 'poly' && right.type === 'poly') {
      const anion = left.info.charge < 0 ? left : right
      const cation = anion === left ? right : left
      if (anion.type === 'poly' && cation.type === 'poly') return `${anion.info.salt}${cation.info.salt}`
    }
    if (left.type === 'element' && right.type === 'element') {
      return speakBinary(left, right)
    }
  }
  return null
}

function speakBinary(left: ElementUnit, right: ElementUnit): string | null {
  const leftMetal = METALS.has(left.symbol)
  const rightMetal = METALS.has(right.symbol)
  let anion = right
  let cation = left
  if (leftMetal && !rightMetal) {
    cation = left
    anion = right
  } else if (rightMetal && !leftMetal) {
    cation = right
    anion = left
    } else if (!leftMetal && !rightMetal) {
      const anionFirst = ['O', 'F', 'Cl', 'Br', 'I', 'S'].includes(right.symbol)
      anion = anionFirst ? right : left
      cation = anion === right ? left : right
      if (anion.symbol === 'O') {
        return `${countWordKeepOne(anion.count)}氧化${countWord(cation.count)}${ELEMENTS[cation.symbol]}`
      }
      return `${countWord(anion.count)}${ELEMENTS[anion.symbol]}化${countWord(cation.count)}${ELEMENTS[cation.symbol]}`
    } else {
    return null
  }

  if (anion.symbol === 'O' && (anion.count > 1 || cation.count > 1)) {
    return `${countWord(anion.count)}氧化${countWord(cation.count)}${ELEMENTS[cation.symbol]}`
  }
      const anionValence = anion.symbol === 'O' || anion.symbol === 'S' ? -2 : -1
      const ox = oxidationOf(cation.count, anionValence, anion.count)
  return `${ELEMENTS[anion.symbol]}化${cationLabel(cation.symbol, ox)}`
}

function speakFormulaToken(token: string): string | null {
  if (SKIP_TOKENS.has(token)) return null
  const { body, charge } = splitFormulaCharge(token)
  if (!body) return null
  const pieces = parsePieces(body)
  if (!pieces) return null
  const units = unitsFromPieces(pieces)
  if (!units) return null
  const special = SPECIAL_MOLECULES[elementSignature(pieces.flatMap((piece) => expandPiece(piece)))]
  if (special && charge === 0) return special
  return speakUnits(units, charge)
}

function expandPiece(piece: Piece): ElementPiece[] {
  if (piece.kind === 'element') return [piece]
  const inner = parsePieces(piece.inner)
  if (!inner) return []
  return inner.flatMap((item) => (item.kind === 'element' ? [{ ...item, count: item.count * piece.count }] : []))
}

function replaceChemicalFormulas(text: string): string {
  return text.replace(FORMULA_TOKEN, (token) => speakFormulaToken(token) ?? token)
}

function isMostlyEnglish(text: string): boolean {
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return cjk === 0 && latin >= 8
}

function stripTrailingEnglishClause(text: string): string {
  const match = /^(.*[\u4e00-\u9fff].*?)([A-Za-z][A-Za-z0-9 ,'"():;\-]{11,}[.?!]?)\s*$/u.exec(text)
  if (!match?.[1] || !match[2]) return text
  if ((match[2].match(/[\u4e00-\u9fff]/g)?.length ?? 0) > 0) return text
  return match[1].trim()
}

/** Chinese chemical names for formulas, without a trailing English sentence. */
export function prepareSpokenSentence(sentence: string): string {
  let next = replaceChemicalFormulas(sentence).trim()
  if (/^(?:confirmed|assumption)\b/i.test(next)) return ''
  if (/^\{[\s\S]*\}$/.test(next)) return ''
  next = stripTrailingEnglishClause(next)
  if (isMostlyEnglish(next)) return ''
  return next.replace(/[ \t]{2,}/g, ' ').trim()
}
