import { useMemo } from 'react'
import type { AgentTask } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { useTaskEvents } from '../useTaskEvents'
import { buildTaskTimelineEvents, formatTaskFailureReason } from './task-panel-utils'
import { TaskTimelineItem } from './TaskTimelineItem'

interface Props {
  taskId: string
  task?: AgentTask
}

export function AgentTaskTimeline({ taskId, task }: Props) {
  const { t } = useI18n()
  const { events, loading } = useTaskEvents(taskId)

  const displayEvents = useMemo(
    () => buildTaskTimelineEvents(events, task),
    [events, task],
  )

  const failureReason = useMemo(
    () => (task ? formatTaskFailureReason(task) : null),
    [task],
  )

  if (loading) {
    return <p className="tm-agent-task-flow-empty">{t('chat.taskEvents.loading')}</p>
  }

  if (displayEvents.length === 0) {
    return <p className="tm-agent-task-flow-empty">{t('chat.taskEvents.empty')}</p>
  }

  return (
    <ul className="tm-agent-task-flow" aria-label={t('chat.tasks.timelineTitle')}>
      {displayEvents.map((event, index) => (
        <TaskTimelineItem
          key={`${event.type}-${event.timestamp}-${index}`}
          event={event}
          variant="flow"
          isLast={index === displayEvents.length - 1}
        />
      ))}
      {failureReason &&
      displayEvents.some(
        (event) => event.type === 'task.finished' && event.status === 'failed',
      ) ? (
        <li className="tm-agent-task-flow-item tm-agent-task-flow-item--failure tm-agent-task-flow-item--reason">
          <div className="tm-agent-task-flow-content">
            <span className="tm-agent-task-flow-label">{failureReason}</span>
          </div>
        </li>
      ) : null}
    </ul>
  )
}
