import { useI18n } from '../../i18n/useI18n'
import { TaskTimelineItem } from './tasks/TaskTimelineItem'
import { useTaskEvents } from './useTaskEvents'

export function TaskActivityPanel({ taskId }: { taskId: string | null | undefined }) {
  const { t } = useI18n()
  const { events, loading } = useTaskEvents(taskId)

  if (!taskId) return null

  const recent = events.slice(-5).reverse()

  return (
    <div
      className="tm-task-activity-panel"
      role="region"
      aria-label={t('chat.taskEvents.title')}
      data-testid="task-activity-panel"
    >
      <div className="tm-task-activity-header">
        <span className="tm-task-activity-title">{t('chat.taskEvents.title')}</span>
        {loading ? <span className="tm-task-activity-loading">{t('chat.taskEvents.loading')}</span> : null}
      </div>
      {recent.length === 0 ? (
        <p className="tm-task-activity-empty">{t('chat.taskEvents.empty')}</p>
      ) : (
        <ul className="tm-task-activity-list">
          {recent.map((event) => (
            <TaskTimelineItem
              key={`${event.type}-${event.timestamp}`}
              event={event}
              className="tm-task-activity-item"
            />
          ))}
        </ul>
      )}
    </div>
  )
}
