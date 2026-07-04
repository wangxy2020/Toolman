import type { AgentTask } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import {
  canCancelTask,
  canPauseTask,
  canResumeTask,
  getTaskCurrentStepTitle,
} from './useAgentTasks'
import {
  formatTaskStatusLabel,
  formatTaskUpdatedAt,
  getTaskStepProgress,
} from './task-panel-utils'

interface Props {
  task: AgentTask
  active?: boolean
  bound?: boolean
  controlling?: boolean
  onSelect: (taskId: string) => void
  onPause: (taskId: string) => void
  onResume: (taskId: string) => void
  onCancel: (taskId: string) => void
}

export function TaskListItem({
  task,
  active = false,
  bound = false,
  controlling = false,
  onSelect,
  onPause,
  onResume,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const stepTitle = getTaskCurrentStepTitle(task)
  const progress = getTaskStepProgress(task)

  return (
    <div
      className={[
        'tm-task-list-item',
        active ? 'tm-task-list-item--active' : '',
        bound ? 'tm-task-list-item--bound' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`task-list-item-${task.id}`}
    >
      <button
        type="button"
        className="tm-task-list-item-main"
        data-testid="task-select-button"
        onClick={() => onSelect(task.id)}
      >
        <span className="tm-task-list-item-title-row">
          <span className="tm-task-list-item-title" title={task.title}>
            {task.title}
          </span>
          {bound ? <span className="tm-task-list-item-bound">{t('chat.tasks.boundBadge')}</span> : null}
        </span>
        <span
          className={`tm-task-list-item-status tm-task-list-item-status--${task.status}`}
          data-testid="task-status-badge"
        >
          {formatTaskStatusLabel(task.status, t)}
        </span>
        {stepTitle ? (
          <span className="tm-task-list-item-step" title={stepTitle}>
            {stepTitle}
          </span>
        ) : null}
        {progress.total > 0 ? (
          <div className="tm-task-list-item-progress" aria-hidden="true">
            <div
              className="tm-task-list-item-progress-bar"
              style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
            />
          </div>
        ) : null}
        <span className="tm-task-list-item-meta">
          {task.retryCount > 0
            ? t('chat.tasks.retryCount').replace('{{count}}', String(task.retryCount))
            : null}
          {task.retryCount > 0 ? ' · ' : null}
          {formatTaskUpdatedAt(task.updatedAt, t)}
        </span>
      </button>

      <div className="tm-task-list-item-actions">
        {canPauseTask(task) ? (
          <button
            type="button"
            className="tm-task-list-item-action"
            data-testid="task-control-pause"
            disabled={controlling}
            title={t('chat.tasks.pause')}
            onClick={() => onPause(task.id)}
          >
            {t('chat.tasks.pause')}
          </button>
        ) : null}
        {canResumeTask(task) ? (
          <button
            type="button"
            className="tm-task-list-item-action"
            data-testid="task-control-resume"
            disabled={controlling}
            title={t('chat.tasks.resume')}
            onClick={() => onResume(task.id)}
          >
            {t('chat.tasks.resume')}
          </button>
        ) : null}
        {canCancelTask(task) ? (
          <button
            type="button"
            className="tm-task-list-item-action tm-task-list-item-action--danger"
            data-testid="task-control-cancel"
            disabled={controlling}
            title={t('chat.tasks.cancel')}
            onClick={() => onCancel(task.id)}
          >
            {t('chat.tasks.cancel')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
