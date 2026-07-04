import type { ReactNode } from 'react'
import type { AgentTask } from '@toolman/shared'
import { isActiveTaskStatus } from '@toolman/shared'

import { IconX } from '../../../components/icons'
import { useI18n } from '../../../i18n/useI18n'
import { AgentTaskHexIcon } from './AgentTaskHexIcon'
import {
  formatTaskStatusLabel,
  getTaskDisplayProgress,
  shortTaskId,
  taskTitleInitial,
} from './task-panel-utils'

interface Props {
  task: AgentTask
  bound?: boolean
  /** When true, exposes list-item test id for E2E (single-task menu). */
  asListItem?: boolean
  onSelect?: (taskId: string) => void
  /** Collapsed fold header — title row only, no progress bar. */
  variant?: 'full' | 'summary'
  /** Optional control rendered in the title row (e.g. expand/collapse). */
  headerAction?: ReactNode
}

function taskStatusBadgeVariant(status: AgentTask['status']): 'failure' | 'retry' | 'default' {
  if (status === 'failed' || status === 'cancelled') return 'failure'
  if (status === 'retrying') return 'retry'
  return 'default'
}

export function AgentTaskCard({
  task,
  bound = false,
  asListItem = false,
  onSelect,
  variant = 'full',
  headerAction,
}: Props) {
  const { t } = useI18n()
  const progress = getTaskDisplayProgress(task)
  const segmentTotal = Math.max(progress.total, progress.completed, 1)
  const badgeVariant = taskStatusBadgeVariant(task.status)
  const showRetryBadge = task.retryCount > 0
  const pulsing = isActiveTaskStatus(task.status) || task.status === 'retrying'

  const card = (
    <article
      className={[
        'tm-agent-task-card',
        variant === 'summary' ? 'tm-agent-task-card--summary' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={asListItem ? `task-list-item-${task.id}` : undefined}
      onClick={onSelect ? () => onSelect(task.id) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(task.id)
              }
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="tm-agent-task-card-main">
        <AgentTaskHexIcon letter={taskTitleInitial(task.title)} pulsing={pulsing} />
        <div className="tm-agent-task-card-body">
          <div className="tm-agent-task-card-title-row">
            <h4 className="tm-agent-task-card-title" title={task.title} data-testid="task-select-button">
              {task.title}
            </h4>
            {headerAction ? (
              <div className="tm-agent-task-card-header-action">{headerAction}</div>
            ) : null}
            <div className="tm-agent-task-card-badges">
              {badgeVariant === 'failure' ? (
                <span
                  className="tm-agent-task-badge tm-agent-task-badge--failure"
                  data-testid="task-status-badge"
                >
                  <span className="tm-agent-task-badge-icon" aria-hidden>
                    <IconX size={10} />
                  </span>
                  {formatTaskStatusLabel(task.status, t)}
                </span>
              ) : (
                <span
                  className={[
                    'tm-agent-task-badge',
                    badgeVariant === 'retry' ? 'tm-agent-task-badge--retry' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid="task-status-badge"
                >
                  {formatTaskStatusLabel(task.status, t)}
                </span>
              )}
              {showRetryBadge ? (
                <span className="tm-agent-task-badge tm-agent-task-badge--muted">
                  {t('chat.tasks.retryCount').replace('{{count}}', String(task.retryCount))}
                </span>
              ) : null}
            </div>
          </div>
          <div className="tm-agent-task-card-meta">
            <span className="tm-agent-task-card-id" title={task.id}>
              {shortTaskId(task.id)}
            </span>
            <span className="tm-agent-task-card-steps">
              {t('chat.tasks.menuProgress')
                .replace('{{done}}', String(progress.completed))
                .replace('{{total}}', String(progress.total || segmentTotal))}
            </span>
            {bound ? (
              <span className="tm-agent-task-card-bound">{t('chat.tasks.boundBadge')}</span>
            ) : null}
          </div>
          {variant === 'full' ? (
          <div
            className="tm-agent-task-progress"
            role="progressbar"
            aria-valuenow={progress.completed}
            aria-valuemin={0}
            aria-valuemax={segmentTotal}
            aria-label={t('chat.tasks.menuProgress')
              .replace('{{done}}', String(progress.completed))
              .replace('{{total}}', String(segmentTotal))}
          >
            {Array.from({ length: segmentTotal }, (_, index) => (
              <span
                key={index}
                className={[
                  'tm-agent-task-progress-segment',
                  index < progress.completed ? 'tm-agent-task-progress-segment--done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </div>
          ) : null}
        </div>
      </div>
    </article>
  )

  return card
}
