import type { AgentTask } from '@toolman/shared'

import { IconChevronDown } from '../../../components/icons'
import { useI18n } from '../../../i18n/useI18n'
import {
  formatTaskStatusLabel,
  formatTaskUpdatedAt,
  getTaskDisplayProgress,
} from './task-panel-utils'

interface Props {
  task: AgentTask
  expanded: boolean
  onToggle: () => void
}

function statusTone(status: AgentTask['status']): 'failure' | 'success' | 'active' | 'muted' {
  if (status === 'failed' || status === 'cancelled') return 'failure'
  if (status === 'completed') return 'success'
  if (status === 'paused' || status === 'pending') return 'muted'
  return 'active'
}

export function AgentTaskCompactCard({ task, expanded, onToggle }: Props) {
  const { t } = useI18n()
  const progress = getTaskDisplayProgress(task)
  const tone = statusTone(task.status)

  return (
    <button
      type="button"
      className={[
        'tm-agent-task-compact',
        expanded ? 'tm-agent-task-compact--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={expanded}
      aria-label={task.title}
      data-testid="task-select-button"
      onClick={onToggle}
    >
      <IconChevronDown size={14} className="tm-agent-task-compact-chevron" />
      <span className="tm-agent-task-compact-body">
        <span className="tm-agent-task-compact-title" title={task.title}>
          {task.title}
        </span>
        <span className="tm-agent-task-compact-meta">
          {t('chat.tasks.menuProgress')
            .replace('{{done}}', String(progress.completed))
            .replace('{{total}}', String(progress.total || 1))}
          <span className="tm-agent-task-compact-meta-sep" aria-hidden>
            ·
          </span>
          {formatTaskUpdatedAt(task.updatedAt, t)}
        </span>
      </span>
      <span
        className={[
          'tm-agent-task-compact-status',
          `tm-agent-task-compact-status--${tone}`,
        ].join(' ')}
        data-testid="task-status-badge"
      >
        {formatTaskStatusLabel(task.status, t)}
      </span>
    </button>
  )
}
