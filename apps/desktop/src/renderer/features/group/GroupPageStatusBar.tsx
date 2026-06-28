import { useMemo } from 'react'

import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { useModulePagePanelStatuses } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  syncError: string | null
  showSyncIndicator: boolean
  showDegraded: boolean
  isMembershipPending?: boolean
  lastSyncAt?: number
}

function formatLastSyncAt(timestamp?: number): string | null {
  if (!timestamp) return null
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function GroupPageStatusBar({
  syncError,
  showSyncIndicator,
  showDegraded,
  isMembershipPending = false,
  lastSyncAt,
}: Props) {
  const { t } = useI18n()
  const panelStatuses = useModulePagePanelStatuses()
  const hasPanelStatus = Object.keys(panelStatuses).length > 0

  const priority = useMemo(() => {
    if (syncError) {
      return { tone: 'error' as const, text: t('groupPage.status.syncError', { message: syncError }) }
    }
    if (isMembershipPending) {
      return { tone: 'warning' as const, text: t('groupPage.status.pendingApproval') }
    }
    return null
  }, [isMembershipPending, syncError, t])

  const fallback = useMemo(() => {
    if (hasPanelStatus) return null

    if (showDegraded) {
      return {
        tone: 'warning' as const,
        text: t('groupPage.status.p2pDegraded'),
      }
    }

    if (showSyncIndicator) {
      return { tone: 'info' as const, text: t('groupPage.status.syncing') }
    }

    return { tone: 'muted' as const, text: t('groupPage.status.ready') }
  }, [hasPanelStatus, showDegraded, showSyncIndicator, t])

  const lastSyncLabel = formatLastSyncAt(lastSyncAt)
  const meta =
    lastSyncLabel && !priority && !hasPanelStatus && fallback?.tone === 'muted'
      ? t('groupPage.status.lastSync', { time: lastSyncLabel })
      : null

  return <ModulePageStatusBar priority={priority} fallback={fallback} meta={meta} />
}
