import { mergeSocraticState } from './teaching-detect.js'
import { EMPTY_SOCRATIC_STATE, SocraticStateSchema, type SocraticState } from './teaching-types.js'

export type ThoughtChainCard = {
  confirmed: string
  assumption: string
}

const CARD_RE = /```socratic-card\s*([\s\S]*?)```/i
const STATE_RE = /```socratic-state\s*([\s\S]*?)```/i

export function parseThoughtChainCard(text: string): ThoughtChainCard | null {
  const match = text.match(CARD_RE)
  if (!match?.[1]) return null
  const body = match[1]
  const confirmed = body.match(/confirmed:\s*(.+)/i)?.[1]?.trim() || '无'
  const assumption = body.match(/assumption:\s*(.+)/i)?.[1]?.trim() || '无'
  if (confirmed === '无' && assumption === '无') return null
  return { confirmed, assumption }
}

export function parseSocraticStateFromText(text: string): Partial<SocraticState> | null {
  const match = text.match(STATE_RE)
  if (!match?.[1]) return null
  try {
    const json = JSON.parse(match[1].trim()) as unknown
    const parsed = SocraticStateSchema.partial().safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Remove machine-only Socratic fences from user-facing text (chat bubble / TTS).
 * Also drops a trailing incomplete fence while the model is still streaming.
 */
export function stripSocraticMachineBlocks(text: string): string {
  return text
    .replace(CARD_RE, '')
    .replace(STATE_RE, '')
    .replace(/```socratic-(?:card|state)\s*[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function applySocraticStateFromAssistantText(
  current: SocraticState | undefined,
  text: string,
): SocraticState {
  const base = current ?? { ...EMPTY_SOCRATIC_STATE }
  const patch = parseSocraticStateFromText(text)
  if (!patch) {
    const card = parseThoughtChainCard(text)
    if (!card) return base
    const nextClaims =
      card.confirmed !== '无' && !base.confirmedClaims.includes(card.confirmed)
        ? [...base.confirmedClaims, card.confirmed]
        : base.confirmedClaims
    const nextAssumptions =
      card.assumption !== '无' && !base.openAssumptions.includes(card.assumption)
        ? [...base.openAssumptions, card.assumption]
        : base.openAssumptions
    return mergeSocraticState(base, {
      confirmedClaims: nextClaims,
      openAssumptions: nextAssumptions,
    })
  }
  return mergeSocraticState(base, patch)
}
