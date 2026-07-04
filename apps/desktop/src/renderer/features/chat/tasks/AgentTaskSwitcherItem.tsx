import type { AgentTask } from '@toolman/shared'

import { useI18n } from '../../../i18n/useI18n'
import { AgentTaskHexIcon } from './AgentTaskHexIcon'
import { formatTaskStatusLabel, taskTitleInitial } from './task-panel-utils'

interface Props {
  task: AgentTask
  active?: boolean
  onSelect: (taskId: string) => void
}

export function AgentTaskSwitcherItem({ task, active = false, onSelect }: Props) {
  const { t } = useI18n()

  return (
    <li
      className={[
        'tm-agent-task-switcher-item',
        active ? 'tm-agent-task-switcher-item--active' : '',
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
      <AgentTaskHexIcon letter={taskTitleInitial(task.title)} size={28} />
      <span className="tm-agent-task-switcher-title" title={task.title}>
        {task.title}
      </span>
      <span className="tm-agent-task-switcher-status">{formatTaskStatusLabel(task.status, t)}</span>
    </li>
  )
}
