import {
  hasAppliedResourcePlanFingerprint,
  type PmProject,
  type PmResourceTaskPlanSuggestion,
} from '@toolman/shared'

export function storageKey(workspaceId: string): string {
  return `tm-pm-resource-plan-applied:${workspaceId}`
}

export function readAppliedMap(workspaceId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeAppliedMap(workspaceId: string, map: Record<string, string>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function assignmentCount(suggestions: readonly PmResourceTaskPlanSuggestion[]): number {
  return suggestions.reduce((sum, task) => sum + task.assignments.length, 0)
}

/** Durable receipts in project metadata first; session map as optimistic fallback. */
export function findAppliedProjectId(
  projects: PmProject[],
  fingerprint: string,
  workspaceId: string,
): string | null {
  if (!fingerprint) return null
  for (const project of projects) {
    if (hasAppliedResourcePlanFingerprint(project.metadata, fingerprint)) {
      return project.id
    }
  }
  const sessionId = readAppliedMap(workspaceId)[fingerprint]
  if (sessionId && projects.some((project) => project.id === sessionId)) {
    return sessionId
  }
  return null
}
