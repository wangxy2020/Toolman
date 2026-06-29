import type { ReactNode } from 'react'

export function FormLabel({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <span className="tm-kb-settings-label tm-kb-settings-label--with-hint">
      {children}
      {hint ? (
        <span className="tm-kb-settings-help" title={hint} aria-label={hint}>
          ⓘ
        </span>
      ) : null}
    </span>
  )
}

export function WatchStatusBadge({
  loading,
  watching,
  loadingLabel,
  watchingLabel,
  notWatchingLabel,
}: {
  loading: boolean
  watching: boolean
  loadingLabel: string
  watchingLabel: string
  notWatchingLabel: string
}) {
  if (loading) {
    return <span className="tm-kb-settings-watch-status">{loadingLabel}</span>
  }

  return (
    <span
      className={[
        'tm-kb-settings-watch-status',
        watching ? 'tm-kb-settings-watch-status--active' : 'tm-kb-settings-watch-status--inactive',
      ].join(' ')}
    >
      {watching ? watchingLabel : notWatchingLabel}
    </span>
  )
}
