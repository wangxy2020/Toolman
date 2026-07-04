import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { AgentTask } from '@toolman/shared'
import { isActiveTaskStatus } from '@toolman/shared'

import { IconMoreHorizontal } from '../../../components/icons'
import { useI18n } from '../../../i18n/useI18n'
import {
  formatTaskStatusLabel,
  formatTaskUpdatedAt,
  getTaskStepProgress,
} from './task-panel-utils'
import {
  canCancelTask,
  canPauseTask,
  canResumeTask,
  getTaskCurrentStepTitle,
} from './useAgentTasks'

function shortTaskId(taskId: string): string {
  if (taskId.length <= 16) return taskId
  return `${taskId.slice(0, 8)}…${taskId.slice(-4)}`
}

function taskInitial(title: string): string {
  const trimmed = title.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function taskStatusPillClass(status: AgentTask['status']): string {
  if (status === 'failed' || status === 'cancelled') {
    return 'tm-group-member-role--task-danger'
  }
  if (status === 'completed') {
    return 'tm-group-member-role--task-done'
  }
  if (isActiveTaskStatus(status) || status === 'pending' || status === 'paused' || status === 'retrying') {
    return 'tm-group-member-role--owner'
  }
  return ''
}

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

export function AgentTaskMenuItem({
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
  const [actionOpen, setActionOpen] = useState(false)
  const actionRef = useRef<HTMLDivElement>(null)
  const stepTitle = getTaskCurrentStepTitle(task)
  const progress = getTaskStepProgress(task)
  const hasActions = canPauseTask(task) || canResumeTask(task) || canCancelTask(task)

  useEffect(() => {
    if (!actionOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (actionRef.current?.contains(target)) return
      setActionOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [actionOpen])

  const statusHint =
    progress.total > 0
      ? t('chat.tasks.menuProgress')
          .replace('{{done}}', String(progress.completed))
          .replace('{{total}}', String(progress.total))
      : (stepTitle ?? formatTaskUpdatedAt(task.updatedAt, t))

  const openActions = (event: ReactMouseEvent) => {
    event.stopPropagation()
    setActionOpen((open) => !open)
  }

  return (
    <li
      className={[
        'tm-group-member-card',
        'tm-group-member-card--compact',
        'tm-agent-task-menu-item',
        active ? 'tm-agent-task-menu-item--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`task-list-item-${task.id}`}
      onClick={() => onSelect(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(task.id)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="tm-group-member-avatar" aria-hidden="true">
        {taskInitial(task.title)}
      </span>
      <div className="tm-group-member-meta">
        <span className="tm-group-member-name">
          <span className="tm-agent-task-menu-item-title" title={task.title} data-testid="task-select-button">
            {task.title}
          </span>
          {bound ? <span className="tm-group-member-you">{t('chat.tasks.boundBadge')}</span> : null}
        </span>
        <span className="tm-group-member-device" title={task.id}>
          {shortTaskId(task.id)}
        </span>
      </div>
      <div className="tm-group-member-end">
        <span
          className={['tm-group-member-role', taskStatusPillClass(task.status)].filter(Boolean).join(' ')}
          data-testid="task-status-badge"
        >
          {formatTaskStatusLabel(task.status, t)}
        </span>
        <div className="tm-group-member-status-row">
          <span
            className={[
              'tm-group-member-status',
              isActiveTaskStatus(task.status) ? 'tm-group-member-status--online' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={statusHint}
          >
            {statusHint}
          </span>
          {hasActions ? (
            <div className="tm-agent-task-menu-item-actions" ref={actionRef}>
              <button
                type="button"
                className="tm-group-member-manage-btn"
                title={t('chat.tasks.menuActions')}
                disabled={controlling}
                aria-expanded={actionOpen}
                onClick={openActions}
              >
                <IconMoreHorizontal size={16} />
              </button>
              {actionOpen ? (
                <div className="tm-agent-task-action-menu" role="menu">
                  {canPauseTask(task) ? (
                    <button
                      type="button"
                      className="tm-agent-task-action-menu-item"
                      role="menuitem"
                      data-testid="task-control-pause"
                      disabled={controlling}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPause(task.id)
                        setActionOpen(false)
                      }}
                    >
                      {t('chat.tasks.pause')}
                    </button>
                  ) : null}
                  {canResumeTask(task) ? (
                    <button
                      type="button"
                      className="tm-agent-task-action-menu-item"
                      role="menuitem"
                      data-testid="task-control-resume"
                      disabled={controlling}
                      onClick={(event) => {
                        event.stopPropagation()
                        onResume(task.id)
                        setActionOpen(false)
                      }}
                    >
                      {t('chat.tasks.resume')}
                    </button>
                  ) : null}
                  {canCancelTask(task) ? (
                    <button
                      type="button"
                      className="tm-agent-task-action-menu-item tm-agent-task-action-menu-item--danger"
                      role="menuitem"
                      data-testid="task-control-cancel"
                      disabled={controlling}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCancel(task.id)
                        setActionOpen(false)
                      }}
                    >
                      {t('chat.tasks.cancel')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
