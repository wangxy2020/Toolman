import {
  hasAppliedPlanFingerprint,
  type PmProject,
  type PmProjectPlan,
  type PmWbsSuggestion,
} from '@toolman/shared'

function storageKey(workspaceId: string): string {
  return `tm-pm-plan-applied:${workspaceId}`
}

/** Optimistic session cache; durable source of truth is project metadata receipts. */
function readAppliedMap(workspaceId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAppliedMap(workspaceId: string, map: Record<string, string>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/** Drop apply fingerprints that point at a deleted / missing project. */
export function clearPmPlanAppliedProject(workspaceId: string, projectId: string): void {
  const map = readAppliedMap(workspaceId)
  let changed = false
  for (const [fingerprint, appliedId] of Object.entries(map)) {
    if (appliedId === projectId) {
      delete map[fingerprint]
      changed = true
    }
  }
  if (changed) writeAppliedMap(workspaceId, map)
}

/** Stable fingerprint so remount / message-id churn cannot re-apply the same plan. */
export function buildPmPlanFingerprint(
  wbs: PmWbsSuggestion[],
  projectPlan?: PmProjectPlan,
): string {
  return JSON.stringify({
    name: '',
    plan: projectPlan ?? null,
    wbs: wbs.map((item) => ({
      title: item.title,
      parentTitle: item.parentTitle ?? null,
      type: item.type ?? null,
      startDate: item.startDate ?? null,
      dueDate: item.dueDate ?? null,
      durationDays: item.durationDays ?? null,
      predecessors: item.predecessors ?? [],
    })),
  })
}

export function findAppliedProjectId(
  projects: PmProject[],
  fingerprint: string,
  workspaceId: string,
): string | null {
  if (!fingerprint) return null
  for (const project of projects) {
    if (hasAppliedPlanFingerprint(project.metadata, fingerprint)) {
      return project.id
    }
  }
  const sessionId = readAppliedMap(workspaceId)[fingerprint]
  if (sessionId && projects.some((project) => project.id === sessionId)) {
    return sessionId
  }
  return null
}

export function rememberAppliedFingerprint(
  workspaceId: string,
  fingerprint: string,
  projectId: string,
): void {
  const map = readAppliedMap(workspaceId)
  map[fingerprint] = projectId
  writeAppliedMap(workspaceId, map)
}
