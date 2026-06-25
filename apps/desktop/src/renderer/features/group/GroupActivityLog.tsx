import type { WorkspaceEvent } from '@toolman/shared'
import { IconActivity } from '../../components/icons'
import {
  formatAbsoluteTime,
  formatP2pEventMessage,
  formatP2pEventTime,
  getP2pResourceLabel,
  shortDeviceId,
} from '../../i18n/group-event-labels'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { useRegisterGroupPanelError } from './group-page-status'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceName: string
  events: WorkspaceEvent[]
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
}

export function GroupActivityLog({
  workspaceName,
  events,
  loading,
  error,
  onRefresh,
}: Props) {
  const { t, language } = useI18n()
  useRegisterGroupPanelError('activity', error)

  return (
    <div className="tm-group-activity-panel">
      <GroupPanelHeader
        title={t('groupPage.header.activity')}
        subtitle={`${workspaceName} · ${t('groupPage.activity.count', { count: events.length })}`}
        actions={
          onRefresh ? (
            <GroupPanelRefreshButton loading={loading} onRefresh={onRefresh} />
          ) : null
        }
      />

      {loading && events.length === 0 ? (
        <div className="tm-session-empty">{t('groupPage.activity.loading')}</div>
      ) : events.length === 0 ? (
        <div className="tm-group-member-panel-empty">
          <span className="tm-group-member-panel-empty-icon" aria-hidden="true">
            <IconActivity size={28} />
          </span>
          <p>{t('groupPage.activity.empty')}</p>
          <p className="tm-kb-file-dropzone-hint">{t('groupPage.activity.emptyHint')}</p>
        </div>
      ) : (
        <ul className="tm-group-activity-list">
          {events.map((event) => {
            const absoluteTime = formatAbsoluteTime(event.timestamp, language)
            const relativeTime = formatP2pEventTime(event.timestamp, t, language)

            return (
              <li key={event.eventId} className="tm-group-activity-card">
                <div className="tm-group-activity-main">
                  <span className="tm-group-activity-message">
                    {formatP2pEventMessage(event, t)}
                  </span>
                  <span className="tm-group-activity-meta">
                    #{event.seq} · {getP2pResourceLabel(event.resourceType, t)}
                    {event.sourceDeviceId ? (
                      <>
                        {' '}
                        {' '}{t('groupPage.activity.from')}{' '}
                        <span title={event.sourceDeviceId}>
                          {shortDeviceId(event.sourceDeviceId)}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>
                <time
                  className="tm-group-activity-time"
                  dateTime={new Date(event.timestamp).toISOString()}
                  title={absoluteTime}
                >
                  {relativeTime}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
