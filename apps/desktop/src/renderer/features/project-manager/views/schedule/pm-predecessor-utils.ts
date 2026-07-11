import type { PmWorkItemRelation, PmWorkItemRelationType } from '@toolman/shared'

export type PredecessorToken = {
  index: number
  type: PmWorkItemRelationType
  lagDays: number
}

const PREDECESSOR_RE = /^(\d+)(FS|SS|FF|SF)?([+-]\d+)?$/i

export function formatPredecessorToken(
  index: number,
  type: PmWorkItemRelationType,
  lagDays: number,
): string {
  if (lagDays === 0) return `${index}${type}`
  const sign = lagDays > 0 ? '+' : ''
  return `${index}${type}${sign}${lagDays}`
}

export function formatPredecessorsForItem(
  relations: PmWorkItemRelation[],
  toWorkItemId: string,
  indexById: Map<string, number>,
): string {
  const parts: string[] = []
  for (const relation of relations) {
    if (relation.toWorkItemId !== toWorkItemId) continue
    const index = indexById.get(relation.fromWorkItemId)
    if (index == null) continue
    parts.push(formatPredecessorToken(index, relation.type, relation.lagDays))
  }
  return parts.join(', ')
}

export function parsePredecessors(input: string): PredecessorToken[] {
  const cleaned = input.trim().replace(/\s+/g, '')
  if (!cleaned) return []

  const tokens: PredecessorToken[] = []
  for (const part of cleaned.split(/[,;，、]+/)) {
    const match = part.match(PREDECESSOR_RE)
    if (!match) continue
    const index = Number.parseInt(match[1]!, 10)
    if (!Number.isFinite(index) || index < 1) continue
    const type = (match[2]?.toUpperCase() ?? 'FS') as PmWorkItemRelationType
    const lagDays = match[3] ? Number.parseInt(match[3], 10) : 0
    tokens.push({ index, type, lagDays: Number.isFinite(lagDays) ? lagDays : 0 })
  }
  return tokens
}
