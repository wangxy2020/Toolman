import { useMemo } from 'react'

import { useGroupPagePanelErrors } from './group-page-status'

type StatusTone = 'error' | 'warning' | 'info' | 'muted'

interface StatusMessage {
  tone: StatusTone
  text: string
  onDismiss?: () => void
}

interface Props {
  syncError: string | null
  showSyncIndicator: boolean
  showDegraded: boolean
  lastSyncAt?: number
}

function formatLastSyncAt(timestamp?: number): string | null {
  if (!timestamp) return null
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function resolveStatusMessage(options: {
  syncError: string | null
  panelErrors: Record<string, { message: string; onDismiss?: () => void }>
  showDegraded: boolean
  showSyncIndicator: boolean
}): StatusMessage {
  if (options.syncError) {
    return { tone: 'error', text: `同步错误：${options.syncError}` }
  }

  const panelErrorEntries = Object.values(options.panelErrors)
  if (panelErrorEntries.length > 0) {
    const first = panelErrorEntries[0]!
    return {
      tone: 'error',
      text: first.message,
      onDismiss: first.onDismiss,
    }
  }

  if (options.showDegraded) {
    return {
      tone: 'warning',
      text: '群主 P2P 未连接，事件序号已降级；正在尝试连接并同步，连接成功后自动恢复。',
    }
  }

  if (options.showSyncIndicator) {
    return { tone: 'info', text: '正在同步群组数据…' }
  }

  return { tone: 'muted', text: '就绪' }
}

export function GroupPageStatusBar({
  syncError,
  showSyncIndicator,
  showDegraded,
  lastSyncAt,
}: Props) {
  const panelErrors = useGroupPagePanelErrors()

  const status = useMemo(
    () =>
      resolveStatusMessage({
        syncError,
        panelErrors,
        showDegraded,
        showSyncIndicator,
      }),
    [panelErrors, showDegraded, showSyncIndicator, syncError],
  )

  const lastSyncLabel = formatLastSyncAt(lastSyncAt)

  return (
    <footer className="tm-group-statusbar" aria-live="polite">
      <span
        className={[
          'tm-group-statusbar-message',
          `tm-group-statusbar-message--${status.tone}`,
        ].join(' ')}
      >
        {status.text}
      </span>
      <div className="tm-group-statusbar-actions">
        {lastSyncLabel && status.tone === 'muted' ? (
          <span className="tm-group-statusbar-meta">上次同步 {lastSyncLabel}</span>
        ) : null}
        {status.onDismiss ? (
          <button
            type="button"
            className="tm-group-statusbar-dismiss"
            aria-label="关闭提示"
            onClick={status.onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>
    </footer>
  )
}
