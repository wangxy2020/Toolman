import { formatCommunityDate } from './community-market-utils'
import { ModerationList } from './ModerationList'
import {
  getModerationLogActionLabel,
  getModerationLogTargetTypeLabel,
} from '../../i18n/community-user-labels'
import type { AdminModerationPanelState } from './useAdminModerationPanel'

type PanelSlice = Pick<
  AdminModerationPanelState,
  't' | 'language' | 'category' | 'moderation'
>

export function AdminModerationLogsSection({ panel }: { panel: PanelSlice }) {
  const { t, language, category, moderation } = panel

  if (category !== 'logs') return null

  return (
    <ModerationList
      empty={t('communityPage.admin.emptyLogs')}
      items={moderation.logs}
      renderItem={(log) => (
        <div key={log.id} className="tm-community-moderation-row">
          <div className="tm-community-moderation-row-main">
            <div className="tm-community-moderation-row-title">
              {getModerationLogActionLabel(log.action, t)}
            </div>
            <div className="tm-community-moderation-row-meta">
              {getModerationLogTargetTypeLabel(log.targetType, t)} · {log.targetId.slice(0, 8)}… ·{' '}
              {formatCommunityDate(log.createdAt, language)}
            </div>
            {log.reason ? <p className="tm-community-moderation-row-desc">{log.reason}</p> : null}
          </div>
        </div>
      )}
    />
  )
}
