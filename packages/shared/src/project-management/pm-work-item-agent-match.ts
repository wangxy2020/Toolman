export type PmAgentWorkItemMatchable = {
  id: string
  title: string
  metadata?: Record<string, unknown> | null
}

/** Reads a work item's WBS/task code from common metadata keys. */
export function readPmWorkItemAgentCode(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (metadata == null) return null
  const candidates = [metadata.code, metadata.wbsCode, metadata.taskCode]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

/**
 * Match a plan/cost agent suggestion to a work item.
 *
 * Priority: exact `workItemId` → `workItemCode` (against metadata code/wbsCode/taskCode,
 * case-insensitive) → `workItemTitle` (trimmed, case-insensitive exact match).
 */
export function findPmWorkItemForAgentSuggestion<T extends PmAgentWorkItemMatchable>(
  items: readonly T[],
  suggestion: {
    workItemId?: string | null
    workItemTitle?: string | null
    workItemCode?: string | null
  },
): T | undefined {
  const workItemId = suggestion.workItemId?.trim()
  if (workItemId) {
    const byId = items.find((item) => item.id === workItemId)
    if (byId) return byId
  }

  const workItemCode = suggestion.workItemCode?.trim().toLowerCase()
  if (workItemCode) {
    const byCode = items.find(
      (item) => readPmWorkItemAgentCode(item.metadata)?.toLowerCase() === workItemCode,
    )
    if (byCode) return byCode
  }

  const workItemTitle = suggestion.workItemTitle?.trim().toLowerCase()
  if (workItemTitle) {
    const byTitle = items.find((item) => item.title.trim().toLowerCase() === workItemTitle)
    if (byTitle) return byTitle
  }

  return undefined
}

/**
 * Match catalog names that appear as substrings of a task title, preferring longer
 * names first and dropping shorter names already contained within a longer match
 * (e.g. title「钢筋工程」matching both「钢筋」and「钢」keeps only「钢筋」).
 */
export function matchPmCatalogNamesInTitle(
  title: string,
  names: readonly string[],
): string[] {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) return []

  const seen = new Set<string>()
  const candidates: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    if (trimmedTitle.includes(name)) candidates.push(name)
  }

  candidates.sort((left, right) => right.length - left.length)

  const selected: string[] = []
  for (const candidate of candidates) {
    if (selected.some((chosen) => chosen.includes(candidate))) continue
    selected.push(candidate)
  }
  return selected
}

/** `max(1, round(durationDays))` when start/due are both set; otherwise `1`. */
export function estimatePmAssignmentQuantityFromDuration(
  startDate: number | null | undefined,
  dueDate: number | null | undefined,
): number {
  if (startDate == null || dueDate == null || !Number.isFinite(startDate) || !Number.isFinite(dueDate)) {
    return 1
  }
  const durationDays = (dueDate - startDate) / (24 * 60 * 60 * 1000) + 1
  return Math.max(1, Math.round(durationDays))
}
