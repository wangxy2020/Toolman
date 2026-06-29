const STORAGE_PREFIX = 'toolman:group-limit-warning:v1:'

export function hasShownGroupMemberLimitWarning(workspaceId: string): boolean {
  try {
    return Boolean(localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`))
  } catch {
    return false
  }
}

export function markGroupMemberLimitWarningShown(workspaceId: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, String(Date.now()))
  } catch {
    // ignore quota errors
  }
}
