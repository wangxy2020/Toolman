import type { TaskEvent } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import {
  formatTaskEventLabel,
  formatTaskEventTime,
  getTaskEventCssModifier,
  getTaskEventNodeTone,
} from './task-panel-utils'

interface Props {
  event: TaskEvent
  showTime?: boolean
  className?: string
  variant?: 'inline' | 'flow'
  isLast?: boolean
}

export function TaskTimelineItem({
  event,
  showTime = true,
  className,
  variant = 'inline',
  isLast = false,
}: Props) {
  const { t } = useI18n()
  const modifier = getTaskEventCssModifier(event.type)
  const tone = getTaskEventNodeTone(event)

  if (variant === 'flow') {
    return (
      <li
        className={[
          'tm-agent-task-flow-item',
          `tm-agent-task-flow-item--${tone}`,
          `tm-agent-task-flow-item--${modifier}`,
          isLast ? 'tm-agent-task-flow-item--last' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`task-event-${modifier}`}
      >
        <div className="tm-agent-task-flow-rail" aria-hidden>
          <span className="tm-agent-task-flow-node" />
          {!isLast ? <span className="tm-agent-task-flow-line" /> : null}
        </div>
        <div className="tm-agent-task-flow-content">
          <span className="tm-agent-task-flow-label">{formatTaskEventLabel(event, t)}</span>
          {showTime ? (
            <time
              className="tm-agent-task-flow-time"
              dateTime={new Date(event.timestamp).toISOString()}
            >
              {formatTaskEventTime(event.timestamp)}
            </time>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <li
      className={[
        'tm-task-timeline-item',
        `tm-task-timeline-item--${modifier}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`task-event-${modifier}`}
    >
      <span className="tm-task-timeline-label">{formatTaskEventLabel(event, t)}</span>
      {showTime ? (
        <time
          className="tm-task-timeline-time"
          dateTime={new Date(event.timestamp).toISOString()}
        >
          {formatTaskEventTime(event.timestamp)}
        </time>
      ) : null}
    </li>
  )
}
