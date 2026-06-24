import { useMemo } from 'react'

import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { useModulePagePanelStatuses } from '../../components/module-page-status'

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

export function GroupPageStatusBar({
  syncError,
  showSyncIndicator,
  showDegraded,
  lastSyncAt,
}: Props) {
  const panelStatuses = useModulePagePanelStatuses()
  const hasPanelStatus = Object.keys(panelStatuses).length > 0

  const priority = useMemo(() => {
    if (syncError) {
      return { tone: 'error' as const, text: `同步错误：${syncError}` }
    }
    return null
  }, [syncError])

  const fallback = useMemo(() => {
    if (hasPanelStatus) return null

    if (showDegraded) {
      return {
        tone: 'warning' as const,
        text: '群主 P2P 未连接，事件序号已降级；正在尝试连接并同步，连接成功后自动恢复。',
      }
    }

    if (showSyncIndicator) {
      return { tone: 'info' as const, text: '正在同步群组数据…' }
    }

    return { tone: 'muted' as const, text: '就绪' }
  }, [hasPanelStatus, showDegraded, showSyncIndicator])

  const lastSyncLabel = formatLastSyncAt(lastSyncAt)
  const meta =
    lastSyncLabel && !priority && !hasPanelStatus && fallback?.tone === 'muted'
      ? `上次同步 ${lastSyncLabel}`
      : null

  return <ModulePageStatusBar priority={priority} fallback={fallback} meta={meta} />
}
