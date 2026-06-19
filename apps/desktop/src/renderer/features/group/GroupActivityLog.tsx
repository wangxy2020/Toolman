import type { WorkspaceEvent } from '@toolman/shared'
import { IconActivity, IconRefresh } from '../../components/icons'
import {
  formatAbsoluteTime,
  formatP2pEventMessage,
  formatP2pEventTime,
  P2P_RESOURCE_LABELS,
  shortDeviceId,
} from './formatP2pEventMessage'

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
  return (
    <div className="tm-group-activity-panel">
      <div className="tm-group-member-panel-header">
        <div>
          <h2 className="tm-group-member-panel-title">群组活动记录</h2>
          <p className="tm-group-member-panel-subtitle">
            {workspaceName} · {events.length} 条记录
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="tm-btn tm-btn--secondary"
            onClick={onRefresh}
            disabled={loading}
            title="刷新活动记录"
          >
            <IconRefresh size={14} />
            刷新
          </button>
        )}
      </div>

      {error && <div className="tm-error-bar">{error}</div>}

      {loading && events.length === 0 ? (
        <div className="tm-session-empty">加载活动记录中…</div>
      ) : events.length === 0 ? (
        <div className="tm-group-member-panel-empty">
          <span className="tm-group-member-panel-empty-icon" aria-hidden="true">
            <IconActivity size={28} />
          </span>
          <p>暂无活动记录</p>
          <p className="tm-kb-file-dropzone-hint">创建群组、加入成员等操作会显示在这里</p>
        </div>
      ) : (
        <ul className="tm-group-activity-list">
          {events.map((event) => {
            const absoluteTime = formatAbsoluteTime(event.timestamp)
            const relativeTime = formatP2pEventTime(event.timestamp)

            return (
              <li key={event.eventId} className="tm-group-activity-card">
                <div className="tm-group-activity-main">
                  <span className="tm-group-activity-message">
                    {formatP2pEventMessage(event)}
                  </span>
                  <span className="tm-group-activity-meta">
                    #{event.seq} · {P2P_RESOURCE_LABELS[event.resourceType]}
                    {event.sourceDeviceId ? (
                      <>
                        {' '}
                        · 来自{' '}
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
