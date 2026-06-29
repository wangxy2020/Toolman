import type { P2pSyncStatus } from '@toolman/shared'

export function formatSettingsTimestamp(timestamp?: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString()
}

export function syncStatusDotClass(status: P2pSyncStatus): string {
  switch (status) {
    case 'idle':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--idle'
    case 'syncing':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--syncing'
    case 'error':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--error'
  }
}

export function isSettingsFormDirty(
  name: string,
  description: string,
  workspace: { name: string; description?: string | null },
): boolean {
  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  return (
    trimmedName !== workspace.name ||
    (trimmedDescription || null) !== (workspace.description ?? null)
  )
}
