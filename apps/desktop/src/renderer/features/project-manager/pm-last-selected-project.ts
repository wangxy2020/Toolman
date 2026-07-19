/** Last concrete project selected in plan-management header (localStorage). */

function storageKey(workspaceId: string): string {
  return `toolman.pm.lastSelectedProject.${workspaceId}`
}

export function readLastSelectedProjectId(workspaceId: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return null
    const value = raw.trim()
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function writeLastSelectedProjectId(workspaceId: string, projectId: string): void {
  try {
    localStorage.setItem(storageKey(workspaceId), projectId)
  } catch {
    // ignore quota / private-mode failures
  }
}

/** Prefer last used project when present in the list; otherwise first project. */
export function resolveDefaultProjectId(
  workspaceId: string,
  projects: ReadonlyArray<{ id: string }>,
): string | null {
  if (projects.length === 0) return null
  const lastId = readLastSelectedProjectId(workspaceId)
  if (lastId && projects.some((project) => project.id === lastId)) {
    return lastId
  }
  return projects[0]?.id ?? null
}
