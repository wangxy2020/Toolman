import type { ReactNode } from 'react'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export function statusBadge(ok: boolean | null | undefined, okLabel: string, badLabel: string): ReactNode {
  if (ok == null) return <span className="tm-settings-static">—</span>
  return (
    <span className={ok ? 'tm-diagnostics-badge tm-diagnostics-badge--ok' : 'tm-diagnostics-badge tm-diagnostics-badge--bad'}>
      {ok ? okLabel : badLabel}
    </span>
  )
}
