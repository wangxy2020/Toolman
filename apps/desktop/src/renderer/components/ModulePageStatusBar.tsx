import { useMemo } from 'react'

import { useI18n } from '../i18n/useI18n'
import {
  useModulePagePanelStatuses,
  type ModulePanelStatusEntry,
  type ModulePanelStatusTone,
} from './module-page-status'

const TONE_PRIORITY: Record<ModulePanelStatusTone, number> = {
  error: 0,
  warning: 1,
  info: 2,
  muted: 3,
}

interface StatusMessage {
  tone: ModulePanelStatusTone
  text: string
  onDismiss?: () => void
}

interface Props {
  priority?: StatusMessage | null
  fallback?: StatusMessage | null
  meta?: string | null
}

function pickPanelStatus(
  panelStatuses: Record<string, ModulePanelStatusEntry>,
): StatusMessage | null {
  const entries = Object.values(panelStatuses)
  if (entries.length === 0) return null

  const sorted = [...entries].sort(
    (a, b) => TONE_PRIORITY[a.tone] - TONE_PRIORITY[b.tone],
  )
  const first = sorted[0]!
  return {
    tone: first.tone,
    text: first.message,
    onDismiss: first.onDismiss,
  }
}

function resolveStatusMessage(
  panelStatuses: Record<string, ModulePanelStatusEntry>,
  priority: StatusMessage | null | undefined,
  fallback: StatusMessage | null | undefined,
  readyLabel: string,
): StatusMessage {
  if (priority) return priority

  const panelStatus = pickPanelStatus(panelStatuses)
  if (panelStatus) return panelStatus

  if (fallback) return fallback
  return { tone: 'muted', text: readyLabel }
}

export function ModulePageStatusBar({
  priority = null,
  fallback = null,
  meta = null,
}: Props) {
  const { t } = useI18n()
  const panelStatuses = useModulePagePanelStatuses()

  const status = useMemo(
    () => resolveStatusMessage(panelStatuses, priority, fallback, t('common.ready')),
    [fallback, panelStatuses, priority, t],
  )

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
        {meta && status.tone === 'muted' ? (
          <span className="tm-group-statusbar-meta">{meta}</span>
        ) : null}
        {status.onDismiss ? (
          <button
            type="button"
            className="tm-group-statusbar-dismiss"
            aria-label={t('common.dismissStatus')}
            onClick={status.onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>
    </footer>
  )
}
